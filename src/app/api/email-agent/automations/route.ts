import { NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";
import {
    AuthError,
    getWorkspaceFromRequest,
} from "../../../../lib/auth/getWorkspaceFromRequest";
import { serializeWorkflow } from "../../../../lib/automation/serializer";
import { toJsonInput } from "../../../../lib/automation/json";
import { validateWorkflowDefinition } from "../../../../lib/automation/validation";
import type {
    WorkflowDefinition,
    WorkflowStatus,
} from "../../../../lib/automation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function parseStatus(value: unknown): WorkflowStatus | null {
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

function jsonError(message: string, status: number) {
    return NextResponse.json(
        { error: message },
        { status },
    );
}

export async function GET(req: Request) {
    try {
        const { workspaceId } =
            await getWorkspaceFromRequest(req);


        const { searchParams } = new URL(req.url);
        const rawStatus = cleanText(searchParams.get("status"));

        if (
            rawStatus &&
            rawStatus !== "draft" &&
            rawStatus !== "active" &&
            rawStatus !== "paused"
        ) {
            return jsonError(
                "Invalid automation status filter.",
                400,
            );
        }

        const workflows =
            await prisma.automationWorkflow.findMany({
                where: {
                    workspaceId,
                    // Archived automations are hidden; they are kept only so
                    // their run history survives.
                    status: { not: "archived" },
                    ...(rawStatus
                        ? {
                            status:
                                rawStatus as WorkflowStatus,
                        }
                        : {}),
                },
                orderBy: {
                    updatedAt: "desc",
                },
                include: {
                    _count: {
                        select: {
                            runs: true,
                        },
                    },
                },
            });

        // Finished-run counts per workflow, so the list shows real
        // completion and success rates.
        const finished = await prisma.automationRun.groupBy({
            by: ["workflowId", "status"],
            where: {
                workspaceId,
                status: { in: ["completed", "failed"] },
            },
            _count: { _all: true },
        });

        const outcome = new Map<string, { completed: number; failed: number }>();
        for (const row of finished) {
            const entry = outcome.get(row.workflowId) ?? { completed: 0, failed: 0 };
            if (row.status === "completed") entry.completed += row._count._all;
            else entry.failed += row._count._all;
            outcome.set(row.workflowId, entry);
        }

        return NextResponse.json(
            {
                workflows: workflows.map((workflow) => {
                    const counts = outcome.get(workflow.id) ?? { completed: 0, failed: 0 };
                    return serializeWorkflow({
                        ...workflow,
                        completedRuns: counts.completed + counts.failed,
                        successfulRuns: counts.completed,
                    });
                }),
                source: "live",
            },
            {
                headers: {
                    "Cache-Control": "no-store",
                },
            },
        );
    } catch (error) {
        if (error instanceof AuthError) {
            return jsonError(error.message, error.status);
        }

        console.error("Automations GET error:", error);

        return jsonError(
            "Failed to load automations.",
            500,
        );
    }
}

export async function POST(req: Request) {
    try {
        const { workspaceId } =
            await getWorkspaceFromRequest(req);

        const parsed: unknown = await req.json().catch(() => ({}));
        const body =
            parsed &&
                typeof parsed === "object" &&
                !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)
                : {};


        const name = cleanText(body.name);
        const description = cleanText(body.description);
        const explicitStatus =
            body.status === undefined
                ? "draft"
                : parseStatus(body.status);

        if (!name) {
            return jsonError(
                "Automation name is required.",
                400,
            );
        }

        if (!explicitStatus) {
            return jsonError(
                "Invalid automation status.",
                400,
            );
        }

        const definition = definitionFromBody(body);
        const issues =
            validateWorkflowDefinition(definition);

        if (
            explicitStatus === "active" &&
            issues.length > 0
        ) {
            return NextResponse.json(
                {
                    error: issues[0],
                    issues,
                },
                { status: 400 },
            );
        }

        const workflow =
            await prisma.automationWorkflow.create({
                data: {
                    workspaceId,
                    name,
                    description: description || null,
                    status: explicitStatus,
                    definition: toJsonInput(definition),
                },
                include: {
                    _count: {
                        select: {
                            runs: true,
                        },
                    },
                },
            });

        return NextResponse.json(
            {
                workflow: serializeWorkflow(workflow),
            },
            {
                status: 201,
            },
        );
    } catch (error) {
        if (error instanceof AuthError) {
            return jsonError(error.message, error.status);
        }

        console.error("Automations POST error:", error);

        return jsonError(
            "Failed to create automation.",
            500,
        );
    }
}
