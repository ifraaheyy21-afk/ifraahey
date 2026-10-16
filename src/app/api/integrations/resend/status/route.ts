import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getWorkspaceId } from "../../../../../lib/getWorkspaceId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResendMetadata = {
    senderName?: string | null;
    senderEmail?: string | null;
    senderDomain?: string | null;
    permission?: string | null;
    domainStatus?: string | null;
    connectedAt?: string | null;
};

export async function GET(req: Request) {
    try {
        const workspaceId = await getWorkspaceId(req);

        const integration =
            await prisma.workspaceIntegration.findUnique({
                where: {
                    workspaceId_provider: {
                        workspaceId,
                        provider: "resend",
                    },
                },
                select: {
                    status: true,
                    metadata: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });

        if (!integration) {
            return NextResponse.json({
                connected: false,
                integration: null,
            });
        }

        const metadata =
            integration.metadata &&
                typeof integration.metadata === "object" &&
                !Array.isArray(integration.metadata)
                ? (integration.metadata as ResendMetadata)
                : {};

        return NextResponse.json({
            connected: integration.status === "connected",
            integration: {
                provider: "resend",
                status: integration.status,
                senderName: metadata.senderName || null,
                senderEmail: metadata.senderEmail || null,
                senderDomain: metadata.senderDomain || null,
                permission: metadata.permission || null,
                domainStatus: metadata.domainStatus || null,
                connectedAt:
                    metadata.connectedAt ||
                    integration.createdAt.toISOString(),
                updatedAt: integration.updatedAt.toISOString(),
            },
        });
    } catch (error) {
        console.error("Read Resend status error:", error);

        const message =
            error instanceof Error
                ? error.message
                : "Failed to read Resend status.";

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