import { prisma } from "../../../../../lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    const workspaceId =
        req.headers.get("x-workspace-id") ??
        "demo-workspace";

    await prisma.workspaceIntegration.delete({
        where: {
            workspaceId_provider: {
                workspaceId,
                provider: "resend",
            },
        },
    });

    return NextResponse.json({
        success: true,
    });
}