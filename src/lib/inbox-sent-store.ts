import { prisma } from "./prisma";
import type { InboxSentRecord, InboxSentStore, PendingRfcMessage } from "./inbox-send";

// Prisma-backed store for messages sent from the dashboard inbox.
export const prismaInboxSentStore: InboxSentStore = {
    findBySendKey(workspaceId, sendKey) {
        return prisma.inboxSentMessage.findUnique({
            where: { workspaceId_sendKey: { workspaceId, sendKey } },
        });
    },
    create(data) {
        return prisma.inboxSentMessage.create({ data: { ...data, status: "sending" } });
    },
    async retry(id, data) {
        // Only a failed draft may be claimed again; a concurrent retry loses.
        const claimed = await prisma.inboxSentMessage.updateMany({
            where: { id, workspaceId: data.workspaceId, status: "failed" },
            data: { ...data, status: "sending", failureReason: null },
        });
        if (claimed.count !== 1) throw new Error("Send already claimed.");
        return prisma.inboxSentMessage.findUniqueOrThrow({ where: { id } });
    },
    markSent(id, providerMessageId) {
        return prisma.inboxSentMessage.update({
            where: { id },
            data: { status: "sent", providerMessageId, sentAt: new Date(), failureReason: null },
        });
    },
    async markFailed(id, reason) {
        await prisma.inboxSentMessage.update({
            where: { id },
            data: { status: "failed", failureReason: reason.slice(0, 1000) },
        });
    },
};

// The inbox still loads if this read fails (for example before the
// InboxSentMessage migration is applied); sent mail is just left out.
export async function listInboxSentMessages(workspaceId: string): Promise<InboxSentRecord[]> {
    try {
        return await prisma.inboxSentMessage.findMany({
            where: { workspaceId, status: "sent" },
            orderBy: { createdAt: "desc" },
            take: 500,
        });
    } catch (error) {
        console.error("Failed to load sent inbox messages", error instanceof Error ? error.message : error);
        return [];
    }
}

// Inbox message ids are sent_<InboxSentMessage id> or se_msg_<ScheduledEmail id>.
function splitMessageIds(messageIds: string[]) {
    const sent: string[] = [];
    const scheduled: string[] = [];
    for (const messageId of messageIds) {
        if (messageId.startsWith("sent_")) sent.push(messageId.slice("sent_".length));
        else if (messageId.startsWith("se_msg_")) scheduled.push(messageId.slice("se_msg_".length));
    }
    return { sent, scheduled };
}

/** Earlier outbound messages that Resend accepted but whose Message-ID isn't stored. */
export async function findPendingRfcMessages(workspaceId: string, messageIds: string[]): Promise<PendingRfcMessage[]> {
    const { sent, scheduled } = splitMessageIds(messageIds);
    const where = { workspaceId, providerRfcMessageId: null, providerMessageId: { not: null } };
    const [sentRows, scheduledRows] = await Promise.all([
        sent.length
            ? prisma.inboxSentMessage.findMany({ where: { ...where, id: { in: sent } }, select: { id: true, providerMessageId: true } })
            : [],
        scheduled.length
            ? prisma.scheduledEmail.findMany({ where: { ...where, id: { in: scheduled } }, select: { id: true, providerMessageId: true } })
            : [],
    ]);
    return [
        ...sentRows.map((row) => ({ messageId: `sent_${row.id}`, providerMessageId: row.providerMessageId! })),
        ...scheduledRows.map((row) => ({ messageId: `se_msg_${row.id}`, providerMessageId: row.providerMessageId! })),
    ];
}

/** Store a Message-ID unless the webhook already did. */
export async function saveRfcMessageId(workspaceId: string, messageId: string, rfcMessageId: string) {
    const { sent, scheduled } = splitMessageIds([messageId]);
    const data = { providerRfcMessageId: rfcMessageId };
    if (sent[0]) {
        await prisma.inboxSentMessage.updateMany({ where: { id: sent[0], workspaceId, providerRfcMessageId: null }, data });
    } else if (scheduled[0]) {
        await prisma.scheduledEmail.updateMany({ where: { id: scheduled[0], workspaceId, providerRfcMessageId: null }, data });
    }
}
