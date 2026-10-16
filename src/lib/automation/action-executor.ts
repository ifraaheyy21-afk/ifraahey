import { Prisma } from "@prisma/client";

import { prisma } from "../prisma";
import { automationConfig } from "./config";
import { getAutomationActionCapability } from "./action-capabilities";

import type {
    ExecutionContext,
    WorkflowNode,
} from "./types";

function cleanText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeTag(value: string) {
    return value
        .trim()
        .toLocaleLowerCase("en-GB");
}

async function executeAddContactTag({
    workspaceId,
    customerId,
    node,
}: {
    workspaceId: string;
    customerId: string | null;
    node: WorkflowNode;
}) {
    if (!customerId) {
        throw new Error(
            `${node.title} requires a customer.`,
        );
    }

    const name = cleanText(node.config.actionValue);

    if (!name) {
        throw new Error(
            `${node.title} needs a tag name.`,
        );
    }

    if (name.length > automationConfig.maxTagLength) {
        throw new Error(
            `${node.title} tag exceeds the configured ${automationConfig.maxTagLength}-character limit.`,
        );
    }

    const normalizedName = normalizeTag(name);

    const customer = await prisma.customer.findFirst({
        where: {
            id: customerId,
            workspaceId,
        },
        select: {
            id: true,
        },
    });

    if (!customer) {
        throw new Error(
            "Customer not found in this workspace.",
        );
    }

    try {
        const tag = await prisma.customerTag.create({
            data: {
                workspaceId,
                customerId,
                name,
                normalizedName,
            },
            select: {
                id: true,
                name: true,
                createdAt: true,
            },
        });

        return {
            action: "add_contact_tag",
            tagId: tag.id,
            tagName: tag.name,
            createdAt: tag.createdAt.toISOString(),
            reused: false,
        };
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            const existing = await prisma.customerTag.findUnique({
                where: {
                    customerId_normalizedName: {
                        customerId,
                        normalizedName,
                    },
                },
                select: {
                    id: true,
                    name: true,
                    createdAt: true,
                },
            });

            if (existing) {
                return {
                    action: "add_contact_tag",
                    tagId: existing.id,
                    tagName: existing.name,
                    createdAt: existing.createdAt.toISOString(),
                    reused: true,
                };
            }
        }

        throw error;
    }
}

export async function executeActionNode({
    workspaceId,
    customerId,
    node,
    context: _context,
}: {
    workspaceId: string;
    customerId: string | null;
    workflowId: string;
    node: WorkflowNode;
    context: ExecutionContext;
}) {
    const capability = getAutomationActionCapability(
        node.config.actionType,
    );

    if (!capability) {
        throw new Error(
            `${node.title} uses an action that does not have a server executor yet.`,
        );
    }

    if (capability.requiresCustomer && !customerId) {
        throw new Error(
            `${node.title} requires a customer.`,
        );
    }

    if (
        capability.requiresValue &&
        !cleanText(node.config.actionValue)
    ) {
        throw new Error(
            `${node.title} needs an action value.`,
        );
    }

    if (capability.key === "stop_sequence") {
        return {
            kind: "complete" as const,
            output: {
                action: capability.key,
                reason:
                    node.config.actionType ?? node.title,
            },
        };
    }

    if (capability.key === "add_contact_tag") {
        const output = await executeAddContactTag({
            workspaceId,
            customerId,
            node,
        });

        return {
            kind: "continue" as const,
            output,
        };
    }

    throw new Error(
        `${node.title} uses an unsupported automation action.`,
    );
}
