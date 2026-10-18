import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { requireWorkspace } from "../../../../../../lib/auth/requireWorkspace";
import { inboxThreadExists } from "../../../../../../lib/inbox-store";
import { MOVABLE_FOLDERS, type MovableFolder } from "../../../../../../lib/inbox-threads";
import { prisma } from "../../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LABELS = 20;
const MAX_LABEL_LENGTH = 40;

type ThreadUpdate = {
    starred?: boolean;
    read?: boolean;
    /** "archived" or "deleted" moves the thread; null restores it. */
    folder?: MovableFolder | null;
    labels?: string[];
};

function parseUpdate(body: unknown): ThreadUpdate | string {
    if (!body || typeof body !== "object" || Array.isArray(body)) return "Send a JSON object.";
    const input = body as Record<string, unknown>;
    const update: ThreadUpdate = {};
    if ("starred" in input) {
        if (typeof input.starred !== "boolean") return "starred must be true or false.";
        update.starred = input.starred;
    }
    if ("read" in input) {
        if (typeof input.read !== "boolean") return "read must be true or false.";
        update.read = input.read;
    }
    if ("folder" in input) {
        if (input.folder !== null && !MOVABLE_FOLDERS.includes(input.folder as MovableFolder)) {
            return "folder must be archived, deleted or null.";
        }
        update.folder = input.folder as MovableFolder | null;
    }
    if ("labels" in input) {
        if (!Array.isArray(input.labels) || input.labels.some((label) => typeof label !== "string")) {
            return "labels must be a list of text.";
        }
        const labels = [...new Set((input.labels as string[]).map((label) => label.trim()).filter(Boolean))];
        if (labels.length > MAX_LABELS || labels.some((label) => label.length > MAX_LABEL_LENGTH)) {
            return `Use up to ${MAX_LABELS} tags of ${MAX_LABEL_LENGTH} characters or fewer.`;
        }
        update.labels = labels;
    }
    if (Object.keys(update).length === 0) return "Nothing to update.";
    return update;
}

/** Star, read/unread, archive, delete, restore or tag one inbox thread. */
export async function PATCH(request: Request, context: { params: Promise<{ threadId: string }> }) {
    const auth = await requireWorkspace(request);
    if (auth instanceof NextResponse) return auth;

    try {
        const { threadId } = await context.params;
        const update = parseUpdate(await request.json().catch(() => null));
        if (typeof update === "string") return NextResponse.json({ error: update }, { status: 400 });
        // The thread id must name a stored email in this workspace.
        if (!(await inboxThreadExists(auth.workspaceId, threadId))) {
            return NextResponse.json({ error: "That conversation could not be found." }, { status: 404 });
        }

        const now = new Date();
        const data: Prisma.InboxThreadStateUpdateInput = {
            ...(update.starred !== undefined ? { starred: update.starred } : {}),
            ...(update.read === true ? { lastReadAt: now, markedUnread: false } : {}),
            ...(update.read === false ? { markedUnread: true } : {}),
            ...(update.folder !== undefined ? { folder: update.folder } : {}),
            ...(update.labels !== undefined ? { labels: update.labels } : {}),
        };
        const state = await prisma.inboxThreadState.upsert({
            where: { workspaceId_threadId: { workspaceId: auth.workspaceId, threadId } },
            create: {
                workspaceId: auth.workspaceId,
                threadId,
                starred: update.starred ?? false,
                lastReadAt: update.read === true ? now : null,
                markedUnread: update.read === false,
                folder: update.folder ?? null,
                labels: update.labels ?? [],
            },
            update: data,
            select: { threadId: true, starred: true, lastReadAt: true, markedUnread: true, folder: true, labels: true },
        });

        return NextResponse.json({ state }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        console.error("Failed to update inbox thread", error instanceof Error ? error.message : error);
        return NextResponse.json({ error: "Could not save that change. Try again." }, { status: 500 });
    }
}
