import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { Prisma } from "@prisma/client";

import { prisma } from "../../../../../lib/prisma";
import { decryptIntegrationSecret } from "../../../../../lib/integrationEncryption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUTBOUND = new Set([
    "email.sent", "email.delivered", "email.delivery_delayed",
    "email.opened", "email.clicked", "email.bounced", "email.complained",
    "email.failed", "email.suppressed",
]);

class WebhookError extends Error {
    constructor(public code: string, public status = 503) {
        super(code);
        this.name = "WebhookError";
    }
}

type Integration = {
    id: string;
    workspaceId: string;
    accessToken: string;
    webhookSecretEncrypted: string;
};

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
            ...(status === 503 ? { "Retry-After": "30" } : {}),
        },
    });
}

function record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown> : null;
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function configInteger(name: string, fallback: number) {
    const value = process.env[name]?.trim();
    const parsed = value ? Number(value) : fallback;
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new WebhookError("INVALID_WEBHOOK_CONFIGURATION", 500);
    }
    return parsed;
}

async function limitedText(stream: ReadableStream<Uint8Array> | null, limit: number) {
    if (!stream) return "";
    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let size = 0;
    let result = "";
    try {
        for (; ;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > limit) {
                await reader.cancel();
                throw new WebhookError("PAYLOAD_TOO_LARGE", 413);
            }
            result += decoder.decode(chunk.value, { stream: true });
        }
        return result + decoder.decode();
    } finally {
        reader.releaseLock();
    }
}

async function providerEmail(apiKey: string, id: string, incoming = false) {
    try {
        const path = incoming ? "emails/receiving" : "emails";
        const response = await fetch(
            `https://api.resend.com/${path}/${encodeURIComponent(id)}${incoming ? "?html_format=cid" : ""}`,
            {
                headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
                cache: "no-store",
                redirect: "error",
                signal: AbortSignal.timeout(configInteger("RESEND_WEBHOOK_API_TIMEOUT_MS", 15_000)),
            },
        );
        if (!response.ok) throw new WebhookError("PROVIDER_EMAIL_LOOKUP_PENDING");
        const raw = await limitedText(
            response.body,
            configInteger("RESEND_WEBHOOK_PROVIDER_MAX_BYTES", 10 * 1024 * 1024),
        );
        const email = record(JSON.parse(raw));
        if (!email || email.id !== id) throw new WebhookError("INVALID_PROVIDER_EMAIL_RESPONSE");
        return email;
    } catch {
        // Never log response bodies, headers, API keys, or email contents.
        throw new WebhookError("PROVIDER_EMAIL_LOOKUP_PENDING");
    }
}

function mailbox(value: unknown): string {
    const candidate = text(value);
    const display = candidate.match(/^[^<>\r\n]*<([^<>\r\n]+)>$/);
    const address = (display?.[1] ?? candidate).trim();
    return /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(address)
        ? address.toLowerCase() : "";
}

function addresses(value: unknown) {
    const items = Array.isArray(value) ? value : [value];
    return [...new Set(items.map(mailbox).filter(Boolean))];
}

function rfcId(value: unknown) {
    const candidate = text(value);
    return /^<[^<>\s]+@[^<>\s]+>$/.test(candidate) ? candidate : "";
}

function firstDate(existing: Date | null, incoming: Date) {
    return existing && existing.getTime() < incoming.getTime() ? existing : incoming;
}

function eventReason(data: Record<string, unknown>, fallback: string) {
    return text(data.reason) || text(data.error) || text(record(data.failed)?.reason) ||
        text(record(data.bounce)?.message) || fallback;
}

// Serialize with disconnect/reconnect and reject a stale credential snapshot.
async function lockIntegration(tx: Prisma.TransactionClient, integration: Integration) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "WorkspaceIntegration"
        WHERE "id" = ${integration.id} AND "workspaceId" = ${integration.workspaceId}
          AND "provider" = 'resend' AND "status" = 'connected'
          AND "accessToken" = ${integration.accessToken}
          AND "webhookSecretEncrypted" = ${integration.webhookSecretEncrypted}
        FOR SHARE
    `;
    if (rows.length !== 1) throw new WebhookError("INTEGRATION_CHANGED_DURING_WEBHOOK");
}

async function lockEmail(tx: Prisma.TransactionClient, workspaceId: string, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "ScheduledEmail"
        WHERE "id" = ${id} AND "workspaceId" = ${workspaceId}
        FOR UPDATE
    `;
    if (rows.length !== 1) throw new WebhookError("EMAIL_MAPPING_PENDING");
    const email = await tx.scheduledEmail.findFirst({ where: { id, workspaceId } });
    if (!email) throw new WebhookError("EMAIL_MAPPING_PENDING");
    return email;
}

