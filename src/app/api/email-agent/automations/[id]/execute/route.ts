import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import {
    AuthError,
    getWorkspaceFromRequest,
} from "../../../../../../lib/auth/getWorkspaceFromRequest";
import { runAutomation } from "../../../../../../lib/automation/workflow-runner";
import { asWorkflowDefinition } from "../../../../../../lib/automation/serializer";
import { toJsonInput } from "../../../../../../lib/automation/json";
import { validateWorkflowDefinition } from "../../../../../../lib/automation/validation";
type RouteContext = {
    params: Promise<{
        id: string;
    }>;
};
function cleanText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
function cleanObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}
async function findExistingRun(
    workflowId: string,
    idempotencyKey: string,
) {
    return prisma.automationRun.findFirst({
        where: {
            workflowId,
            idempotencyKey,
        },
        include: {
            steps: {
                orderBy: [
                    { createdAt: "asc" },
                    { attempt: "asc" },
                ],
            },
        },
    });
}
export async function POST(
    req: Request,
    context: RouteContext,
) {
    try {
        const { id } = await context.params;
        const workflowId = cleanText(id);
        if (!workflowId) {
            return NextResponse.json(
                { error: "Missing workflow id." },
                { status: 400 },
            );
        }
        let body: Record<string, unknown>;
        try {
            const parsed = await req.json();
            body =
                parsed &&
                    typeof parsed === "object" &&
                    !Array.isArray(parsed)
                    ? (parsed as Record<string, unknown>)
                    : {};
        } catch {
            body = {};
        }
        const { workspaceId } =
            await getWorkspaceFromRequest(req);
        const requestedWorkspaceId =
            cleanText(body.workspaceId);
        if (
            requestedWorkspaceId &&
            requestedWorkspaceId !== workspaceId
        ) {
            throw new AuthError(
                "You do not have access to this workspace.",
                403,
            );
        }
        const customerId = cleanText(body.customerId) || null;
        // Prefer the standard request header used by the client. Keep body
        // support for backwards compatibility with older callers.
        const idempotencyKey =
            cleanText(req.headers.get("Idempotency-Key")) ||
            cleanText(body.idempotencyKey) ||
            null;
        // The current client sends `context`. Older callers may send `input`.
        // Both are treated as caller-provided execution input; the runner will
        // build and persist the canonical execution context.
        const input =
            cleanObject(body.context) ??
            cleanObject(body.input) ??
            {};
        const workflow = await prisma.automationWorkflow.findFirst({
            where: {
                id: workflowId,
                workspaceId,
            },
        });
        if (!workflow) {
            return NextResponse.json(
                { error: "Workflow not found." },
                { status: 404 },
            );
        }
        if (workflow.status !== "active") {
            return NextResponse.json(
                { error: "Only active workflows can be executed." },
                { status: 409 },
            );
        }
        const definition = asWorkflowDefinition(workflow.definition);
        const issues = validateWorkflowDefinition(definition);
        if (issues.length > 0) {
            return NextResponse.json(
                {
                    error:
                        "This active workflow is invalid and cannot be executed.",
                    issues,
                },
                { status: 422 },
            );
        }
        const trigger = definition.nodes.find(
            (node) => node.type === "trigger",
        );
        if (!trigger) {
            return NextResponse.json(
                { error: "Workflow does not contain a trigger." },
                { status: 422 },
            );
        }
        if (customerId) {
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
                return NextResponse.json(
                    { error: "Customer not found." },
                    { status: 404 },
                );
            }
        }
        if (idempotencyKey) {
            const existingRun = await findExistingRun(
                workflow.id,
                idempotencyKey,
            );
            if (existingRun) {
                return NextResponse.json(
                    {
                        run: existingRun,
                        reused: true,
                    },
                    { status: 200 },
                );
            }
        }
        let run;
        try {
            run = await prisma.automationRun.create({
                data: {
                    workflowId: workflow.id,
                    workspaceId,
                    customerId,
                    status: "queued",
                    idempotencyKey,
                    triggerNodeId: trigger.id,
                    currentNodeId: trigger.id,
                    workflowDefinition: toJsonInput(definition),
                    workflowVersion: workflow.version,
                    input: toJsonInput(input),
                },
            });
        } catch (error) {
            // The schema has @@unique([workflowId, idempotencyKey]).
            // If two identical requests race, return the winning run instead
            // of surfacing a database error.
            if (
                idempotencyKey &&
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002"
            ) {
                const existingRun = await findExistingRun(
                    workflow.id,
                    idempotencyKey,
                );
                if (existingRun) {
                    return NextResponse.json(
                        {
                            run: existingRun,
                            reused: true,
                        },
                        { status: 200 },
                    );
                }
            }
            throw error;
        }
        try {
            const result = await runAutomation(run.id);
            const completedRun = await prisma.automationRun.findUnique({
                where: {
                    id: run.id,
                },
                include: {
                    steps: {
                        orderBy: [
                            { createdAt: "asc" },
                            { attempt: "asc" },
                        ],
                    },
                },
            });
            return NextResponse.json(
                {
                    run: completedRun,
                    result,
                    reused: false,
                },
                { status: 201 },
            );
        } catch (executionError) {
            const failedRun = await prisma.automationRun.findUnique({
                where: {
                    id: run.id,
                },
                include: {
                    steps: {
                        orderBy: [
                            { createdAt: "asc" },
                            { attempt: "asc" },
                        ],
                    },
                },
            });
            const message =
                executionError instanceof Error
                    ? executionError.message
                    : "Workflow execution failed.";
            return NextResponse.json(
                {
                    error: message,
                    run: failedRun,
                },
                { status: 500 },
            );
        }
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { error: error.message },
                { status: error.status },
            );
        }
        console.error("Execute automation error:", error);
        return NextResponse.json(
            { error: "Failed to execute automation." },
            { status: 500 },
        );
    }
}
