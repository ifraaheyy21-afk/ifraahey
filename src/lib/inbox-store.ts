import { prisma } from "./prisma";
import { buildInboxPayload, type InboxPayload, type InboxThread } from "./inbox-data";
import { listInboxSentMessages } from "./inbox-sent-store";
import {
    buildInboxThreads,
    buildPayload,
    type ReceivedEmailRecord,
    type ScheduledEmailRecord,
    type ThreadStateRecord,
} from "./inbox-threads";

const MAX_SCHEDULED = 300;
const MAX_RECEIVED = 1000;

/**
 * Sample conversations sit beside real mail in development so every inbox
 * feature can be tried. Production shows only real mail unless
 * INBOX_DEMO_DATA=true.
 */
export function inboxDemoDataEnabled() {
    const flag = process.env.INBOX_DEMO_DATA?.trim().toLowerCase();
    if (flag === "true") return true;
    if (flag === "false") return false;
    return process.env.NODE_ENV !== "production";
}

function sender(payload: unknown) {
    const email = payload && typeof payload === "object"
        ? (payload as { email?: { from?: unknown } }).email : undefined;
    const from = typeof email?.from === "string" ? email.from.trim() : "";
    const match = from.match(/^\s*"?([^"<>]*?)"?\s*<([^<>]+)>$/);
    return {
        fromName: match?.[1]?.trim() || null,
        fromEmail: (match?.[2] ?? from) || null,
    };
}

// Each read is allowed to fail on its own, so the inbox still loads before a
// migration is applied (that table's records are just left out).
async function optional<T>(label: string, read: () => Promise<T[]>): Promise<T[]> {
    try {
        return await read();
    } catch (error) {
        console.error(`Failed to load ${label}`, error instanceof Error ? error.message : error);
        return [];
    }
}

async function loadScheduled(workspaceId: string): Promise<ScheduledEmailRecord[]> {
    const rows = await prisma.scheduledEmail.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: MAX_SCHEDULED,
        include: { customer: { select: { name: true, email: true, company: true } } },
    });
    return rows.map((row) => ({
        id: row.id,
        customerId: row.customerId,
        customerName: row.customer?.name || row.customer?.email || "Customer",
        customerEmail: row.customer?.email ?? "",
        customerCompany: row.customer?.company || null,
        subject: row.subject,
        html: row.html,
        plainText: row.plainText,
        scheduledFor: row.scheduledFor,
        sentAt: row.sentAt,
        status: row.status,
        failureReason: row.failureReason,
        providerRfcMessageId: row.providerRfcMessageId,
        deliveredAt: row.deliveredAt,
        openedAt: row.openedAt,
        clickedAt: row.clickedAt,
        createdAt: row.createdAt,
        ...sender(row.sendPayload),
    }));
}

function loadReceived(workspaceId: string): Promise<ReceivedEmailRecord[]> {
    return prisma.inboxReceivedMessage.findMany({
        where: { workspaceId },
        orderBy: { receivedAt: "desc" },
        take: MAX_RECEIVED,
        select: {
            id: true, threadId: true, fromEmail: true, fromName: true, toEmail: true,
            subject: true, html: true, plainText: true, rfcMessageId: true,
            attachments: true, authenticationFailed: true, receivedAt: true,
        },
    });
}

function loadStates(workspaceId: string): Promise<ThreadStateRecord[]> {
    return prisma.inboxThreadState.findMany({
        where: { workspaceId },
        select: { threadId: true, starred: true, lastReadAt: true, markedUnread: true, folder: true, labels: true },
    });
}

export async function loadInboxThreads(workspaceId: string): Promise<InboxThread[]> {
    const [scheduled, sent, received, states] = await Promise.all([
        optional("scheduled emails", () => loadScheduled(workspaceId)),
        listInboxSentMessages(workspaceId),
        optional("received emails", () => loadReceived(workspaceId)),
        optional("inbox thread states", () => loadStates(workspaceId)),
    ]);
    return buildInboxThreads({
        workspaceId,
        scheduled,
        sent,
        received,
        states,
        demoThreads: inboxDemoDataEnabled() ? buildInboxPayload(workspaceId).threads : [],
    });
}

export async function loadInboxPayload(workspaceId: string): Promise<InboxPayload> {
    return buildPayload(workspaceId, await loadInboxThreads(workspaceId));
}

/** Whether a stored (non-demo) thread with this id exists in the workspace. */
export async function inboxThreadExists(workspaceId: string, threadId: string) {
    const match = threadId.match(/^(se|ism)_([A-Za-z0-9_-]{1,64})$/);
    if (!match) return false;
    const [, kind, id] = match;
    const row = kind === "se"
        ? await prisma.scheduledEmail.findFirst({ where: { id, workspaceId }, select: { id: true } })
        : await prisma.inboxSentMessage.findFirst({ where: { id, workspaceId, threadId: null }, select: { id: true } });
    return Boolean(row);
}