async function duplicate(tx: Prisma.TransactionClient, webhookEventId: string) {
    return Boolean(await tx.emailEvent.findUnique({
        where: { webhookEventId }, select: { id: true },
    }));
}

async function handleOutbound(
    integration: Integration,
    apiKey: string,
    type: string,
    data: Record<string, unknown>,
    occurredAt: Date,
    webhookEventId: string,
) {
    const providerMessageId = text(data.email_id);
    if (!providerMessageId) throw new WebhookError("MISSING_PROVIDER_EMAIL_ID", 400);
    const candidates = await prisma.scheduledEmail.findMany({
        where: { workspaceId: integration.workspaceId, providerMessageId },
        take: 2,
    });
    // A webhook can beat the sender's acknowledgment write. Retry rather than
    // acknowledge and permanently lose the event. Never guess by subject/to.
    if (candidates.length !== 1) throw new WebhookError("EMAIL_MAPPING_PENDING");
    const candidate = candidates[0];
    let messageId = candidate.providerRfcMessageId;
    const accepted = !["email.failed", "email.suppressed", "email.delivery_delayed"].includes(type);
    // Bounces/complaints must still suppress recipients if enrichment is unavailable.
    const enrichMessageId = ["email.sent", "email.delivered", "email.opened", "email.clicked"].includes(type);
    if (!messageId && enrichMessageId) {
        const sent = await providerEmail(apiKey, providerMessageId);
        messageId = rfcId(sent.message_id);
        if (!messageId) throw new WebhookError("EMAIL_MESSAGE_ID_PENDING");
    }

    const recipients = addresses(data.to);
    const snapshot = record(record(candidate.sendPayload)?.email);
    const savedRecipient = mailbox(snapshot?.to);
    if (recipients.length !== 1 || (savedRecipient && savedRecipient !== recipients[0])) {
        throw new WebhookError("EMAIL_RECIPIENT_MISMATCH");
    }

    return prisma.$transaction(async (tx) => {
        await lockIntegration(tx, integration);
        const email = await lockEmail(tx, integration.workspaceId, candidate.id);
        if (email.providerMessageId !== providerMessageId) throw new WebhookError("EMAIL_MAPPING_CHANGED");
        if (await duplicate(tx, webhookEventId)) return { received: true, duplicate: true };
        if (messageId && email.providerRfcMessageId && email.providerRfcMessageId !== messageId) {
            throw new WebhookError("EMAIL_MESSAGE_ID_CONFLICT");
        }

        const base = {
            workspaceId: email.workspaceId, customerId: email.customerId,
            generatedEmailId: email.generatedEmailId, scheduledEmailId: email.id,
            emailType: email.emailType, subject: email.subject, providerMessageId,
        };
        const existingSent = await tx.emailEvent.findFirst({
            where: {
                workspaceId: email.workspaceId, scheduledEmailId: email.id,
                status: "sent", providerMessageId,
            }, select: { id: true }
        });

        // The sender uses the same sent-event marker under the same email-row
        // lock. The marker and the increment always commit together here.
        if (accepted && !existingSent) {
            const updated = await tx.customer.updateMany({
                where: { id: email.customerId, workspaceId: email.workspaceId },
                data: { emailsSent: { increment: 1 }, lastEmail: email.subject },
            });
            if (updated.count !== 1) throw new WebhookError("CUSTOMER_MAPPING_MISSING");
            if (type !== "email.sent") {
                await tx.emailEvent.create({
                    data: {
                        ...base, status: "sent", createdAt: email.sentAt ?? occurredAt,
                        reason: "Provider event confirms an earlier send.",
                    }
                });
            }
        }

        const update: Prisma.ScheduledEmailUpdateManyMutationInput = {
            ...(messageId ? { providerRfcMessageId: messageId } : {}),
            // Fence any in-flight sender; its guarded writes must now fail.
            sendLockToken: null, sendLockedUntil: null,
        };
        if (accepted) update.sentAt = email.sentAt ?? occurredAt;
        if (type === "email.delivered") update.deliveredAt = firstDate(email.deliveredAt, occurredAt);
        if (type === "email.opened") update.openedAt = firstDate(email.openedAt, occurredAt);
        if (type === "email.clicked") update.clickedAt = firstDate(email.clickedAt, occurredAt);
        if (type === "email.bounced") update.bouncedAt = firstDate(email.bouncedAt, occurredAt);
        if (type === "email.complained") update.complainedAt = firstDate(email.complainedAt, occurredAt);

        const complained = Boolean(email.complainedAt) || email.status === "complained" || type === "email.complained";
        const bounced = Boolean(email.bouncedAt) || email.status === "bounced" || type === "email.bounced";
        const deliveryFailed = email.status === "delivery_failed" || type === "email.failed" || type === "email.suppressed";
        const delivered = Boolean(email.deliveredAt) || email.status === "delivered" || type === "email.delivered";
        update.status = complained ? "complained" : bounced ? "bounced" :
            deliveryFailed ? "delivery_failed" : delivered ? "delivered" :
                accepted || email.sentAt || existingSent ? "sent" : "delivery_pending";

        if (type === "email.complained") {
            update.failureReason = eventReason(data, "Spam complaint");
        } else if (type === "email.bounced" && !complained) {
            update.failureReason = eventReason(data, "Email bounced");
        } else if ((type === "email.failed" || type === "email.suppressed") && !complained && !bounced) {
            update.failureReason = eventReason(data, "Provider could not deliver this email");
        } else if (!complained && !bounced && !deliveryFailed) {
            update.failureReason = type === "email.delivery_delayed" && !delivered
                ? eventReason(data, "Delivery delayed") : null;
        }

        // Use the original event recipient, not an editable customer address.
        if (type === "email.bounced" || type === "email.complained" || type === "email.suppressed") {
            await tx.suppression.upsert({
                where: { workspaceId_email: { workspaceId: email.workspaceId, email: recipients[0] } },
                create: {
                    workspaceId: email.workspaceId, email: recipients[0],
                    reason: type === "email.complained" ? "Spam complaint" :
                        type === "email.bounced" ? "Email bounced" : "Provider suppression",
                },
                update: {},
            });
        }
        await tx.scheduledEmail.updateMany({
            where: { id: email.id, workspaceId: email.workspaceId }, data: update,
        });
        await tx.emailEvent.create({
            data: {
                ...base, webhookEventId, status: type.slice("email.".length),
                createdAt: occurredAt, reason: eventReason(data, `Resend ${type}`),
            }
        });
        return { received: true };
    });
}

