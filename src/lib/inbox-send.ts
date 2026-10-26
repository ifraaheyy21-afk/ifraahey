// Sending replies and new emails from the dashboard inbox.
//
// Kept free of Prisma and Resend imports so tests can pass in fakes; the
// route at /api/dashboard/inbox/send wires in the real store and client.
import { createHash } from "node:crypto";

import { friendlyResendError } from "./resend-errors";
import type {
    InboxMessage,
    InboxThread,
} from "./inbox-data";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
// Resend caps a whole email at 40 MB once files are base64-encoded.
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_SUBJECT_LENGTH = 500;
const MAX_HTML_LENGTH = 500_000;
const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

export class InboxSendError extends Error {
    readonly status: number;

    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
    }
}

export type InboxSendAttachment = {
    fileName: string;
    mimeType: string;
    size: number;
    content: Buffer;
};

export type InboxSendInput = {
    sendKey: string;
    threadId: string | null;
    toEmail: string;
    toName: string | null;
    subject: string;
    html: string;
    attachments: InboxSendAttachment[];
};

export type InboxSentRecord = {
    id: string;
    workspaceId: string;
    sendKey: string;
    threadId: string | null;
    toEmail: string;
    toName: string | null;
    fromEmail: string;
    fromName: string | null;
    subject: string;
    html: string;
    plainText: string;
    inReplyTo: string | null;
    // The first file, kept for rows sent before several files were allowed.
    attachmentName: string | null;
    attachmentMimeType: string | null;
    attachmentSize: number | null;
    /** Every file sent: SentAttachmentMeta[] (names and sizes; files aren't kept). */
    attachments?: unknown;
    status: string;
    failureReason: string | null;
    providerMessageId: string | null;
    providerRfcMessageId?: string | null;
    sentAt: Date | null;
    createdAt: Date;
};

export type SentAttachmentMeta = { fileName: string; mimeType: string; size: number };

export type InboxSentCreate = Omit<
    InboxSentRecord,
    "id" | "status" | "failureReason" | "providerMessageId" | "providerRfcMessageId" | "sentAt" | "createdAt" | "attachments"
> & { attachments?: SentAttachmentMeta[] };

export type InboxSentStore = {
    findBySendKey(workspaceId: string, sendKey: string): Promise<InboxSentRecord | null>;
    // Must reject when (workspaceId, sendKey) already exists.
    create(data: InboxSentCreate): Promise<InboxSentRecord>;
    retry(id: string, data: InboxSentCreate): Promise<InboxSentRecord>;
    markSent(id: string, providerMessageId: string): Promise<InboxSentRecord>;
    markFailed(id: string, reason: string): Promise<void>;
};

type ResendLikeResult = {
    data?: { id?: string } | null;
    error?: { message?: string; name?: string } | null;
};

export type InboxResendClient = {
    resend: {
        emails: {
            send(
                payload: {
                    from: string;
                    to: string;
                    subject: string;
                    html: string;
                    text: string;
                    replyTo?: string;
                    headers?: Record<string, string>;
                    attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
                },
                options: { idempotencyKey: string },
            ): Promise<ResendLikeResult>;
            // Resend's GET /emails/:id; its message_id is the RFC Message-ID.
            get?(id: string): Promise<{
                data?: { message_id?: string | null } | null;
                error?: unknown;
            }>;
        };
    };
    metadata: unknown;
};

/** An earlier outbound inbox message whose RFC Message-ID isn't known yet. */
export type PendingRfcMessage = { messageId: string; providerMessageId: string };

export type InboxSendDeps = {
    workspaceId: string;
    store: InboxSentStore;
    getClient(workspaceId: string): Promise<InboxResendClient>;
    loadThreads(workspaceId: string): Promise<InboxThread[]>;
    isSuppressed(workspaceId: string, email: string): Promise<boolean>;
    // Optional: let replies thread before Resend's email.sent webhook arrives.
    // messageIds are inbox message ids such as sent_<id> or se_msg_<id>.
    findPendingRfcMessages?(workspaceId: string, messageIds: string[]): Promise<PendingRfcMessage[]>;
    saveRfcMessageId?(workspaceId: string, messageId: string, rfcMessageId: string): Promise<void>;
};

const MAX_RFC_LOOKUPS = 10;

/**
 * Ask Resend for an email's RFC Message-ID; null if it isn't known yet.
 * "restricted" means the key can only send, so no lookup will ever work.
 */
