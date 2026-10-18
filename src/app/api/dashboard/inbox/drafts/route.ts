import { NextResponse } from "next/server";

import { requireWorkspace } from "../../../../../lib/auth/requireWorkspace";
import { draftHasContent, draftThreadId, parseDraftInput } from "../../../../../lib/inbox-drafts";
import { deleteDraftsAfterSend, saveInboxDraft } from "../../../../../lib/inbox-draft-store";
import { InboxSendError } from "../../../../../lib/inbox-send";
import { inboxThreadExists } from "../../../../../lib/inbox-store";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

/** Save the draft being written. An emptied draft is deleted instead. */
export async function PUT(request: Request) {
    const auth = await requireWorkspace(request);
    if (auth instanceof NextResponse) return auth;
    const { workspaceId } = auth;

    try {
        const input = parseDraftInput(await request.json().catch(() => null));

        if (input.threadId && !(await inboxThreadExists(workspaceId, input.threadId))) {
            throw new InboxSendError("Drafts can only be saved for your own conversations.", 404);
        }

        if (!draftHasContent(input)) {
            await deleteDraftsAfterSend(workspaceId, input.draftId, input.threadId);
            return NextResponse.json({ draftId: null }, { headers: noStore });
        }

        const draft = await saveInboxDraft(workspaceId, input);
        if (!draft) throw new InboxSendError("The draft could not be saved.", 500);

        return NextResponse.json(
            { draftId: draft.id, draftThreadId: draftThreadId(draft.id), savedAt: draft.updatedAt.toISOString() },
            { headers: noStore },
        );
    } catch (error) {
        if (error instanceof InboxSendError) {
            return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
        }
        console.error("Inbox draft save failed", { workspaceId, errorType: error instanceof Error ? error.name : "unknown" });
        return NextResponse.json({ error: "The draft could not be saved." }, { status: 500, headers: noStore });
    }
}
