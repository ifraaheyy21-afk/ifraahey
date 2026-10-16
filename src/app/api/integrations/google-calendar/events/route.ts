import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "../../../../../lib/prisma";
import { createGoogleOAuthClient } from "../../../../../lib/google";
import { requireWorkspace } from "../../../../../lib/auth/requireWorkspace";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const { workspaceId } = auth;

        const integration = await prisma.workspaceIntegration.findUnique({
            where: {
                workspaceId_provider: {
                    workspaceId,
                    provider: "google_calendar",
                },
            },
        });

        if (!integration || integration.status !== "connected") {
            return NextResponse.json(
                { error: "Google Calendar is not connected" },
                { status: 404 }
            );
        }

        const googleOAuthClient = createGoogleOAuthClient();
        googleOAuthClient.setCredentials({
            access_token: integration.accessToken,
            refresh_token: integration.refreshToken || undefined,
        });

        const calendar = google.calendar({
            version: "v3",
            auth: googleOAuthClient,
        });

        const response = await calendar.events.list({
            calendarId: "primary",
            timeMin: new Date().toISOString(),
            maxResults: 20,
            singleEvents: true,
            orderBy: "startTime",
        });

        return NextResponse.json({
            success: true,
            events: response.data.items || [],
        });
    } catch (error) {
        console.error("Google Calendar events error:", error);

        return NextResponse.json(
            { error: "Failed to fetch Google Calendar events" },
            { status: 500 }
        );
    }
}