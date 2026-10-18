import { prisma } from "./prisma";
import type { InboxSentRecord, InboxSentStore } from "./inbox-send";

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
