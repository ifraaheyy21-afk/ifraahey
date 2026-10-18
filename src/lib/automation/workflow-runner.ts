import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { automationConfig } from "./config";
import { buildExecutionContext, refreshExecutionContext } from "./context";
import { executeWorkflowNode } from "./node-executor";
import { toJsonInput } from "./json";
import { asWorkflowDefinition } from "./serializer";
import { validateWorkflowDefinition } from "./validation";
import type { ExecutionContext, WorkflowConnection, WorkflowNode } from "./types";
import { connectionBranch } from "./branches";

export type RunAutomationResult =
    | { status: "waiting"; resumeAt: Date }
    | { status: "completed"; completedAt: Date }
    | { status: "failed"; completedAt: Date | null }
    | { status: "cancelled"; completedAt: Date | null }
    | { status: "queued" | "running" };

type WorkerRunResult = {
    runId: string;
    source: "due" | "stale" | "queued";
    result?: RunAutomationResult;
    error?: string;
};

// Internal state, always overwritten by the runner rather than accepted from input.
const OWNER_KEY = "__automationWorkerToken";
class OwnershipLostError extends Error {
    constructor() { super("Automation execution ownership was lost or the run was cancelled."); }
}
function ownerWhere(runId: string, token: string): Prisma.AutomationRunWhereInput {
    return {
        id: runId,
        status: "running",
        context: { path: [OWNER_KEY], equals: token },
    };
}
function asContext(value: unknown): ExecutionContext | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as ExecutionContext : null;
}
function chooseNextNodeId(node: WorkflowNode, connections: WorkflowConnection[], branch?: boolean) {
    const outgoing = connections.filter((connection) => connection.from === node.id);
    if (!outgoing.length) return null;
    if (node.type !== "condition") {
        if (outgoing.length > 1) throw new Error(`${node.title} has multiple outgoing connections but is not a condition.`);
        return outgoing[0].to;
    }
    if (typeof branch !== "boolean") throw new Error(`${node.title} did not return a Yes/No branch result.`);
    const wanted = branch ? "YES" : "NO";
    const matches = outgoing.filter((connection) => connectionBranch(connection) === wanted);
    if (matches.length !== 1) throw new Error(`${node.title} must have exactly one ${branch ? "Yes" : "No"} branch.`);
    return matches[0].to;
}
async function currentResult(runId: string): Promise<RunAutomationResult> {
    const run = await prisma.automationRun.findUnique({ where: { id: runId } });
    if (!run) throw new Error("Automation run not found.");
    if (run.status === "completed") return { status: "completed", completedAt: run.completedAt ?? run.updatedAt };
    if (run.status === "failed" || run.status === "cancelled") return { status: run.status, completedAt: run.completedAt };
    if (run.status === "waiting") {
        if (!run.resumeAt) throw new Error("Waiting automation has no resume time.");
        return { status: "waiting", resumeAt: run.resumeAt };
    }
    return { status: run.status };
}
async function currentWorkflowStatus(workflowId: string) {
    const workflow = await prisma.automationWorkflow.findUnique({
        where: { id: workflowId }, select: { status: true },
    });
    return workflow?.status ?? null;
}
async function touchRun(runId: string, token: string) {
    const changed = await prisma.automationRun.updateMany({
        where: ownerWhere(runId, token), data: { updatedAt: new Date() },
    });
    if (changed.count !== 1) throw new OwnershipLostError();
}

// Guard first inside the transaction: step writes roll back if this worker no
// longer owns the run. Holding the run row also serializes cancellation/recovery.
async function commitRun(
    runId: string,
    token: string,
    data: Prisma.AutomationRunUpdateManyMutationInput,
    writeSteps?: (tx: Prisma.TransactionClient) => Promise<void>,
) {
    await prisma.$transaction(async (tx) => {
        const changed = await tx.automationRun.updateMany({
            where: ownerWhere(runId, token), data: { ...data, updatedAt: new Date() },
        });
        if (changed.count !== 1) throw new OwnershipLostError();
        if (writeSteps) await writeSteps(tx);
    });
}

