import { automationConfig } from "./config";
import {
    getAutomationActionCapability,
    isTerminalAutomationAction,
} from "./action-capabilities";

import type {
    DelayUnit,
    NodeType,
    WorkflowConnection,
    WorkflowDefinition,
    WorkflowNode,
} from "./types";
import { triggerIssues } from "./triggers";

const VALID_NODE_TYPES = new Set<NodeType>([
    "trigger",
    "email",
    "delay",
    "condition",
    "action",
]);

const VALID_DELAY_UNITS = new Set<DelayUnit>([
    "minutes",
    "hours",
    "days",
]);

const EMAIL_EVENT_CONDITIONS = new Set([
    "email was opened",
    "email was clicked",
    "recipient replied",
    "recipient did not reply",
    "email bounced",
]);

function hasText(
    value: unknown,
): value is string {
    return (
        typeof value === "string" &&
        value.trim().length > 0
    );
}

function isFiniteNumber(
    value: unknown,
): value is number {
    return (
        typeof value === "number" &&
        Number.isFinite(value)
    );
}

function nodeName(node: WorkflowNode) {
    return (
        (hasText(node.title)
            ? node.title.trim()
            : "") ||
        (hasText(node.id)
            ? node.id.trim()
            : "") ||
        "Workflow step"
    );
}

function outgoingConnections(
    connections: WorkflowConnection[],
    nodeId: string,
) {
    return connections.filter(
        (connection) =>
            connection.from === nodeId,
    );
}

function incomingConnections(
    connections: WorkflowConnection[],
    nodeId: string,
) {
    return connections.filter(
        (connection) =>
            connection.to === nodeId,
    );
}

function buildAdjacency(
    definition: WorkflowDefinition,
) {
    const adjacency = new Map<string, string[]>();

    for (const node of definition.nodes) {
        if (hasText(node.id)) {
            adjacency.set(node.id, []);
        }
    }

    for (const connection of definition.connections) {
        if (
            adjacency.has(connection.from) &&
            adjacency.has(connection.to)
        ) {
            adjacency
                .get(connection.from)
                ?.push(connection.to);
        }
    }

    return adjacency;
}

function hasCycle(
    definition: WorkflowDefinition,
) {
    const adjacency = buildAdjacency(definition);
    const visiting = new Set<string>();
    const visited = new Set<string>();

    function visit(nodeId: string): boolean {
        if (visiting.has(nodeId)) {
            return true;
        }

        if (visited.has(nodeId)) {
            return false;
        }

        visiting.add(nodeId);

        for (const next of adjacency.get(nodeId) ?? []) {
            if (visit(next)) {
                return true;
            }
        }

        visiting.delete(nodeId);
        visited.add(nodeId);
        return false;
    }

    return definition.nodes.some(
        (node) =>
            hasText(node.id) && visit(node.id),
    );
}

function reachableNodeIds(
    definition: WorkflowDefinition,
    triggerId: string,
) {
    const adjacency = buildAdjacency(definition);
    const reachable = new Set<string>();
    const queue = [triggerId];

    while (queue.length > 0) {
        const nodeId = queue.shift();

        if (!nodeId || reachable.has(nodeId)) {
            continue;
        }

        reachable.add(nodeId);

        for (const next of adjacency.get(nodeId) ?? []) {
            if (!reachable.has(next)) {
                queue.push(next);
            }
        }
    }

    return reachable;
}

function canReach(
    definition: WorkflowDefinition,
    fromNodeId: string,
    toNodeId: string,
) {
    const adjacency = buildAdjacency(definition);
    const visited = new Set<string>();
    const queue = [fromNodeId];

    while (queue.length > 0) {
        const nodeId = queue.shift();

        if (!nodeId || visited.has(nodeId)) {
            continue;
        }

        if (nodeId === toNodeId) {
            return true;
        }

        visited.add(nodeId);

        for (const next of adjacency.get(nodeId) ?? []) {
            if (!visited.has(next)) {
                queue.push(next);
            }
        }
    }

    return false;
}