async function lookupRfcMessageId(client: InboxResendClient, providerMessageId: string) {
    if (!client.resend.emails.get) return null;
    try {
        const result = await client.resend.emails.get(providerMessageId);
        if (result.error) {
            const name = (result.error as { name?: unknown }).name;
            return name === "restricted_api_key" ? "restricted" : null;
        }
        return formatMessageIdHeader(result.data?.message_id ?? undefined);
    } catch {
        return null;
    }
}

/**
 * Fill in Message-IDs Resend knows but the webhook hasn't delivered yet, so
 * In-Reply-To/References can point at our own earlier messages. Best effort.
 */
async function withRfcMessageIds(deps: InboxSendDeps, client: InboxResendClient, thread: InboxThread) {
    if (!deps.findPendingRfcMessages || !deps.saveRfcMessageId) return thread;
    const missing = thread.messages
        .filter((message) => message.direction === "outbound" && !formatMessageIdHeader(message.providerMessageId) &&
            message.status !== "scheduled" && message.status !== "failed")
        .slice(-MAX_RFC_LOOKUPS)
        .map((message) => message.id);
    if (missing.length === 0) return thread;

    let pending: PendingRfcMessage[];
    try {
        pending = await deps.findPendingRfcMessages(deps.workspaceId, missing);
    } catch {
        return thread;
    }
    const found = new Map<string, string>();
    for (const item of pending) {
        const rfcMessageId = await lookupRfcMessageId(client, item.providerMessageId);
        if (rfcMessageId === "restricted") break;
        if (!rfcMessageId) continue;
        found.set(item.messageId, rfcMessageId);
        await deps.saveRfcMessageId(deps.workspaceId, item.messageId, rfcMessageId).catch(() => undefined);
    }
    if (found.size === 0) return thread;
    return {
        ...thread,
        messages: thread.messages.map((message) =>
            found.has(message.id) ? { ...message, providerMessageId: found.get(message.id) } : message),
    };
}

