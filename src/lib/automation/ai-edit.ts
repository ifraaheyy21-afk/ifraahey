import { getAutomationActionCapability, isTerminalAutomationAction } from "./action-capabilities";
import { branchLabel, connectionBranch, type ConditionBranch } from "./branches";
import type { DelayUnit, WorkflowConnection, WorkflowDefinition, WorkflowNode } from "./types";

/**
 * Structured edits returned by the AI assistant, and the one place that
 * turns them into a workflow. The API route applies them to a copy of the
 * workflow to check the result before replying; the builder page applies the
 * same operations to the real workflow, so both always agree.
 */

export type AiOperation = {
    action: "add" | "update" | "remove";
    operationId: string | null;
    targetIndex: number | null;
    afterIndex: number | null;
    parentIndex: number | null;
    parentOperationId: string | null;
    branch: ConditionBranch | null;
    stepId: string | null;
    integrationStepId: string | null;
    actionValue: string | null;
    condition: string | null;
    sourceEmailIndex: number | null;
    sourceEmailOperationId: string | null;
    delayValue: number | null;
    delayUnit: DelayUnit | null;
    /** Step name shown on the canvas. */
    title: string | null;
    subject: string | null;
    body: string | null;
    /** Trigger setting: the tag, days before renewal, or event name. */
    triggerValue: string | null;
};

export type AvailableStep = {
    id: string;
    type: string;
    title: string;
    description: string;
    actionType?: string;
};

export const EMAIL_EVENT_CONDITIONS = [
    "Email was opened",
    "Email was clicked",
    "Recipient replied",
    "Recipient did not reply",
    "Email bounced",
] as const;

const EMAIL_EVENT_CONDITION_KEYS = new Set(EMAIL_EVENT_CONDITIONS.map((item) => item.toLowerCase()));

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

const cleanText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function nullable<T>(value: unknown, check: (value: unknown) => value is T): T | null | undefined {
    if (value === null || value === undefined) return null;
    return check(value) ? value : undefined;
}

