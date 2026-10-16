import { NextResponse } from "next/server";

import {
    AuthError,
    getWorkspaceFromRequest,
} from "../../../../../lib/auth/getWorkspaceFromRequest";
import { automationConfig } from "../../../../../lib/automation/config";
import {
    callOpenClawFunction,
    OpenClawError,
} from "../../../../../lib/openclaw/client";
import { limitAiRequest } from "../../../../../lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_EVENT_CONDITIONS = new Set([
    "email was opened",
    "email was clicked",
    "recipient replied",
    "recipient did not reply",
    "email bounced",
]);

type AvailableStep = {
    id: string;
    type: string;
    title: string;
    description: string;
};

type CurrentStep = {
    index: number;
    id: string;
    type: string;
    title: string;
    description: string;
    config: Record<string, unknown>;
};

type CurrentConnection = {
    fromIndex: number;
    toIndex: number;
    branch: "YES" | "NO" | null;
    label: string | null;
};

type ConversationMessage = {
    role: "assistant" | "user";
    text: string;
};

type AiOperation = {
    action: "add" | "update" | "remove";
    operationId: string | null;
    targetIndex: number | null;
    afterIndex: number | null;
    parentIndex: number | null;
    parentOperationId: string | null;
    branch: "YES" | "NO" | null;
    stepId: string | null;
    integrationStepId: string | null;
    condition: string | null;
    sourceEmailIndex: number | null;
    sourceEmailOperationId: string | null;
    delayValue: number | null;
    delayUnit: "minutes" | "hours" | "days" | null;
};

