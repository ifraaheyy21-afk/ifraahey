import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);

        const workspaceId = searchParams.get("workspaceId");
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