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

        if (email.status === "sent") {
            return NextResponse.json(
                { error: "Sent emails cannot be cancelled." },
                { status: 409 }
            );
        }

        if (email.status === "cancelled") {
            return NextResponse.json({
                email,
                message: "Email is already cancelled.",
            });
        }

        const cancelledEmail = await prisma.scheduledEmail.update({
            where: { id },
            data: {
                status: "cancelled" as any,
            },
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