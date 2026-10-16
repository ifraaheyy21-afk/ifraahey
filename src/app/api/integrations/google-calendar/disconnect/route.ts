import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireWorkspace } from "../../../../../lib/auth/requireWorkspace";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const { workspaceId } = auth;

        await prisma.workspaceIntegration.updateMany({
            where: {
                workspaceId,
                provider: "google_calendar",
            },
            data: {
                status: "disconnected",
                accessToken: "",
                refreshToken: null,
                expiresAt: null,
                syncStatus: "disconnected",
                syncError: null,
            },
        });

        return NextResponse.json({
            success: true,
            provider: "google_calendar",
            status: "disconnected",
        });
    } catch (error) {
        console.error("Google Calendar disconnect error:", error);

        return NextResponse.json(
            { error: "Failed to disconnect Google Calendar" },
            { status: 500 }
        );
    }
}