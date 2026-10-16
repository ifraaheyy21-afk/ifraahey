import { NextResponse } from "next/server";

import {

    AuthError,

    getWorkspaceFromRequest,

} from "../../../../lib/auth/getWorkspaceFromRequest";

import { automationConfig } from "../../../../lib/automation/config";

import { getAutomationActionCapability } from "../../../../lib/automation/action-capabilities";

import {

    callOpenClawFunction,

    OpenClawError,

} from "../../../../lib/openclaw/client";
import { limitAiRequest } from "../../../../lib/rateLimit";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

type AvailableStep = {

    actionType?: string;

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

    actionValue: string | null;

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

function parseAvailableSteps(value: unknown): AvailableStep[] {

    if (!Array.isArray(value)) return [];

    return value.filter((item): item is AvailableStep => {

        if (!isRecord(item) || typeof item.id !== "string" || typeof item.type !== "string" ||

            typeof item.title !== "string" || typeof item.description !== "string") return false;

        if (!new Set(["trigger", "email", "delay", "condition", "action"]).has(item.type)) return false;

        // An OAuth connection does not create an executor. Keep provider steps out

        // until their server adapters and operation schemas are implemented.

        if (item.id.startsWith("integration:")) return false;

        if (item.type === "action") return Boolean(getAutomationActionCapability(item.actionType ?? item.title));

        return true;

    });

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

        (value.actionValue === null ||

            typeof value.actionValue === "string") &&

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

    currentConnections,

    availableSteps,

}: {

    operations: AiOperation[];

    currentSteps: CurrentStep[];

    currentConnections: CurrentConnection[];

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

    }

    const removedIndexes = new Set(

        operations

            .filter(

                (operation) =>

                    operation.action === "remove" &&

                    operation.targetIndex !== null,

            )

            .map((operation) => operation.targetIndex as number),

    );

    const emailConditions = new Set(["email was opened", "email was clicked", "recipient replied", "recipient did not reply", "email bounced"]);

    for (const operation of operations) {

        if (operation.action === "remove") continue;

        if (operation.action === "update" && operation.targetIndex !== null && removedIndexes.has(operation.targetIndex)) {

            errors.push("An operation cannot update a step that is removed in the same response.");

        }

        if (operation.integrationStepId !== null && !availableById.has(operation.integrationStepId)) {

            errors.push("The requested integration does not have a supported workflow executor.");

        }

        const current = operation.targetIndex === null ? undefined : currentByIndex.get(operation.targetIndex);

        const type = operation.action === "add" ? operationStepType(operation, availableById) : current?.type;

        if (type !== "condition") continue;

        if (operation.condition === null && Array.isArray(current?.config.conditionRules) && current.config.conditionRules.length) continue;

        const condition = (operation.condition ?? String(current?.config.condition ?? "Email was opened")).trim().toLowerCase();

        if (!emailConditions.has(condition)) continue;

        const sourceOperationId = cleanText(operation.sourceEmailOperationId);

        const hasIndex = operation.sourceEmailIndex !== null;

        if (hasIndex && sourceOperationId) {

            errors.push("An email condition must reference exactly one source email step.");

            continue;

        }

        if (hasIndex) {

            const source = currentByIndex.get(operation.sourceEmailIndex!);

            if (!source || source.type !== "email" || removedIndexes.has(source.index)) errors.push("The condition references a missing or removed email step.");

        } else if (sourceOperationId) {

            if (addedByOperationId.get(sourceOperationId)?.type !== "email") errors.push("The condition must reference an added email operation.");

        } else {

            const sourceId = typeof current?.config.sourceEmailNodeId === "string" ? current.config.sourceEmailNodeId : "";

            if (!sourceId || !currentSteps.some((step) => step.id === sourceId && step.type === "email" && !removedIndexes.has(step.index))) {

                errors.push("An email condition must identify the exact source email step it evaluates.");

            }

        }

    }

    const occupiedConditionBranches = new Set(

        currentConnections

            .filter(

                (connection) =>

                    connection.branch !== null &&

                    !removedIndexes.has(connection.toIndex),

            )

            .map(

                (connection) =>

                    `${connection.fromIndex}: ${connection.branch}`,

            ),

    );

    for (const operation of operations) {

        if (

            operation.action !== "add" ||

            operation.parentIndex === null ||

            operation.branch === null

        ) {

            continue;

        }

        const parent = currentByIndex.get(operation.parentIndex);

        if (parent?.type !== "condition") {

            continue;

        }

        const key = `${operation.parentIndex}: ${operation.branch}`;

        if (occupiedConditionBranches.has(key)) {

            errors.push(

                `Condition at index ${operation.parentIndex} already has a ${operation.branch} branch.Update the existing branch step instead of adding a duplicate.`,

            );

        } else {

            occupiedConditionBranches.add(key);

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

        const parsed = await callOpenClawFunction({

            messages: [

                {

                    role: "system",

                    content: [

                        "You are an AI workflow editing assistant.",

                        "The user is chatting with you about ONE persistent workflow.",

                        "CURRENT WORKFLOW and CURRENT GRAPH are the source of truth for what exists right now.",

                        "Never rebuild or replace the whole workflow unless the user explicitly asks to start over or replace it.",

                        "Make the smallest valid edit that satisfies the latest user request and preserve every unrelated step and connection.",

                        "Never duplicate an existing step merely because the user refers to it again in conversation.",

                        "If the requested behaviour already exists, return no operations and simply tell the user it is already set up.",

                        "If the user asks a question, asks for an explanation, or is chatting without requesting a workflow change, return operations=[] and answer naturally in message.",

                        "Resolve references such as it, that, this step, the email, the wait, yes, and no from CURRENT WORKFLOW, CURRENT GRAPH, and RECENT CHAT.",

                        "For follow-up requests, edit the existing workflow incrementally.",

                        "Use update when the user changes an existing step.",

                        "Use add when the user asks to add another step or connected tool.",

                        "When the user's request contains conditional intent (for example: if, when, unless, responds, replies, does not respond, opened, clicked, bounced), represent that logic with a condition operation and explicit YES/NO branch relationships before adding the requested action.",

                        "If the user requests a step that is not listed in SUPPORTED STEP IDS, return operations=[] and explain that its workflow executor is not available yet. A connected integration alone is not sufficient. Do not pretend the workflow was changed.",

                        "Use remove when the user asks to delete a step.",

                        "Indexes refer to CURRENT WORKFLOW and are zero-based.",

                        "For update/remove operations, targetIndex must identify the existing step from CURRENT WORKFLOW.",

                        "For every add operation, operationId must be a unique short identifier so later operations can reference it.",

                        "For an added root trigger, parentIndex and parentOperationId must both be null.",

                        "For every other added step, set exactly one parent: parentIndex for an existing CURRENT WORKFLOW step, or parentOperationId for a step added earlier in this response.",

                        "parentIndex may ONLY reference an index that is explicitly listed under CURRENT WORKFLOW. Never use the position of an add operation in this response as parentIndex.",

                        "If CURRENT WORKFLOW is empty, parentIndex MUST be null for every add operation.",

                        "When chaining steps that are all being added in the same response, link them with parentOperationId. Example for Trigger -> Wait -> Action in an empty workflow: trigger operationId=op1 with parentIndex=null and parentOperationId=null; wait operationId=op2 with parentIndex=null and parentOperationId=op1; action operationId=op3 with parentIndex=null and parentOperationId=op2.",

                        "afterIndex controls display/list ordering only. It NEVER expresses workflow graph meaning.",

                        "If the semantic parent is a condition, branch MUST be YES or NO and must match the user's wording exactly.",

                        "If the semantic parent is not a condition, branch must be null.",

                        "Never infer a branch from visual position, list order, or creation order.",

                        "Preserve existing YES/NO relationships unless the user explicitly asks to change them.",

                        "Before adding to a condition branch, inspect CURRENT GRAPH. If that YES or NO branch already has a step and the user is changing what that branch does, update or remove/replace the existing branch step instead of adding a second child to the same branch.",

                        "For add operations, stepId must be one of the exact SUPPORTED STEP IDS.",

                        "When the user asks to add a contact tag, use the exact Add contact tag supported step and set actionValue to the requested tag text.",

                        "For action steps that need a user-supplied value, set actionValue to that exact value. Otherwise actionValue must be null.",

                        "If the user asks an existing step to use a connected tool, use update and set integrationStepId to the exact integration:... supported ID.",

                        "For condition changes, set condition to the exact condition text. Otherwise condition must be null.",

                        "Conditional language must create or update a condition step; never flatten an if/when/unless request into a plain sequence of actions.",

                        "For phrases such as 'if the client responds', 'if they reply', or equivalent wording, use a condition step with condition='Recipient replied' and place the requested follow-up step on the YES branch.",

                        "For phrases such as 'if they do not respond', 'if they don't reply', or equivalent wording, use a condition step with condition='Recipient did not reply' and place the requested follow-up step on the YES branch.",

                        "For 'otherwise' or 'else', attach the requested step to the NO branch of the relevant condition.",

                        "Email-event conditions are ordinary condition nodes in the current workflow model: Email was opened, Email was clicked, Recipient replied, Recipient did not reply, Email bounced.",

                        "Every email-event condition must identify the exact email step whose events it evaluates. Use sourceEmailIndex for an existing email, or sourceEmailOperationId for an email added in this response. Set the other source field to null.",

                        "The source email must occur before the condition on the workflow path. Preserve an existing sourceEmailNodeId when updating other settings of a condition.",

                        "If there is no suitable email step and the user has not asked to create one, return operations=[] and ask which email the condition should check. Never claim such a condition is executable without its source.",

                        "For delay changes, set delayValue and delayUnit. Otherwise set them to null.",

                        "Do not add duplicate triggers unless the user explicitly requests replacing the trigger.",

                        "Write the assistant message clearly, naturally, and in a polished AI-assistant style.",

                        "Do not return one dense paragraph when several workflow steps were created or changed.",

                        "Start with one short sentence explaining what you did.",

                        "For a single small edit, respond with one short natural sentence and do not restate the whole workflow.",

                        "If multiple workflow steps are involved, add a blank line and list only the steps that were created or changed, in execution order, using lines beginning with '- '.",

                        "Each workflow step should be short but informative: explain what happens and, where useful, why it happens.",

                        "When a condition exists, clearly show its outcomes on separate lines, for example '- Yes: ...' and '- No: ...'.",

                        "Use another short paragraph after the list only when there is genuinely useful information the user should know.",

                        "Do not repeat obvious information or pad the response.",

                        "Do not expose operation IDs, indexes, schema fields, raw JSON, internal implementation details, or debugging information.",

                        "Write like a helpful automation copilot speaking to a non-technical user.",

                        "Only describe workflow changes that are actually represented by the returned operations.",

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

            tool: {

                type: "function",

                function: {

                    name: "submit_workflow_edit",

                    description:

                        "Return the requested workflow edit as structured Mailgine workflow operations.",

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

                                        actionValue: {

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

                                        "actionValue",

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

                        required: [

                            "message",

                            "operations",

                        ],

                        additionalProperties: false,

                    },

                },

            },

            temperature: 0.1,

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

            currentConnections,

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

            return NextResponse.json(

                {

                    error: error.message,

                    code: error.code,

                },

                {

                    status: error.status,

                    headers: {

                        "Cache-Control": "no-store",

                    },

                },

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


