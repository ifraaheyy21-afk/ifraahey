import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireWorkspace } from "../../../../lib/auth/requireWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const workspace = await prisma.workspace.findUnique({
            where: { id: auth.workspaceId },
        });

        return NextResponse.json({
            workspaceId: auth.workspaceId,
            workspace,
            isDemo: false,
        });
    } catch (error) {
        console.error("Workspace error:", error);

        return NextResponse.json(
            { error: "Failed to load workspace" },
            { status: 500 }
        );
    }
}
