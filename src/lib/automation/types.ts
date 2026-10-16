export type WorkflowStatus = "draft" | "active" | "paused";

export type NodeType = "trigger" | "email" | "delay" | "condition" | "action";

export type DelayUnit = "minutes" | "hours" | "days";

export type ConditionMatchMode = "all" | "any";

export type ConditionOperator =
    | "equals"
    | "not_equals"
    | "contains"
    | "not_contains"
    | "greater_than"
    | "greater_than_or_equal"
    | "less_than"
    | "less_than_or_equal"
    | "is_true"
    | "is_false"
    | "exists"
    | "not_exists";

export type ConditionRule = {
    field: string;
    operator: ConditionOperator;
    value?: unknown;
};

export type WorkflowNodeConfig = {
    condition?: string;
    conditionRules?: ConditionRule[];
    conditionMatch?: ConditionMatchMode;

    // For conditions about a workflow email, this is the exact email node
    // whose events must be evaluated. It is semantic workflow data and is
    // never inferred from node position or array order at execution time.
    sourceEmailNodeId?: string;

    subject?: string;
    body?: string;
    sendingAccount?: string;

    delayValue?: number;
    delayUnit?: DelayUnit;

    actionType?: string;
    actionValue?: string;
    integrationId?: string;

    audience?: unknown;
    [key: string]: unknown;
};

export type WorkflowNode = {
    id: string;
    type: NodeType;
    label: string;
    title: string;
    description: string;
    status: "ready" | "warning";
    warningText?: string;
    config: WorkflowNodeConfig;
    position: { x: number; y: number };
};

export type WorkflowConnection = {
    id: string;
    from: string;
    to: string;
    label?: string;
};

export type WorkflowDefinition = {
    nodes: WorkflowNode[];
    connections: WorkflowConnection[];
};

export type WorkflowDto = WorkflowDefinition & {
    id: string;
    name: string;
    description: string;
    status: WorkflowStatus;
    version: number;
    createdAt: string;
    updatedAt: string;
    lastRunAt?: string;
    metrics: {
        enrolled: number;
        completed: number;
        successRate: number;
        revenueRecoveredMinor?: number;
        customersRecovered?: number;
    };
};

export type AutomationEmailEvent = Record<string, unknown> & {
    id?: string;
    scheduledEmailId?: string | null;
    generatedEmailId?: string | null;
    emailType?: string;
    status?: string;
    reason?: string | null;
    subject?: string;
    providerMessageId?: string | null;
    createdAt?: string | Date;
    automationNodeId?: string | null;
};

export type ExecutionContext = Record<string, unknown> & {
    customer?: Record<string, unknown>;
    workspace?: Record<string, unknown>;
    brand?: Record<string, unknown>;

    emailEvents?: AutomationEmailEvent[];
    automationEmailEvents?: AutomationEmailEvent[];
    customerEmailEvents?: AutomationEmailEvent[];
    automationEmailEventsByNode?: Record<string, AutomationEmailEvent[]>;

    steps?: Record<string, unknown>;
    automationRunId?: string;
};

export type NodeExecutionResult =
    | { kind: "continue"; output?: Record<string, unknown> }
    | { kind: "branch"; branch: boolean; output?: Record<string, unknown> }
    | { kind: "wait"; resumeAt: Date; output?: Record<string, unknown> }
    | { kind: "complete"; output?: Record<string, unknown> };
