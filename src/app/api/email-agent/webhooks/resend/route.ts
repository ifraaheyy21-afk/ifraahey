import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { Prisma } from "@prisma/client";

import { prisma } from "../../../../../lib/prisma";
import { decryptIntegrationSecret } from "../../../../../lib/integrationEncryption";
import { emitAutomationEvent } from "../../../../../lib/automation/enrollment";
import { sanitiseEmailHtml } from "../../../../../lib/email-html";

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

const OUTBOUND_AUTOMATION_EVENTS: Record<string, "email_opened" | "email_clicked" | "email_bounced"> = {
    "email.opened": "email_opened",
    "email.clicked": "email_clicked",
    "email.bounced": "email_bounced",
};

async function duplicate(tx: Prisma.TransactionClient, webhookEventId: string) {
    return Boolean(await tx.emailEvent.findUnique({
        where: { webhookEventId }, select: { id: true },
    }));
}

// Events for an email sent by hand from the dashboard inbox. These have no
// customer row, so they only record the Message-ID (for reply matching),
// delivery problems and suppressions. Every write is idempotent.
async function handleInboxSentOutbound(
    integration: Integration,
    apiKey: string,
    type: string,
    data: Record<string, unknown>,
    providerMessageId: string,
) {
    const sentMessages = await prisma.inboxSentMessage.findMany({
        where: { workspaceId: integration.workspaceId, providerMessageId },
        take: 2,
    });
    if (sentMessages.length !== 1) return null;
    const sent = sentMessages[0];
    const recipients = addresses(data.to);
    if (recipients.length !== 1 || recipients[0] !== sent.toEmail.toLowerCase()) {
        throw new WebhookError("EMAIL_RECIPIENT_MISMATCH");
    }

    let messageId = sent.providerRfcMessageId;
    if (!messageId && ["email.sent", "email.delivered", "email.opened", "email.clicked"].includes(type)) {
        messageId = rfcId((await providerEmail(apiKey, providerMessageId)).message_id) || null;
        if (!messageId) throw new WebhookError("EMAIL_MESSAGE_ID_PENDING");
    }

    const problem = type === "email.complained" ? eventReason(data, "Spam complaint")
        : type === "email.bounced" ? eventReason(data, "Email bounced")
            : type === "email.failed" || type === "email.suppressed"
                ? eventReason(data, "Provider could not deliver this email") : null;

    await prisma.$transaction(async (tx) => {
        await lockIntegration(tx, integration);
        await tx.inboxSentMessage.updateMany({
            where: { id: sent.id, workspaceId: integration.workspaceId, providerMessageId },
            data: {
                ...(messageId && !sent.providerRfcMessageId ? { providerRfcMessageId: messageId } : {}),
                ...(problem ? { failureReason: problem.slice(0, 1000) } : {}),
            },
        });
        if (type === "email.bounced" || type === "email.complained" || type === "email.suppressed") {
            await tx.suppression.upsert({
                where: { workspaceId_email: { workspaceId: integration.workspaceId, email: recipients[0] } },
                create: {
                    workspaceId: integration.workspaceId, email: recipients[0],
                    reason: type === "email.complained" ? "Spam complaint" :
                        type === "email.bounced" ? "Email bounced" : "Provider suppression",
                },
                update: {},
            });
        }
    });
    return { received: true, inboxMessage: true };
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
    if (candidates.length === 0) {
        const inboxResult = await handleInboxSentOutbound(integration, apiKey, type, data, providerMessageId);
        if (inboxResult) return inboxResult;
    }
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

    const result = await prisma.$transaction(async (tx) => {
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

    // After commit, so a rolled-back webhook never enrolls anyone. Keyed by
    // the email, so this and the tracking pixel enroll at most once.
    const automationEvent = OUTBOUND_AUTOMATION_EVENTS[type];
    if (automationEvent && !("duplicate" in result)) {
        await emitAutomationEvent({
            workspaceId: candidate.workspaceId,
            customerId: candidate.customerId,
            event: { type: automationEvent },
            eventKey: candidate.id,
            data: { scheduledEmailId: candidate.id, subject: candidate.subject },
        });
    }
    return result;
}

const MAX_STORED_HTML = 512 * 1024;
const MAX_STORED_TEXT = 128 * 1024;

function displayName(value: unknown) {
    const match = text(value).match(/^\s*"?([^"<>\r\n]+?)"?\s*<[^<>]+>$/);
    return match?.[1]?.trim().slice(0, 180) || null;
}

function attachmentList(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.map(record).filter((item): item is Record<string, unknown> => Boolean(item)).slice(0, 20).map((item) => ({
        id: text(item.id).slice(0, 200),
        fileName: (text(item.filename) || "Attachment").slice(0, 255),
        mimeType: (text(item.content_type) || "application/octet-stream").slice(0, 120),
        size: typeof item.size === "number" && Number.isFinite(item.size) ? item.size : 0,
    }));
}

// The body of an inbound email as stored for the inbox.
function receivedMessage(incoming: Record<string, unknown>, incomingId: string, occurredAt: Date) {
    const html = text(incoming.html);
    const created = new Date(text(incoming.created_at));
    return {
        providerEmailId: incomingId,
        fromEmail: mailbox(incoming.from),
        fromName: displayName(incoming.from),
        toEmail: addresses(incoming.to)[0] ?? "",
        subject: (text(incoming.subject) || "(no subject)").slice(0, 998),
        html: html ? sanitiseEmailHtml(html).slice(0, MAX_STORED_HTML) : null,
        plainText: text(incoming.text).slice(0, MAX_STORED_TEXT),
        rfcMessageId: rfcId(incoming.message_id) || null,
        attachments: attachmentList(incoming.attachments),
        receivedAt: Number.isFinite(created.getTime()) ? created : occurredAt,
    };
}

// A reply to an email sent by hand from the dashboard inbox.
async function handleInboxSentReply(
    integration: Integration,
    incoming: Record<string, unknown>,
    incomingId: string,
    parentId: string,
    occurredAt: Date,
    rejectedAuthentication: boolean,
) {
    const matches = await prisma.inboxSentMessage.findMany({
        where: { workspaceId: integration.workspaceId, providerRfcMessageId: parentId },
        take: 2,
    });
    if (matches.length !== 1) return null;
    const sent = matches[0];
    const sender = mailbox(incoming.from);
    const incomingTo = addresses(incoming.to);
    if (!sender || sender !== sent.toEmail.toLowerCase() || !incomingTo.includes(sent.fromEmail.toLowerCase())) {
        throw new WebhookError("REPLY_ENVELOPE_MISMATCH");
    }
    const message = receivedMessage(incoming, incomingId, occurredAt);
    await prisma.$transaction(async (tx) => {
        await lockIntegration(tx, integration);
        await tx.inboxReceivedMessage.upsert({
            where: { workspaceId_providerEmailId: { workspaceId: integration.workspaceId, providerEmailId: incomingId } },
            create: {
                ...message,
                workspaceId: integration.workspaceId,
                threadId: sent.threadId ?? `ism_${sent.id}`,
                inboxSentMessageId: sent.id,
                authenticationFailed: rejectedAuthentication,
            },
            update: {},
        });
    });
    return { received: true, inboxMessage: true, reviewRequired: rejectedAuthentication };
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
    const authentication = record(incoming.authentication);
    const rejectedAuthentication = text(authentication?.dmarc).toLowerCase() === "fail";
    const matches = await prisma.scheduledEmail.findMany({
        where: { workspaceId: integration.workspaceId, providerRfcMessageId: parentId },
        take: 2,
    });
    if (matches.length === 0) {
        const inboxResult = await handleInboxSentReply(
            integration, incoming, incomingId, parentId, occurredAt, rejectedAuthentication,
        );
        if (inboxResult) return inboxResult;
    }
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
    const message = receivedMessage(incoming, incomingId, occurredAt);

    const result = await prisma.$transaction(async (tx) => {
        await lockIntegration(tx, integration);
        const email = await lockEmail(tx, integration.workspaceId, matched.id);
        if (email.providerRfcMessageId !== parentId || email.providerMessageId !== matched.providerMessageId) {
            throw new WebhookError("REPLY_MAPPING_CHANGED");
        }
        if (await duplicate(tx, webhookEventId)) return { received: true, duplicate: true };
        // Keep the reply itself so the inbox can show it.
        await tx.inboxReceivedMessage.upsert({
            where: { workspaceId_providerEmailId: { workspaceId: email.workspaceId, providerEmailId: incomingId } },
            create: {
                ...message,
                workspaceId: email.workspaceId,
                threadId: `se_${email.id}`,
                scheduledEmailId: email.id,
                customerId: email.customerId,
                authenticationFailed: rejectedAuthentication,
            },
            update: {},
        });
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

    // Replies that fail DMARC could be spoofed, so they never start workflows.
    if (!("duplicate" in result) && !rejectedAuthentication) {
        await emitAutomationEvent({
            workspaceId: matched.workspaceId,
            customerId: matched.customerId,
            event: { type: "email_replied" },
            eventKey: incomingId,
            data: { scheduledEmailId: matched.id, subject: matched.subject },
        });
    }
    return result;
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
