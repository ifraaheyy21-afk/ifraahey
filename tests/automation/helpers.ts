import type { WorkflowConnection, WorkflowDefinition, WorkflowNode } from "../../src/lib/automation/types";

export function node(
    id: string,
    type: WorkflowNode["type"],
    config: WorkflowNode["config"] = {},
    title = id,
): WorkflowNode {
    return {
        id,
        type,
        label: type,
        title,
        description: "",
        status: "ready",
        config,
        position: { x: 0, y: 0 },
    };
}

export function edge(from: string, to: string, label?: string): WorkflowConnection {
    return { id: `${from}->${to}`, from, to, ...(label ? { label } : {}) };
}

export function workflow(nodes: WorkflowNode[], connections: WorkflowConnection[]): WorkflowDefinition {
    return { nodes, connections };
}

export const welcomeEmail = { subject: "Welcome {{first_name}}", body: "Hi {{first_name}}" };
