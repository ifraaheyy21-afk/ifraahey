import { NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { requireWorkspace } from "../../../../../../lib/auth/requireWorkspace";

export const dynamic = "force-dynamic";

// "sending" is excluded: the worker holds a lease and may already have
// handed the message to the provider.
const CANCELLABLE_STATUSES = ["scheduled", "failed"];

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const { id } = await params;

        const email = await prisma.scheduledEmail.findFirst({
            where: { id, workspaceId: auth.workspaceId },
        });

        if (!email) {
            return NextResponse.json(
                { error: "Queued email not found." },
                { status: 404 }
            );
        }

        if (email.status === "cancelled") {
            return NextResponse.json({
                email,
                message: "Email is already cancelled.",
            });
        }

        if (!CANCELLABLE_STATUSES.includes(email.status)) {
            return NextResponse.json(
                { error: "This email has already been sent or is sending, so it cannot be cancelled." },
                { status: 409 }
            );
        }

        const cancelled = await prisma.scheduledEmail.updateMany({
            where: {
                id,
                workspaceId: auth.workspaceId,
                status: { in: CANCELLABLE_STATUSES },
            },
            data: {
                status: "cancelled",
                sendLockToken: null,
                sendLockedUntil: null,
            },
        });

        if (cancelled.count !== 1) {
            return NextResponse.json(
                { error: "This email started sending before it could be cancelled." },
                { status: 409 }
            );
        }

        const cancelledEmail = await prisma.scheduledEmail.findUnique({
            where: { id },
        });

        return NextResponse.json({
            email: cancelledEmail,
            message: "Queued email cancelled.",
        });
    } catch (error) {
        console.error("EMAIL_QUEUE_CANCEL_ERROR", error);

        return NextResponse.json(
            { error: "Failed to cancel queued email." },
            { status: 500 }
        );
    }
}
