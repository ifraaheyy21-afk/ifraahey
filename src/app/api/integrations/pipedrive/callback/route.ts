import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { completeIntegrationOAuth } from "../../../../../lib/integrationOAuth";
import { sealToken } from "../../../../../lib/integrationEncryption";

export const runtime = "nodejs";

export async function GET(req: Request) {
    const oauth = await completeIntegrationOAuth(req, "pipedrive");
    if (oauth instanceof NextResponse) return oauth;

    const url = new URL(req.url);

    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
        return NextResponse.redirect(
            new URL(`/dashboard/integrations?error=${encodeURIComponent(error)}`, req.url)
        );
    }

    if (!code) {
        return NextResponse.redirect(
            new URL("/dashboard/integrations?error=pipedrive_missing_code", req.url)
        );
    }

    const clientId = process.env.PIPEDRIVE_CLIENT_ID;
    const clientSecret = process.env.PIPEDRIVE_CLIENT_SECRET;
    const redirectUri = process.env.PIPEDRIVE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
        return NextResponse.json(
            { error: "Missing Pipedrive environment variables" },
            { status: 500 }
        );
    }

    const tokenResponse = await fetch("https://oauth.pipedrive.com/oauth/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
        }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
        console.error("Pipedrive token error:", tokens);

        return NextResponse.redirect(
            new URL(
                `/dashboard/integrations?error=${encodeURIComponent(
                    tokens.error || "pipedrive_token_failed"
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
                provider: "pipedrive",
            },
        },
        update: {
            status: "connected",
            accessToken: sealToken(tokens.access_token),
            refreshToken: sealToken(tokens.refresh_token),
            tokenType: tokens.token_type,
            scope: tokens.scope,
            expiresAt: tokens.expires_in
                ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
                : null,
            syncStatus: "connected",
            syncError: null,
        },
        create: {
            workspaceId,
            provider: "pipedrive",
            status: "connected",
            accessToken: sealToken(tokens.access_token),
            refreshToken: sealToken(tokens.refresh_token),
            tokenType: tokens.token_type,
            scope: tokens.scope,
            expiresAt: tokens.expires_in
                ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
                : null,
            syncStatus: "connected",
        },
    });

    const response = NextResponse.redirect(
        new URL("/dashboard/integrations?connected=pipedrive", req.url)
    );

    response.cookies.delete("oauth_state_pipedrive");

    return response;
}