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

function requestedWorkspaceId(req: Request) {
    const { searchParams } = new URL(req.url);
    return cleanText(searchParams.get("workspaceId"));
}

function bodyWorkspaceId(body: Record<string, unknown>) {
    return cleanText(body.workspaceId);
}

function assertWorkspaceMatch(
    requested: string,
    authorised: string,
) {
    if (requested && requested !== authorised) {
        throw new AuthError(
            "You do not have access to this workspace.",
            403,
        );
    }
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

        assertWorkspaceMatch(
            requestedWorkspaceId(req),
            workspaceId,
        );

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

        return NextResponse.json(
            {
                workflows: workflows.map(serializeWorkflow),
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

        assertWorkspaceMatch(
            bodyWorkspaceId(body),
            workspaceId,
        );

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
