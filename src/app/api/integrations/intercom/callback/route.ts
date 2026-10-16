import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const code = url.searchParams.get("code");

        if (!code) {
            return NextResponse.redirect(
                new URL("/dashboard/integrations?error=intercom_oauth_failed", req.url)
            );
        }

        if (!process.env.INTERCOM_CLIENT_ID || !process.env.INTERCOM_CLIENT_SECRET) {
            return NextResponse.redirect(
                new URL("/dashboard/integrations?error=missing_intercom_env", req.url)
            );
        }

        const tokenRes = await fetch("https://api.intercom.io/auth/eagle/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                client_id: process.env.INTERCOM_CLIENT_ID,
                client_secret: process.env.INTERCOM_CLIENT_SECRET,
                code,
            }),
        });

        const tokenData = await tokenRes.json();

        if (!tokenRes.ok || !tokenData.access_token) {
            console.error("Intercom token error:", tokenData);

            return NextResponse.redirect(
                new URL("/dashboard/integrations?error=intercom_token_failed", req.url)
            );
        }

        const workspaceId = "demo-workspace";

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
                    provider: "intercom",
                },
            },
            update: {
                status: "connected",
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token || null,
                tokenType: tokenData.token_type || "bearer",
                scope: Array.isArray(tokenData.scope)
                    ? tokenData.scope.join(" ")
                    : tokenData.scope || null,
                externalOrgId:
                    tokenData.workspace_id ||
                    tokenData.app_id ||
                    tokenData.company_id ||
                    null,
                issuedAt: new Date(),
                syncStatus: "connected",
                syncError: null,
            },
            create: {
                workspaceId,
                provider: "intercom",
                status: "connected",
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token || null,
                tokenType: tokenData.token_type || "bearer",
                scope: Array.isArray(tokenData.scope)
                    ? tokenData.scope.join(" ")
                    : tokenData.scope || null,
                externalOrgId:
                    tokenData.workspace_id ||
                    tokenData.app_id ||
                    tokenData.company_id ||
                    null,
                issuedAt: new Date(),
                syncStatus: "connected",
            },
        });

        return NextResponse.redirect(
            new URL("/dashboard/integrations?success=intercom", req.url)
        );
    } catch (error) {
        console.error("Intercom callback error:", error);

        return NextResponse.redirect(
            new URL("/dashboard/integrations?error=intercom_callback_failed", req.url)
        );
    }
}