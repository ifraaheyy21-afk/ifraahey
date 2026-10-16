import { Prisma } from "@prisma/client";

import { prisma } from "../prisma";
import { plainTextToHtml, renderTemplate } from "./template";
import type { ExecutionContext, WorkflowNode } from "./types";

function cleanText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

async function findExistingAutomationEmail(
    automationRunId: string,
    automationNodeId: string,
) {
    return prisma.scheduledEmail.findFirst({
        where: {
            automationRunId,
            automationNodeId,
        },
        select: {
            id: true,
            subject: true,
            scheduledFor: true,
            status: true,
        },
    });
}

export async function executeEmailNode({
    workspaceId,
    customerId,
    workflowId,
    node,
    context,
}: {
    workspaceId: string;
    customerId: string | null;
    workflowId: string;
    node: WorkflowNode;
    context: ExecutionContext;
}) {
    if (!customerId) {
        throw new Error(`${node.title} requires a customer.`);
    }

    const automationRunId = cleanText(context.automationRunId);

    if (!automationRunId) {
        throw new Error(
            `${node.title} is missing the automation run id required for safe email execution.`,
        );
    }

    const existing = await findExistingAutomationEmail(
        automationRunId,
        node.id,
    );

    if (existing) {
        return {
            scheduledEmailId: existing.id,
            subject: existing.subject,
            scheduledFor: existing.scheduledFor.toISOString(),
            status: existing.status,
            reused: true,
        };
    }

    const customer = await prisma.customer.findFirst({
        where: {
            id: customerId,
            workspaceId,
         
        },
        select: {
            id: true,
            email: true,
            unsubscribedAt: true,
        },
    });

    if (!customer) {
        throw new Error(
            "Customer not found in this workspace.",
        );
    }

    const suppressed = await prisma.suppression.findUnique({
        where: {
            workspaceId_email: {
                workspaceId,
                email: customer.email.toLowerCase(),
            },
        },
        select: {
            id: true,
        },
    });

    if (suppressed || customer.unsubscribedAt) {
        throw new Error(
            "Customer is unsubscribed or suppressed.",
        );
    }

    const rawSubject = node.config.subject?.trim();
    const rawBody = node.config.body?.trim();

    if (!rawSubject || !rawBody) {
        throw new Error(
            `${node.title} is missing email content.`,
        );
    }

    const subject = renderTemplate(rawSubject, context);
    const plainText = renderTemplate(rawBody, context);
    const html = plainTextToHtml(plainText);
    const emailType = `automation:${workflowId}:${node.id}`;

    try {
        const scheduledEmail = await prisma.$transaction(
            async (transaction) => {
                const created =
                    await transaction.scheduledEmail.create({
                        data: {
                            workspaceId,
                            customerId,
                            automationRunId,
                            automationNodeId: node.id,
                            emailType,
                            subject,
                            html,
                            plainText,
                            scheduledFor: new Date(),
                            status: "scheduled",
                        },
                        select: {
                            id: true,
                            subject: true,
                            scheduledFor: true,
                            status: true,
                        },
                    });

                await transaction.emailEvent.create({
                    data: {
                        workspaceId,
                        customerId,
                        scheduledEmailId: created.id,
                        emailType,
                        subject,
                        status: "scheduled",
                        reason: `Scheduled by automation ${workflowId}`,
                    },
                });

                return created;
            },
        );

        return {
            scheduledEmailId: scheduledEmail.id,
            subject: scheduledEmail.subject,
            scheduledFor:
                scheduledEmail.scheduledFor.toISOString(),
            status: scheduledEmail.status,
            reused: false,
        };
    } catch (error) {
        // The database unique constraint is the final protection if two
        // workers race to execute the same run/node at the same time.
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            const raced = await findExistingAutomationEmail(
                automationRunId,
                node.id,
            );

            

            if (raced) {
                return {
                    scheduledEmailId: raced.id,
                    subject: raced.subject,
                    scheduledFor: raced.scheduledFor.toISOString(),
                    status: raced.status,
                    reused: true,
                };
            }
        }

        throw error;
    }
}
