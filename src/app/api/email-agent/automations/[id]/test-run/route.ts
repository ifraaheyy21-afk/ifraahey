import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
    AuthError,
    getWorkspaceFromRequest,
} from "../../../../../../lib/auth/getWorkspaceFromRequest";

import { prisma } from "../../../../../../lib/prisma";

import { startAutomationRun } from "../../../../../../lib/automation/run-service";

export const runtime =
    "nodejs";

export const dynamic =
    "force-dynamic";

function json(
    body: Record<
        string,
        unknown
    >,
    status = 200,
) {
    return NextResponse.json(
        body,
        {
            status,

            headers: {
                "Cache-Control":
                    "no-store",
            },
        },
    );
}

function cleanText(
    value: unknown,
) {
    return typeof value ===
        "string"
        ? value.trim()
        : "";
}

export async function POST(
    req: Request,
    context: {
        params:
        Promise<{
            id: string;
        }>;
    },
) {
    try {
        const {
            workspaceId,
        } =
            await getWorkspaceFromRequest(
                req,
            );

        const {
            id,
        } =
            await context.params;

        const workflowId =
            cleanText(id);

        if (!workflowId) {
            return json(
                {
                    error:
                        "Automation id is required.",
                },
                400,
            );
        }

        let body:
            | Record<
                string,
                unknown
            >
            | null =
            null;

        try {
            const candidate =
                await req.json();

            if (
                candidate &&
                typeof candidate ===
                "object" &&
                !Array.isArray(
                    candidate,
                )
            ) {
                body =
                    candidate as Record<
                        string,
                        unknown
                    >;
            }
        } catch {
            body = null;
        }

        const customerId =
            cleanText(
                body?.customerId,
            );

        if (!customerId) {
            return json(
                {
                    error:
                        "Choose a customer before testing this automation.",
                },
                400,
            );
        }

        const workflow =
            await prisma.automationWorkflow.findFirst({
                where: {
                    id:
                        workflowId,

                    workspaceId,
                },

                select: {
                    id: true,
                    status:
                        true,
                },
            });

        if (!workflow) {
            return json(
                {
                    error:
                        "Automation not found.",
                },
                404,
            );
        }

        if (
            workflow.status !==
            "active"
        ) {
            return json(
                {
                    error:
                        "Publish the automation before running a real test.",
                },
                409,
            );
        }

        const customer =
            await prisma.customer.findFirst({
                where: {
                    id:
                        customerId,

                    workspaceId,
                },

                select: {
                    id: true,
                    name:
                        true,
                    email:
                        true,
                },
            });

        if (!customer) {
            return json(
                {
                    error:
                        "Customer not found.",
                },
                404,
            );
        }

        const requestId =
            randomUUID();

        const started =
            await startAutomationRun({
                workspaceId,

                workflowId,

                customerId:
                    customer.id,

                idempotencyKey:
                    `manual-test:${requestId}`,

                input: {
                    source:
                        "manual_test",

                    requestId,
                },
            });

        const run =
            await prisma.automationRun.findFirst({
                where: {
                    id:
                        started.run.id,

                    workspaceId,
                },

                include: {
                    steps: {
                        orderBy: [
                            {
                                createdAt:
                                    "asc",
                            },
                            {
                                attempt:
                                    "asc",
                            },
                        ],
                    },
                },
            });

        if (!run) {
            return json(
                {
                    error:
                        "Automation run could not be read after execution.",
                },
                500,
            );
        }

        return json({
            ok: true,

            run: {
                id:
                    run.id,

                status:
                    run.status,

                workflowId:
                    run.workflowId,

                customerId:
                    run.customerId,

                currentNodeId:
                    run.currentNodeId,

                resumeAt:
                    run.resumeAt
                        ?.toISOString() ??
                    null,

                error:
                    run.error,

                startedAt:
                    run.startedAt.toISOString(),

                completedAt:
                    run.completedAt
                        ?.toISOString() ??
                    null,

                steps:
                    run.steps.map(
                        (step) => ({
                            id:
                                step.id,

                            nodeId:
                                step.nodeId,

                            nodeType:
                                step.nodeType,

                            title:
                                step.title,

                            status:
                                step.status,

                            attempt:
                                step.attempt,

                            error:
                                step.error,

                            startedAt:
                                step.startedAt.toISOString(),

                            completedAt:
                                step.completedAt
                                    ?.toISOString() ??
                                null,

                            output:
                                step.output,
                        }),
                    ),
            },

            execution:
                started.execution,
        });
    } catch (error) {
        if (
            error instanceof
            AuthError
        ) {
            return json(
                {
                    error:
                        error.message,

                    code:
                        error.code,
                },

                error.status,
            );
        }

        console.error(
            "Automation test run failed:",
            error,
        );

        return json(
            {
                error:
                    error instanceof
                        Error
                        ? error.message
                        : "Automation test could not run.",
            },
            500,
        );
    }
}