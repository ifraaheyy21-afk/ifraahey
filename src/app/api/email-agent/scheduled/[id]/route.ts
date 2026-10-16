import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

type RouteParams = {
    params: Promise<{ id: string }>;
};

function isValidDate(value: string) {
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
}

export async function PATCH(req: Request, { params }: RouteParams) {
    try {
        const { id } = await params;
        const body = await req.json();

        const { workspaceId, scheduledFor } = body;

        if (!workspaceId || !scheduledFor) {
            return NextResponse.json({ error: "Missing workspaceId or scheduledFor" }, { status: 400 });
        }

        if (!isValidDate(scheduledFor)) {
            return NextResponse.json({ error: "Invalid scheduledFor date" }, { status: 400 });
        }

        const existing = await prisma.scheduledEmail.findFirst({
            where: { id, workspaceId },
        });

        if (!existing) {
            return NextResponse.json({ error: "Scheduled email not found" }, { status: 404 });
        }

        if (existing.status === "sent" || existing.status === "sending") {
            return NextResponse.json({ error: "This email can no longer be rescheduled" }, { status: 409 });
        }

        const scheduledEmail = await prisma.scheduledEmail.update({
            where: { id },
            data: {
                scheduledFor: new Date(scheduledFor),
                status: "scheduled",
                failureReason: null,
            },
            include: {
                customer: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        company: true,
                    },
                },
            },
        });

        return NextResponse.json({ scheduledEmail });
    } catch (error) {
        console.error("Reschedule email error:", error);
        return NextResponse.json({ error: "Failed to reschedule email" }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: RouteParams) {
    try {
        const { id } = await params;
        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get("workspaceId");

        if (!workspaceId) {
            return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });
        }

        const existing = await prisma.scheduledEmail.findFirst({
            where: { id, workspaceId },
        });

        if (!existing) {
            return NextResponse.json({ error: "Scheduled email not found" }, { status: 404 });
        }

        if (existing.status === "sent" || existing.status === "sending") {
            return NextResponse.json({ error: "This email can no longer be deleted" }, { status: 409 });
        }

        await prisma.scheduledEmail.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete scheduled email error:", error);
        return NextResponse.json({ error: "Failed to delete scheduled email" }, { status: 500 });
    }
}