function cleanText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function isRecord(
    value: unknown,
): value is Record<string, unknown> {
    return (
        Boolean(value) &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function parseAvailableSteps(value: unknown) {
    return Array.isArray(value)
        ? value.filter(
            (item): item is AvailableStep => {
                if (!isRecord(item)) {
                    return false;
                }

                return (
                    typeof item.id === "string" &&
                    typeof item.type === "string" &&
                    typeof item.title === "string" &&
                    typeof item.description === "string"
                );
            },
        )
        : [];
}

function parseCurrentSteps(value: unknown) {
    return Array.isArray(value)
        ? value.filter(
            (item): item is CurrentStep => {
                if (!isRecord(item)) {
                    return false;
                }

                return (
                    Number.isInteger(item.index) &&
                    typeof item.id === "string" &&
                    typeof item.type === "string" &&
                    typeof item.title === "string" &&
                    typeof item.description === "string" &&
                    isRecord(item.config)
                );
            },
        )
        : [];
}

function parseCurrentConnections(value: unknown) {
    return Array.isArray(value)
        ? value.filter(
            (item): item is CurrentConnection => {
                if (!isRecord(item)) {
                    return false;
                }

                return (
                    Number.isInteger(item.fromIndex) &&
                    Number.isInteger(item.toIndex) &&
                    (item.branch === null ||
                        item.branch === "YES" ||
                        item.branch === "NO") &&
                    (item.label === null ||
                        typeof item.label === "string")
                );
            },
        )
        : [];
}

function parseConversation(value: unknown) {
    return Array.isArray(value)
        ? value.filter(
            (item): item is ConversationMessage => {
                if (!isRecord(item)) {
                    return false;
                }

                return (
                    (item.role === "assistant" ||
                        item.role === "user") &&
                    typeof item.text === "string"
                );
            },
        )
        : [];
}

function isAiOperation(value: unknown): value is AiOperation {
    if (!isRecord(value)) {
        return false;
    }

    return (
        (value.action === "add" ||
            value.action === "update" ||
            value.action === "remove") &&
        (value.operationId === null ||
            typeof value.operationId === "string") &&
        (value.targetIndex === null ||
            Number.isInteger(value.targetIndex)) &&
        (value.afterIndex === null ||
            Number.isInteger(value.afterIndex)) &&
        (value.parentIndex === null ||
            Number.isInteger(value.parentIndex)) &&
        (value.parentOperationId === null ||
            typeof value.parentOperationId === "string") &&
        (value.branch === null ||
            value.branch === "YES" ||
            value.branch === "NO") &&
        (value.stepId === null ||
            typeof value.stepId === "string") &&
        (value.integrationStepId === null ||
            typeof value.integrationStepId === "string") &&
        (value.condition === null ||
            typeof value.condition === "string") &&
        (value.sourceEmailIndex === null ||
            Number.isInteger(value.sourceEmailIndex)) &&
        (value.sourceEmailOperationId === null ||
            typeof value.sourceEmailOperationId === "string") &&
        (value.delayValue === null ||
            typeof value.delayValue === "number") &&
        (value.delayUnit === null ||
            value.delayUnit === "minutes" ||
            value.delayUnit === "hours" ||
            value.delayUnit === "days")
    );
}

function operationStepType(
    operation: AiOperation,
    availableById: Map<string, AvailableStep>,
) {
    if (!operation.stepId) {
        return null;
    }

    return availableById.get(operation.stepId)?.type ?? null;
}

function validateOperations({
    operations,
    currentSteps,
    availableSteps,
}: {
    operations: AiOperation[];
    currentSteps: CurrentStep[];
    availableSteps: AvailableStep[];
}) {
    const errors: string[] = [];
    const availableById = new Map(
        availableSteps.map(
            (step) => [step.id, step] as const,
        ),
    );
    const currentByIndex = new Map(
        currentSteps.map(
            (step) => [step.index, step] as const,
        ),
    );
    const addedByOperationId = new Map<
        string,
        { operation: AiOperation; type: string | null }
    >();

    for (const [index, operation] of operations.entries()) {
        if (operation.action === "add") {
            const operationId = cleanText(operation.operationId);

            if (!operationId) {
                errors.push(
                    `Add operation ${index} is missing operationId.`,
                );
                continue;
            }

            if (addedByOperationId.has(operationId)) {
                errors.push(
                    `Duplicate AI operationId: ${operationId}.`,
                );
                continue;
            }

            if (!operation.stepId || !availableById.has(operation.stepId)) {
                errors.push(
                    `Add operation ${operationId} references an unsupported step.`,
                );
            }

            const type = operationStepType(
                operation,
                availableById,
            );
            const hasParentIndex = operation.parentIndex !== null;
            const parentOperationId = cleanText(
                operation.parentOperationId,
            );
            const hasParentOperation = parentOperationId.length > 0;

            if (type === "trigger") {
                if (hasParentIndex || hasParentOperation) {
                    errors.push(
                        `Add operation ${operationId} adds a trigger, so it cannot have a parent.`,
                    );
                }

                if (operation.branch !== null) {
                    errors.push(
                        `Add operation ${operationId} adds a trigger, so it cannot have a branch.`,
                    );
                }
            } else if (hasParentIndex === hasParentOperation) {
                errors.push(
                    `Add operation ${operationId} must reference exactly one semantic parent.`,
                );
            }

            if (
                operation.parentIndex !== null &&
                !currentByIndex.has(operation.parentIndex)
            ) {
                errors.push(
                    `Add operation ${operationId} references a missing parentIndex.`,
                );
            }

            if (
                hasParentOperation &&
                !addedByOperationId.has(parentOperationId)
            ) {
                errors.push(
                    `Add operation ${operationId} must reference an earlier parentOperationId.`,
                );
            }

            let parentType: string | null = null;

            if (operation.parentIndex !== null) {
                parentType =
                    currentByIndex.get(operation.parentIndex)?.type ?? null;
            } else if (hasParentOperation) {
                parentType =
                    addedByOperationId.get(parentOperationId)?.type ?? null;
            }

            if (parentType === "condition") {
                if (!operation.branch) {
                    errors.push(
                        `Add operation ${operationId} needs an explicit YES or NO branch.`,
                    );
                }
            } else if (
                type !== "trigger" &&
                operation.branch !== null
            ) {
                errors.push(
                    `Add operation ${operationId} cannot set a branch unless its parent is a condition.`,
                );
            }

            addedByOperationId.set(operationId, {
                operation,
                type,
            });
        } else {
            if (
                operation.targetIndex === null ||
                !currentByIndex.has(operation.targetIndex)
            ) {
                errors.push(
                    `${operation.action} operation ${index} references a missing targetIndex.`,
                );
            }
        }

        const conditionText = cleanText(operation.condition).toLowerCase();
        const conditionIsEmailEvent =
            conditionText && EMAIL_EVENT_CONDITIONS.has(conditionText);

        if (conditionIsEmailEvent) {
            const hasSourceIndex = operation.sourceEmailIndex !== null;
            const hasSourceOperation =
                cleanText(operation.sourceEmailOperationId).length > 0;

            if (hasSourceIndex === hasSourceOperation) {
                errors.push(
                    `Email condition operation ${index} must reference exactly one source email step.`,
                );
            }

            if (hasSourceIndex) {
                const source = currentByIndex.get(
                    operation.sourceEmailIndex as number,
                );

                if (!source || source.type !== "email") {
                    errors.push(
                        `Email condition operation ${index} sourceEmailIndex must reference an existing email step.`,
                    );
                }
            }

            if (hasSourceOperation) {
                const source = addedByOperationId.get(
                    cleanText(operation.sourceEmailOperationId),
                );

                if (!source || source.type !== "email") {
                    errors.push(
                        `Email condition operation ${index} sourceEmailOperationId must reference an earlier added email step.`,
                    );
                }
            }
        }
    }

    return [...new Set(errors)];
}

function jsonError(
    message: string,
    status: number,
    details?: string[],
) {
    return NextResponse.json(
        {
            error: message,
            ...(details?.length ? { details } : {}),
        },
        {
            status,
            headers: {
                "Cache-Control": "no-store",
            },
        },
    );
}

export async function POST(request: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(request);
        const limited = await limitAiRequest(workspaceId);
        if (limited) return limited;

        const body: unknown = await request.json().catch(() => ({}));
        const record = isRecord(body) ? body : {};

        const prompt = cleanText(record.prompt);
        const availableSteps = parseAvailableSteps(
            record.availableSteps,
        );
        const currentSteps = parseCurrentSteps(
            record.currentSteps,
        );
        const currentConnections = parseCurrentConnections(
            record.currentConnections,
        );
        const conversation = parseConversation(
            record.conversation,
        );

        if (!prompt) {
            return jsonError(
                "Describe the workflow change you want.",
                400,
            );
        }

        if (prompt.length > automationConfig.aiMaxPromptLength) {
            return jsonError(
                `Workflow prompt exceeds the configured ${automationConfig.aiMaxPromptLength}-character limit.`,
                413,
            );
        }

        if (availableSteps.length === 0) {
            return jsonError(
                "No supported workflow steps were provided.",
                400,
            );
        }

        const supportedSteps = availableSteps
            .map(
                (step) =>
                    `- ${step.id} | ${step.type}: ${step.title} — ${step.description}`,
            )
            .join("\n");

        const currentWorkflow =
            currentSteps.length === 0
                ? "(empty workflow)"
                : currentSteps
                    .map(
                        (step) =>
                            `${step.index}. id=${step.id} | ${step.type}: ${step.title} | config=${JSON.stringify(step.config)}`,
                    )
                    .join("\n");

        const currentGraph =
            currentConnections.length === 0
                ? "(no connections)"
                : currentConnections
                    .map(
                        (connection) =>
                            `${connection.fromIndex} -> ${connection.toIndex}${connection.branch
                                ? ` | branch=${connection.branch}`
                                : ""
                            }${connection.label
                                ? ` | label=${connection.label}`
                                : ""
                            }`,
                    )
                    .join("\n");

        const recentConversation =
            conversation.length === 0
                ? "(no earlier chat)"
                : conversation
                    .slice(-8)
                    .map(
                        (message) =>
                            `${message.role}: ${message.text}`,
                    )
                    .join("\n");

        const workflowEditTool = {
            type: "function" as const,
            function: {
                name: "submit_workflow_edit",
                description:
                    "Return the safe incremental workflow edits requested by the user.",
                parameters: {
                    type: "object",
                    properties: {
                        message: {
                            type: "string",
                        },
                        operations: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    action: {
                                        type: "string",
                                        enum: [
                                            "add",
                                            "update",
                                            "remove",
                                        ],
                                    },
                                    operationId: {
                                        anyOf: [
                                            { type: "string" },
                                            { type: "null" },
                                        ],
                                    },
                                    targetIndex: {
                                        anyOf: [
                                            { type: "integer" },
                                            { type: "null" },
                                        ],
                                    },
                                    afterIndex: {
                                        anyOf: [
                                            { type: "integer" },
                                            { type: "null" },
                                        ],
                                    },
                                    parentIndex: {
                                        anyOf: [
                                            { type: "integer" },
                                            { type: "null" },
                                        ],
                                    },
                                    parentOperationId: {
                                        anyOf: [
                                            { type: "string" },
                                            { type: "null" },
                                        ],
                                    },
                                    branch: {
                                        anyOf: [
                                            {
                                                type: "string",
                                                enum: ["YES", "NO"],
                                            },
                                            { type: "null" },
                                        ],
                                    },
                                    stepId: {
                                        anyOf: [
                                            { type: "string" },
                                            { type: "null" },
                                        ],
                                    },
                                    integrationStepId: {
                                        anyOf: [
                                            { type: "string" },
                                            { type: "null" },
                                        ],
                                    },
                                    condition: {
                                        anyOf: [
                                            { type: "string" },
                                            { type: "null" },
                                        ],
                                    },
                                    sourceEmailIndex: {
                                        anyOf: [
                                            { type: "integer" },
                                            { type: "null" },
                                        ],
                                    },
                                    sourceEmailOperationId: {
                                        anyOf: [
                                            { type: "string" },
                                            { type: "null" },
                                        ],
                                    },
                                    delayValue: {
                                        anyOf: [
                                            { type: "number" },
                                            { type: "null" },
                                        ],
                                    },
                                    delayUnit: {
                                        anyOf: [
                                            {
                                                type: "string",
                                                enum: [
                                                    "minutes",
                                                    "hours",
                                                    "days",
                                                ],
                                            },
                                            { type: "null" },
                                        ],
                                    },
                                },
                                required: [
                                    "action",
                                    "operationId",
                                    "targetIndex",
                                    "afterIndex",
                                    "parentIndex",
                                    "parentOperationId",
                                    "branch",
                                    "stepId",
                                    "integrationStepId",
                                    "condition",
                                    "sourceEmailIndex",
                                    "sourceEmailOperationId",
                                    "delayValue",
                                    "delayUnit",
                                ],
                                additionalProperties: false,
                            },
                        },
                    },
                    required: ["message", "operations"],
                    additionalProperties: false,
                },
            },
        };

        const parsed = await callOpenClawFunction({
            temperature: 0.1,
            tool: workflowEditTool,
            messages: [
                {
                    role: "system",
                    content: [
                        "You are an AI workflow editing assistant.",
                        "The user is chatting with you about ONE persistent workflow.",
                        "Never rebuild or replace the whole workflow unless the user explicitly asks to start over or replace it.",
                        "For follow-up requests, edit the existing workflow incrementally.",
                        "Use update when the user changes an existing step.",
                        "Use add when the user asks to add another step or connected tool.",
                        "Use remove when the user asks to delete a step.",
                        "Indexes refer to CURRENT WORKFLOW and are zero-based.",
                        "For update/remove operations, targetIndex must identify the existing step from CURRENT WORKFLOW.",
                        "For every add operation, operationId must be a unique short identifier so later operations can reference it.",
                        "For an added root trigger, parentIndex and parentOperationId must both be null.",
                        "For every other added step, set exactly one parent: parentIndex for an existing CURRENT WORKFLOW step, or parentOperationId for a step added earlier in this response.",
                        "afterIndex controls display/list ordering only. It NEVER expresses workflow graph meaning.",
                        "If the semantic parent is a condition, branch MUST be YES or NO and must match the user's wording exactly.",
                        "If the semantic parent is not a condition, branch must be null.",
                        "Never infer a branch from visual position, list order, or creation order.",
                        "Preserve existing YES/NO relationships unless the user explicitly asks to change them.",
                        "For add operations, stepId must be one of the exact SUPPORTED STEP IDS.",
                        "If the user asks an existing step to use a connected tool, use update and set integrationStepId to the exact integration:... supported ID.",
                        "For condition changes, set condition to the exact condition text. Otherwise condition must be null.",
                        "Email-event conditions are: Email was opened, Email was clicked, Recipient replied, Recipient did not reply, Email bounced.",
                        "Every email-event condition MUST explicitly reference the exact email step it evaluates using exactly one of sourceEmailIndex or sourceEmailOperationId.",
                        "Use sourceEmailIndex for an existing CURRENT WORKFLOW email step.",
                        "Use sourceEmailOperationId only for an email step added earlier in this same response.",
                        "Never infer an email condition's source from visual position, list order, or nearest-neighbour order.",
                        "For delay changes, set delayValue and delayUnit. Otherwise set them to null.",
                        "Do not add duplicate triggers unless the user explicitly requests replacing the trigger.",
                        "Keep the assistant message short and accurately describe only changes represented by operations.",
                        "You MUST call submit_workflow_edit exactly once and must not answer with free-form text instead.",
                        "",
                        "CURRENT WORKFLOW:",
                        currentWorkflow,
                        "",
                        "CURRENT GRAPH:",
                        currentGraph,
                        "",
                        "RECENT CHAT:",
                        recentConversation,
                        "",
                        "SUPPORTED STEP IDS:",
                        supportedSteps,
                    ].join("\n"),
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
        });

        if (
            !isRecord(parsed) ||
            typeof parsed.message !== "string" ||
            !Array.isArray(parsed.operations)
        ) {
            return jsonError(
                "AI returned an invalid workflow edit.",
                502,
            );
        }

        if (parsed.operations.length > automationConfig.aiMaxOperations) {
            return jsonError(
                `AI returned more than the configured ${automationConfig.aiMaxOperations} operation limit.`,
                502,
            );
        }

        const operations = parsed.operations.filter(isAiOperation);

        if (operations.length !== parsed.operations.length) {
            return jsonError(
                "AI returned malformed workflow operations.",
                502,
            );
        }

        const operationErrors = validateOperations({
            operations,
            currentSteps,
            availableSteps,
        });

        if (operationErrors.length > 0) {
            return jsonError(
                "AI returned an unsafe workflow edit.",
                502,
                operationErrors,
            );
        }

        return NextResponse.json(
            {
                message: parsed.message,
                operations,
            },
            {
                headers: {
                    "Cache-Control": "no-store",
                },
            },
        );
    } catch (error) {
        if (error instanceof AuthError) {
            return jsonError(
                error.message,
                error.status,
            );
        }

        if (error instanceof OpenClawError) {
            console.error(
                "automation-builder openclaw error",
                error.code,
                error.message,
            );

            return jsonError(
                error.message,
                error.status,
            );
        }

        console.error(
            "automation-builder error",
            error,
        );

        return jsonError(
            "Unable to update the workflow right now.",
            500,
        );
    }
}
