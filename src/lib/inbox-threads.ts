// Builds inbox threads from stored email records.
//
// Kept free of Prisma so tests can pass plain objects; `inbox-store.ts` loads
// the records for a workspace and calls `buildInboxThreads`.
import type {
    InboxAttachment,
    InboxFolder,
    InboxMessage,
    InboxMessageStatus,
    InboxPayload,
    InboxThread,
} from "./inbox-data";
import { threadInFolder } from "./inbox-folders";
import { sentRecordToMessage, type InboxSentRecord } from "./inbox-send";

export const INBOX_FOLDER_ORDER: InboxFolder[] = [
    "inbox", "starred", "sent", "scheduled", "drafts", "deleted", "failed", "archived",
];

export { MOVABLE_FOLDERS, type MovableFolder } from "./inbox-folders";

export type ScheduledEmailRecord = {
    id: string;
    customerId: string;
    customerName: string;
    customerEmail: string;
    customerCompany: string | null;
    subject: string;
    html: string;
    plainText: string | null;
    scheduledFor: Date;
    sentAt: Date | null;
    status: string;
    failureReason: string | null;
    providerRfcMessageId: string | null;
    deliveredAt: Date | null;
    openedAt: Date | null;
    clickedAt: Date | null;
    fromEmail: string | null;
    fromName: string | null;
    createdAt: Date;
};

export type ReceivedEmailRecord = {
    id: string;
    threadId: string;
    fromEmail: string;
    fromName: string | null;
    toEmail: string;
    subject: string;
    html: string | null;
    plainText: string;
    rfcMessageId: string | null;
    attachments: unknown;
    authenticationFailed: boolean;
    receivedAt: Date;
};

export type ThreadStateRecord = {
    threadId: string;
    starred: boolean;
    lastReadAt: Date | null;
    markedUnread: boolean;
    folder: string | null;
    labels: string[];
};

export type SentEmailRecord = InboxSentRecord & { providerRfcMessageId?: string | null };

const FAILED_STATUSES = new Set(["failed", "delivery_failed", "bounced", "complained"]);
const NOT_YET_SENT = new Set(["scheduled", "queued", "sending", "pending", "delivery_pending", "retrying"]);

export function scheduledThreadId(id: string) {
    return `se_${id}`;
}

export function sentThreadId(id: string) {
    return `ism_${id}`;
}

function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function preview(plainText: string) {
    const flat = plainText.replace(/\s+/g, " ").trim();
    return flat.length > 140 ? `${flat.slice(0, 137)}…` : flat;
}

function htmlToText(html: string) {
    return html
        .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/[ \t]+/g, " ")
        .trim();
}

function scheduledStatus(email: ScheduledEmailRecord): InboxMessageStatus {
    if (FAILED_STATUSES.has(email.status)) return "failed";
    if (email.clickedAt) return "clicked";
    if (email.openedAt) return "opened";
    if (email.deliveredAt || email.status === "delivered") return "delivered";
    if (email.sentAt || email.status === "sent") return "sent";
    return "scheduled";
}

function scheduledMessage(email: ScheduledEmailRecord): InboxMessage {
    return {
        id: `se_msg_${email.id}`,
        direction: "outbound",
        fromName: email.fromName ?? email.fromEmail ?? "You",
        fromEmail: email.fromEmail ?? "",
        toName: email.customerName,
        toEmail: email.customerEmail,
        sentAt: (email.sentAt ?? email.scheduledFor).toISOString(),
        status: scheduledStatus(email),
        html: email.html,
        plainText: email.plainText || htmlToText(email.html),
        ...(email.providerRfcMessageId ? { providerMessageId: email.providerRfcMessageId } : {}),
    };
}

function receivedAttachments(value: unknown, messageId: string): InboxAttachment[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const entry = item as Record<string, unknown>;
        return [{
            id: `${messageId}_att_${index}`,
            fileName: typeof entry.fileName === "string" ? entry.fileName : "Attachment",
            mimeType: typeof entry.mimeType === "string" ? entry.mimeType : "application/octet-stream",
            sizeLabel: formatSize(typeof entry.size === "number" ? entry.size : 0),
        }];
    });
}

function receivedMessage(record: ReceivedEmailRecord): InboxMessage {
    const id = `rcv_${record.id}`;
    const attachments = receivedAttachments(record.attachments, id);
    return {
        id,
        direction: "inbound",
        fromName: record.fromName ?? record.fromEmail,
        fromEmail: record.fromEmail,
        toName: record.toEmail,
        toEmail: record.toEmail,
        sentAt: record.receivedAt.toISOString(),
        status: "received",
        html: record.html,
        plainText: record.plainText || (record.html ? htmlToText(record.html) : ""),
        ...(attachments.length ? { attachments } : {}),
        ...(record.rfcMessageId ? { providerMessageId: record.rfcMessageId } : {}),
        ...(record.authenticationFailed ? { authenticationFailed: true } : {}),
    };
}

