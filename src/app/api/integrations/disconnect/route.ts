import { NextResponse } from "next/server";
import {
    IntegrationProvider,
    IntegrationStatus,
} from "@prisma/client";
import { prisma } from "../../../../lib/prisma";
import { getWorkspaceId } from "../../../../lib/getWorkspaceId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedProviders = new Set<IntegrationProvider>(
    Object.values(IntegrationProvider)
);

export async function POST(req: Request) {
    try {
        const workspaceId = await getWorkspaceId(req);

        const body = (await req.json()) as {
            provider?: unknown;
        };

        if (typeof body.provider !== "string") {
            return NextResponse.json(
                {
                    error: "Missing integration provider.",
                },
                {
                    status: 400,
                }
            );
        }

        const provider =
            body.provider.toLowerCase() as IntegrationProvider;

        if (!allowedProviders.has(provider)) {
            return NextResponse.json(
                {
                    error: "Unsupported integration provider.",
                },
                {
                    status: 400,
                }
            );
        }

        const existing =
            await prisma.workspaceIntegration.findUnique({
                where: {
                    workspaceId_provider: {
                        workspaceId,
                        provider,
                    },
                },
                select: {
                    id: true,
                },
            });

        if (!existing) {
            return NextResponse.json({
                success: true,
                message: "Integration was already disconnected.",
            });
        }

        /*
         * Remove credentials immediately while retaining the record for
         * connection status and future audit history.
         */
        await prisma.workspaceIntegration.update({
            where: {
                workspaceId_provider: {
                    workspaceId,
                    provider,
                },
            },
            data: {
                status: IntegrationStatus.disconnected,
                accessToken: null,
                refreshToken: null,
                expiresAt: null,
                metadata: {
                    disconnectedAt: new Date().toISOString(),
                },
            },
        });

        return NextResponse.json({
            success: true,
        });
    } catch (error) {
        console.error("Disconnect integration error:", error);

        const message =
            error instanceof Error
                ? error.message
                : "Failed to disconnect integration.";

        return NextResponse.json(
            {
                error: message,
            },
            {
                status: 500,
            }
        );
    }
}