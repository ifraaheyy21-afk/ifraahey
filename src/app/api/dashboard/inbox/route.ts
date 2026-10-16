import { NextRequest, NextResponse } from "next/server";

import {
    buildInboxPayload,
    DEMO_INBOX_WORKSPACE_ID,
} from "../../../../lib/inbox-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const workspaceId =
            request.nextUrl.searchParams.get("workspaceId")?.trim() ||
            DEMO_INBOX_WORKSPACE_ID;

        return NextResponse.json(buildInboxPayload(workspaceId), {
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
