import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";

function getWorkspaceId() {
    return process.env.DEMO_WORKSPACE_ID || "demo-workspace";
}

export async function POST() {
    try {
        const workspaceId = getWorkspaceId();

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