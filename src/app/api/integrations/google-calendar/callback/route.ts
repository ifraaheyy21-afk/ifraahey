import { NextRequest, NextResponse } from "next/server";
import { googleOAuthClient } from "../../../../../lib/google";
import { prisma } from "../../../../../lib/prisma";
import { completeIntegrationOAuth } from "../../../../../lib/integrationOAuth";
import { sealToken } from "../../../../../lib/integrationEncryption";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    const oauth = await completeIntegrationOAuth(req, "google_calendar");
    if (oauth instanceof NextResponse) return oauth;

    try {
        const code = req.nextUrl.searchParams.get("code");
        const error = req.nextUrl.searchParams.get("error");
        const { workspaceId } = oauth;

        const appUrl =
            process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

        if (error) {
            return NextResponse.redirect(
                `${appUrl}/dashboard/integrations?error=${encodeURIComponent(error)}`
            );
        }

        if (!code) {
            return NextResponse.redirect(
                `${appUrl}/dashboard/integrations?error=missing_google_code`
            );
        }

        const { tokens } = await googleOAuthClient.getToken(code);

        if (!tokens.access_token) {
            return NextResponse.redirect(
                `${appUrl}/dashboard/integrations?error=missing_google_access_token`
            );
        }

        const expiresAt = tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : null;


        const existing = await prisma.workspaceIntegration.findUnique({
            where: {
                workspaceId_provider: {
                    workspaceId,
                    provider: "google_calendar",
                },
            },
        });

        await prisma.workspaceIntegration.upsert({
            where: {
                workspaceId_provider: {
                    workspaceId,
                    provider: "google_calendar",
                },
            },
            update: {
                status: "connected",
                accessToken: sealToken(tokens.access_token),
                refreshToken: sealToken(tokens.refresh_token) ?? existing?.refreshToken ?? null,
                tokenType: tokens.token_type || "Bearer",
                scope: tokens.scope || null,
                issuedAt: new Date(),
                expiresAt,
                syncStatus: "connected",
                syncError: null,
            },
            create: {
                workspaceId,
                provider: "google_calendar",
                status: "connected",
                accessToken: sealToken(tokens.access_token),
                refreshToken: sealToken(tokens.refresh_token),
                tokenType: tokens.token_type || "Bearer",
                scope: tokens.scope || null,
                issuedAt: new Date(),
                expiresAt,
                syncStatus: "connected",
            },
        });

        return NextResponse.redirect(
            `${appUrl}/dashboard/integrations?connected=google_calendar`
        );
    } catch (error) {
        console.error("Google Calendar callback error:", error);

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

        return NextResponse.redirect(
            `${appUrl}/dashboard/integrations?error=google_calendar_callback_failed`
        );
    }
}