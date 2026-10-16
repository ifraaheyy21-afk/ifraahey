import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

function base64UrlEncode(buffer: Buffer) {
    return buffer
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

export async function GET() {
    const clientId = process.env.SALESFORCE_CLIENT_ID;
    const redirectUri = process.env.SALESFORCE_REDIRECT_URI;
    const loginUrl = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";

    if (!clientId || !redirectUri) {
        return NextResponse.json(
            { error: "Missing Salesforce environment variables" },
            { status: 500 }
        );
    }

    const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
    const codeChallenge = base64UrlEncode(
        crypto.createHash("sha256").update(codeVerifier).digest()
    );

    const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "api refresh_token id",
        prompt: "login",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
    });

    const response = NextResponse.redirect(
        `${loginUrl}/services/oauth2/authorize?${params.toString()}`
    );

    response.cookies.set("sf_code_verifier", codeVerifier, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 10,
    });

    return response;
}