// Shared by the inbox AI routes (summary and reply): turns the thread the
// browser sends into bounded plain text for the model.

export type InboxMessageLike = {
    fromName?: unknown;
    fromEmail?: unknown;
    toName?: unknown;
    toEmail?: unknown;
    subject?: unknown;
    plainText?: unknown;
    html?: unknown;
    sentAt?: unknown;
    status?: unknown;
};



export function normaliseText(value: unknown, maxLength = 8_000) {
    return typeof value === "string"
        ? value.trim().slice(0, maxLength)
        : "";
}

export function stripHtml(value: unknown) {
    return normaliseText(value)
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function serialiseMessage(value: unknown) {
    if (!isRecord(value)) return null;

    const message = value as InboxMessageLike;
    const plainText = normaliseText(message.plainText);
    const htmlText = stripHtml(message.html);

    return {
        fromName: normaliseText(message.fromName, 180),
        fromEmail: normaliseText(message.fromEmail, 320),
        toName: normaliseText(message.toName, 180),
        toEmail: normaliseText(message.toEmail, 320),
        subject: normaliseText(message.subject, 500),
        body: (plainText || htmlText).slice(0, 8_000),
        sentAt: normaliseText(message.sentAt, 100),
        status: normaliseText(message.status, 80),
    };
}

export type InboxThreadLike = {
    channel?: unknown;
    customerName?: unknown;
    customerEmail?: unknown;
    customerCompany?: unknown;
    subject?: unknown;
    preview?: unknown;
    messages?: unknown;
};
