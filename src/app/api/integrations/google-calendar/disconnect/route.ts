import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const workspaceId = body.workspaceId || "demo-workspace";

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