function validateNodeBasics(
    node: WorkflowNode,
    issues: string[],
) {
    const name = nodeName(node);

    if (!hasText(node.id)) {
        issues.push(
            "Every workflow step needs an id.",
        );
    }

    if (!hasText(node.title)) {
        issues.push(
            "Every workflow step needs a name.",
        );
    }

    if (!VALID_NODE_TYPES.has(node.type as NodeType)) {
        issues.push(
            `${name} has an unsupported step type.`,
        );
        return;
    }

    if (
        !node.config ||
        typeof node.config !== "object" ||
        Array.isArray(node.config)
    ) {
        issues.push(
            `${name} has an invalid configuration.`,
        );
        return;
    }

    if (
        !node.position ||
        !isFiniteNumber(node.position.x) ||
        !isFiniteNumber(node.position.y)
    ) {
        issues.push(
            `${name} has an invalid canvas position.`,
        );
    }

    if (node.type === "email") {
        if (!hasText(node.config.subject)) {
            issues.push(
                `${name} needs a subject.`,
            );
        }

        if (!hasText(node.config.body)) {
            issues.push(
                `${name} needs a message.`,
            );
        }
    }

    if (node.type === "trigger") {
        issues.push(...triggerIssues(node, name));
    }

    if (node.type === "delay") {
        if (
            !isFiniteNumber(node.config.delayValue) ||
            node.config.delayValue <= 0
        ) {
            issues.push(
                `${name} needs a positive wait value.`,
            );
        }

        const unit = node.config.delayUnit ?? "days";

        if (!VALID_DELAY_UNITS.has(unit as DelayUnit)) {
            issues.push(
                `${name} has an invalid wait unit.`,
            );
        }
    }

    if (node.type === "condition") {
        const rules = Array.isArray(
            node.config.conditionRules,
        )
            ? node.config.conditionRules
            : [];

        const condition =
            typeof node.config.condition === "string"
                ? node.config.condition.trim().toLowerCase()
                : "";

        if (rules.length === 0 && !condition) {
            issues.push(
                `${name} needs a condition.`,
            );
        }

        if (
            rules.length === 0 &&
            condition &&
            !EMAIL_EVENT_CONDITIONS.has(condition)
        ) {
            issues.push(
                `${name} needs structured condition rules before it can be activated.`,
            );
        }
    }

    if (node.type === "action") {
        if (!hasText(node.config.actionType)) {
            issues.push(
                `${name} needs an action type.`,
            );
            return;
        }

        const capability = getAutomationActionCapability(
            node.config.actionType,
        );

        if (!capability) {
            issues.push(
                `${name} uses "${node.config.actionType}" but that action does not have a server executor yet.`,
            );
            return;
        }

        if (
            capability.requiresValue &&
            !hasText(node.config.actionValue)
        ) {
            issues.push(
                `${name} needs an action value.`,
            );
        }

        if (
            capability.key === "add_contact_tag" &&
            hasText(node.config.actionValue) &&
            node.config.actionValue.trim().length > automationConfig.maxTagLength
        ) {
            issues.push(
                `${name} tag exceeds the configured ${automationConfig.maxTagLength}-character limit.`,
            );
        }
    }
}

function validateConnections(
    definition: WorkflowDefinition,
    nodeIds: Set<string>,
    issues: string[],
) {
    const connectionIds = new Set<string>();
    const semanticEdges = new Set<string>();

    for (const connection of definition.connections) {
        if (!hasText(connection.id)) {
            issues.push(
                "Every connection needs an id.",
            );
        } else if (connectionIds.has(connection.id)) {
            issues.push(
                `Duplicate workflow connection id: ${connection.id}`,
            );
        } else {
            connectionIds.add(connection.id);
        }

        if (
            !hasText(connection.from) ||
            !hasText(connection.to)
        ) {
            issues.push(
                `Connection ${connection.id || "without an id"} needs valid source and destination steps.`,
            );
            continue;
        }

        if (
            !nodeIds.has(connection.from) ||
            !nodeIds.has(connection.to)
        ) {
            issues.push(
                `Connection ${connection.id || "without an id"} points to a missing step.`,
            );
            continue;
        }

        if (connection.from === connection.to) {
            issues.push(
                `Connection ${connection.id || "without an id"} cannot point a step to itself.`,
            );
        }

        const edgeKey = [
            connection.from,
            connection.to,
            connection.label?.trim().toLowerCase() ?? "",
        ].join("::");

        if (semanticEdges.has(edgeKey)) {
            issues.push(
                `Duplicate connection from ${connection.from} to ${connection.to}.`,
            );
        } else {
            semanticEdges.add(edgeKey);
        }
    }
}

function validateEmailConditionSources(
    definition: WorkflowDefinition,
    nodesById: Map<string, WorkflowNode>,
    issues: string[],
) {
    for (const conditionNode of definition.nodes) {
        if (conditionNode.type !== "condition") {
            continue;
        }

        const rules = Array.isArray(
            conditionNode.config.conditionRules,
        )
            ? conditionNode.config.conditionRules
            : [];

        if (rules.length > 0) {
            continue;
        }

        const condition =
            conditionNode.config.condition
                ?.trim()
                .toLowerCase() ?? "";

        if (!EMAIL_EVENT_CONDITIONS.has(condition)) {
            continue;
        }

        const sourceEmailNodeId =
            typeof conditionNode.config.sourceEmailNodeId === "string"
                ? conditionNode.config.sourceEmailNodeId.trim()
                : "";

        if (!sourceEmailNodeId) {
            issues.push(
                `${nodeName(conditionNode)} must select the exact email step it evaluates.`,
            );
            continue;
        }

        const source = nodesById.get(sourceEmailNodeId);

        if (!source || source.type !== "email") {
            issues.push(
                `${nodeName(conditionNode)} references an email step that does not exist.`,
            );
            continue;
        }

        if (
            !canReach(
                definition,
                source.id,
                conditionNode.id,
            )
        ) {
            issues.push(
                `${nodeName(conditionNode)} must reference an email step that occurs before it in the workflow path.`,
            );
        }
    }
}

