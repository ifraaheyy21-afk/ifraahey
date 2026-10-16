import { NextResponse } from "next/server";

import { prisma } from "../../../../../lib/prisma";

import {
    AuthError,
    getWorkspaceFromRequest,
} from "../../../../../lib/auth/getWorkspaceFromRequest";

import { serializeWorkflow } from "../../../../../lib/automation/serializer";

import { toJsonInput } from "../../../../../lib/automation/json";

import { validateWorkflowDefinition } from "../../../../../lib/automation/validation";

import type {
    WorkflowDefinition,
    WorkflowStatus,
} from "../../../../../lib/automation/types";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

function cleanText(value: unknown) {
    return typeof value === "string"
        ? value.trim()
        : "";
}

function parseStatus(
    value: unknown,
): WorkflowStatus | null {
    if (
        value === "draft" ||
        value === "active" ||
        value === "paused"
    ) {
        return value;
    }

    return null;
}

function definitionFromBody(
    body: Record<string, unknown>,
): WorkflowDefinition {
    return {
        nodes: Array.isArray(body.nodes)
            ? (body.nodes as WorkflowDefinition["nodes"])
            : [],

        connections: Array.isArray(body.connections)
            ? (body.connections as WorkflowDefinition["connections"])
            : [],
    };
}

function jsonError(
    message: string,
    status: number,
    code?: string,
) {
    return NextResponse.json(
        {
            error: message,
            ...(code ? { code } : {}),
        },
        {
            status,
        },
    );
}

function getErrorCode(
    error: unknown,
) {
    if (
        error &&
        typeof error === "object" &&
        "code" in error
    ) {
        const code =
            (error as {
                code?: unknown;
            }).code;

        if (
            typeof code === "string" &&
            code.trim()
        ) {
            return code.trim();
        }
    }

    return "";
}

export async function GET(
    req: Request,
    context: {
        params: Promise<{
            id: string;
        }>;
    },
) {
    try {
        const {
            id,
        } = await context.params;

        const workflowId =
            cleanText(id);

        if (!workflowId) {
            return jsonError(
                "Missing automation id.",
                400,
            );
        }

        const {
            workspaceId,
        } =
            await getWorkspaceFromRequest(
                req,
            );

        const workflow =
            await prisma.automationWorkflow.findFirst({
                where: {
                    id:
                        workflowId,

                    workspaceId,
                    status: { not: "archived" },
                },

                include: {
                    _count: {
                        select: {
                            runs:
                                true,
                        },
                    },
                },
            });

        if (!workflow) {
            return jsonError(
                "Automation not found.",
                404,
            );
        }

        return NextResponse.json(
            {
                workflow:
                    serializeWorkflow(
                        workflow,
                    ),
            },
            {
                headers: {
                    "Cache-Control":
                        "no-store",
                },
            },
        );
    } catch (error) {
        if (
            error instanceof
            AuthError
        ) {
            return jsonError(
                error.message,
                error.status,
            );
        }

        console.error(
            "Automation GET error:",
            error,
        );

        return jsonError(
            "Failed to load automation.",
            500,
        );
    }
}

