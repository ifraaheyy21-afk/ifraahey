import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Prisma, ScheduledEmail } from "@prisma/client";
import { prisma } from "./prisma";
import {
    getResendErrorMessage,
    getWorkspaceResendClient,
} from "./resendIntegration";


type SendPayload = {
    from: string;
    to: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    headers: Record<string, string>;
};
type WorkerConfig = ReturnType<typeof getEmailSenderConfig>;
export type WorkerResult = { id: string; status: string; providerMessageId?: string };

class OwnershipLostError extends Error { }
class ReviewRequiredError extends Error { }
class RetryableSendError extends Error { }

function positiveInteger(name: string, fallback: number) {
    const raw = process.env[name]?.trim();
    const value = raw ? Number(raw) : fallback;
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive safe integer.`);
    }
    return value;
}

export function getEmailSenderConfig() {
    const leaseMs = positiveInteger("EMAIL_SEND_LEASE_MS", 5 * 60_000);
    const retryWindowMs = positiveInteger("EMAIL_SEND_RETRY_WINDOW_MS", 23 * 60 * 60_000);
    // Resend's documented retention is 24 hours. Leave at least one lease
    // (and at least a minute) before expiry; never extend this using config.
    const providerWindowMs = 24 * 60 * 60_000;
    if (retryWindowMs > providerWindowMs - Math.max(leaseMs, 60_000)) {
        throw new Error("EMAIL_SEND_RETRY_WINDOW_MS must leave a safety margin within Resend's 24-hour window.");
    }
    const retryBaseMs = positiveInteger("EMAIL_SEND_RETRY_BASE_MS", 5 * 60_000);
    const retryMaxMs = positiveInteger("EMAIL_SEND_RETRY_MAX_MS", 60 * 60_000);
    if (retryBaseMs > retryMaxMs) {
        throw new Error("EMAIL_SEND_RETRY_BASE_MS must not exceed EMAIL_SEND_RETRY_MAX_MS.");
    }
    return {
        leaseMs,
        retryWindowMs,
        retryBaseMs,
        retryMaxMs,
        maxAttempts: positiveInteger("EMAIL_SEND_MAX_ATTEMPTS", 3),
        batchSize: positiveInteger("EMAIL_SEND_BATCH_SIZE", 25),
    };
}

function getAppUrl() {
    const configured = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (!configured && process.env.NODE_ENV === "production") {
        throw new ReviewRequiredError("APP_URL or NEXT_PUBLIC_APP_URL must be configured before sending email.");
    }
    const url = new URL(configured || "http://localhost:3000");
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new ReviewRequiredError("The application URL must be an HTTP(S) URL without credentials, query or fragment.");
    }
    if (process.env.NODE_ENV === "production" && (
        url.protocol !== "https:" ||
        /^(localhost|127\.|0\.0\.0\.0$|\[::1\]$)/i.test(url.hostname) ||
        url.hostname.endsWith(".localhost")
    )) {
        throw new ReviewRequiredError("Production email links require a public HTTPS application URL.");
    }
    return url.toString().replace(/\/+$/, "");
}

function escapeHtml(value: string) {
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function unsubscribeUrl(email: ScheduledEmail, recipient: string, appUrl: string) {
    const secret = process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || "";
    if (!secret.trim()) throw new ReviewRequiredError("An unsubscribe signing secret is required.");
    // Preserve the existing unsubscribe endpoint's signing format.
    const token = createHmac("sha256", secret)
        .update(`${email.workspaceId}:${email.customerId}:${recipient.toLowerCase()}`)
        .digest("hex");
    return `${appUrl}/api/email-agent/unsubscribe` +
        `?workspaceId=${encodeURIComponent(email.workspaceId)}` +
        `&customerId=${encodeURIComponent(email.customerId)}` +
        `&email=${encodeURIComponent(recipient)}` +
        `&token=${encodeURIComponent(token)}`;
}

function ownerWhere(email: ScheduledEmail, token: string): Prisma.ScheduledEmailWhereInput {
    return { id: email.id, workspaceId: email.workspaceId, status: "sending", sendLockToken: token };
}

async function ownedUpdate(
    email: ScheduledEmail,
    token: string,
    data: Prisma.ScheduledEmailUpdateManyMutationInput,
    tx: Prisma.TransactionClient = prisma,
) {
    const result = await tx.scheduledEmail.updateMany({ where: ownerWhere(email, token), data });
    if (result.count !== 1) throw new OwnershipLostError("Email worker ownership was lost.");
}

function eventData(email: ScheduledEmail, subject: string, status: string, reason: string) {
    return {
        workspaceId: email.workspaceId,
        customerId: email.customerId,
        generatedEmailId: email.generatedEmailId,
        scheduledEmailId: email.id,
        emailType: email.emailType,
        subject,
        status,
        reason,
    };
}

async function stopForReview(email: ScheduledEmail, token: string, reason: string): Promise<WorkerResult> {
    await prisma.$transaction(async (tx) => {
        await ownedUpdate(email, token, {
            status: "review_required", failureReason: reason,
            sendLockToken: null, sendLockedUntil: null,
        }, tx);
        await tx.emailEvent.create({ data: eventData(email, email.subject, "send_review_required", reason) });
    });
    return { id: email.id, status: "review_required" };
}

function record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown> : null;
}

function savedPayload(value: unknown, email: ScheduledEmail): SendPayload {
    const envelope = record(value);
    const payload = record(envelope?.email);
    const headers = record(payload?.headers);
    const allowed = new Set(["from", "to", "subject", "html", "text", "replyTo", "headers"]);
    if (!envelope || envelope.version !== 1 || !payload || !headers ||
        Object.keys(envelope).some((key) => key !== "version" && key !== "email") ||
        Object.keys(payload).some((key) => !allowed.has(key)) ||
        typeof payload.from !== "string" || !payload.from.trim() ||
        typeof payload.to !== "string" || !payload.to.trim() ||
        typeof payload.subject !== "string" || typeof payload.html !== "string" ||
        (payload.text !== undefined && typeof payload.text !== "string") ||
        (payload.replyTo !== undefined && typeof payload.replyTo !== "string") ||
        Object.values(headers).some((v) => typeof v !== "string") ||
        headers["X-Scheduled-Email-ID"] !== email.id ||
        headers["X-Workspace-ID"] !== email.workspaceId ||
        typeof headers["List-Unsubscribe"] !== "string"
    ) {
        throw new ReviewRequiredError("The saved email payload is missing or invalid. Review this send before retrying.");
    }
    // Return the saved object intact: never rebuild a retry from editable content.
    return payload as SendPayload;
}

async function preparePayload(
    email: ScheduledEmail,
    token: string,
    recipient: string,
    metadata: unknown,
    credentialFingerprint: string,
    config: WorkerConfig,
): Promise<SendPayload> {
    const sender = record(metadata);
    const senderEmail = typeof sender?.senderEmail === "string" ? sender.senderEmail.trim() : "";
    const senderName = typeof sender?.senderName === "string" ? sender.senderName.trim() : "";
    const replyTo = typeof sender?.replyToEmail === "string" && sender.replyToEmail.trim()
        ? sender.replyToEmail.trim() : senderEmail;
    if (!senderEmail) throw new ReviewRequiredError("The connected Resend account does not have a sender email.");
    const appUrl = getAppUrl();
    const unsubscribe = unsubscribeUrl(email, recipient, appUrl);
    let html = email.html;
    if (!html.includes(unsubscribe)) {
        html += `\n<div style="margin-top:32px;padding-top:18px;border-top:1px solid #e5e7eb;font-size:12px;line-height:18px;color:#6b7280;text-align:center;">\nYou are receiving this email because you are a customer or contact.\n<br />\n<a href="${escapeHtml(unsubscribe)}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>\n</div>`;
    }
    return prisma.$transaction(async (tx) => {
        // Lock the owned row first; tracking links and the payload commit together.
        await ownedUpdate(email, token, { sendLockedUntil: new Date(Date.now() + config.leaseMs) }, tx);
        const pattern = /\bhref\s*=\s*(["'])(.*?)\1/gi;
        const matches = [...html.matchAll(pattern)];
        let cursor = 0;
        let trackedHtml = "";
        const links = new Map<string, string>();
        for (const match of matches) {
            const original = match[2];
            const index = match.index!;
            trackedHtml += html.slice(cursor, index);
            cursor = index + match[0].length;
            if (!/^https?:\/\//i.test(original) || original.includes("/api/email-agent/track/click/") || original.includes("/api/email-agent/unsubscribe")) {
                trackedHtml += match[0];
                continue;
            }
            let trackingUrl = links.get(original);
            if (!trackingUrl) {
                const link = await tx.trackedLink.create({
                    data: {
                        workspaceId: email.workspaceId, scheduledEmailId: email.id,
                        customerId: email.customerId, originalUrl: original,
                    }
                });
                trackingUrl = `${appUrl}/api/email-agent/track/click/${link.id}`;
                links.set(original, trackingUrl);
            }
            trackedHtml += `href="${escapeHtml(trackingUrl)}"`;
        }
        trackedHtml += html.slice(cursor);
        const payload: SendPayload = {
            from: senderName ? `${senderName} <${senderEmail}>` : senderEmail,
            to: recipient, subject: email.subject, html: trackedHtml,
            ...(email.plainText ? { text: email.plainText } : {}),
            ...(replyTo ? { replyTo } : {}),
            headers: {
                "List-Unsubscribe": `<${unsubscribe}>`,
                "X-Scheduled-Email-ID": email.id,
                "X-Workspace-ID": email.workspaceId,
            },
        };
        const snapshot = JSON.parse(JSON.stringify({ version: 1, email: payload })) as Prisma.InputJsonValue;
        await ownedUpdate(email, token, {
            sendPayload: snapshot, sendCredentialFingerprint: credentialFingerprint,
        }, tx);
        return payload;
    });
}

async function finishSent(email: ScheduledEmail, token: string, providerMessageId: string, payload: SendPayload, source: "cron" | "manual"): Promise<WorkerResult> {
    await prisma.$transaction(async (tx) => {
        await ownedUpdate(email, token, {
            status: "sent", providerMessageId, sentAt: email.sentAt ?? new Date(),
            failureReason: null, sendLockToken: null, sendLockedUntil: null,
        }, tx);
        // A verified webhook may have recorded the sent event already.
        const existing = await tx.emailEvent.findFirst({
            where: {
                workspaceId: email.workspaceId, scheduledEmailId: email.id,
                status: "sent", providerMessageId,
            }, select: { id: true }
        });
        if (!existing) {
            const customer = await tx.customer.updateMany({
                where: { id: email.customerId, workspaceId: email.workspaceId },
                data: { emailsSent: { increment: 1 }, lastEmail: payload.subject },
            });
            if (customer.count !== 1) throw new Error("Customer not found in this workspace.");
            await tx.emailEvent.create({
                data: {
                    ...eventData(email, payload.subject, "sent", source === "manual" ? "Email sent manually" : "Email sent via cron"), providerMessageId,
                }
            });
        }
    });
    return { id: email.id, status: "sent", providerMessageId };
}

function canRetry(startedAt: Date, config: WorkerConfig, at = Date.now()) {
    const started = startedAt.getTime();
    return Number.isFinite(started) && started <= at && at < started + config.retryWindowMs;
}

async function retryOrReview(email: ScheduledEmail, token: string, attemptedAt: Date, reason: string, config: WorkerConfig): Promise<WorkerResult> {
    const retryCount = email.retryCount + 1;
    const delay = Math.min(config.retryMaxMs, config.retryBaseMs * 2 ** Math.min(retryCount, 30));
    const retryAt = new Date(Date.now() + delay);
    if (retryCount >= config.maxAttempts || !canRetry(attemptedAt, config, retryAt.getTime())) {
        return stopForReview(email, token, `${reason} Automatic retries stopped; verify the provider outcome before sending again.`);
    }
    await prisma.$transaction(async (tx) => {
        await ownedUpdate(email, token, {
            status: "failed", failureReason: reason, lastRetryAt: retryAt,
            sendLockToken: null, sendLockedUntil: null,
        }, tx);
        // An uncertain result is not evidence that delivery failed.
        await tx.emailEvent.create({ data: eventData(email, email.subject, "send_retry_pending", reason) });
    });
    return { id: email.id, status: "failed_retry_scheduled" };
}

export function eligibleScheduledEmailsWhere(now: Date, config: WorkerConfig): Prisma.ScheduledEmailWhereInput {
    return {
        OR: [
            { status: "scheduled", scheduledFor: { lte: now } },
            { status: "failed", retryCount: { lt: config.maxAttempts }, OR: [{ lastRetryAt: null }, { lastRetryAt: { lte: now } }] },
            { status: "sending", OR: [{ sendLockedUntil: null }, { sendLockedUntil: { lte: now } }] },
        ]
    };
}

export async function processScheduledEmail(email: ScheduledEmail, config: WorkerConfig, source: "cron" | "manual" = "cron"): Promise<WorkerResult> {
    const token = randomUUID();
    const claimed = await prisma.scheduledEmail.updateMany({
        where: {
            id: email.id, workspaceId: email.workspaceId,
            status: email.status, updatedAt: email.updatedAt,
            AND: [source === "manual" && email.status === "scheduled"
                ? { status: "scheduled" }
                : eligibleScheduledEmailsWhere(new Date(), config)],
        },
        data: {
            status: "sending", sendLockToken: token, sendLockedUntil: new Date(Date.now() + config.leaseMs),
            ...(source === "manual" && email.status === "scheduled" ? { scheduledFor: new Date() } : {}),
        },
    });
    if (claimed.count !== 1) return { id: email.id, status: "skipped_locked" };
    let attemptedAt = email.sendAttemptedAt;
    let acknowledgedId = email.providerMessageId;
    let payload: SendPayload | null = null;
    try {
        if (email.sendPayload !== null && email.sendPayload !== undefined) {
            payload = savedPayload(email.sendPayload, email);
        }
        // A recorded provider acknowledgment never goes through the send API again.
        if (acknowledgedId) {
            if (!payload) throw new ReviewRequiredError("Provider acknowledgment exists without a saved payload; reconcile this email manually.");
            return await finishSent(email, token, acknowledgedId, payload, source);
        }
        if (!payload && (attemptedAt || email.status !== "scheduled" || email.retryCount > 0)) {
            throw new ReviewRequiredError("This older or interrupted send has no saved payload. Check Resend before retrying it.");
        }
        if (attemptedAt && !canRetry(attemptedAt, config)) {
            throw new ReviewRequiredError("The safe retry window has expired. Check Resend before sending again.");
        }
        if (email.retryCount >= config.maxAttempts) {
            throw new ReviewRequiredError("The send attempt limit was reached. Check Resend before sending again.");
        }
        const client = await getWorkspaceResendClient(email.workspaceId);
        if (!client.credentialFingerprint) throw new ReviewRequiredError("Update the Resend integration helper before running this worker.");
        if (payload && email.sendCredentialFingerprint !== client.credentialFingerprint) {
            throw new ReviewRequiredError("The Resend credential changed. Review the previous send outcome before retrying.");
        }
        const customer = await prisma.customer.findFirst({
            where: { id: email.customerId, workspaceId: email.workspaceId },
            select: { email: true, unsubscribedAt: true },
        });
        if (!customer) throw new ReviewRequiredError("Customer not found in this workspace.");
        if (!payload) payload = await preparePayload(email, token, customer.email.trim(), client.metadata, client.credentialFingerprint, config);

        // Refresh after payload preparation, immediately before authorizing a send.
        const freshCustomer = await prisma.customer.findFirst({
            where: { id: email.customerId, workspaceId: email.workspaceId },
            select: { email: true, unsubscribedAt: true },
        });
        if (!freshCustomer || freshCustomer.email.trim().toLowerCase() !== payload.to.trim().toLowerCase()) {
            throw new ReviewRequiredError("The recipient changed or was removed. Review the saved email before sending.");
        }
        const suppressed = await prisma.suppression.findUnique({
            where: {
                workspaceId_email: { workspaceId: email.workspaceId, email: payload.to.trim().toLowerCase() },
            }, select: { id: true }
        });
        if (suppressed || freshCustomer.unsubscribedAt) {
            if (attemptedAt) throw new ReviewRequiredError("Recipient is now unsubscribed or suppressed; no further send attempted. Reconcile the previous attempt.");
            await prisma.$transaction(async (tx) => {
                await ownedUpdate(email, token, {
                    status: "cancelled", failureReason: "Customer is unsubscribed or suppressed",
                    sendLockToken: null, sendLockedUntil: null,
                }, tx);
                await tx.emailEvent.create({ data: eventData(email, payload!.subject, "cancelled", "Customer is unsubscribed or suppressed") });
            });
            return { id: email.id, status: "skipped_suppressed" };
        }
        attemptedAt ??= new Date();
        if (!canRetry(attemptedAt, config)) throw new ReviewRequiredError("The safe retry window expired during preparation. Review this send.");
        // Commit the attempt marker before any network side effect. Expired/stolen
        // ownership, cancellation or an acknowledgment prevents a new send.
        const authorized = await prisma.scheduledEmail.updateMany({
            where: {
                ...ownerWhere(email, token), providerMessageId: null,
                sendLockedUntil: { gt: new Date() },
            },
            data: {
                sendAttemptedAt: attemptedAt, retryCount: { increment: 1 },
                sendLockedUntil: new Date(Date.now() + config.leaseMs),
            },
        });
        if (authorized.count !== 1) throw new OwnershipLostError("Email send authorization was lost.");
        // Use the same stable key for every attempt. Never rotate a key on errors.
        const idempotencyKey = `scheduled-email/${createHash("sha256").update(JSON.stringify([email.workspaceId, email.id])).digest("hex")}`;
        let sent: Awaited<ReturnType<typeof client.resend.emails.send>>;
        try {
            sent = await client.resend.emails.send(payload, { idempotencyKey });
        } catch {
            throw new RetryableSendError("The provider response was interrupted; the send outcome is uncertain.");
        }
        if (sent.error) {
            const message = getResendErrorMessage(sent.error);
            const providerError = sent.error as { name?: string; statusCode?: number };
            if (providerError.name === "concurrent_idempotent_requests" ||
                providerError.name === "rate_limit_exceeded" ||
                providerError.name === "application_error" ||
                providerError.name === "internal_server_error" ||
                providerError.statusCode === 429 ||
                (typeof providerError.statusCode === "number" && providerError.statusCode >= 500)) {
                throw new RetryableSendError(message);
            }
            throw new ReviewRequiredError(message);
        }
        acknowledgedId = sent.data?.id || null;
        if (!acknowledgedId) throw new RetryableSendError("Resend returned no identifier; the send outcome is uncertain.");
        // Persist acknowledgment independently of analytics/events. Recovery then
        // finishes local bookkeeping without calling the provider again.
        await ownedUpdate(email, token, { providerMessageId: acknowledgedId, sentAt: new Date(), failureReason: null });
        return await finishSent(email, token, acknowledgedId, payload, source);
    } catch (error) {
        if (error instanceof OwnershipLostError) return { id: email.id, status: "skipped_ownership_lost" };
        if (acknowledgedId) {
            // Never set failed/retry after a known send. Leave the lease for recovery.
            // If the first acknowledgment write failed, make one best-effort save.
            try {
                await ownedUpdate(email, token, {
                    providerMessageId: acknowledgedId,
                    failureReason: "Provider accepted the email; local bookkeeping needs recovery.",
                });
            } catch {
                // The next owner reuses the saved payload/key within the safe window.
            }
            console.error("Email send bookkeeping pending", { scheduledEmailId: email.id, providerMessageId: acknowledgedId });
            return { id: email.id, status: "sent_pending_reconciliation", providerMessageId: acknowledgedId };
        }
        if (error instanceof RetryableSendError && attemptedAt) {
            return retryOrReview(email, token, attemptedAt, error.message, config);
        }
        if (error instanceof ReviewRequiredError) return stopForReview(email, token, error.message);
        // Database/preparation errors do not prove non-delivery. Leave the owned
        // row recoverable instead of marking it failed and blindly sending again.
        console.error("Email worker interrupted", { scheduledEmailId: email.id, errorType: error instanceof Error ? error.name : "unknown" });
        return { id: email.id, status: "recovery_pending" };
    }
}

