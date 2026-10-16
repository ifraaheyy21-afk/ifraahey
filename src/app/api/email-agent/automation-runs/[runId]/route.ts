import { NextResponse } from "next/server";

import {
    AuthError,
    getWorkspaceFromRequest,
} from "../../../../../lib/auth/getWorkspaceFromRequest";

import { prisma } from "../../../../../lib/prisma";

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

export async function GET(
    req: Request,
    context: {
        params:
        Promise<{
            runId: string;
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
            runId:
            rawRunId,
        } =
            await context.params;

        const runId =
            cleanText(
                rawRunId,
            );

        if (!runId) {
            return json(
                {
                    error:
                        "Run id is required.",
                },
                400,
            );
        }

        const run =
            await prisma.automationRun.findFirst({
                where: {
                    id:
                        runId,

                    workspaceId,
                },

                include: {
                    workflow: {
                        select: {
                            id:
                                true,

                            name:
                                true,

                            status:
                                true,

                            version:
                                true,
                        },
                    },

                    customer: {
                        select: {
                            id:
                                true,

                            name:
                                true,

                            email:
                                true,
                        },
                    },

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
                        "Automation run not found.",
                },
                404,
            );
        }

        return json({
            run: {
                id:
                    run.id,

                status:
                    run.status,

                workflow:
                    run.workflow,

                customer:
                    run.customer,

                triggerNodeId:
                    run.triggerNodeId,

                currentNodeId:
                    run.currentNodeId,

                idempotencyKey:
                    run.idempotencyKey,

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

                createdAt:
                    run.createdAt.toISOString(),

                updatedAt:
                    run.updatedAt.toISOString(),

                context:
                    run.context,

                output:
                    run.output,

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

                            input:
                                step.input,

                            output:
                                step.output,

                            error:
                                step.error,

                            startedAt:
                                step.startedAt.toISOString(),

                            completedAt:
                                step.completedAt
                                    ?.toISOString() ??
                                null,

                            createdAt:
                                step.createdAt.toISOString(),
                        }),
                    ),
            },
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
            "Automation run lookup failed:",
            error,
        );

        return json(
            {
                error:
                    "Unable to load the automation run.",
            },
            500,
        );
    }
}