export async function PUT(
    req: Request,
    context: {
        params: Promise<{
            id: string;
        }>;
    },
) {
    try {
        const {
            id,
        } = await context.params;

        const workflowId =
            cleanText(id);

        if (!workflowId) {
            return jsonError(
                "Missing automation id.",
                400,
            );
        }

        const {
            workspaceId,
        } =
            await getWorkspaceFromRequest(
                req,
            );

        const parsed:
            unknown =
            await req
                .json()
                .catch(
                    () => ({}),
                );

        const body =
            parsed &&
                typeof parsed ===
                "object" &&
                !Array.isArray(
                    parsed,
                )
                ? (
                    parsed as Record<
                        string,
                        unknown
                    >
                )
                : {};


        const name =
            cleanText(
                body.name,
            );

        const description =
            cleanText(
                body.description,
            );

        const status =
            parseStatus(
                body.status,
            );

        const definition =
            definitionFromBody(
                body,
            );

        if (!name) {
            return jsonError(
                "Automation name is required.",
                400,
            );
        }

        if (!status) {
            return jsonError(
                "Invalid automation status.",
                400,
            );
        }

        const issues =
            validateWorkflowDefinition(
                definition,
            );

        if (
            status === "active" &&
            issues.length > 0
        ) {
            return NextResponse.json(
                {
                    error:
                        issues[0],

                    issues,
                },
                {
                    status:
                        400,
                },
            );
        }

        let existing =
            await prisma.automationWorkflow.findFirst({
                where: {
                    id:
                        workflowId,

                    workspaceId,
                },

                select: {
                    id:
                        true,

                    version:
                        true,

                    status:
                        true,
                },
            });

        if (existing?.status === "archived") {
            return jsonError(
                "This automation was archived and can no longer be edited.",
                410,
                "ARCHIVED",
            );
        }

        if (!existing) {
            try {
                const created =
                    await prisma.automationWorkflow.create({
                        data: {
                            id:
                                workflowId,

                            workspaceId,

                            name,

                            description:
                                description ||
                                null,

                            status,

                            definition:
                                toJsonInput(
                                    definition,
                                ),
                        },

                        include: {
                            _count: {
                                select: {
                                    runs:
                                        true,
                                },
                            },
                        },
                    });

                return NextResponse.json(
                    {
                        workflow:
                            serializeWorkflow(
                                created,
                            ),
                    },
                    {
                        status:
                            201,
                    },
                );
            } catch (error) {
                if (
                    getErrorCode(
                        error,
                    ) !== "P2002"
                ) {
                    throw error;
                }

                /*
                 * Another autosave may have created the
                 * workflow after our initial lookup but
                 * before this CREATE completed.
                 *
                 * Re-read it and continue through the
                 * normal version/update path.
                 */
                existing =
                    await prisma.automationWorkflow.findFirst({
                        where: {
                            id:
                                workflowId,

                            workspaceId,
                        },

                        select: {
                            id:
                                true,

                            version:
                                true,

                            status:
                                true,
                        },
                    });

                if (!existing) {
                    return jsonError(
                        "An automation with this id already exists.",
                        409,
                        "AUTOMATION_ID_CONFLICT",
                    );
                }
            }
        }

        const requestedVersion =
            typeof body.version ===
                "number" &&
                Number.isInteger(
                    body.version,
                )
                ? body.version
                : null;

        if (
            requestedVersion !==
            null &&
            requestedVersion !==
            existing.version
        ) {
            return jsonError(
                "This automation was updated elsewhere. Reload before saving again.",
                409,
                "VERSION_CONFLICT",
            );
        }

        const updateResult =
            await prisma.automationWorkflow.updateMany({
                where: {
                    id:
                        workflowId,

                    workspaceId,

                    status: { not: "archived" },

                    ...(requestedVersion !==
                        null
                        ? {
                            version:
                                requestedVersion,
                        }
                        : {}),
                },

                data: {
                    name,

                    description:
                        description ||
                        null,

                    status,

                    definition:
                        toJsonInput(
                            definition,
                        ),

                    version: {
                        increment:
                            1,
                    },
                },
            });

        if (
            updateResult.count ===
            0
        ) {
            const stillExists =
                await prisma.automationWorkflow.findFirst({
                    where: {
                        id:
                            workflowId,

                        workspaceId,
                    },

                    select: {
                        id:
                            true,
                    },
                });

            if (!stillExists) {
                return jsonError(
                    "Automation not found.",
                    404,
                );
            }

            return jsonError(
                "This automation was updated elsewhere. Reload before saving again.",
                409,
                "VERSION_CONFLICT",
            );
        }

        const updated =
            await prisma.automationWorkflow.findFirst({
                where: {
                    id:
                        workflowId,

                    workspaceId,
                },

                include: {
                    _count: {
                        select: {
                            runs:
                                true,
                        },
                    },
                },
            });

        if (!updated) {
            return jsonError(
                "Automation not found.",
                404,
            );
        }

        return NextResponse.json({
            workflow:
                serializeWorkflow(
                    updated,
                ),
        });
    } catch (error) {
        if (
            error instanceof
            AuthError
        ) {
            return jsonError(
                error.message,
                error.status,
            );
        }

        console.error(
            "Automation PUT error:",
            error,
        );

        return jsonError(
            "Failed to save automation.",
            500,
        );
    }
}

/**
 * Archive an automation. It disappears from the list, stops enrolling, and
 * its unfinished runs are cancelled. Run history is kept.
 */
export async function DELETE(
    req: Request,
    context: {
        params: Promise<{
            id: string;
        }>;
    },
) {
    try {
        const { workspaceId } =
            await getWorkspaceFromRequest(req);

        const workflowId =
            cleanText((await context.params).id);

        if (!workflowId) {
            return jsonError("Missing automation id.", 400);
        }

        const result = await prisma.$transaction(async (tx) => {
            const archived = await tx.automationWorkflow.updateMany({
                where: {
                    id: workflowId,
                    workspaceId,
                    status: { not: "archived" },
                },
                data: {
                    status: "archived",
                    version: { increment: 1 },
                },
            });

            if (archived.count === 0) return null;

            // Running runs stop at their next step (the runner checks the
            // workflow status); queued and waiting ones are cancelled here.
            const cancelled = await tx.automationRun.updateMany({
                where: {
                    workflowId,
                    workspaceId,
                    status: { in: ["queued", "waiting"] },
                },
                data: {
                    status: "cancelled",
                    completedAt: new Date(),
                    resumeAt: null,
                    error: "The automation was archived.",
                },
            });

            return { cancelledRuns: cancelled.count };
        });

        if (!result) {
            return jsonError("Automation not found.", 404);
        }

        return NextResponse.json({
            archived: true,
            cancelledRuns: result.cancelledRuns,
        });
    } catch (error) {
        if (error instanceof AuthError) {
            return jsonError(error.message, error.status, error.code);
        }

        console.error("Automation archive failed:", error);

        return jsonError("Unable to archive automation.", 500);
    }
}