async function handleReply(
    integration: Integration,
    apiKey: string,
    data: Record<string, unknown>,
    occurredAt: Date,
    webhookEventId: string,
) {
    const incomingId = text(data.email_id);
    if (!incomingId) throw new WebhookError("MISSING_PROVIDER_EMAIL_ID", 400);
    const incoming = await providerEmail(apiKey, incomingId, true);
    const headers = record(incoming.headers);
    if (!headers) throw new WebhookError("REPLY_HEADERS_PENDING");
    const header = (name: string) => {
        const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
        return text(entry?.[1]);
    };
    const autoSubmitted = header("auto-submitted").toLowerCase();
    if (autoSubmitted && autoSubmitted !== "no") {
        return { received: true, ignored: "automatic_reply" };
    }
    const explicitParent = header("in-reply-to");
    const references = header("references").match(/<[^<>\s]+@[^<>\s]+>/g) ?? [];
    // Prefer the direct parent; never substitute an older message when it exists.
    const parentId = explicitParent ? rfcId(explicitParent) : references.at(-1) ?? "";
    if (!parentId) {
        if (explicitParent) throw new WebhookError("AMBIGUOUS_REPLY_REFERENCE");
        return { received: true, ignored: "not_a_threaded_reply" };
    }
    const matches = await prisma.scheduledEmail.findMany({
        where: { workspaceId: integration.workspaceId, providerRfcMessageId: parentId },
        take: 2,
    });
    if (matches.length !== 1 || !matches[0].providerMessageId) {
        throw new WebhookError("REPLY_MAPPING_PENDING");
    }
    const matched = matches[0];
    const payload = record(record(matched.sendPayload)?.email);
    // Older emails may have no saved send payload; retrieve the actual envelope.
    const sent = payload ? null : await providerEmail(apiKey, matched.providerMessageId!);
    const sentTo = addresses(payload?.to ?? sent?.to);
    const sender = mailbox(incoming.from);
    const replyTo = addresses(payload?.replyTo ?? sent?.reply_to);
    const expectedInbox = replyTo.length ? replyTo : addresses(payload?.from ?? sent?.from);
    const incomingTo = addresses(incoming.to);
    if (sentTo.length !== 1 || !sender || sender !== sentTo[0] ||
        !expectedInbox.some((address) => incomingTo.includes(address))) {
        throw new WebhookError("REPLY_ENVELOPE_MISMATCH");
    }
    const authentication = record(incoming.authentication);
    const rejectedAuthentication = text(authentication?.dmarc).toLowerCase() === "fail";

    return prisma.$transaction(async (tx) => {
        await lockIntegration(tx, integration);
        const email = await lockEmail(tx, integration.workspaceId, matched.id);
        if (email.providerRfcMessageId !== parentId || email.providerMessageId !== matched.providerMessageId) {
            throw new WebhookError("REPLY_MAPPING_CHANGED");
        }
        if (await duplicate(tx, webhookEventId)) return { received: true, duplicate: true };
        // Separate provider notifications about the same inbound email must not
        // generate multiple reply records, even if their delivery IDs differ.
        const previous = await tx.emailEvent.findFirst({
            where: {
                workspaceId: email.workspaceId, scheduledEmailId: email.id,
                providerMessageId: incomingId, status: { in: ["replied", "reply_review_required"] },
            }, select: { id: true }
        });
        if (previous) return { received: true, duplicate: true };
        await tx.emailEvent.create({
            data: {
                workspaceId: email.workspaceId, customerId: email.customerId,
                generatedEmailId: email.generatedEmailId, scheduledEmailId: email.id,
                emailType: email.emailType, subject: email.subject,
                status: rejectedAuthentication ? "reply_review_required" : "replied",
                reason: rejectedAuthentication ? "Inbound reply failed DMARC; review required." :
                    "Inbound reply matched the exact original email reference.",
                providerMessageId: incomingId, webhookEventId, createdAt: occurredAt,
            }
        });
        return { received: true, reviewRequired: rejectedAuthentication };
    });
}

