import { NextResponse } from "next/server";

import { requireWorkspace } from "../../../../../../lib/auth/requireWorkspace";
import { inboxThreadExists } from "../../../../../../lib/inbox-store";
import { parseThreadUpdate, saveThreadStates } from "../../../../../../lib/inbox-thread-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Star, read/unread, archive, delete, restore or tag one inbox thread. */
export async function PATCH(request: Request, context: { params: Promise<{ threadId: string }> }) {
    const auth = await requireWorkspace(request);
    if (auth instanceof NextResponse) return auth;

    try {
        const { threadId } = await context.params;
        const update = parseThreadUpdate(await request.json().catch(() => null));
        if (typeof update === "string") return NextResponse.json({ error: update }, { status: 400 });
        // The thread id must name a stored email in this workspace.
        if (!(await inboxThreadExists(auth.workspaceId, threadId))) {
            return NextResponse.json({ error: "That conversation could not be found." }, { status: 404 });
        }

        const [state] = await saveThreadStates(auth.workspaceId, [threadId], update);
        return NextResponse.json({ state }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        console.error("Failed to update inbox thread", error instanceof Error ? error.message : error);
        return NextResponse.json({ error: "Could not save that change. Try again." }, { status: 500 });
    }
}