export async function runAutomation(runId: string): Promise<RunAutomationResult> {
    const run = await prisma.automationRun.findUnique({ where: { id: runId }, include: { workflow: true } });
    if (!run) throw new Error("Automation run not found.");
    // A running run is owned, even if a caller knows its latest timestamp.
    if (run.status !== "queued" && run.status !== "waiting") return currentResult(runId);
    // Paused (or archived) workflows hold their runs where they are; they
    // continue from the same step when the workflow is resumed.
    if (run.workflow.status !== "active") return currentResult(runId);
    if (run.status === "waiting" && (!run.resumeAt || run.resumeAt.getTime() > Date.now())) return currentResult(runId);

    const storedContext = asContext(run.context);
    const token = randomUUID();
    const claimed = await prisma.automationRun.updateMany({
        where: {
            id: runId, status: run.status, updatedAt: run.updatedAt,
            ...(run.status === "waiting" ? { resumeAt: { lte: new Date() } } : {}),
        },
        data: {
            status: "running", error: null,
            context: toJsonInput({ ...(storedContext ?? {}), [OWNER_KEY]: token }),
            updatedAt: new Date(),
        },
    });
    if (claimed.count !== 1) return currentResult(runId);

    let heartbeatError: unknown;
    let heartbeatPending: Promise<void> = Promise.resolve();
    let heartbeatBusy = false;
    const heartbeat = setInterval(() => {
        if (heartbeatBusy || heartbeatError) return;
        heartbeatBusy = true;
        heartbeatPending = touchRun(runId, token)
            .catch((error: unknown) => { heartbeatError = error; })
            .finally(() => { heartbeatBusy = false; });
    }, automationConfig.runHeartbeatMs);
    heartbeat.unref?.();
    const assertOwned = async () => {
        if (heartbeatError) throw heartbeatError;
        await touchRun(runId, token);
    };

    let stepRunId: string | null = null;
    try {
        // Never substitute today's editable workflow for a run's original graph.
        // Legacy runs have no reliable snapshot and must be reviewed, not replayed.
        if (
            run.workflowDefinition === null || run.workflowDefinition === undefined ||
            !Number.isInteger(run.workflowVersion) || (run.workflowVersion ?? 0) < 1
        ) {
            throw new Error(
                "This run has no saved workflow definition/version. It cannot safely resume. Review its completed actions before starting a new run.",
            );
        }
        const snapshot = run.workflowDefinition;
        if (typeof snapshot !== "object" || Array.isArray(snapshot)) {
            throw new Error("This run's saved workflow definition is invalid.");
        }
        const definition = asWorkflowDefinition(snapshot);
        const snapshotIssues = validateWorkflowDefinition(definition);
        if (snapshotIssues.length > 0) {
            throw new Error(`This run's saved workflow definition is invalid: ${snapshotIssues[0]}`);
        }
        let executionContext: ExecutionContext = storedContext ?? await buildExecutionContext({
            workspaceId: run.workspaceId, customerId: run.customerId,
            workflowId: run.workflowId, automationRunId: run.id, input: asContext(run.input),
        });
        executionContext = { ...executionContext, automationRunId: run.id, [OWNER_KEY]: token };
        await commitRun(runId, token, { context: toJsonInput(executionContext) }, async (tx) => {
            await tx.automationStepRun.updateMany({
                where: { runId, status: "waiting" },
                data: { status: "completed", completedAt: new Date() },
            });
        });

        const nodesById = new Map(definition.nodes.map((node) => [node.id, node]));
        const trigger = definition.nodes.find((node) => node.type === "trigger");
        if (!trigger) throw new Error("Workflow trigger not found.");
        // Null after a persisted step means the graph ended, including a final
        // delay. It must not fall back to the trigger on resume or recovery.
        let currentNodeId = run.currentNodeId ?? ((storedContext || run.status === "waiting") ? null : trigger.id);
        let processed = 0;
        while (currentNodeId) {
            await assertOwned();
            const workflowStatus = await currentWorkflowStatus(run.workflowId);
            if (workflowStatus !== "active") {
                const cancelled = workflowStatus === "archived" || workflowStatus === null;
                await commitRun(runId, token, cancelled
                    ? { status: "cancelled", completedAt: new Date(), resumeAt: null, error: "The automation was archived." }
                    : { status: "queued", currentNodeId, context: toJsonInput(executionContext), resumeAt: null });
                return cancelled
                    ? { status: "cancelled", completedAt: new Date() }
                    : { status: "queued" };
            }
            if (++processed > automationConfig.maxStepsPerRun) throw new Error("Automation stopped because it exceeded the configured step limit.");
            const node = nodesById.get(currentNodeId);
            if (!node) throw new Error(`Workflow step ${currentNodeId} was not found.`);
            if (node.type === "condition") {
                executionContext = await refreshExecutionContext({
                    workspaceId: run.workspaceId, customerId: run.customerId,
                    workflowId: run.workflowId, automationRunId: run.id, currentContext: executionContext,
                });
                executionContext = { ...executionContext, automationRunId: run.id, [OWNER_KEY]: token };
            }
            await commitRun(runId, token, { context: toJsonInput(executionContext), resumeAt: null }, async (tx) => {
                const latest = await tx.automationStepRun.findFirst({
                    where: { runId, nodeId: node.id }, orderBy: { attempt: "desc" }, select: { attempt: true },
                });
                const step = await tx.automationStepRun.create({
                    data: {
                        runId, nodeId: node.id, nodeType: node.type, title: node.title,
                        attempt: (latest?.attempt ?? 0) + 1, status: "running",
                        input: toJsonInput({ context: executionContext }),
                    },
                });
                stepRunId = step.id;
            });
            await assertOwned();
            const result = await executeWorkflowNode({
                workspaceId: run.workspaceId, customerId: run.customerId,
                workflowId: run.workflowId, node, context: executionContext,
            });
            await assertOwned();
            if (result.output) {
                executionContext = { ...executionContext, steps: { ...(asContext(executionContext.steps) ?? {}), [node.id]: result.output } };
            }
            const nextNodeId = result.kind === "complete" ? null : chooseNextNodeId(
                node, definition.connections, result.kind === "branch" ? result.branch : undefined,
            );
            await commitRun(runId, token, {
                currentNodeId: nextNodeId, context: toJsonInput(executionContext),
                ...(result.kind === "wait" ? { status: "waiting", resumeAt: result.resumeAt } : { resumeAt: null }),
            }, async (tx) => {
                await tx.automationStepRun.update({
                    where: { id: stepRunId! },
                    data: {
                        status: result.kind === "wait" ? "waiting" : "completed",
                        output: toJsonInput(result.output ?? {}),
                        completedAt: result.kind === "wait" ? null : new Date(),
                    },
                });
            });
            stepRunId = null;
            if (result.kind === "wait") return { status: "waiting", resumeAt: result.resumeAt };
            currentNodeId = nextNodeId;
        }
        const completedAt = new Date();
        await commitRun(runId, token, {
            status: "completed", currentNodeId: null, resumeAt: null,
            completedAt, error: null, context: toJsonInput(executionContext),
        }, async (tx) => {
            await tx.automationWorkflow.update({ where: { id: run.workflowId }, data: { lastRunAt: completedAt } });
        });
        return { status: "completed", completedAt };
    } catch (error) {
        if (error instanceof OwnershipLostError) return currentResult(runId);
        const message = error instanceof Error ? error.message : "Automation execution failed.";
        try {
            await commitRun(runId, token, {
                status: "failed", error: message, completedAt: new Date(), resumeAt: null,
            }, async (tx) => {
                if (stepRunId) await tx.automationStepRun.updateMany({
                    where: { id: stepRunId, status: "running" },
                    data: { status: "failed", error: message, completedAt: new Date() },
                });
            });
        } catch (commitError) {
            if (commitError instanceof OwnershipLostError) return currentResult(runId);
            throw commitError;
        }
        throw error;
    } finally {
        clearInterval(heartbeat);
        await heartbeatPending;
    }
}

