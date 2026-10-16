import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { completeIntegrationOAuth } from "../../../../../lib/integrationOAuth";
import { sealToken } from "../../../../../lib/integrationEncryption";

export const runtime = "nodejs";


export async function GET(req: Request) {
    const oauth = await completeIntegrationOAuth(req, "salesforce");
    if (oauth instanceof NextResponse) return oauth;

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    if (error) {
        return NextResponse.redirect(
            new URL(
                `/dashboard/integrations?error=${encodeURIComponent(
                    errorDescription || error
                )}`,
                req.url
            )
        );
    }

    if (!code) {
        return NextResponse.redirect(
            new URL("/dashboard/integrations?error=missing_code", req.url)
        );
    }

    const codeVerifier = req.headers
        .get("cookie")
        ?.split(";")
        .find((cookie) => cookie.trim().startsWith("sf_code_verifier="))
        ?.split("=")[1];

    if (!codeVerifier) {
        return NextResponse.redirect(
            new URL("/dashboard/integrations?error=missing_code_verifier", req.url)
        );
    }

    const clientId = process.env.SALESFORCE_CLIENT_ID;
    const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
    const redirectUri = process.env.SALESFORCE_REDIRECT_URI;
    const loginUrl = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";

    if (!clientId || !clientSecret || !redirectUri) {
        return NextResponse.json(
            { error: "Missing Salesforce environment variables" },
            { status: 500 }
        );
    }

    const tokenResponse = await fetch(`${loginUrl}/services/oauth2/token`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            code_verifier: decodeURIComponent(codeVerifier),
        }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
        console.error("Salesforce token error:", tokens);

        return NextResponse.redirect(
            new URL(
                `/dashboard/integrations?error=${encodeURIComponent(
                    tokens.error_description || tokens.error || "salesforce_token_failed"
                )}`,
                req.url
            )
        );
    }

    const { workspaceId } = oauth;


    await prisma.workspaceIntegration.upsert({
        where: {
            workspaceId_provider: {
                workspaceId,
                provider: "salesforce",
            },
        },
        update: {
            status: "connected",
            accessToken: sealToken(tokens.access_token),
            refreshToken: sealToken(tokens.refresh_token),
            instanceUrl: tokens.instance_url,
            tokenType: tokens.token_type,
            scope: tokens.scope,
            issuedAt: tokens.issued_at
                ? new Date(Number(tokens.issued_at))
                : new Date(),
            syncStatus: "connected",
            syncError: null,
        },
        create: {
            workspaceId,
            provider: "salesforce",
            status: "connected",
            accessToken: sealToken(tokens.access_token),
            refreshToken: sealToken(tokens.refresh_token),
            instanceUrl: tokens.instance_url,
            tokenType: tokens.token_type,
            scope: tokens.scope,
            issuedAt: tokens.issued_at
                ? new Date(Number(tokens.issued_at))
                : new Date(),
            syncStatus: "connected",
        },
    });

    const response = NextResponse.redirect(
        new URL("/dashboard/integrations?connected=salesforce", req.url)
    );

    response.cookies.delete("sf_code_verifier");

    return response;
}