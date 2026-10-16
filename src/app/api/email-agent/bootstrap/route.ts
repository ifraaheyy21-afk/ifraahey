import { NextResponse } from "next/server";

import {
    AuthError,
    getWorkspaceFromRequest,
} from "../../../../lib/auth/getWorkspaceFromRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
    return NextResponse.json(
        { error: message },
        { status },
    );
}

export async function GET(req: Request) {
    try {
        const { workspaceId } =
            await getWorkspaceFromRequest(req);

        return NextResponse.json(
            {
                workspaceId,
                workspace: {
                    id: workspaceId,
                },
            },
            {
                status: 200,
                headers: {
                    "Cache-Control": "no-store",
                },
            },
        );
    } catch (error) {
        if (error instanceof AuthError) {
            return jsonError(error.message, error.status);
        }

        console.error("Bootstrap workspace error:", error);

        return jsonError(
            "Failed to initialise workspace.",
            500,
        );
    }
}
