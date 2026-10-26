import { NextResponse } from "next/server";

import { requireWorkspace } from "../../../../../lib/auth/requireWorkspace";
import {
    existingInboxThreadIds,
    parseBulkThreadUpdate,
    saveThreadStates,
} from "../../../../../lib/inbox-thread-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Apply one change (star, read/unread, archive, delete, restore) to several
 * selected threads at once. Body: { threadIds: string[], ...change }.
 */
export async function PATCH(request: Request) {
    const auth = await requireWorkspace(request);
    if (auth instanceof NextResponse) return auth;

    try {
        const parsed = parseBulkThreadUpdate(await request.json().catch(() => null));
        if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });

        // Only threads stored in this workspace can change.
        const existing = await existingInboxThreadIds(auth.workspaceId, parsed.threadIds);
        const missing = parsed.threadIds.filter((id) => !existing.has(id));
        if (missing.length) {
            return NextResponse.json(
                { error: "Some of those conversations could not be found. Refresh and try again.", missing },
                { status: 404 },
            );
        }

        const states = await saveThreadStates(auth.workspaceId, parsed.threadIds, parsed.update);
        return NextResponse.json({ states }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        console.error("Failed to update inbox threads", error instanceof Error ? error.message : error);
        return NextResponse.json({ error: "Could not save that change. Try again." }, { status: 500 });
    }
}