function batchLimit(limit: number) {
    return Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), automationConfig.workerBatchSize)) : automationConfig.workerBatchSize;
}
async function executeClaimedRun(runId: string, source: WorkerRunResult["source"]): Promise<WorkerRunResult> {
    try { return { runId, source, result: await runAutomation(runId) }; }
    catch (error) { return { runId, source, error: error instanceof Error ? error.message : "Automation worker execution failed." }; }
}
export async function resumeDueAutomationRuns(limit = automationConfig.workerBatchSize) {
    const runs = await prisma.automationRun.findMany({
        where: { status: "waiting", resumeAt: { lte: new Date() }, workflow: { status: "active" } },
        orderBy: { resumeAt: "asc" }, take: batchLimit(limit), select: { id: true },
    });
    const results: WorkerRunResult[] = [];
    // Claim directly in runAutomation; preserve the wait checkpoint until then.
    for (const run of runs) results.push(await executeClaimedRun(run.id, "due"));
    return results;
}
export async function processQueuedAutomationRuns(limit = automationConfig.workerBatchSize) {
    const runs = await prisma.automationRun.findMany({
        where: { status: "queued", workflow: { status: "active" } }, orderBy: { createdAt: "asc" },
        take: batchLimit(limit), select: { id: true },
    });
    const results: WorkerRunResult[] = [];
    for (const run of runs) results.push(await executeClaimedRun(run.id, "queued"));
    return results;
}
export async function recoverStaleAutomationRuns(limit = automationConfig.workerBatchSize) {
    const staleBefore = new Date(Date.now() - automationConfig.staleRunAfterMs);
    const runs = await prisma.automationRun.findMany({
        where: { status: "running", updatedAt: { lte: staleBefore } },
        orderBy: { updatedAt: "asc" }, take: batchLimit(limit), select: { id: true, updatedAt: true },
    });
    const results: WorkerRunResult[] = [];
    for (const run of runs) {
        const recovered = await prisma.$transaction(async (tx) => {
            const changed = await tx.automationRun.updateMany({
                where: { id: run.id, status: "running", updatedAt: run.updatedAt },
                data: { status: "queued", error: null, updatedAt: new Date() },
            });
            if (changed.count !== 1) return false;
            await tx.automationStepRun.updateMany({
                where: { runId: run.id, status: "running" },
                data: { status: "failed", error: "Execution was interrupted; retrying the checkpoint.", completedAt: new Date() },
            });
            return true;
        });
        if (recovered) results.push(await executeClaimedRun(run.id, "stale"));
    }
    return results;
}
export async function processAutomationWorker() {
    const staleResults = await recoverStaleAutomationRuns();
    const dueResults = await resumeDueAutomationRuns();
    const queuedResults = await processQueuedAutomationRuns();
    return [...staleResults, ...dueResults, ...queuedResults];
}

