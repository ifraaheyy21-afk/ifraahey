import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireWorkspace } from "../../../../../lib/auth/requireWorkspace";

type RouteParams = {
    params: Promise<{ id: string }>;
};

// Emails the sender has finished with, or is working on, must not change.
const MUTABLE_STATUSES = ["scheduled", "failed", "cancelled"];

function isValidDate(value: string) {
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
}

export async function PATCH(req: Request, { params }: RouteParams) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const { id } = await params;
        const body = await req.json();

        const { workspaceId } = auth;
        const { scheduledFor } = body;

        if (!scheduledFor) {
            return NextResponse.json({ error: "Missing scheduledFor" }, { status: 400 });
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

        if (!MUTABLE_STATUSES.includes(existing.status)) {
            return NextResponse.json({ error: "This email can no longer be rescheduled" }, { status: 409 });
        }

        const changed = await prisma.scheduledEmail.updateMany({
            where: { id, workspaceId, status: existing.status, updatedAt: existing.updatedAt },
            data: {
                scheduledFor: new Date(scheduledFor),
                status: "scheduled",
                failureReason: null,
            },
        });

        if (changed.count !== 1) {
            return NextResponse.json({ error: "This email changed while you were editing it. Refresh and try again." }, { status: 409 });
        }

        const scheduledEmail = await prisma.scheduledEmail.findUnique({
            where: { id },
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
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const { id } = await params;
        const { workspaceId } = auth;

        const existing = await prisma.scheduledEmail.findFirst({
            where: { id, workspaceId },
        });

        if (!existing) {
            return NextResponse.json({ error: "Scheduled email not found" }, { status: 404 });
        }

        if (!MUTABLE_STATUSES.includes(existing.status) || existing.sendAttemptedAt) {
            return NextResponse.json({ error: "This email can no longer be deleted" }, { status: 409 });
        }

        const deleted = await prisma.scheduledEmail.deleteMany({
            where: { id, workspaceId, status: existing.status, updatedAt: existing.updatedAt },
        });

        if (deleted.count !== 1) {
            return NextResponse.json({ error: "This email changed before it could be deleted. Refresh and try again." }, { status: 409 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete scheduled email error:", error);
        return NextResponse.json({ error: "Failed to delete scheduled email" }, { status: 500 });
    }
}