// Unsent inbox emails. Kept free of Prisma so tests can use it directly; the
// routes under /api/dashboard/inbox/drafts store drafts with inbox-draft-store.
import type { InboxThread } from "./inbox-data";
import { htmlToPlainText, InboxSendError, sanitiseEmailHtml } from "./inbox-send";

const MAX_SUBJECT_LENGTH = 500;
const MAX_HTML_LENGTH = 500_000;
const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

export type InboxDraftRecord = {
    id: string;
    workspaceId: string;
    threadId: string | null;
    toEmail: string | null;
    toName: string | null;
    subject: string;
    html: string;
    updatedAt: Date;
};

export type InboxDraftInput = {
    /** Set when updating a draft that already exists. */
    draftId: string | null;
    threadId: string | null;
    toEmail: string | null;
    toName: string | null;
    subject: string;
    html: string;
};

function text(value: unknown, maxLength: number) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/** Validate the JSON body the inbox page sends when it saves a draft. */
export function parseDraftInput(body: unknown): InboxDraftInput {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new InboxSendError("Send the draft as a JSON object.");
    }
    const input = body as Record<string, unknown>;
    const draftId = text(input.draftId, 100) || null;
    const threadId = text(input.threadId, 200) || null;
    const toEmail = text(input.to, 320).toLowerCase() || null;
    const toName = text(input.toName, 180) || null;
    const subject = typeof input.subject === "string" ? input.subject.slice(0, MAX_SUBJECT_LENGTH + 1) : "";
    const html = typeof input.html === "string" ? input.html : "";

    if (draftId && !/^[A-Za-z0-9_-]{1,100}$/.test(draftId)) throw new InboxSendError("That draft id is not valid.");
    // A half-typed address is fine in a draft; only a malformed full one isn't stored.
    if (toEmail && !EMAIL_PATTERN.test(toEmail)) throw new InboxSendError("The recipient email address is not valid.");
    if (subject.length > MAX_SUBJECT_LENGTH) {
        throw new InboxSendError(`Keep the subject under ${MAX_SUBJECT_LENGTH} characters.`);
    }
    if (html.length > MAX_HTML_LENGTH) throw new InboxSendError("This draft is too long to save.");

    return { draftId, threadId, toEmail: threadId ? null : toEmail, toName: threadId ? null : toName, subject, html: sanitiseEmailHtml(html) };
}

/** Whether a draft has anything worth keeping. */
export function draftHasContent(input: Pick<InboxDraftInput, "subject" | "html" | "toEmail" | "threadId">) {
    return Boolean(htmlToPlainText(input.html) || input.subject.trim() || (!input.threadId && input.toEmail));
}

export function draftThreadId(id: string) {
    return `draft_${id}`;
}

/**
 * Show a draft in the Drafts folder. A reply draft borrows its conversation's
 * recipient and subject; a new email uses its own.
 */
export function draftToThread(draft: InboxDraftRecord, parent?: InboxThread): InboxThread {
    const plainText = htmlToPlainText(draft.html);
    const toEmail = parent?.customerEmail ?? draft.toEmail ?? "";
    const toName = parent?.customerName ?? draft.toName ?? toEmail;
    const subject = draft.subject.trim() || (parent ? `Re: ${parent.subject}` : "(no subject)");
    const sentAt = draft.updatedAt.toISOString();
    const flat = plainText.replace(/\s+/g, " ").trim();

    return {
        id: draftThreadId(draft.id),
        customerId: parent?.customerId ?? null,
        customerName: toName || "No recipient",
        customerEmail: toEmail,
        customerCompany: parent?.customerCompany ?? null,
        subject,
        preview: flat.length > 140 ? `${flat.slice(0, 137)}…` : flat,
        folder: "drafts",
        labels: ["Draft"],
        unread: false,
        starred: false,
        archived: false,
        lastMessageAt: sentAt,
        messages: [{
            id: `draft_msg_${draft.id}`,
            direction: "outbound",
            fromName: "You",
            fromEmail: "",
            toName: toName || "No recipient",
            toEmail,
            sentAt,
            status: "scheduled",
            html: draft.html,
            plainText,
        }],
        draft: {
            id: draft.id,
            threadId: draft.threadId,
            toEmail: draft.toEmail,
            toName: draft.toName,
            subject: draft.subject,
            html: draft.html,
        },
    };
}

/** Add drafts to the thread list. Reply drafts whose conversation is gone are dropped. */
export function withDraftThreads(threads: InboxThread[], drafts: InboxDraftRecord[]): InboxThread[] {
    const byId = new Map(threads.map((thread) => [thread.id, thread]));
    const draftThreads = drafts.flatMap((draft) => {
        const parent = draft.threadId ? byId.get(draft.threadId) : undefined;
        if (draft.threadId && !parent) return [];
        return [draftToThread(draft, parent)];
    });
    return [...threads, ...draftThreads];
}
