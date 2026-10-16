import { NextResponse } from "next/server";

import {
    AuthError,
    getWorkspaceFromRequest,
} from "./getWorkspaceFromRequest";

export type WorkspaceAuth = Awaited<ReturnType<typeof getWorkspaceFromRequest>>;

/**
 * Resolve the signed-in user's workspace for an API route.
 *
 * The workspace always comes from the verified Firebase session or ID token,
 * never from a workspaceId in the query string, body or headers. Returns a
 * ready-to-send error response when the caller is not authenticated.
 *
 *   const auth = await requireWorkspace(req);
 *   if (auth instanceof NextResponse) return auth;
 *   const { workspaceId } = auth;
 */
export async function requireWorkspace(
    req: Request,
): Promise<WorkspaceAuth | NextResponse> {
    try {
        return await getWorkspaceFromRequest(req);
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { error: error.message, code: error.code },
                {
                    status: error.status,
                    headers: { "Cache-Control": "no-store" },
                },
            );
        }

        console.error("Workspace authentication failed:", error);

        return NextResponse.json(
            { error: "Unable to verify your session." },
            {
                status: 500,
                headers: { "Cache-Control": "no-store" },
            },
        );
    }
}
