import { NextResponse } from "next/server";

export async function GET(req: Request) {
    const clientId = process.env.INTERCOM_CLIENT_ID;
    const redirectUri =
        process.env.INTERCOM_REDIRECT_URI ||
        "http://localhost:3000/api/integrations/intercom/callback";

    if (!clientId) {
        return NextResponse.redirect(
            new URL("/dashboard/integrations?error=missing_intercom_client_id", req.url)
        );
    }

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
    });

    return NextResponse.redirect(
        `https://app.intercom.com/oauth?${params.toString()}`
    );
}