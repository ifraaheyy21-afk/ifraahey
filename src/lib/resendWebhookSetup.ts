import { prisma } from "./prisma";
import {
    decryptIntegrationSecret,
    encryptIntegrationSecret,
} from "./integrationEncryption";

export class ResendWebhookSetupError extends Error {
    constructor(
        message: string,
        public status = 502,
        public code = "RESEND_WEBHOOK_SETUP_FAILED",
    ) {
        super(message);
        this.name = "ResendWebhookSetupError";
    }
}

// Provider event names are part of the Resend API contract.
const EVENTS = [
    "email.sent", "email.delivered", "email.delivery_delayed",
    "email.opened", "email.clicked", "email.bounced",
    "email.complained", "email.failed", "email.received",
];

function object(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function positiveInteger(name: string, fallback: number) {
    const raw = process.env[name]?.trim();
    const value = raw ? Number(raw) : fallback;
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new ResendWebhookSetupError(
            `${name} must be a positive integer.`, 500, "INVALID_WEBHOOK_CONFIG",
        );
    }
    return value;
}

export function getResendWebhookUrl(workspaceId: string) {
    if (!workspaceId.trim()) {
        throw new ResendWebhookSetupError("Workspace is required.", 400);
    }
    const configured = process.env.APP_URL?.trim() ||
        process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (!configured) {
        throw new ResendWebhookSetupError(
            "Configure APP_URL with the public HTTPS application URL.",
            500, "WEBHOOK_URL_NOT_CONFIGURED",
        );
    }
    let base: URL;
    try {
        base = new URL(configured);
    } catch {
        throw new ResendWebhookSetupError("APP_URL is invalid.", 500, "INVALID_WEBHOOK_CONFIG");
    }
    if (base.protocol !== "https:" || base.username || base.password ||
        base.search || base.hash || base.pathname !== "/" ||
        base.hostname === "localhost" || base.hostname.endsWith(".localhost") ||
        base.hostname === "127.0.0.1" || base.hostname === "[::1]") {
        throw new ResendWebhookSetupError(
            "APP_URL must be a public HTTPS origin without credentials, a path, query, or fragment.",
            500, "INVALID_WEBHOOK_CONFIG",
        );
    }
    const endpoint = new URL("/api/email-agent/webhooks/resend", base);
    // Routing hint only. The receiving route must verify this workspace's secret.
    endpoint.searchParams.set("workspaceId", workspaceId);
    return endpoint.toString();
}

