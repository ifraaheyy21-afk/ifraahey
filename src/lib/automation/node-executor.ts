import { executeActionNode } from "./action-executor";
import { evaluateCondition } from "./condition-evaluator";
import { executeEmailNode } from "./email-executor";

import type {
    DelayUnit,
    ExecutionContext,
    NodeExecutionResult,
    WorkflowNode,
} from "./types";

const VALID_DELAY_UNITS = new Set<DelayUnit>([
    "minutes",
    "hours",
    "days",
]);

function delayToMilliseconds(
    value: number,
    unit: DelayUnit,
) {
    const minute = 60_000;

    if (unit === "minutes") {
        return value * minute;
    }

    if (unit === "hours") {
        return value * 60 * minute;
    }

    return value * 24 * 60 * minute;
}

function normalizeDelayUnit(
    value: unknown,
): DelayUnit {
    const candidate =
        typeof value === "string"
            ? value.trim().toLowerCase()
            : "days";

    if (!VALID_DELAY_UNITS.has(candidate as DelayUnit)) {
        throw new Error(
            `Unsupported delay unit "${String(value)}".`,
        );
    }

    return candidate as DelayUnit;
}

export async function executeWorkflowNode({
    workspaceId,
    customerId,
    workflowId,
    node,
    context,
}: {
    workspaceId: string;
    customerId: string | null;
    workflowId: string;
    node: WorkflowNode;
    context: ExecutionContext;
}): Promise<NodeExecutionResult> {
    if (node.type === "trigger") {
        return {
            kind: "continue",
            output: { acknowledged: true },
        };
    }

    if (node.type === "email") {
        const output = await executeEmailNode({
            workspaceId,
            customerId,
            workflowId,
            node,
            context,
        });

        return {
            kind: "continue",
            output,
        };
    }

    if (node.type === "delay") {
        const value = Number(
            node.config.delayValue ?? 0,
        );
        const unit = normalizeDelayUnit(
            node.config.delayUnit,
        );

        if (!Number.isFinite(value) || value <= 0) {
            throw new Error(
                `${node.title} has an invalid delay.`,
            );
        }

        const milliseconds = delayToMilliseconds(
            value,
            unit,
        );

        if (
            !Number.isSafeInteger(milliseconds) ||
            milliseconds <= 0
        ) {
            throw new Error(
                `${node.title} has a delay that is too large to execute safely.`,
            );
        }

        const resumeAt = new Date(
            Date.now() + milliseconds,
        );

        if (Number.isNaN(resumeAt.getTime())) {
            throw new Error(
                `${node.title} produced an invalid resume time.`,
            );
        }

        return {
            kind: "wait",
            resumeAt,
            output: {
                delayValue: value,
                delayUnit: unit,
                resumeAt: resumeAt.toISOString(),
            },
        };
    }

    if (node.type === "condition") {
        const branch = evaluateCondition(
            node,
            context,
        );

        return {
            kind: "branch",
            branch,
            output: { result: branch },
        };
    }

    if (node.type === "action") {
        return executeActionNode({
            workspaceId,
            customerId,
            workflowId,
            node,
            context,
        });
    }

    throw new Error(
        `${node.title} has an unsupported workflow node type.`,
    );
}
