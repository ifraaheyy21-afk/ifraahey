import { NextResponse } from "next/server";
import { beginIntegrationOAuth } from "../../../../../lib/integrationOAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
    const oauth = await beginIntegrationOAuth(req, "pipedrive");
    if (oauth instanceof NextResponse) return oauth;

    const clientId = process.env.PIPEDRIVE_CLIENT_ID;
    const redirectUri = process.env.PIPEDRIVE_REDIRECT_URI;
    const oauthUrl = process.env.PIPEDRIVE_OAUTH_URL || "https://oauth.pipedrive.com";

    if (!clientId || !redirectUri) {
        return NextResponse.json(
            { error: "Missing Pipedrive environment variables" },
            { status: 500 }
        );
    }

    const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        state: oauth.state,
    });

    return oauth.redirect(`${oauthUrl}/oauth/authorize?${params.toString()}`);
}
