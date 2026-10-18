import { NextRequest, NextResponse } from "next/server";

import {
    buildInboxPayload,
    DEMO_INBOX_WORKSPACE_ID,
} from "../../../../lib/inbox-data";
import { requireWorkspace } from "../../../../lib/auth/requireWorkspace";
import { mergeSentMessages } from "../../../../lib/inbox-send";
import { listInboxSentMessages } from "../../../../lib/inbox-sent-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const auth = await requireWorkspace(request);
    if (auth instanceof NextResponse) return auth;

    try {
        const workspaceId =
            request.nextUrl.searchParams.get("workspaceId")?.trim() ||
            DEMO_INBOX_WORKSPACE_ID;

        // Sent mail is always read for the signed-in workspace.
        const payload = mergeSentMessages(
            buildInboxPayload(workspaceId),
            await listInboxSentMessages(auth.workspaceId),
        );

        return NextResponse.json(payload, {
            status: 200,
            headers: {
                "Cache-Control": "no-store",
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
