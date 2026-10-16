import { NextResponse } from "next/server";

import { prisma } from "../../../../../../lib/prisma";

type RouteContext = {
    params: Promise<{
        runId: string;
    }>;
};

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
    context: RouteContext,
) {
    try {
        const {
            runId: rawRunId,
        } = await context.params;

        const runId =
            cleanText(
                rawRunId,
            );

        const {
            searchParams,
        } = new URL(
            req.url,
        );

        const workspaceId =
            cleanText(
                searchParams.get(
                    "workspaceId",
                ),
            );

        if (!runId) {
            return NextResponse.json(
                {
                    error:
                        "Missing run id.",
                },
                {
                    status: 400,
                },
            );
        }

        if (!workspaceId) {
            return NextResponse.json(
                {
                    error:
                        "Missing workspaceId.",
                },
                {
                    status: 400,
                },
            );
        }

        if (
            workspaceId ===
            "demo-workspace"
        ) {
            return NextResponse.json(
                {
                    error:
                        "Demo workflow runs are not stored in the production database.",
                },
                {
                    status: 400,
                },
            );
        }

        const run =
            await prisma.automationRun.findFirst({
                where: {
                    id: runId,
                    workspaceId,
                },

                include: {
                    workflow: {
                        select: {
                            id: true,
                            name: true,
                            status: true,
                            version: true,
                        },
                    },

                    customer: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            company: true,
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
            return NextResponse.json(
                {
                    error:
                        "Automation run not found.",
                },
                {
                    status: 404,
                },
            );
        }

        return NextResponse.json({
            run,
        });
    } catch (error) {
        console.error(
            "Get automation run error:",
            error,
        );

        return NextResponse.json(
            {
                error:
                    "Failed to load automation run.",
            },
            {
                status: 500,
            },
        );
    }
}