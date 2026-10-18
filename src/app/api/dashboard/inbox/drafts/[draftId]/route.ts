import { NextResponse } from "next/server";

import { requireWorkspace } from "../../../../../../lib/auth/requireWorkspace";
import { deleteInboxDraft } from "../../../../../../lib/inbox-draft-store";

export const runtime = "nodejs";

/** Discard a draft. Deleting one that's already gone still succeeds. */
export async function DELETE(request: Request, context: { params: Promise<{ draftId: string }> }) {
    const auth = await requireWorkspace(request);
    if (auth instanceof NextResponse) return auth;

    const { draftId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(draftId)) {
        return NextResponse.json({ error: "That draft id is not valid." }, { status: 400 });
    }

    try {
        await deleteInboxDraft(auth.workspaceId, draftId);
        return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        console.error("Inbox draft delete failed", error instanceof Error ? error.message : error);
        return NextResponse.json({ error: "The draft could not be deleted." }, { status: 500 });
    }
}