async function request(
    apiKey: string,
    path: string,
    signal: AbortSignal,
    method = "GET",
    body?: Record<string, unknown>,
) {
    let response: Response;
    try {
        response = await fetch(`https://api.resend.com${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: "application/json",
                ...(body ? { "Content-Type": "application/json" } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal,
            cache: "no-store",
            redirect: "error",
        });
    } catch {
        throw new ResendWebhookSetupError(
            "Resend webhook setup was interrupted. Check the endpoint in Resend before retrying.",
            503, "WEBHOOK_SETUP_INTERRUPTED",
        );
    }
    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            throw new ResendWebhookSetupError(
                "Automatic webhook setup requires a valid Resend key with full access.",
                409, "WEBHOOK_FULL_ACCESS_REQUIRED",
            );
        }
        throw new ResendWebhookSetupError(
            "Resend could not complete webhook setup. Try again after checking the account.",
            response.status === 429 ? 503 : 502,
        );
    }
    const result: unknown = await response.json().catch(() => null);
    const payload = object(result);
    if (!payload) throw new ResendWebhookSetupError("Resend returned an invalid webhook response.");
    return payload;
}

/**
 * Server-only service: callers MUST authenticate and authorize workspaceId.
 * Call only after the workspace-aware receiving route is deployed.
 * No secret is returned to the caller.
 */
export async function configureWorkspaceResendWebhook(
    workspaceId: string,
    expectedAccessToken?: string,
) {
    const endpoint = getResendWebhookUrl(workspaceId);
    const timeoutMs = positiveInteger("RESEND_WEBHOOK_SETUP_TIMEOUT_MS", 20_000);
    const signal = AbortSignal.timeout(timeoutMs);

    // Serialize setup for this integration. This transaction intentionally holds
    // its row lock while contacting Resend; setup is not an email-sending path.
    return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "WorkspaceIntegration"
            WHERE "workspaceId" = ${workspaceId} AND "provider" = 'resend'
            FOR UPDATE
        `;
        if (rows.length !== 1) {
            throw new ResendWebhookSetupError("Connect Resend for this workspace first.", 409);
        }
        const integration = await tx.workspaceIntegration.findUnique({
            where: { id: rows[0].id },
            select: { id: true, status: true, accessToken: true },
        });
        if (!integration || integration.status !== "connected" || !integration.accessToken) {
            throw new ResendWebhookSetupError("Connect Resend for this workspace first.", 409);
        }
        if (expectedAccessToken !== undefined && integration.accessToken !== expectedAccessToken) {
            throw new ResendWebhookSetupError(
                "The Resend connection changed during setup. Reload its settings before retrying.",
                409, "INTEGRATION_CHANGED",
            );
        }
        const apiKey = decryptIntegrationSecret(integration.accessToken);
        const matches: string[] = [];
        const seenCursors = new Set<string>();
        let after: string | undefined;

        // Search all pages, including endpoints created before a local save failed.
        for (; ;) {
            const query = new URLSearchParams({ limit: "100" });
            if (after) query.set("after", after);
            const page = await request(apiKey, `/webhooks?${query}`, signal);
            if (!Array.isArray(page.data) || typeof page.has_more !== "boolean") {
                throw new ResendWebhookSetupError("Resend returned an invalid webhook list.");
            }
            for (const entry of page.data) {
                const item = object(entry);
                if (!item || typeof item.id !== "string" || typeof item.endpoint !== "string") {
                    throw new ResendWebhookSetupError("Resend returned an invalid webhook entry.");
                }
                if (item.endpoint === endpoint) matches.push(item.id);
            }
            if (!page.has_more) break;
            const last = object(page.data.at(-1));
            if (typeof last?.id !== "string" || seenCursors.has(last.id)) {
                throw new ResendWebhookSetupError("Resend webhook pagination could not continue safely.");
            }
            after = last.id;
            seenCursors.add(after);
        }
        if (matches.length > 1) {
            throw new ResendWebhookSetupError(
                "Multiple Resend webhooks use this workspace URL. Resolve the duplicates in Resend first.",
                409, "DUPLICATE_WORKSPACE_WEBHOOKS",
            );
        }

        let webhookId = matches[0];
        if (!webhookId) {
            const created = await request(apiKey, "/webhooks", signal, "POST", {
                endpoint, events: EVENTS,
            });
            if (typeof created.id !== "string" || !created.id) {
                throw new ResendWebhookSetupError("Resend did not return a webhook identifier.");
            }
            webhookId = created.id;
        }

        const path = `/webhooks/${encodeURIComponent(webhookId)}`;
        let hook = await request(apiKey, path, signal);
        if (hook.id !== webhookId || hook.endpoint !== endpoint) {
            throw new ResendWebhookSetupError("Resend returned a different webhook than requested.");
        }
        if (hook.status !== "enabled") {
            throw new ResendWebhookSetupError(
                "This workspace webhook is disabled in Resend. Enable it before completing setup.",
                409, "WORKSPACE_WEBHOOK_DISABLED",
            );
        }
        if (!Array.isArray(hook.events) || hook.events.some((value) => typeof value !== "string")) {
            throw new ResendWebhookSetupError("Resend returned invalid webhook event subscriptions.");
        }
        if (EVENTS.some((name) => !(hook.events as string[]).includes(name))) {
            await request(apiKey, path, signal, "PATCH", {
                events: [...new Set([...hook.events as string[], ...EVENTS])],
            });
            hook = await request(apiKey, path, signal);
        }
        if (hook.id !== webhookId || hook.endpoint !== endpoint || hook.status !== "enabled" ||
            !Array.isArray(hook.events) || EVENTS.some((name) => !(hook.events as unknown[]).includes(name)) ||
            typeof hook.signing_secret !== "string" || !hook.signing_secret.startsWith("whsec_")) {
            throw new ResendWebhookSetupError("Resend webhook settings could not be verified.");
        }

        await tx.workspaceIntegration.update({
            where: { id: integration.id },
            data: {
                webhookId,
                webhookUrl: endpoint,
                webhookSecretEncrypted: encryptIntegrationSecret(hook.signing_secret),
            },
        });
        return { webhookId, webhookUrl: endpoint, configured: true as const };
    }, { timeout: timeoutMs + 5_000, maxWait: 5_000 });
}
