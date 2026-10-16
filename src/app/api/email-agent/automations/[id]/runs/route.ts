import { NextResponse } from "next/server";

import { prisma } from "../../../../../../lib/prisma";
import { requireWorkspace } from "../../../../../../lib/auth/requireWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;

/**
 * Recent runs of one automation, newest first, with a count per status.
 * Step-by-step detail for a run comes from /api/email-agent/automation-runs/[runId].
 */
export async function GET(
    req: Request,
    context: { params: Promise<{ id: string }> },
) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    const workflowId = (await context.params).id?.trim();
    if (!workflowId) {
        return NextResponse.json({ error: "Missing automation id." }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const requestedLimit = Number(searchParams.get("limit") ?? 25);
    const limit = Number.isInteger(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT)
        : 25;

    const workflow = await prisma.automationWorkflow.findFirst({
        where: { id: workflowId, workspaceId: auth.workspaceId },
        select: { id: true },
    });

    if (!workflow) {
        return NextResponse.json({ error: "Automation not found." }, { status: 404 });
    }

    const [runs, counts] = await Promise.all([
        prisma.automationRun.findMany({
            where: { workflowId, workspaceId: auth.workspaceId },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: {
                id: true,
                status: true,
                currentNodeId: true,
                resumeAt: true,
                error: true,
                input: true,
                startedAt: true,
                completedAt: true,
                createdAt: true,
                customer: { select: { id: true, name: true, email: true, company: true } },
            },
        }),
        prisma.automationRun.groupBy({
            by: ["status"],
            where: { workflowId, workspaceId: auth.workspaceId },
            _count: { _all: true },
        }),
    ]);

    return NextResponse.json(
        {
            runs: runs.map((run) => {
                const input = run.input && typeof run.input === "object" && !Array.isArray(run.input)
                    ? run.input as Record<string, unknown>
                    : {};
                const trigger = input.trigger && typeof input.trigger === "object"
                    ? input.trigger as Record<string, unknown>
                    : null;

                return {
                    id: run.id,
                    status: run.status,
                    currentNodeId: run.currentNodeId,
                    resumeAt: run.resumeAt?.toISOString() ?? null,
                    error: run.error,
                    source: input.source === "manual_test" ? "test" : trigger ? "trigger" : "manual",
                    triggerType: typeof trigger?.type === "string" ? trigger.type : null,
                    startedAt: run.startedAt.toISOString(),
                    completedAt: run.completedAt?.toISOString() ?? null,
                    createdAt: run.createdAt.toISOString(),
                    customer: run.customer,
                };
            }),
            counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}
