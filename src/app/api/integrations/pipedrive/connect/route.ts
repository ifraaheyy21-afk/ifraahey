import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

export async function GET() {
    const clientId = process.env.PIPEDRIVE_CLIENT_ID;
    const redirectUri = process.env.PIPEDRIVE_REDIRECT_URI;
    const oauthUrl = process.env.PIPEDRIVE_OAUTH_URL || "https://oauth.pipedrive.com";

    if (!clientId || !redirectUri) {
        return NextResponse.json(
            { error: "Missing Pipedrive environment variables" },
            { status: 500 }
        );
    }

    const state = crypto.randomBytes(24).toString("hex");

    const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
    });

    const response = NextResponse.redirect(`${oauthUrl}/oauth/authorize?${params.toString()}`);

    response.cookies.set("pipedrive_oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 10,
    });

    return response;
}