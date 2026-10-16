import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getWorkspaceId } from "../../../../../lib/getWorkspaceId";
import { AuthError } from "../../../../../lib/auth/getWorkspaceFromRequest";
import {
    decryptIntegrationSecret,
    encryptIntegrationSecret,
} from "../../../../../lib/integrationEncryption";
import { validateResendApiKey } from "../../../../../lib/resendIntegration";
import {
    configureWorkspaceResendWebhook,
    getResendWebhookUrl,
    ResendWebhookSetupError,
} from "../../../../../lib/resendWebhookSetup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: { "Cache-Control": "private, no-store" },
    });
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function assertRequestOrigin(req: Request) {
    if (/^Bearer\s+\S+$/i.test(req.headers.get("authorization") ?? "")) return;
    const expected = new URL(
        process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || req.url,
    ).origin;
    if (req.headers.get("origin") !== expected) {
        throw new AuthError("Request origin is not allowed.", 403, "INVALID_REQUEST_ORIGIN");
    }
}

export async function POST(req: Request) {
    try {
        const workspaceId = await getWorkspaceId(req);
        assertRequestOrigin(req);

        const parsed: unknown = await req.json().catch(() => null);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return json({ error: "Send a valid JSON object." }, 400);
        }
        const body = parsed as Record<string, unknown>;
        const apiKey = text(body.apiKey);
        const senderName = text(body.senderName) || null;
        const senderEmail = text(body.senderEmail);
        if (!apiKey.startsWith("re_") || /\s/.test(apiKey)) {
            return json({ error: "Enter a valid Resend API key." }, 400);
        }
        if (senderName && /[\r\n<>]/.test(senderName)) {
            return json({ error: "Sender name cannot contain line breaks or angle brackets." }, 400);
        }
        if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(senderEmail)) {
            return json({ error: "Enter a valid sender email address." }, 400);
        }

        const validation = await validateResendApiKey(apiKey);
        if (!validation.valid) return json({ error: validation.error }, 400);

        const senderDomain = senderEmail.split("@").at(-1)!.toLowerCase();
        const domain = validation.domains.find((item) => item.name.toLowerCase() === senderDomain);
        if (validation.permission === "full_access" && !domain) {
            return json({ error: "The sender domain was not found in the domains returned by Resend." }, 400);
        }
        if (domain && domain.status.toLowerCase() !== "verified") {
            return json({ error: "The sender domain is not verified in Resend yet." }, 400);
        }
        // Validate server configuration before changing a full-access connection.
        if (validation.permission === "full_access") getResendWebhookUrl(workspaceId);

        const existing = await prisma.workspaceIntegration.findUnique({
            where: { workspaceId_provider: { workspaceId, provider: "resend" } },
            select: { id: true, accessToken: true, status: true, updatedAt: true },
        });
        let sameCredential = false;
        if (existing?.status === "connected" && existing.accessToken) {
            try {
                sameCredential = decryptIntegrationSecret(existing.accessToken) === apiKey;
            } catch {
                // Reconnection can replace a credential that can no longer be decrypted.
                sameCredential = false;
            }
        }
        const encryptedApiKey = encryptIntegrationSecret(apiKey);
        const now = new Date().toISOString();
        const domainStatus = domain?.status || "checked_on_send";
        const metadata = {
            senderName, senderEmail, senderDomain,
            permission: validation.permission, domainStatus,
            connectedAt: now, lastValidatedAt: now,
        };
        const data = {
            status: "connected" as const,
            accessToken: encryptedApiKey,
            refreshToken: null,
            expiresAt: null,
            metadata,
            ...(!sameCredential ? {
                webhookId: null, webhookSecretEncrypted: null, webhookUrl: null,
            } : {}),
        };
        if (existing) {
            const saved = await prisma.workspaceIntegration.updateMany({
                where: {
                    id: existing.id, workspaceId,
                    accessToken: existing.accessToken,
                    status: existing.status, updatedAt: existing.updatedAt,
                },
                data,
            });
            if (saved.count !== 1) {
                return json({ error: "The integration changed. Reload its settings before retrying.", code: "INTEGRATION_CHANGED" }, 409);
            }
        } else {
            try {
                await prisma.workspaceIntegration.create({
                    data: { workspaceId, provider: "resend", ...data },
                });
            } catch (error) {
                if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
                    return json({ error: "Another request connected this integration. Reload its settings.", code: "INTEGRATION_CHANGED" }, 409);
                }
                throw error;
            }
        }

        const integration = {
            provider: "resend", status: "connected", senderName, senderEmail,
            permission: validation.permission, domainStatus,
        };
        if (validation.permission === "sending_access") {
            return json({
                success: false, connectionSaved: true, integration,
                webhook: { configured: false },
                code: "WEBHOOK_FULL_ACCESS_REQUIRED",
                error: "The sending credential was saved. Connect a full-access Resend key to complete automatic webhook setup.",
            }, 409);
        }
        try {
            const webhook = await configureWorkspaceResendWebhook(workspaceId, encryptedApiKey);
            return json({ success: true, connectionSaved: true, integration, webhook });
        } catch (error) {
            const known = error instanceof ResendWebhookSetupError;
            console.error("Resend webhook setup incomplete", {
                errorType: error instanceof Error ? error.name : "unknown",
            });
            return json({
                success: false, connectionSaved: true, integration,
                webhook: { configured: false },
                code: known ? error.code : "WEBHOOK_SETUP_INCOMPLETE",
                error: known ? error.message : "The sending credential was saved, but webhook setup could not complete. Check the connection settings before retrying.",
            }, known ? error.status : 503);
        }
    } catch (error) {
        if (error instanceof AuthError || error instanceof ResendWebhookSetupError) {
            return json({ error: error.message, code: error.code }, error.status);
        }
        console.error("Connect Resend failed", {
            errorType: error instanceof Error ? error.name : "unknown",
        });
        return json({ error: "Unable to connect Resend. Check the server configuration and try again." }, 500);
    }
}
