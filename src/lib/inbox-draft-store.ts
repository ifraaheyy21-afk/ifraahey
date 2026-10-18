import { prisma } from "./prisma";
import type { InboxDraftInput, InboxDraftRecord } from "./inbox-drafts";

const MAX_DRAFTS = 200;

const select = {
    id: true, workspaceId: true, threadId: true, toEmail: true, toName: true,
    subject: true, html: true, updatedAt: true,
} as const;

export function listInboxDrafts(workspaceId: string): Promise<InboxDraftRecord[]> {
    return prisma.inboxDraft.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: "desc" },
        take: MAX_DRAFTS,
        select,
    });
}

/**
 * Create or update a draft. A reply draft is one per thread, so saving from
 * a second tab updates the same row instead of making a duplicate.
 */
export async function saveInboxDraft(workspaceId: string, input: InboxDraftInput): Promise<InboxDraftRecord | null> {
    const data = {
        threadId: input.threadId,
        toEmail: input.toEmail,
        toName: input.toName,
        subject: input.subject,
        html: input.html,
    };
    if (input.draftId) {
        const updated = await prisma.inboxDraft.updateMany({ where: { id: input.draftId, workspaceId }, data });
        if (updated.count === 1) return prisma.inboxDraft.findFirst({ where: { id: input.draftId, workspaceId }, select });
        // The draft was sent or deleted elsewhere; fall through and save a new one.
    }
    if (input.threadId) {
        return prisma.inboxDraft.upsert({
            where: { workspaceId_threadId: { workspaceId, threadId: input.threadId } },
            create: { workspaceId, ...data },
            update: data,
            select,
        });
    }
    return prisma.inboxDraft.create({ data: { workspaceId, ...data }, select });
}

export async function deleteInboxDraft(workspaceId: string, draftId: string) {
    const deleted = await prisma.inboxDraft.deleteMany({ where: { id: draftId, workspaceId } });
    return deleted.count === 1;
}

/** Drop a draft by id and/or the reply draft for a thread (after a send, or when emptied). */
export async function deleteDraftsAfterSend(workspaceId: string, draftId: string | null, threadId: string | null) {
    const or = [
        ...(draftId ? [{ id: draftId }] : []),
        ...(threadId ? [{ threadId }] : []),
    ];
    if (or.length === 0) return;
    await prisma.inboxDraft.deleteMany({ where: { workspaceId, OR: or } });
}
