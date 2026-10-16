import { prisma } from "../../../../../lib/prisma";
import { NextResponse } from "next/server";
import { requireWorkspace } from "../../../../../lib/auth/requireWorkspace";

export async function POST(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    await prisma.workspaceIntegration.deleteMany({
        where: {
            workspaceId: auth.workspaceId,
            provider: "resend",
        },
    });

    return NextResponse.json({
        success: true,
    });
}