function text(value: FormDataEntryValue | null, maxLength: number) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function htmlToPlainText(html: string) {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#0?39;/gi, "'")
        .replace(/&amp;/gi, "&")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

// The inbox renders stored HTML directly, so drop anything that can run script.
export function sanitiseEmailHtml(html: string) {
    return html
        .replace(/<(script|style|iframe|object|embed|form)\b[\s\S]*?<\/\1\s*>/gi, "")
        .replace(/<(script|style|iframe|object|embed|form|meta|link|base)\b[^>]*>/gi, "")
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/\s(href|src)\s*=\s*(["']?)\s*(javascript|vbscript|data):[^"'\s>]*\2/gi, "");
}

function formatMessageIdHeader(value: string | undefined) {
    const trimmed = value?.trim();
    if (!trimmed || !trimmed.includes("@") || /[\r\n]/.test(trimmed)) return null;
    return trimmed.startsWith("<") ? trimmed : `<${trimmed}>`;
}

/** Read and validate the multipart body the inbox page posts. */
export async function parseSendForm(form: FormData): Promise<InboxSendInput> {
    const sendKey = text(form.get("sendKey"), 100);
    const threadId = text(form.get("threadId"), 200) || null;
    const toEmail = text(form.get("to"), 320).toLowerCase();
    const toName = text(form.get("toName"), 180) || null;
    const subject = text(form.get("subject"), MAX_SUBJECT_LENGTH + 1);
    const html = typeof form.get("html") === "string" ? String(form.get("html")) : "";

    if (!/^[A-Za-z0-9_-]{8,100}$/.test(sendKey)) {
        throw new InboxSendError("This send request is missing its draft key. Refresh and try again.");
    }
    if (!threadId && !toEmail) {
        throw new InboxSendError("Choose a recipient before sending.");
    }
    if (toEmail && !EMAIL_PATTERN.test(toEmail)) {
        throw new InboxSendError("The recipient email address is not valid.");
    }
    if (subject.length > MAX_SUBJECT_LENGTH) {
        throw new InboxSendError(`Keep the subject under ${MAX_SUBJECT_LENGTH} characters.`);
    }
    if (html.length > MAX_HTML_LENGTH) {
        throw new InboxSendError("This message is too long to send.");
    }
    if (!htmlToPlainText(html)) {
        throw new InboxSendError("Write a message before sending.");
    }

    const files = form.getAll("attachment")
        .filter((file): file is File => typeof file !== "string" && file.size > 0);
    if (files.length > MAX_ATTACHMENTS) {
        throw new InboxSendError(`Attach up to ${MAX_ATTACHMENTS} files per email.`, 413);
    }
    if (files.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
        throw new InboxSendError(
            `Attachments must be ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB or smaller.`,
            413,
        );
    }
    if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_ATTACHMENT_BYTES) {
        throw new InboxSendError(
            `Attachments can add up to ${MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024)} MB per email.`,
            413,
        );
    }
    const attachments = await Promise.all(files.map(async (file) => ({
        fileName: (file.name || "attachment").replace(/[\r\n"\\/]/g, "_").slice(0, 200),
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        content: Buffer.from(await file.arrayBuffer()),
    })));

    return { sendKey, threadId, toEmail, toName, subject, html, attachments };
}

function senderFrom(metadata: unknown) {
    const record = metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? metadata as Record<string, unknown> : {};
    const value = (key: string) => typeof record[key] === "string" ? (record[key] as string).trim() : "";
    const email = value("senderEmail");
    if (!email) {
        throw new InboxSendError("The connected Resend account has no sender email. Add one in Integrations.", 409);
    }
    return { email, name: value("senderName") || null, replyTo: value("replyToEmail") || email };
}

export function inboxIdempotencyKey(workspaceId: string, sendKey: string) {
    return `inbox-send/${createHash("sha256").update(JSON.stringify([workspaceId, sendKey])).digest("hex")}`;
}

function replySubject(subject: string) {
    return /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
}

/**
 * Send one inbox email and record it. Retrying with the same sendKey never
 * creates a second email: the row is unique per draft and Resend dedupes on
 * the idempotency key.
 */
export async function sendInboxEmail(deps: InboxSendDeps, input: InboxSendInput): Promise<InboxSentRecord> {
    const { workspaceId, store } = deps;

    const existing = await store.findBySendKey(workspaceId, input.sendKey);
    if (existing?.status === "sent") return existing;
    if (existing?.status === "sending") {
        throw new InboxSendError("This email is already being sent.", 409);
    }

    let thread: InboxThread | null = null;
    if (input.threadId) {
        const threads = await deps.loadThreads(workspaceId);
        thread = threads.find((candidate) => candidate.id === input.threadId) ?? null;
        if (!thread) throw new InboxSendError("That conversation could not be found.", 404);
        if (thread.demo || thread.channel && thread.channel !== "email") {
            throw new InboxSendError("This is a sample conversation, so replies are not sent.", 400);
        }
    }

    // Replies always go to the thread's customer, never to an address from the browser.
    const toEmail = (thread?.customerEmail ?? input.toEmail).trim().toLowerCase();
    const toName = thread?.customerName ?? input.toName;
    if (!toEmail || !EMAIL_PATTERN.test(toEmail)) {
        throw new InboxSendError("Choose a recipient before sending.");
    }
    const subject = thread
        ? (input.subject || replySubject(thread.subject))
        : input.subject;
    if (!subject) throw new InboxSendError("Add a subject before sending.");

    if (await deps.isSuppressed(workspaceId, toEmail)) {
        throw new InboxSendError("This recipient has unsubscribed or is suppressed, so the email was not sent.", 409);
    }

    let client: InboxResendClient;
    try {
        client = await deps.getClient(workspaceId);
    } catch (error) {
        throw new InboxSendError(
            error instanceof Error ? error.message : "Resend is not connected for this workspace.",
            409,
        );
    }
    const sender = senderFrom(client.metadata);
    if (thread) thread = await withRfcMessageIds(deps, client, thread);

    const html = sanitiseEmailHtml(input.html);
    const plainText = htmlToPlainText(html);
    const replyTarget = thread
        ? [...thread.messages].reverse().find((message) => formatMessageIdHeader(message.providerMessageId))
        : undefined;
    const inReplyTo = formatMessageIdHeader(replyTarget?.providerMessageId);
    const references = thread
        ? thread.messages.map((message) => formatMessageIdHeader(message.providerMessageId)).filter(Boolean).join(" ")
        : "";

    const data: InboxSentCreate = {
        workspaceId,
        sendKey: input.sendKey,
        threadId: thread?.id ?? null,
        toEmail,
        toName: toName || null,
        fromEmail: sender.email,
        fromName: sender.name,
        subject,
        html,
        plainText,
        inReplyTo,
        attachmentName: input.attachments[0]?.fileName ?? null,
        attachmentMimeType: input.attachments[0]?.mimeType ?? null,
        attachmentSize: input.attachments[0]?.size ?? null,
        ...(input.attachments.length
            ? { attachments: input.attachments.map(({ fileName, mimeType, size }) => ({ fileName, mimeType, size })) }
            : {}),
    };

    let record: InboxSentRecord;
    try {
        record = existing ? await store.retry(existing.id, data) : await store.create(data);
    } catch {
        throw new InboxSendError("This email is already being sent.", 409);
    }

    const headers: Record<string, string> = { "X-Workspace-ID": workspaceId };
    if (inReplyTo) {
        headers["In-Reply-To"] = inReplyTo;
        headers.References = references || inReplyTo;
    }

    let result: ResendLikeResult;
    try {
        result = await client.resend.emails.send(
            {
                from: sender.name ? `${sender.name} <${sender.email}>` : sender.email,
                to: toEmail,
                subject,
                html,
                text: plainText,
                replyTo: sender.replyTo,
                headers,
                ...(input.attachments.length
                    ? {
                        attachments: input.attachments.map((attachment) => ({
                            filename: attachment.fileName,
                            content: attachment.content,
                            contentType: attachment.mimeType,
                        })),
                    }
                    : {}),
            },
            { idempotencyKey: inboxIdempotencyKey(workspaceId, input.sendKey) },
        );
    } catch {
        const reason = "Resend did not respond. Try again; the same draft will not be sent twice.";
        await store.markFailed(record.id, reason);
        throw new InboxSendError(reason, 502);
    }

    const providerId = result.data?.id;
    if (result.error || !providerId) {
        const reason = result.error ? friendlyResendError(result.error) : "Resend did not accept the email.";
        await store.markFailed(record.id, reason);
        throw new InboxSendError(reason, 502);
    }

    const sentRecord = await store.markSent(record.id, providerId);

    // Usually the webhook fills this in; asking now lets the next reply thread
    // even when it can't reach us (local development, a missed event).
    if (deps.saveRfcMessageId) {
        const rfcMessageId = await lookupRfcMessageId(client, providerId);
        if (rfcMessageId && rfcMessageId !== "restricted") {
            await deps.saveRfcMessageId(workspaceId, `sent_${sentRecord.id}`, rfcMessageId).catch(() => undefined);
            return { ...sentRecord, providerRfcMessageId: rfcMessageId };
        }
    }
    return sentRecord;
}

function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Files sent with an email: the full list, or the one file older rows kept. */
function sentAttachments(record: InboxSentRecord): SentAttachmentMeta[] {
    if (Array.isArray(record.attachments)) {
        const list = record.attachments.flatMap((item) => {
            const entry = item && typeof item === "object" ? item as Record<string, unknown> : null;
            if (!entry || typeof entry.fileName !== "string") return [];
            return [{
                fileName: entry.fileName,
                mimeType: typeof entry.mimeType === "string" ? entry.mimeType : "application/octet-stream",
                size: typeof entry.size === "number" ? entry.size : 0,
            }];
        });
        if (list.length) return list;
    }
    return record.attachmentName
        ? [{
            fileName: record.attachmentName,
            mimeType: record.attachmentMimeType ?? "application/octet-stream",
            size: record.attachmentSize ?? 0,
        }]
        : [];
}

export function sentRecordToMessage(record: InboxSentRecord): InboxMessage {
    return {
        id: `sent_${record.id}`,
        direction: "outbound",
        fromName: record.fromName ?? record.fromEmail,
        fromEmail: record.fromEmail,
        toName: record.toName ?? record.toEmail,
        toEmail: record.toEmail,
        sentAt: (record.sentAt ?? record.createdAt).toISOString(),
        status: "sent",
        html: record.html,
        plainText: record.plainText,
        ...(sentAttachments(record).length
            ? {
                attachments: sentAttachments(record).map((attachment, index) => ({
                    id: `sent_${record.id}_attachment${index ? `_${index}` : ""}`,
                    fileName: attachment.fileName,
                    mimeType: attachment.mimeType,
                    sizeLabel: formatSize(attachment.size),
                })),
            }
            : {}),
    };
}