function validateGraphShape(
    definition: WorkflowDefinition,
    trigger: WorkflowNode | undefined,
    issues: string[],
) {
    if (!trigger) {
        return;
    }

    const incomingToTrigger = incomingConnections(
        definition.connections,
        trigger.id,
    );

    if (incomingToTrigger.length > 0) {
        issues.push(
            "The workflow trigger cannot have incoming connections.",
        );
    }

    const triggerOutgoing = outgoingConnections(
        definition.connections,
        trigger.id,
    );

    if (triggerOutgoing.length !== 1) {
        issues.push(
            "The workflow trigger needs exactly one outgoing connection.",
        );
    }

    for (const node of definition.nodes) {
        const outgoing = outgoingConnections(
            definition.connections,
            node.id,
        );

        if (
            node.type !== "condition" &&
            outgoing.length > 1
        ) {
            issues.push(
                `${nodeName(node)} cannot have more than one outgoing connection.`,
            );
        }

        if (node.type === "condition") {
            if (outgoing.length !== 2) {
                issues.push(
                    `${nodeName(node)} needs exactly two Yes/No branches.`,
                );
                continue;
            }

            const labels = outgoing.map(
                (connection) =>
                    connection.label?.trim().toLowerCase() ?? "",
            );

            const yesCount = labels.filter(
                (label) =>
                    label === "yes" || label === "true",
            ).length;

            const noCount = labels.filter(
                (label) =>
                    label === "no" || label === "false",
            ).length;

            if (yesCount !== 1 || noCount !== 1) {
                issues.push(
                    `${nodeName(node)} needs exactly one Yes branch and one No branch.`,
                );
            }
        }

        if (
            node.type === "action" &&
            isTerminalAutomationAction(
                node.config.actionType,
            ) &&
            outgoing.length > 0
        ) {
            issues.push(
                `${nodeName(node)} ends the workflow and cannot have an outgoing connection.`,
            );
        }
    }

    const reachable = reachableNodeIds(
        definition,
        trigger.id,
    );

    for (const node of definition.nodes) {
        if (!reachable.has(node.id)) {
            issues.push(
                `${nodeName(node)} is not reachable from the workflow trigger.`,
            );
        }
    }

    if (hasCycle(definition)) {
        issues.push(
            "Workflow loops are not supported by the current execution engine.",
        );
    }
}

export function validateWorkflowDefinition(
    definition: WorkflowDefinition,
) {
    const issues: string[] = [];

    if (
        !definition ||
        typeof definition !== "object"
    ) {
        return [
            "Workflow definition is invalid.",
        ];
    }

    if (
        !Array.isArray(definition.nodes) ||
        definition.nodes.length === 0
    ) {
        return [
            "Add at least one workflow step.",
        ];
    }

    if (
        definition.nodes.length >
        automationConfig.maxNodes
    ) {
        issues.push(
            `Workflow exceeds the configured ${automationConfig.maxNodes}-step limit.`,
        );
    }

    if (!Array.isArray(definition.connections)) {
        issues.push(
            "Workflow connections are invalid.",
        );
        return issues;
    }

    if (
        definition.connections.length >
        automationConfig.maxConnections
    ) {
        issues.push(
            `Workflow exceeds the configured ${automationConfig.maxConnections}-connection limit.`,
        );
    }

    const nodeIds = new Set<string>();
    const nodesById = new Map<string, WorkflowNode>();

    for (const node of definition.nodes) {
        if (!node || typeof node !== "object") {
            issues.push(
                "Workflow contains an invalid step.",
            );
            continue;
        }

        if (
            hasText(node.id) &&
            nodeIds.has(node.id)
        ) {
            issues.push(
                `Duplicate workflow step id: ${node.id}`,
            );
        }

        if (hasText(node.id)) {
            nodeIds.add(node.id);
            nodesById.set(node.id, node);
        }

        validateNodeBasics(node, issues);
    }

    const triggers = definition.nodes.filter(
        (node) => node?.type === "trigger",
    );

    if (triggers.length !== 1) {
        issues.push(
            "A workflow needs exactly one trigger.",
        );
    }

    validateConnections(
        definition,
        nodeIds,
        issues,
    );

    validateGraphShape(
        definition,
        triggers.length === 1
            ? triggers[0]
            : undefined,
        issues,
    );

    validateEmailConditionSources(
        definition,
        nodesById,
        issues,
    );

    return [...new Set(issues)];
}