function sentMessage(record: SentEmailRecord): InboxMessage {
    const message = sentRecordToMessage(record);
    return record.providerRfcMessageId ? { ...message, providerMessageId: record.providerRfcMessageId } : message;
}

function time(value: string) {
    return new Date(value).getTime();
}

/** The folder a thread sits in before the user moves it. */
function naturalFolder(thread: InboxThread, scheduled: ScheduledEmailRecord | undefined): InboxFolder {
    if (thread.messages.some((message) => message.direction === "inbound")) return "inbox";
    if (scheduled && FAILED_STATUSES.has(scheduled.status)) return "failed";
    if (scheduled && NOT_YET_SENT.has(scheduled.status) && !scheduled.sentAt) return "scheduled";
    return "sent";
}

function applyState(thread: InboxThread, state: ThreadStateRecord | undefined): InboxThread {
    if (!state) return thread;
    const folder = state.folder === "archived" || state.folder === "deleted" ? state.folder : null;
    const lastReadAt = state.lastReadAt?.getTime() ?? null;
    const hasNewInbound = lastReadAt === null
        ? thread.unread
        : thread.messages.some((message) => message.direction === "inbound" && time(message.sentAt) > lastReadAt);
    return {
        ...thread,
        folder: folder ?? (thread.folder === "archived" || thread.folder === "deleted" ? "inbox" : thread.folder),
        archived: folder === "archived",
        starred: state.starred,
        unread: state.markedUnread || hasNewInbound,
        labels: [...state.labels],
    };
}

export type BuildInboxInput = {
    workspaceId: string;
    scheduled: ScheduledEmailRecord[];
    sent: SentEmailRecord[];
    received: ReceivedEmailRecord[];
    states: ThreadStateRecord[];
    /** Sample conversations shown in development; never written to the database. */
    demoThreads?: InboxThread[];
};

export function buildInboxThreads(input: BuildInboxInput): InboxThread[] {
    const threads = new Map<string, InboxThread>();
    const scheduledById = new Map<string, ScheduledEmailRecord>();

    for (const thread of input.demoThreads ?? []) {
        threads.set(thread.id, { ...thread, demo: true, messages: [...thread.messages] });
    }

    for (const email of input.scheduled) {
        const id = scheduledThreadId(email.id);
        scheduledById.set(id, email);
        threads.set(id, {
            id,
            customerId: email.customerId,
            customerName: email.customerName,
            customerEmail: email.customerEmail,
            customerCompany: email.customerCompany,
            subject: email.subject,
            preview: "",
            folder: "sent",
            labels: [],
            unread: false,
            starred: false,
            archived: false,
            lastMessageAt: "",
            messages: [scheduledMessage(email)],
        });
    }

    const sent = input.sent
        .filter((record) => record.status === "sent")
        .sort((a, b) => (a.sentAt ?? a.createdAt).getTime() - (b.sentAt ?? b.createdAt).getTime());
    for (const record of sent) {
        const parent = record.threadId ? threads.get(record.threadId) : undefined;
        if (parent) {
            parent.messages.push(sentMessage(record));
            continue;
        }
        const id = sentThreadId(record.id);
        threads.set(id, {
            id,
            customerId: null,
            customerName: record.toName ?? record.toEmail,
            customerEmail: record.toEmail,
            customerCompany: null,
            subject: record.subject,
            preview: "",
            folder: "sent",
            labels: [],
            unread: false,
            starred: false,
            archived: false,
            lastMessageAt: "",
            messages: [sentMessage(record)],
        });
    }

    for (const record of input.received) {
        const thread = threads.get(record.threadId);
        if (!thread || thread.demo) continue;
        thread.messages.push(receivedMessage(record));
        // Never read yet: any reply is new.
        thread.unread = true;
    }

    const states = new Map(input.states.map((state) => [state.threadId, state]));
    const result: InboxThread[] = [];
    for (const thread of threads.values()) {
        const messages = [...thread.messages].sort((a, b) => time(a.sentAt) - time(b.sentAt));
        const last = messages.at(-1);
        if (!last) continue;
        const built: InboxThread = thread.demo
            ? { ...thread, messages }
            : {
                ...thread,
                messages,
                preview: preview(last.plainText),
                lastMessageAt: last.sentAt,
                folder: naturalFolder({ ...thread, messages }, scheduledById.get(thread.id)),
            };
        if (thread.demo && time(last.sentAt) > time(thread.lastMessageAt)) {
            built.lastMessageAt = last.sentAt;
            built.preview = preview(last.plainText);
        }
        result.push(applyState(built, states.get(thread.id)));
    }

    return result.sort((a, b) => time(b.lastMessageAt) - time(a.lastMessageAt));
}

export function buildPayload(workspaceId: string, threads: InboxThread[]): InboxPayload {
    return {
        workspaceId,
        folders: INBOX_FOLDER_ORDER.map((folder) => ({
            folder,
            count: threads.filter((thread) => threadInFolder(thread, folder)).length,
        })),
        threads,
    };
}