export async function POST(req: Request) {
    let webhookEventId: string | undefined;
    try {
        const workspaceId = new URL(req.url).searchParams.get("workspaceId")?.trim();
        if (!workspaceId) return json({ error: "Missing workspace routing identifier." }, 400);
        const id = req.headers.get("svix-id")?.trim();
        const timestamp = req.headers.get("svix-timestamp")?.trim();
        const signature = req.headers.get("svix-signature")?.trim();
        if (!id || !timestamp || !signature) return json({ error: "Invalid webhook signature." }, 401);

        const integration = await prisma.workspaceIntegration.findUnique({
            where: { workspaceId_provider: { workspaceId, provider: "resend" } },
            select: {
                id: true, workspaceId: true, status: true, accessToken: true,
                webhookId: true, webhookSecretEncrypted: true,
            },
        });
        if (!integration || integration.status !== "connected" || !integration.accessToken ||
            !integration.webhookId || !integration.webhookSecretEncrypted) {
            return json({ error: "Workspace webhook is not configured." }, 503);
        }
        const apiKey = decryptIntegrationSecret(integration.accessToken);
        const webhookSecret = decryptIntegrationSecret(integration.webhookSecretEncrypted);
        const raw = await limitedText(req.body, configInteger("RESEND_WEBHOOK_MAX_BODY_BYTES", 1024 * 1024));
        let verified: unknown;
        try {
            verified = await new Resend(apiKey).webhooks.verify({
                payload: raw, headers: { id, timestamp, signature }, webhookSecret,
            });
        } catch {
            return json({ error: "Invalid webhook signature." }, 401);
        }
        const event = record(verified);
        const type = text(event?.type);
        if (!OUTBOUND.has(type) && type !== "email.received") {
            return json({ received: true, ignored: "unsupported_event" });
        }
        const data = record(event?.data);
        const occurredAt = new Date(text(event?.created_at));
        if (!data || !Number.isFinite(occurredAt.getTime())) {
            throw new WebhookError("INVALID_WEBHOOK_EVENT", 400);
        }
        // Scoped to a workspace because one provider event can reach multiple endpoints.
        webhookEventId = `resend:${createHash("sha256").update(JSON.stringify([workspaceId, id])).digest("hex")}`;
        if (await duplicate(prisma, webhookEventId)) return json({ received: true, duplicate: true });
        const authorized: Integration = {
            id: integration.id, workspaceId,
            accessToken: integration.accessToken,
            webhookSecretEncrypted: integration.webhookSecretEncrypted,
        };
        const result = type === "email.received"
            ? await handleReply(authorized, apiKey, data, occurredAt, webhookEventId)
            : await handleOutbound(authorized, apiKey, type, data, occurredAt, webhookEventId);
        return json(result);
    } catch (error) {
        if (webhookEventId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            try {
                if (await duplicate(prisma, webhookEventId)) return json({ received: true, duplicate: true });
            } catch {
                // Retry if the database cannot confirm the duplicate.
            }
        }
        const code = error instanceof WebhookError ? error.code : "WEBHOOK_PROCESSING_PENDING";
        console.error("Resend webhook not completed", { code, webhookEventId });
        return json({ error: "Webhook could not be processed.", code },
            error instanceof WebhookError ? error.status : 503);
    }
}
