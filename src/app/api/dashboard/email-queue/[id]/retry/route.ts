import { NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { requireWorkspace } from "../../../../../../lib/auth/requireWorkspace";

export const dynamic = "force-dynamic";

const RETRYABLE_STATUSES = ["failed", "cancelled"];

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

        if (!RETRYABLE_STATUSES.includes(email.status)) {
            return NextResponse.json(
                { error: "Only failed or cancelled emails can be retried." },
                { status: 409 }
            );
        }

        // "scheduled" is what the send worker picks up. Any saved provider
        // payload is kept so the worker can replay it without duplicating.
        const requeued = await prisma.scheduledEmail.updateMany({
            where: {
                id,
                workspaceId: auth.workspaceId,
                status: { in: RETRYABLE_STATUSES },
            },
            data: {
                status: "scheduled",
                scheduledFor: new Date(),
                failureReason: null,
                retryCount: 0,
                lastRetryAt: null,
            },
        });

        if (requeued.count !== 1) {
            return NextResponse.json(
                { error: "This email changed while it was being retried. Refresh and try again." },
                { status: 409 }
            );
        }

        const retryEmail = await prisma.scheduledEmail.findUnique({
            where: { id },
        });

        return NextResponse.json({
            email: retryEmail,
            message: "Email queued for retry.",
        });
    } catch (error) {
        console.error("EMAIL_QUEUE_RETRY_ERROR", error);

        return NextResponse.json(
            { error: "Failed to retry email." },
            { status: 500 }
        );
    }
}
