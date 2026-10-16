import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireWorkspace } from "../../../../../lib/auth/requireWorkspace";

export const runtime = "nodejs";

export async function POST(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const { workspaceId } = auth;

        await prisma.workspaceIntegration.deleteMany({
            where: {
                workspaceId,
                provider: "slack",
            },
        });

        return NextResponse.json({
            success: true,
            message: "Slack disconnected successfully",
        });
    } catch (error) {
        console.error("Slack disconnect error:", error);

        return NextResponse.json(
            {
                success: false,
                error: "Failed to disconnect Slack",
            },
            { status: 500 }
        );
    }
}