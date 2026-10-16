import { NextResponse } from "next/server";
import { getOrCreateWorkspaceFromRequest } from "../../../../lib/workspace";

export async function GET(req: Request) {
    try {
        const workspace = await getOrCreateWorkspaceFromRequest(req);

        return NextResponse.json({
            workspaceId: workspace.id,
            workspace,
            isDemo: workspace.id === "demo-workspace",
        });
    } catch (error) {
        console.error("Workspace error:", error);

        return NextResponse.json(
            { error: "Failed to load workspace" },
            { status: 500 }
        );
    }
}