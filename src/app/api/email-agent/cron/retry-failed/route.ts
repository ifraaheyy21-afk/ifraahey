import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { prepareTrackedEmailHtml } from "../../../../../lib/emailTracking";
import {
    getResendErrorMessage,
    getWorkspaceResendClient,
} from "../../../../../lib/resendIntegration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function retryFailedEmails(req: Request) {
    try {
        const authHeader = req.headers.get("authorization");
        const expectedSecret = process.env.CRON_SECRET;

        if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const failedEmails = await prisma.scheduledEmail.findMany({
            where: {
                status: "failed",
                retryCount: {
                    lt: 3,
                },
                bouncedAt: null,
                complainedAt: null,
            },
            take: 10,
            orderBy: {
                updatedAt: "asc",
            },
            include: {
                customer: true,
            },
        });

        const results: Array<{
            id: string;
            status: string;
            providerMessageId?: string | null;
            error?: string;
        }> = [];

        for (const email of failedEmails) {
            const lockedEmail = await prisma.scheduledEmail.updateMany({
                where: {
                    id: email.id,
                    status: "failed",
                    retryCount: {
                        lt: 3,
                    },
                    bouncedAt: null,
                    complainedAt: null,
                },
                data: {
                    status: "sending",
                    retryCount: {
                        increment: 1,
                    },
                    lastRetryAt: new Date(),
                    failureReason: null,
                },
            });

            if (lockedEmail.count === 0) {
                continue;
            }

            const suppressed = await prisma.suppression.findUnique({
                where: {
                    workspaceId_email: {
                        workspaceId: email.workspaceId,
                        email: email.customer.email,
                    },
                },
            });

            if (suppressed || email.customer.unsubscribedAt) {
                await prisma.$transaction([
                    prisma.scheduledEmail.update({
                        where: {
                            id: email.id,
                        },
                        data: {
                            status: "failed",
                            failureReason:
                                "Recipient is unsubscribed or suppressed",
                        },
                    }),

                    prisma.emailEvent.create({
                        data: {
                            workspaceId: email.workspaceId,
                            customerId: email.customerId,
                            generatedEmailId: email.generatedEmailId,
                            scheduledEmailId: email.id,
                            emailType: email.emailType,
                            subject: email.subject,
                            status: "retry_suppressed",
                            reason:
                                "Recipient is unsubscribed or suppressed",
                        },
                    }),
                ]);

                results.push({
                    id: email.id,
                    status: "retry_suppressed",
                });

                continue;
            }

            try {
                const trackedHtml = await prepareTrackedEmailHtml({
                    html: email.html,
                    workspaceId: email.workspaceId,
                    scheduledEmailId: email.id,
                    customerId: email.customerId,
                });

                const { resend, metadata } =
                    await getWorkspaceResendClient(email.workspaceId);

                const resendMetadata =
                    metadata &&
                        typeof metadata === "object" &&
                        !Array.isArray(metadata)
                        ? (metadata as {
                            senderName?: string | null;
                            senderEmail?: string | null;
                        })
                        : {};

                const senderEmail = resendMetadata.senderEmail;
                const senderName = resendMetadata.senderName;

                if (!senderEmail) {
                    throw new Error(
                        "The connected Resend account does not have a sender email."
                    );
                }

                const from = senderName
                    ? `${senderName} <${senderEmail}>`
                    : senderEmail;

                const { data, error } = await resend.emails.send({
                    from,
                    to: email.customer.email,
                    subject: email.subject,
                    html: trackedHtml,
                    text: email.plainText || undefined,
                });

                if (error) {
                    throw new Error(getResendErrorMessage(error));
                }

                if (!data?.id) {
                    throw new Error(
                        "Resend did not return an email identifier."
                    );
                }

                const providerMessageId = data.id;

                await prisma.$transaction([
                    prisma.scheduledEmail.update({
                        where: {
                            id: email.id,
                        },
                        data: {
                            status: "sent",
                            sentAt: new Date(),
                            failureReason: null,
                            providerMessageId,
                        },
                    }),

                    prisma.emailEvent.create({
                        data: {
                            workspaceId: email.workspaceId,
                            customerId: email.customerId,
                            generatedEmailId: email.generatedEmailId,
                            scheduledEmailId: email.id,
                            emailType: email.emailType,
                            subject: email.subject,
                            status: "retried_sent",
                            reason:
                                "Failed email retried successfully",
                            providerMessageId,
                        },
                    }),

                    prisma.customer.update({
                        where: {
                            id: email.customerId,
                        },
                        data: {
                            emailsSent: {
                                increment: 1,
                            },
                            lastEmail: email.subject,
                        },
                    }),
                ]);

                results.push({
                    id: email.id,
                    status: "retried_sent",
                    providerMessageId,
                });
            } catch (retryError) {
                const message =
                    retryError instanceof Error
                        ? retryError.message
                        : "Retry failed";

                await prisma.$transaction([
                    prisma.scheduledEmail.update({
                        where: {
                            id: email.id,
                        },
                        data: {
                            status: "failed",
                            failureReason: message,
                        },
                    }),

                    prisma.emailEvent.create({
                        data: {
                            workspaceId: email.workspaceId,
                            customerId: email.customerId,
                            generatedEmailId: email.generatedEmailId,
                            scheduledEmailId: email.id,
                            emailType: email.emailType,
                            subject: email.subject,
                            status: "retry_failed",
                            reason: message,
                        },
                    }),
                ]);

                results.push({
                    id: email.id,
                    status: "retry_failed",
                    error: message,
                });
            }
        }

        return NextResponse.json({
            success: true,
            processed: results.length,
            results,
        });
    } catch (error) {
        console.error("CRON_RETRY_FAILED_EMAILS_ERROR", error);

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to retry emails",
            },
            {
                status: 500,
            }
        );
    }
}

export async function POST(req: Request) {
    return retryFailedEmails(req);
}

export async function GET(req: Request) {
    return retryFailedEmails(req);
}