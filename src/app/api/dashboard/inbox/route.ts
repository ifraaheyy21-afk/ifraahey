import { NextRequest, NextResponse } from "next/server";

import { requireWorkspace } from "../../../../lib/auth/requireWorkspace";
import { loadInboxPayload } from "../../../../lib/inbox-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const auth = await requireWorkspace(request);
    if (auth instanceof NextResponse) return auth;

    try {
        // Always the signed-in workspace; a workspaceId in the URL is ignored.
        const payload = await loadInboxPayload(auth.workspaceId);

        return NextResponse.json(payload, {
            status: 200,
            headers: {
                "Cache-Control": "private, no-store",
            },
        });
    } catch (error) {
        console.error("Failed to load inbox", error);

        return NextResponse.json(
            { error: "Failed to load inbox." },
            { status: 500 },
        );
    }
}
