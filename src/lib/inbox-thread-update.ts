import { Prisma } from "@prisma/client";

import type { ThreadUpdate } from "./inbox-thread-parse";
import { prisma } from "./prisma";

export { MAX_BULK_THREADS, parseBulkThreadUpdate, parseThreadUpdate, type ThreadUpdate } from "./inbox-thread-parse";

/** The ids, from this list, of stored (non-sample) threads in the workspace. */
export async function existingInboxThreadIds(workspaceId: string, threadIds: string[]) {
    const scheduled: string[] = [];
    const sent: string[] = [];
    for (const threadId of threadIds) {
        const match = threadId.match(/^(se|ism)_([A-Za-z0-9_-]{1,64})$/);
        if (!match) continue;
        (match[1] === "se" ? scheduled : sent).push(match[2]);
    }
    const [scheduledRows, sentRows] = await Promise.all([
        scheduled.length
            ? prisma.scheduledEmail.findMany({ where: { workspaceId, id: { in: scheduled } }, select: { id: true } })
            : [],
        sent.length
            ? prisma.inboxSentMessage.findMany({ where: { workspaceId, id: { in: sent }, threadId: null }, select: { id: true } })
            : [],
    ]);
    return new Set([
        ...scheduledRows.map((row) => `se_${row.id}`),
        ...sentRows.map((row) => `ism_${row.id}`),
    ]);
}

const stateSelect = {
    threadId: true, starred: true, lastReadAt: true, markedUnread: true, folder: true, labels: true,
} as const;

function upsertState(workspaceId: string, threadId: string, update: ThreadUpdate, now: Date) {
    const data: Prisma.InboxThreadStateUpdateInput = {
        ...(update.starred !== undefined ? { starred: update.starred } : {}),
        ...(update.read === true ? { lastReadAt: now, markedUnread: false } : {}),
        ...(update.read === false ? { markedUnread: true } : {}),
        ...(update.folder !== undefined ? { folder: update.folder } : {}),
        ...(update.labels !== undefined ? { labels: update.labels } : {}),
    };
    return prisma.inboxThreadState.upsert({
        where: { workspaceId_threadId: { workspaceId, threadId } },
        create: {
            workspaceId,
            threadId,
            starred: update.starred ?? false,
            lastReadAt: update.read === true ? now : null,
            markedUnread: update.read === false,
            folder: update.folder ?? null,
            labels: update.labels ?? [],
        },
        update: data,
        select: stateSelect,
    });
}

/** Save one update to several threads in one transaction. */
export function saveThreadStates(workspaceId: string, threadIds: string[], update: ThreadUpdate) {
    const now = new Date();
    return prisma.$transaction(threadIds.map((threadId) => upsertState(workspaceId, threadId, update, now)));
}
