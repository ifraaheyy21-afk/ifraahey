import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";

type SlackOAuthResponse = {
    ok: boolean;
    error?: string;
    access_token?: string;
    token_type?: string;
    scope?: string;
    bot_user_id?: string;
    app_id?: string;
    team?: {
        id?: string;
        name?: string;
    };
    authed_user?: {
        id?: string;
    };
    incoming_webhook?: {
        channel?: string;
        channel_id?: string;
        configuration_url?: string;
        url?: string;
    };
};

function getBaseUrl() {
    return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function getWorkspaceId() {
    return process.env.DEMO_WORKSPACE_ID || "demo-workspace";
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
        return NextResponse.redirect(
            `${getBaseUrl()}/dashboard/integrations?error=${encodeURIComponent(error)}`
        );
    }

    if (!code) {
        return NextResponse.redirect(
            `${getBaseUrl()}/dashboard/integrations?error=${encodeURIComponent(
                "Missing Slack authorization code"
            )}`
        );
    }

    if (
        !process.env.SLACK_CLIENT_ID ||
        !process.env.SLACK_CLIENT_SECRET ||
        !process.env.SLACK_REDIRECT_URI
    ) {
        return NextResponse.redirect(
            `${getBaseUrl()}/dashboard/integrations?error=${encodeURIComponent(
                "Missing Slack environment variables"
            )}`
        );
    }

    try {
        const response = await fetch("https://slack.com/api/oauth.v2.access", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                code,
                client_id: process.env.SLACK_CLIENT_ID,
                client_secret: process.env.SLACK_CLIENT_SECRET,
                redirect_uri: process.env.SLACK_REDIRECT_URI,
            }),
        });

        const data = (await response.json()) as SlackOAuthResponse;

        if (!data.ok || !data.access_token) {
            console.error("Slack OAuth failed:", data);

            return NextResponse.redirect(
                `${getBaseUrl()}/dashboard/integrations?error=${encodeURIComponent(
                    data.error || "Slack OAuth failed"
                )}`
            );
        }

        const workspaceId = getWorkspaceId();

        await prisma.workspace.upsert({
            where: {
                id: workspaceId,
            },
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
                    provider: "slack",
                },
            },
            update: {
                status: "connected",
                accessToken: data.access_token,
                tokenType: data.token_type || "bot",
                scope: data.scope || null,
                externalOrgId: data.team?.id || null,
                externalUserId: data.authed_user?.id || data.bot_user_id || null,

                webhookUrl: data.incoming_webhook?.url || null,
                webhookChannel: data.incoming_webhook?.channel || null,
                webhookChannelId: data.incoming_webhook?.channel_id || null,

                syncStatus: "connected",
                syncError: null,
                lastSyncedAt: new Date(),
            },
            create: {
                workspaceId,
                provider: "slack",
                status: "connected",
                accessToken: data.access_token,
                tokenType: data.token_type || "bot",
                scope: data.scope || null,
                externalOrgId: data.team?.id || null,
                externalUserId: data.authed_user?.id || data.bot_user_id || null,

                webhookUrl: data.incoming_webhook?.url || null,
                webhookChannel: data.incoming_webhook?.channel || null,
                webhookChannelId: data.incoming_webhook?.channel_id || null,

                syncStatus: "connected",
                syncError: null,
                lastSyncedAt: new Date(),
            },
        });

        return NextResponse.redirect(
            `${getBaseUrl()}/dashboard/integrations?connected=slack`
        );
    } catch (error) {
        console.error("Slack callback error:", error);

        return NextResponse.redirect(
            `${getBaseUrl()}/dashboard/integrations?error=${encodeURIComponent(
                "Slack callback failed"
            )}`
        );
    }
}