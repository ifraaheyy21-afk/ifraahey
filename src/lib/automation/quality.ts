import type { WorkflowDefinition, WorkflowNode } from "./types";

/**
 * Checks for workflows that are valid but would not work the way the user
 * expects. Conditions run the moment a contact reaches them, so timing
 * matters as much as structure.
 */

const EMAIL_EVENT_CONDITIONS = new Set([
    "email was opened",
    "email was clicked",
    "recipient replied",
    "recipient did not reply",
    "email bounced",
]);

function nameOf(node: WorkflowNode) {
    return `"${node.title?.trim() || node.type}"`;
}

function childrenOf(definition: WorkflowDefinition) {
    const children = new Map<string, string[]>();
    for (const connection of definition.connections) {
        if (!children.has(connection.from)) children.set(connection.from, []);
        children.get(connection.from)!.push(connection.to);
    }
    return children;
}

/**
 * Steps reachable from `startId` without passing through a wait. The start
 * step itself is not included unless the graph loops back to it.
 */
function reachableWithoutWaiting(definition: WorkflowDefinition, startId: string) {
    const nodesById = new Map(definition.nodes.map((node) => [node.id, node]));
    const children = childrenOf(definition);
    const seen = new Set<string>();
    const queue = [...(children.get(startId) ?? [])];

    while (queue.length) {
        const id = queue.shift()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const node = nodesById.get(id);
        if (!node || node.type === "delay") continue;
        queue.push(...(children.get(id) ?? []));
    }

    return { seen, nodesById };
}

function emailEventCondition(node: WorkflowNode) {
    if (node.type !== "condition") return "";
    const rules = Array.isArray(node.config.conditionRules) ? node.config.conditionRules : [];
    if (rules.length) return "";
    const condition = node.config.condition?.trim().toLowerCase() ?? "";
    return EMAIL_EVENT_CONDITIONS.has(condition) ? condition : "";
}

/**
 * An email-event condition placed straight after its email is checked
 * seconds after sending, so "replied" is almost always No and "did not
 * reply" almost always Yes. A wait must sit between them.
 */
export function emailConditionTimingIssues(definition: WorkflowDefinition) {
    const issues: string[] = [];
    if (!Array.isArray(definition?.nodes) || !Array.isArray(definition?.connections)) return issues;

    for (const condition of definition.nodes) {
        if (!emailEventCondition(condition)) continue;
        const sourceId = typeof condition.config.sourceEmailNodeId === "string" ? condition.config.sourceEmailNodeId.trim() : "";
        if (!sourceId) continue;

        const { seen, nodesById } = reachableWithoutWaiting(definition, sourceId);
        const source = nodesById.get(sourceId);
        if (source && seen.has(condition.id)) {
            issues.push(
                `${nameOf(condition)} checks ${nameOf(source)} straight after it is sent. Add a wait before the condition so the contact has time to open, click or reply.`,
            );
        }
    }

    return issues;
}

/**
 * Suggestions that make a workflow more effective. They never block
 * publishing; the AI assistant uses them to improve its own edits.
 */
export function reviewWorkflowQuality(definition: WorkflowDefinition) {
    const suggestions: string[] = [];
    if (!Array.isArray(definition?.nodes) || !Array.isArray(definition?.connections)) return suggestions;

    const children = childrenOf(definition);
    const trigger = definition.nodes.find((node) => node.type === "trigger");
    if (trigger && !(children.get(trigger.id)?.length)) {
        suggestions.push("The trigger has no steps after it, so the workflow does nothing yet.");
    }

    for (const email of definition.nodes) {
        if (email.type !== "email") continue;
        const { seen, nodesById } = reachableWithoutWaiting(definition, email.id);
        for (const id of seen) {
            const next = nodesById.get(id);
            if (next?.type === "email" && next.id !== email.id) {
                suggestions.push(
                    `${nameOf(email)} and ${nameOf(next)} go out at the same moment. Add a wait between them (usually 2–4 days).`,
                );
            }
        }
    }

    for (const node of definition.nodes) {
        if (emailEventCondition(node) === "email was opened") {
            suggestions.push(
                `${nameOf(node)} relies on opens, which are unreliable because many mail apps mark emails as opened automatically. Prefer replies or link clicks when possible.`,
            );
        }
    }

    return [...new Set(suggestions)];
}

const PLACEHOLDER_BODY = /write your email here/i;

/** Emails that would go out with the builder's starter text. */
export function emailPlaceholderIssues(definition: WorkflowDefinition) {
    if (!Array.isArray(definition?.nodes)) return [];
    return definition.nodes
        .filter((node) => node.type === "email" && typeof node.config.body === "string" && PLACEHOLDER_BODY.test(node.config.body))
        .map((node) => `${nameOf(node)} still has the placeholder message. Write the email before publishing.`);
}