const isString = (value: unknown): value is string => typeof value === "string";
const isInteger = (value: unknown): value is number => Number.isInteger(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isBranch = (value: unknown): value is ConditionBranch => value === "YES" || value === "NO";
const isDelayUnit = (value: unknown): value is DelayUnit => value === "minutes" || value === "hours" || value === "days";

/**
 * Reads one operation. Fields added later (title, subject, body,
 * triggerValue) are optional so older responses still parse; anything
 * present with the wrong type rejects the operation.
 */
export function parseAiOperation(value: unknown): AiOperation | null {
    if (!isRecord(value)) return null;
    if (value.action !== "add" && value.action !== "update" && value.action !== "remove") return null;

    const fields = {
        operationId: nullable(value.operationId, isString),
        targetIndex: nullable(value.targetIndex, isInteger),
        afterIndex: nullable(value.afterIndex, isInteger),
        parentIndex: nullable(value.parentIndex, isInteger),
        parentOperationId: nullable(value.parentOperationId, isString),
        branch: nullable(value.branch, isBranch),
        stepId: nullable(value.stepId, isString),
        integrationStepId: nullable(value.integrationStepId, isString),
        actionValue: nullable(value.actionValue, isString),
        condition: nullable(value.condition, isString),
        sourceEmailIndex: nullable(value.sourceEmailIndex, isInteger),
        sourceEmailOperationId: nullable(value.sourceEmailOperationId, isString),
        delayValue: nullable(value.delayValue, isNumber),
        delayUnit: nullable(value.delayUnit, isDelayUnit),
        title: nullable(value.title, isString),
        subject: nullable(value.subject, isString),
        body: nullable(value.body, isString),
        triggerValue: nullable(value.triggerValue, isString),
    };

    if (Object.values(fields).some((field) => field === undefined)) return null;
    return { action: value.action, ...(fields as { [K in keyof typeof fields]: Exclude<(typeof fields)[K], undefined> }) };
}

/** Structural checks on the operations themselves, before applying them. */
export function validateOperations({
    operations,
    definition,
    availableSteps,
}: {
    operations: AiOperation[];
    definition: WorkflowDefinition;
    availableSteps: AvailableStep[];
}) {
    const errors: string[] = [];
    const availableById = new Map(availableSteps.map((step) => [step.id, step] as const));
    const nodes = definition.nodes;
    const typeOfStep = (operation: AiOperation) => (operation.stepId ? availableById.get(operation.stepId)?.type ?? null : null);
    const added = new Map<string, { operation: AiOperation; type: string | null }>();

    for (const [index, operation] of operations.entries()) {
        if (operation.action !== "add") {
            if (operation.targetIndex === null || !nodes[operation.targetIndex]) {
                errors.push(`${operation.action} operation ${index} references a missing targetIndex.`);
            }
            continue;
        }

        const operationId = cleanText(operation.operationId);
        if (!operationId) {
            errors.push(`Add operation ${index} is missing operationId.`);
            continue;
        }
        if (added.has(operationId)) {
            errors.push(`Duplicate AI operationId: ${operationId}.`);
            continue;
        }
        if (!operation.stepId || !availableById.has(operation.stepId)) {
            errors.push(`Add operation ${operationId} references an unsupported step.`);
        }

        const type = typeOfStep(operation);
        const parentOperationId = cleanText(operation.parentOperationId);
        const hasParentIndex = operation.parentIndex !== null;
        const hasParentOperation = parentOperationId.length > 0;

        if (type === "trigger") {
            if (hasParentIndex || hasParentOperation) errors.push(`Add operation ${operationId} adds a trigger, so it cannot have a parent.`);
            if (operation.branch !== null) errors.push(`Add operation ${operationId} adds a trigger, so it cannot have a branch.`);
        } else if (hasParentIndex === hasParentOperation) {
            errors.push(`Add operation ${operationId} must reference exactly one semantic parent.`);
        }

        if (operation.parentIndex !== null && !nodes[operation.parentIndex]) {
            errors.push(`Add operation ${operationId} references a missing parentIndex.`);
        }
        if (hasParentOperation && !added.has(parentOperationId)) {
            errors.push(`Add operation ${operationId} must reference an earlier parentOperationId.`);
        }

        const parentType = operation.parentIndex !== null
            ? nodes[operation.parentIndex]?.type ?? null
            : hasParentOperation ? added.get(parentOperationId)?.type ?? null : null;

        if (parentType === "condition") {
            if (!operation.branch) errors.push(`Add operation ${operationId} needs an explicit YES or NO branch.`);
        } else if (type !== "trigger" && operation.branch !== null) {
            errors.push(`Add operation ${operationId} cannot set a branch unless its parent is a condition.`);
        }

        added.set(operationId, { operation, type });
    }

    const removed = new Set(
        operations.filter((operation) => operation.action === "remove" && operation.targetIndex !== null).map((operation) => operation.targetIndex as number),
    );

    for (const operation of operations) {
        if (operation.action === "remove") continue;
        if (operation.action === "update" && operation.targetIndex !== null && removed.has(operation.targetIndex)) {
            errors.push("An operation cannot update a step that is removed in the same response.");
        }
        if (operation.integrationStepId !== null && !availableById.has(operation.integrationStepId)) {
            errors.push("The requested integration does not have a supported workflow executor.");
        }

        const current = operation.targetIndex === null ? undefined : nodes[operation.targetIndex];
        const type = operation.action === "add" ? typeOfStep(operation) : current?.type;
        if (type !== "condition") continue;
        if (operation.condition === null && Array.isArray(current?.config.conditionRules) && current.config.conditionRules.length) continue;

        const condition = (operation.condition ?? String(current?.config.condition ?? "Email was opened")).trim().toLowerCase();
        if (!EMAIL_EVENT_CONDITION_KEYS.has(condition)) {
            errors.push(`Condition "${operation.condition ?? condition}" is not supported. Use one of: ${EMAIL_EVENT_CONDITIONS.join(", ")}.`);
            continue;
        }

        const sourceOperationId = cleanText(operation.sourceEmailOperationId);
        const hasIndex = operation.sourceEmailIndex !== null;
        if (hasIndex && sourceOperationId) {
            errors.push("An email condition must reference exactly one source email step.");
        } else if (hasIndex) {
            const source = nodes[operation.sourceEmailIndex!];
            if (!source || source.type !== "email" || removed.has(operation.sourceEmailIndex!)) {
                errors.push("The condition references a missing or removed email step.");
            }
        } else if (sourceOperationId) {
            if (added.get(sourceOperationId)?.type !== "email") errors.push("The condition must reference an added email operation.");
        } else {
            const sourceId = typeof current?.config.sourceEmailNodeId === "string" ? current.config.sourceEmailNodeId : "";
            const sourceIndex = nodes.findIndex((node) => node.id === sourceId);
            if (!sourceId || sourceIndex < 0 || nodes[sourceIndex].type !== "email" || removed.has(sourceIndex)) {
                errors.push("An email condition must identify the exact source email step it evaluates.");
            }
        }
    }

    // A condition branch holds one step; replacing it means updating that step.
    const occupied = new Set(
        definition.connections
            .map((connection) => {
                const branch = connectionBranch(connection);
                const from = nodes.findIndex((node) => node.id === connection.from);
                const to = nodes.findIndex((node) => node.id === connection.to);
                return branch && nodes[from]?.type === "condition" && !removed.has(to) ? `${from}:${branch}` : null;
            })
            .filter((key): key is string => key !== null),
    );
    for (const operation of operations) {
        if (operation.action !== "add" || operation.parentIndex === null || operation.branch === null) continue;
        if (nodes[operation.parentIndex]?.type !== "condition") continue;
        const key = `${operation.parentIndex}:${operation.branch}`;
        if (occupied.has(key)) {
            errors.push(`Condition at index ${operation.parentIndex} already has a ${operation.branch} branch. Update the existing branch step instead of adding a duplicate.`);
        } else {
            occupied.add(key);
        }
    }

    return [...new Set(errors)];
}

function makeConnectionId(branch: ConditionBranch | null) {
    return `${branch ? `edge-${branch.toLowerCase()}-` : "edge-"}${crypto.randomUUID()}`;
}

function connect(from: string, to: string, branch: ConditionBranch | null): WorkflowConnection {
    return { id: makeConnectionId(branch), from, to, ...(branch ? { label: branchLabel(branch) } : {}) };
}

export function delayTitle(value: number, unit: DelayUnit) {
    return `Wait ${value} ${value === 1 ? unit.replace(/s$/, "") : unit}`;
}

/** Writes the fields an operation carries onto a step. */
function applyFields(node: WorkflowNode, operation: AiOperation) {
    const title = cleanText(operation.title);

    if (node.type === "email") {
        if (operation.subject !== null) node.config.subject = operation.subject.trim();
        if (operation.body !== null) node.config.body = operation.body.trim();
        if (title) node.title = title;
    }

    if (node.type === "trigger" && operation.triggerValue !== null) {
        const value = operation.triggerValue.trim();
        const triggerType = cleanText(node.config.triggerType);
        if (triggerType === "tag_added") node.config.triggerTag = value;
        if (triggerType === "custom_event") node.config.triggerEventName = value;
        if (triggerType === "renewal_upcoming") {
            const days = Number.parseInt(value, 10);
            if (Number.isFinite(days) && days > 0) node.config.triggerDaysBefore = days;
        }
    }

    if (node.type === "action") {
        if (operation.actionValue !== null) node.config.actionValue = operation.actionValue.trim();
        if (title) node.title = title;
    }

    if (node.type === "condition" && operation.condition !== null) {
        const match = EMAIL_EVENT_CONDITIONS.find((item) => item.toLowerCase() === operation.condition!.trim().toLowerCase());
        node.config.condition = match ?? operation.condition.trim();
        node.config.conditionRules = undefined;
        node.config.conditionMatch = undefined;
        node.title = title || node.config.condition;
    }

    if (node.type === "delay" && (operation.delayValue !== null || operation.delayUnit !== null)) {
        if (operation.delayValue !== null) node.config.delayValue = Math.max(1, Math.round(operation.delayValue));
        if (operation.delayUnit !== null) node.config.delayUnit = operation.delayUnit;
        node.title = delayTitle(node.config.delayValue ?? 1, node.config.delayUnit ?? "days");
    }
}

export type ApplyOptions = {
    /** Builds a new step from a supported step id, or null if unknown. */
    createNode: (stepId: string, index: number) => WorkflowNode | null;
};

/**
 * Applies AI operations to a workflow and returns the new workflow. Indexes
 * always refer to the workflow as it was before the edit.
 */
export function applyAiOperations(definition: WorkflowDefinition, operations: AiOperation[], { createNode }: ApplyOptions) {
    const original = definition.nodes;
    const errors: string[] = [];
    let nodes = original.map((node) => ({ ...node, config: { ...node.config } }));
    let connections = definition.connections.map((connection) => ({ ...connection }));
    const addedIdByOperationId = new Map<string, string>();

    // Removals. A step in the middle of a chain is bridged so the steps after
    // it stay connected; its incoming edge keeps any Yes/No meaning.
    for (const operation of operations) {
        if (operation.action !== "remove" || operation.targetIndex === null) continue;
        const target = original[operation.targetIndex];
        if (!target) continue;

        const incoming = connections.filter((connection) => connection.to === target.id);
        const outgoing = connections.filter((connection) => connection.from === target.id);
        const bridge = target.type !== "condition" && incoming.length === 1 && outgoing.length === 1
            ? { ...incoming[0], to: outgoing[0].to }
            : null;

        nodes = nodes.filter((node) => node.id !== target.id);
        connections = connections.filter((connection) => connection.from !== target.id && connection.to !== target.id);
        if (bridge) connections.push(bridge);
    }

    for (const operation of operations) {
        if (operation.action !== "update" || operation.targetIndex === null) continue;
        const node = nodes.find((item) => item.id === original[operation.targetIndex!]?.id);
        if (node) applyFields(node, operation);
    }

    // Additions, in order, so a step can hang off one added earlier.
    for (const operation of operations) {
        if (operation.action !== "add" || !operation.stepId) continue;
        const node = createNode(operation.stepId, nodes.length);
        if (!node) {
            errors.push(`Step "${operation.stepId}" is not available.`);
            continue;
        }
        applyFields(node, operation);
        nodes.push(node);
        if (operation.operationId) addedIdByOperationId.set(operation.operationId, node.id);

        if (node.type === "trigger") {
            // A new trigger starts the existing chain if nothing else does.
            const hasIncoming = new Set(connections.map((connection) => connection.to));
            const root = nodes.find((item) => item.id !== node.id && item.type !== "trigger" && !hasIncoming.has(item.id));
            if (root) connections.push(connect(node.id, root.id, null));
            continue;
        }

        const parentId = operation.parentIndex !== null
            ? original[operation.parentIndex]?.id
            : addedIdByOperationId.get(cleanText(operation.parentOperationId));
        const parent = nodes.find((item) => item.id === parentId);
        if (!parent) {
            errors.push(`"${node.title}" has no parent step to attach to.`);
            continue;
        }

        const branch = parent.type === "condition" ? operation.branch : null;
        const existing = connections.find((connection) =>
            connection.from === parent.id && (parent.type !== "condition" || connectionBranch(connection) === branch));

        if (!existing) {
            connections.push(connect(parent.id, node.id, branch));
            continue;
        }

        // The slot is taken: insert the new step between the parent and the
        // step that followed, instead of giving the parent two next steps.
        if (node.type === "action" && isTerminalAutomationAction(node.config.actionType)) {
            errors.push(`"${node.title}" ends the workflow, so it cannot go before "${nodes.find((item) => item.id === existing.to)?.title ?? "the next step"}".`);
            continue;
        }
        const next = existing.to;
        existing.to = node.id;
        connections.push(connect(node.id, next, node.type === "condition" ? "YES" : null));
    }

    // Conditions point at the exact email they evaluate.
    for (const operation of operations) {
        if (operation.action === "remove") continue;
        const nodeId = operation.action === "add"
            ? addedIdByOperationId.get(cleanText(operation.operationId))
            : original[operation.targetIndex ?? -1]?.id;
        const node = nodes.find((item) => item.id === nodeId);
        if (!node || node.type !== "condition") continue;

        const sourceId = operation.sourceEmailIndex !== null
            ? original[operation.sourceEmailIndex]?.id
            : operation.sourceEmailOperationId
                ? addedIdByOperationId.get(operation.sourceEmailOperationId)
                : undefined;
        if (!sourceId) continue;
        if (!nodes.some((item) => item.id === sourceId && item.type === "email")) {
            errors.push(`"${node.title}" checks an email step that was removed.`);
            continue;
        }
        node.config.sourceEmailNodeId = sourceId;
    }

    return { definition: { nodes, connections }, addedIdByOperationId, errors };
}

/** Builds a workflow from the index-based shape the builder sends. */
export function definitionFromIndexed(
    steps: Array<{ index: number; id: string; type: string; title: string; description: string; config: Record<string, unknown> }>,
    links: Array<{ fromIndex: number; toIndex: number; branch: ConditionBranch | null }>,
): WorkflowDefinition {
    const ordered = [...steps].sort((a, b) => a.index - b.index);
    const nodes = ordered.map((step) => ({
        id: step.id,
        type: step.type as WorkflowNode["type"],
        label: step.type,
        title: step.title,
        description: step.description,
        status: "ready" as const,
        config: { ...step.config },
        position: { x: 0, y: 0 },
    }));
    const idAt = new Map(ordered.map((step) => [step.index, step.id] as const));
    const connections = links
        .filter((link) => idAt.has(link.fromIndex) && idAt.has(link.toIndex))
        .map((link, index) => ({
            id: `${link.branch ? `edge-${link.branch.toLowerCase()}-` : "edge-"}${index}`,
            from: idAt.get(link.fromIndex)!,
            to: idAt.get(link.toIndex)!,
            ...(link.branch ? { label: branchLabel(link.branch) } : {}),
        }));
    return { nodes, connections };
}

export function isSupportedStep(step: AvailableStep) {
    if (!new Set(["trigger", "email", "delay", "condition", "action"]).has(step.type)) return false;
    // An OAuth connection does not create an executor. Keep provider steps out
    // until their server adapters and operation schemas are implemented.
    if (step.id.startsWith("integration:")) return false;
    if (step.type === "action") return Boolean(getAutomationActionCapability(step.actionType ?? step.title));
    return true;
}
