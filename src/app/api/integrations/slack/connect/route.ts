import { NextResponse } from "next/server";
import { beginIntegrationOAuth } from "../../../../../lib/integrationOAuth";

export async function GET(req: Request) {
    const oauth = await beginIntegrationOAuth(req, "slack");
    if (oauth instanceof NextResponse) return oauth;

    const params = new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID!,
        scope: [
            "chat:write",
            "channels:read",
            "groups:read",
            "users:read",
            "incoming-webhook",
        ].join(","),
        redirect_uri: process.env.SLACK_REDIRECT_URI!,
        state: oauth.state,
    });

    return oauth.redirect(
        `https://slack.com/oauth/v2/authorize?${params.toString()}`
    );
}
