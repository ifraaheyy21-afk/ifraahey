import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { runAutomation } from "./workflow-runner";
import { toJsonInput } from "./json";
import { asWorkflowDefinition } from "./serializer";

type StartAutomationRunInput = {
    workspaceId: string;
    workflowId: string;
    customerId: string | null;
    input?: Record<string, unknown> | null;
    idempotencyKey?: string | null;
};

function cleanText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

async function findExistingRun(workflowId: string, idempotencyKey: string) {
    return prisma.automationRun.findFirst({
        where: { workflowId, idempotencyKey },
        select: {
            id: true,
            workflowId: true,
            workspaceId: true,
            customerId: true,
            status: true,
            idempotencyKey: true,
            currentNodeId: true,
            resumeAt: true,
            error: true,
            startedAt: true,
            completedAt: true,
            createdAt: true,
            updatedAt: true,
        },
    });
}

export async function createAutomationRun({
    workspaceId,
    workflowId,
    customerId,
    input = null,
    idempotencyKey = null,
}: StartAutomationRunInput) {
    const workflow = await prisma.automationWorkflow.findFirst({
        where: { id: workflowId, workspaceId },
        select: {
            id: true,
            status: true,
            definition: true,
            version: true,
        },
    });

    if (!workflow) {
        throw new Error("Automation workflow was not found in this workspace.");
    }

    if (workflow.status !== "active") {
        throw new Error("Automation must be published before it can run.");
    }

    const definition = asWorkflowDefinition(workflow.definition);
    const trigger = definition.nodes.find((node) => node.type === "trigger");

    if (!trigger) {
        throw new Error("Automation does not have a trigger.");
    }

    if (customerId) {
        const customer = await prisma.customer.findFirst({
            where: { id: customerId, workspaceId },
            select: { id: true },
        });

        if (!customer) {
            throw new Error("Customer was not found in this workspace.");
        }
    }

    const normalizedIdempotencyKey = cleanText(idempotencyKey) || null;

    if (normalizedIdempotencyKey) {
        const existing = await findExistingRun(workflowId, normalizedIdempotencyKey);
        if (existing) {
            return { run: existing, reused: true };
        }
    }

    try {
        const run = await prisma.automationRun.create({
            data: {
                workflowId,
                workspaceId,
                customerId,
                status: "queued",
                idempotencyKey: normalizedIdempotencyKey,
                triggerNodeId: trigger.id,
                currentNodeId: trigger.id,
                // Read together above and persist with the run, so later edits
                // cannot change the definition associated with this version.
                workflowDefinition: toJsonInput(definition),
                workflowVersion: workflow.version,
                input: input ? toJsonInput(input) : undefined,
            },
            select: {
                id: true,
                workflowId: true,
                workspaceId: true,
                customerId: true,
                status: true,
                idempotencyKey: true,
                currentNodeId: true,
                resumeAt: true,
                error: true,
                startedAt: true,
                completedAt: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return { run, reused: false };
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002" &&
            normalizedIdempotencyKey
        ) {
            const raced = await findExistingRun(workflowId, normalizedIdempotencyKey);
            if (raced) {
                return { run: raced, reused: true };
            }
        }
        throw error;
    }
}

export async function startAutomationRun(input: StartAutomationRunInput) {
    const created = await createAutomationRun(input);

    // Never restart a terminal run when the request's key is reused.
    if (
        created.reused &&
        (created.run.status === "completed" ||
            created.run.status === "failed" ||
            created.run.status === "cancelled")
    ) {
        return {
            ...created,
            execution: {
                status: created.run.status,
                completedAt: created.run.completedAt,
            },
        };
    }

    // Preserve waits: an early retry must not skip the resume timestamp.
    if (
        created.run.status === "waiting" &&
        created.run.resumeAt &&
        created.run.resumeAt.getTime() > Date.now()
    ) {
        return {
            ...created,
            execution: { status: "waiting" as const, resumeAt: created.run.resumeAt },
        };
    }

    const execution = await runAutomation(created.run.id);
    return { ...created, execution };
}
