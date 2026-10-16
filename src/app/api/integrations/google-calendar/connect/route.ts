import { NextResponse } from "next/server";
import { googleOAuthClient } from "../../../../../lib/google";
import { beginIntegrationOAuth } from "../../../../../lib/integrationOAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
    const oauth = await beginIntegrationOAuth(req, "google_calendar");
    if (oauth instanceof NextResponse) return oauth;

    try {
        if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
            return NextResponse.json(
                { error: "Missing Google OAuth environment variables" },
                { status: 500 }
            );
        }

        const url = googleOAuthClient.generateAuthUrl({
            access_type: "offline",
            prompt: "consent",
            scope: [
                "https://www.googleapis.com/auth/calendar",
                "https://www.googleapis.com/auth/calendar.events",
            ],
            state: oauth.state,
        });

        return oauth.redirect(url);
    } catch (error) {
        console.error("Google Calendar connect error:", error);

        return NextResponse.json(
            { error: "Failed to start Google Calendar OAuth" },
            { status: 500 }
        );
    }
}