import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";

function getWorkspaceId() {
    return process.env.DEMO_WORKSPACE_ID || "demo-workspace";
}

function getCookie(req: Request, name: string) {
    return req.headers
        .get("cookie")
        ?.split(";")
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith(`${name}=`))
        ?.split("=")[1];
}

export async function GET(req: Request) {
    const url = new URL(req.url);

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const cookieState = getCookie(req, "pipedrive_oauth_state");

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

    if (!state || !cookieState || state !== decodeURIComponent(cookieState)) {
        return NextResponse.redirect(
            new URL("/dashboard/integrations?error=pipedrive_invalid_state", req.url)
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

    const workspaceId = getWorkspaceId();

    await prisma.workspace.upsert({
        where: { id: workspaceId },
        update: {},
        create: {
            id: workspaceId,
            name: "Demo Workspace",
        },
    });

    await prisma.workspaceIntegration.upsert({
        where: {
            workspaceId_provider: {
                workspaceId,
                provider: "pipedrive",
            },
        },
        update: {
            status: "connected",
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
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
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
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

    response.cookies.delete("pipedrive_oauth_state");

    return response;
}