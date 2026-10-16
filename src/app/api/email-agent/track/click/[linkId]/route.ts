import { NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { emitAutomationEvent } from "../../../../../../lib/automation/enrollment";

export const runtime = "nodejs";

export async function GET(
    _req: Request,
    context: { params: Promise<{ linkId: string }> }
) {
    try {
        const { linkId } = await context.params;

        const trackedLink = await prisma.trackedLink.findFirst({
            where: { id: linkId },
        });

        if (!trackedLink) {
            return NextResponse.json({ error: "Tracked link not found" }, { status: 404 });
        }

        const scheduledEmail = await prisma.scheduledEmail.findFirst({
            where: { id: trackedLink.scheduledEmailId },
        });

        if (scheduledEmail) {
            await prisma.$transaction([
                prisma.emailEvent.create({
                    data: {
                        workspaceId: trackedLink.workspaceId,
                        customerId: trackedLink.customerId,
                        generatedEmailId: scheduledEmail.generatedEmailId,
                        scheduledEmailId: scheduledEmail.id,
                        emailType: scheduledEmail.emailType,
                        subject: scheduledEmail.subject,
                        status: "clicked",
                        reason: trackedLink.originalUrl,
                        providerMessageId: scheduledEmail.providerMessageId,
                    },
                }),

                prisma.scheduledEmail.update({
                    where: { id: scheduledEmail.id },
                    data: {
                        clickedAt: scheduledEmail.clickedAt || new Date(),
                    },
                }),
            ]);

            if (!scheduledEmail.clickedAt) {
                await emitAutomationEvent({
                    workspaceId: scheduledEmail.workspaceId,
                    customerId: scheduledEmail.customerId,
                    event: { type: "email_clicked" },
                    eventKey: scheduledEmail.id,
                    data: {
                        scheduledEmailId: scheduledEmail.id,
                        subject: scheduledEmail.subject,
                        url: trackedLink.originalUrl,
                    },
                });
            }
        }

        return NextResponse.redirect(trackedLink.originalUrl);
    } catch (error) {
        console.error("Click tracking error:", error);
        return NextResponse.json({ error: "Click tracking failed" }, { status: 500 });
    }
}