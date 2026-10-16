import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { emitAutomationEvent } from "../../../../../lib/automation/enrollment";

const transparentPixel = Buffer.from(
    "R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
    "base64"
);

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const scheduledEmailId = searchParams.get("sid");

    if (!scheduledEmailId) {
        return new NextResponse(transparentPixel, {
            headers: { "Content-Type": "image/gif" },
        });
    }

    try {
        const scheduledEmail = await prisma.scheduledEmail.findUnique({
            where: { id: scheduledEmailId },
        });

        if (scheduledEmail) {
            await prisma.$transaction([
                prisma.scheduledEmail.update({
                    where: { id: scheduledEmailId },
                    data: {
                        openedAt: scheduledEmail.openedAt || new Date(),
                    },
                }),
                prisma.emailEvent.create({
                    data: {
                        workspaceId: scheduledEmail.workspaceId,
                        customerId: scheduledEmail.customerId,
                        generatedEmailId: scheduledEmail.generatedEmailId,
                        scheduledEmailId: scheduledEmail.id,
                        emailType: scheduledEmail.emailType,
                        subject: scheduledEmail.subject,
                        status: "opened",
                        reason: "Tracking pixel loaded",
                    },
                }),
            ]);

            if (!scheduledEmail.openedAt) {
                await emitAutomationEvent({
                    workspaceId: scheduledEmail.workspaceId,
                    customerId: scheduledEmail.customerId,
                    event: { type: "email_opened" },
                    eventKey: scheduledEmail.id,
                    data: { scheduledEmailId: scheduledEmail.id, subject: scheduledEmail.subject },
                });
            }
        }
    } catch (error) {
        console.error("Open tracking error:", error);
    }

    return new NextResponse(transparentPixel, {
        headers: {
            "Content-Type": "image/gif",
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
    });
}