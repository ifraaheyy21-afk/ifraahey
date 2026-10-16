import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireWorkspace } from "../../../../lib/auth/requireWorkspace";

export async function GET(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const { searchParams } = new URL(req.url);

        const { workspaceId } = auth;
        const customerId = searchParams.get("customerId");

        if (!workspaceId || !customerId) {
            return NextResponse.json(
                { error: "Missing workspaceId or customerId" },
                { status: 400 }
            );
        }

        const emailEvents = await prisma.emailEvent.findMany({
            where: {
                workspaceId,
                customerId,
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        return NextResponse.json({ emailEvents });
    } catch (error) {
        console.error("Get email events error:", error);

        return NextResponse.json(
            { error: "Failed to load email events" },
            { status: 500 }
        );
    }
}