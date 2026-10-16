import { NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const email = await prisma.scheduledEmail.findUnique({
            where: { id },
        });

        if (!email) {
            return NextResponse.json(
                { error: "Queued email not found." },
                { status: 404 }
            );
        }

        if (email.status !== "failed" && email.status !== "cancelled") {
            return NextResponse.json(
                { error: "Only failed or cancelled emails can be retried." },
                { status: 409 }
            );
        }

        const retryEmail = await prisma.scheduledEmail.update({
            where: { id },
            data: {
                status: "pending" as any,
                scheduledFor: new Date(),
                failureReason: null,
            } as any,
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