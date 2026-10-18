import { NextResponse } from "next/server";

import { AuthError, getWorkspaceFromRequest } from "../../../../lib/auth/getWorkspaceFromRequest";
import { automationConfig } from "../../../../lib/automation/config";
import {
    applyAiOperations,
    definitionFromIndexed,
    EMAIL_EVENT_CONDITIONS,
    isSupportedStep,
    parseAiOperation,
    validateOperations,
    type AiOperation,
    type AvailableStep,
} from "../../../../lib/automation/ai-edit";
import type { ConditionBranch } from "../../../../lib/automation/branches";
import { reviewWorkflowQuality } from "../../../../lib/automation/quality";
import { validateWorkflowDefinition } from "../../../../lib/automation/validation";
import type { WorkflowDefinition } from "../../../../lib/automation/types";
import { callOpenClawFunction, OpenClawError, type OpenClawChatMessage } from "../../../../lib/openclaw/client";
import { limitAiRequest } from "../../../../lib/rateLimit";
import { createNode, NODE_LIBRARY } from "../../../../lib/automation/node-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Extra model rounds allowed to fix an edit that fails the checks. */
const MAX_REPAIRS = 2;

type CurrentStep = { index: number; id: string; type: string; title: string; description: string; config: Record<string, unknown> };
type CurrentConnection = { fromIndex: number; toIndex: number; branch: ConditionBranch | null; label: string | null };
type ConversationMessage = { role: "assistant" | "user"; text: string };

const cleanText = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

function parseAvailableSteps(value: unknown): AvailableStep[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is AvailableStep =>
        isRecord(item) &&
        typeof item.id === "string" &&
        typeof item.type === "string" &&
        typeof item.title === "string" &&
        typeof item.description === "string" &&
        isSupportedStep(item as AvailableStep));
}

function parseCurrentSteps(value: unknown): CurrentStep[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is CurrentStep =>
        isRecord(item) &&
        Number.isInteger(item.index) &&
        typeof item.id === "string" &&
        typeof item.type === "string" &&
        typeof item.title === "string" &&
        typeof item.description === "string" &&
        isRecord(item.config));
}

function parseCurrentConnections(value: unknown): CurrentConnection[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is CurrentConnection =>
        isRecord(item) &&
        Number.isInteger(item.fromIndex) &&
        Number.isInteger(item.toIndex) &&
        (item.branch === null || item.branch === "YES" || item.branch === "NO") &&
        (item.label === null || typeof item.label === "string"));
}

function parseConversation(value: unknown): ConversationMessage[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ConversationMessage =>
        isRecord(item) && (item.role === "assistant" || item.role === "user") && typeof item.text === "string");
}

function jsonError(message: string, status: number, details?: string[]) {
    return NextResponse.json(
        { error: message, ...(details?.length ? { details } : {}) },
        { status, headers: { "Cache-Control": "no-store" } },
    );
}

/** Builds a step on the server the same way the builder does. */
function serverNode(stepId: string, index: number) {
    const definition = NODE_LIBRARY.find((item) => item.id === stepId);
    return definition ? createNode(definition.type, index, definition.id) : null;
}

const nullable = (type: string) => ({ anyOf: [{ type }, { type: "null" }] });
const nullableEnum = (values: string[]) => ({ anyOf: [{ type: "string", enum: values }, { type: "null" }] });

const OPERATION_FIELDS = {
    action: { type: "string", enum: ["add", "update", "remove"] },
    operationId: nullable("string"),
    targetIndex: nullable("integer"),
    afterIndex: nullable("integer"),
    parentIndex: nullable("integer"),
    parentOperationId: nullable("string"),
    branch: nullableEnum(["YES", "NO"]),
    stepId: nullable("string"),
    integrationStepId: nullable("string"),
    actionValue: nullable("string"),
    condition: nullableEnum([...EMAIL_EVENT_CONDITIONS]),
    sourceEmailIndex: nullable("integer"),
    sourceEmailOperationId: nullable("string"),
    delayValue: nullable("number"),
    delayUnit: nullableEnum(["minutes", "hours", "days"]),
    title: nullable("string"),
    subject: nullable("string"),
    body: nullable("string"),
    triggerValue: nullable("string"),
};

const EDIT_TOOL = {
    type: "function" as const,
    function: {
        name: "submit_workflow_edit",
        description: "Return the requested workflow edit as structured Mailgine workflow operations.",
        parameters: {
            type: "object",
            properties: {
                message: { type: "string" },
                operations: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: OPERATION_FIELDS,
                        required: Object.keys(OPERATION_FIELDS),
                        additionalProperties: false,
                    },
                },
            },
            required: ["message", "operations"],
            additionalProperties: false,
        },
    },
};

const EDITING_RULES = [
    "You are OpenClaw, the workflow assistant inside Mailgine. You build and edit email automation workflows that actually work and get results.",
    "The user is chatting with you about ONE persistent workflow. CURRENT WORKFLOW and CURRENT GRAPH are the source of truth for what exists right now.",
    "",
    "HOW TO EDIT",
    "- Never rebuild or replace the whole workflow unless the user asks to start over. Make the smallest edit that fully satisfies the request and keep unrelated steps.",
    "- Never duplicate a step just because the user mentions it again. If the behaviour already exists, return no operations and say so.",
    "- If the user is asking a question or chatting, return operations=[] and answer in message.",
    "- Resolve references such as it, that, the email, the wait, yes and no from CURRENT WORKFLOW, CURRENT GRAPH and RECENT CHAT.",
    "- Use update to change an existing step, add for a new step, remove to delete one.",
    "- Indexes refer to CURRENT WORKFLOW and are zero-based. update/remove use targetIndex.",
    "- Every add needs a unique short operationId. A new root trigger has no parent. Every other added step has exactly one parent: parentIndex for an existing step, or parentOperationId for a step added earlier in this response. parentIndex may only reference an index listed in CURRENT WORKFLOW.",
    "- Example for an empty workflow (Trigger -> Email -> Wait): op1 trigger with no parent; op2 email with parentOperationId=op1; op3 wait with parentOperationId=op2.",
    "- Adding a step under a parent that already has a next step inserts it between them; that is the right way to add a step in the middle.",
    "- afterIndex is display order only and never workflow meaning.",
    "- If the parent is a condition, branch MUST be YES or NO. Otherwise branch is null. A condition branch holds one step; to change it, update or replace that step.",
    "- stepId must be one of SUPPORTED STEP IDS. Set every field that does not apply to null.",
    "",
    "WRITING EMAILS",
    "- Every email you add must have a subject, a body and a short title such as \"Welcome email\" or \"Day 3 follow-up\". Never leave the starter text \"Write your email here\".",
    "- Write complete, specific plain-text copy for the user's goal: 50-150 words, short paragraphs, a greeting like \"Hi {{first_name}},\", one clear call to action, and a sign-off with {{sender_name}}.",
    "- Only these variables exist: {{first_name}}, {{customer_name}}, {{customer_company}}, {{customer_email}}, {{company_name}}, {{sender_name}}. Never invent other variables or bracket placeholders like [link] or [Name].",
    "- Subjects: under 60 characters, specific and human, no ALL CAPS, no spammy words.",
    "- Follow-ups are shorter than the first email, add something new, and refer back to the earlier email naturally. Ending with a simple question invites replies.",
    "- When the user asks to change an email's wording, update subject and/or body on that email.",
    "",
    "MAKING WORKFLOWS EFFECTIVE",
    "- Conditions are checked the moment a contact reaches them. An email-event condition must have a wait between its email and the condition (usually 2-3 days, at least 1 day), otherwise it checks before anyone could open or reply.",
    "- Put a wait of 2-4 days between emails to the same contact.",
    "- Every condition needs both a Yes and a No path or the workflow cannot be published. If the user only describes one outcome, finish the other path sensibly (usually End workflow, or a tag) and say what you chose.",
    "- Prefer \"Recipient replied\", \"Recipient did not reply\" or \"Email was clicked\" over \"Email was opened\"; many mail apps mark emails as opened automatically.",
    "- When a contact replies, stop emailing them: route replies to End workflow or a tag, never to another sales follow-up.",
    "- Keep sequences focused, usually 2-4 emails. Do not add steps the goal does not need.",
    "- Each email-event condition must name the exact email it checks: sourceEmailIndex for an existing email or sourceEmailOperationId for one added now. The email must come before the condition.",
    `- Supported conditions: ${EMAIL_EVENT_CONDITIONS.join(", ")}. For if/when/unless wording, use a condition with explicit Yes/No paths; never flatten it into a plain sequence. "Otherwise" means the No path.`,
    "- For a broad request such as \"build an onboarding workflow\", build a complete, ready-to-publish workflow with sensible defaults instead of asking questions, and mention the key assumptions briefly.",
    "",
    "TRIGGERS AND ACTIONS",
    "- Pick the trigger that matches the goal. Tag added needs triggerValue = the tag. Custom event needs triggerValue = the event name in snake_case (for example trial_ended). Renewal coming up takes triggerValue = days before renewal. Set triggerValue to null otherwise.",
    "- Events from other tools (Stripe, a CRM, the user's app) arrive as named events through the events API or Zapier: use Payment failed or Custom event and tell the user the event must be sent.",
    "- The only actions are Add contact tag (actionValue = the tag) and End workflow. If the user asks for something else (Slack messages, CRM updates and so on), return operations=[], explain it is not available yet, and suggest the closest thing that is, such as tagging the contact.",
    "- Do not add a second trigger unless the user asks to replace the trigger.",
    "",
    "YOUR REPLY",
    "- Start with one short sentence saying what you did. For a small edit, that sentence is enough.",
    "- When several steps changed, add a blank line and list them in order on lines starting with '- ', each short but informative. Show condition outcomes as '- Yes: ...' and '- No: ...'.",
    "- Never mention operation ids, indexes, field names, JSON or internal details. Write for a non-technical user, and only describe changes your operations actually make.",
].join("\n");

function describeWorkflow(steps: CurrentStep[], connections: CurrentConnection[]) {
    const workflow = steps.length === 0
        ? "(empty workflow)"
        : steps.map((step) => `${step.index}. id=${step.id} | ${step.type}: ${step.title} | config=${JSON.stringify(step.config)}`).join("\n");
    const graph = connections.length === 0
        ? "(no connections)"
        : connections.map((connection) =>
            `${connection.fromIndex} -> ${connection.toIndex}${connection.branch ? ` | branch=${connection.branch}` : ""}`).join("\n");
    return { workflow, graph };
}

type Attempt = {
    message: string;
    operations: AiOperation[];
    /** Problems that make the edit unusable. */
    blocking: string[];
    /** Publishing problems the edit introduced. */
    issues: string[];
    /** Effectiveness suggestions the edit introduced. */
    suggestions: string[];
};

/** Checks one model response by applying it to a copy of the workflow. */
function checkResponse(parsed: unknown, context: {
    definition: WorkflowDefinition;
    availableSteps: AvailableStep[];
    baseIssues: Set<string>;
    baseSuggestions: Set<string>;
}): Attempt {
    if (!isRecord(parsed) || typeof parsed.message !== "string" || !Array.isArray(parsed.operations)) {
        return { message: "", operations: [], blocking: ["Return both message and operations."], issues: [], suggestions: [] };
    }
    if (parsed.operations.length > automationConfig.aiMaxOperations) {
        return {
            message: parsed.message, operations: [], issues: [], suggestions: [],
            blocking: [`Use at most ${automationConfig.aiMaxOperations} operations.`],
        };
    }

    const operations = parsed.operations.map(parseAiOperation);
    if (operations.some((operation) => operation === null)) {
        return { message: parsed.message, operations: [], blocking: ["Some operations were malformed."], issues: [], suggestions: [] };
    }
    const valid = operations as AiOperation[];
    if (valid.length === 0) return { message: parsed.message, operations: [], blocking: [], issues: [], suggestions: [] };

    const structural = validateOperations({ operations: valid, definition: context.definition, availableSteps: context.availableSteps });
    if (structural.length) return { message: parsed.message, operations: valid, blocking: structural, issues: [], suggestions: [] };

    const applied = applyAiOperations(context.definition, valid, { createNode: serverNode });
    if (applied.errors.length) return { message: parsed.message, operations: valid, blocking: applied.errors, issues: [], suggestions: [] };

    return {
        message: parsed.message,
        operations: valid,
        blocking: [],
        issues: validateWorkflowDefinition(applied.definition).filter((issue) => !context.baseIssues.has(issue)),
        suggestions: reviewWorkflowQuality(applied.definition).filter((item) => !context.baseSuggestions.has(item)),
    };
}

export async function POST(request: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(request);
        const limited = await limitAiRequest(workspaceId);
        if (limited) return limited;

        const body: unknown = await request.json().catch(() => ({}));
        const record = isRecord(body) ? body : {};
        const prompt = cleanText(record.prompt);
        const availableSteps = parseAvailableSteps(record.availableSteps);
        const currentSteps = parseCurrentSteps(record.currentSteps);
        const currentConnections = parseCurrentConnections(record.currentConnections);
        const conversation = parseConversation(record.conversation);

        if (!prompt) return jsonError("Describe the workflow change you want.", 400);
        if (prompt.length > automationConfig.aiMaxPromptLength) {
            return jsonError(`Workflow prompt exceeds the configured ${automationConfig.aiMaxPromptLength}-character limit.`, 413);
        }
        if (availableSteps.length === 0) return jsonError("No supported workflow steps were provided.", 400);

        const definition = definitionFromIndexed(currentSteps, currentConnections);
        const baseIssues = currentSteps.length ? validateWorkflowDefinition(definition) : [];
        const baseSuggestions = reviewWorkflowQuality(definition);
        const { workflow, graph } = describeWorkflow(currentSteps, currentConnections);

        const messages: OpenClawChatMessage[] = [
            {
                role: "system",
                content: [
                    EDITING_RULES,
                    "",
                    "CURRENT WORKFLOW:",
                    workflow,
                    "",
                    "CURRENT GRAPH:",
                    graph,
                    "",
                    "OPEN ISSUES IN THE CURRENT WORKFLOW (fix them when the user asks you to fix, improve or finish the workflow):",
                    [...baseIssues, ...baseSuggestions].map((issue) => `- ${issue}`).join("\n") || "(none)",
                    "",
                    "RECENT CHAT:",
                    conversation.slice(-8).map((message) => `${message.role}: ${message.text}`).join("\n") || "(no earlier chat)",
                    "",
                    "SUPPORTED STEP IDS:",
                    availableSteps.map((step) => `- ${step.id} | ${step.type}: ${step.title} — ${step.description}`).join("\n"),
                ].join("\n"),
            },
            { role: "user", content: prompt },
        ];

        const context = { definition, availableSteps, baseIssues: new Set(baseIssues), baseSuggestions: new Set(baseSuggestions) };
        let best: Attempt | null = null;

        for (let round = 0; round <= MAX_REPAIRS; round += 1) {
            const parsed = await callOpenClawFunction({ messages, tool: EDIT_TOOL, temperature: round === 0 ? 0.2 : 0.1 });
            const attempt = checkResponse(parsed, context);

            // Keep the most usable answer: no blocking problems first, then fewest issues.
            const score = (item: Attempt) => item.blocking.length * 100 + item.issues.length * 10 + item.suggestions.length;
            if (!best || score(attempt) < score(best)) best = attempt;

            const problems = [...attempt.blocking, ...attempt.issues, ...attempt.suggestions];
            if (problems.length === 0) break;

            messages.push(
                { role: "assistant", content: JSON.stringify({ message: attempt.message, operations: attempt.operations }) },
                {
                    role: "user",
                    content: [
                        "That edit was checked by applying it to the CURRENT WORKFLOW and it has these problems:",
                        ...problems.map((problem) => `- ${problem}`),
                        "",
                        "Return a corrected, complete edit relative to the CURRENT WORKFLOW (not on top of your previous answer) that still does what I asked and fixes every problem. Update the message to match.",
                    ].join("\n"),
                },
            );
        }

        if (!best || best.blocking.length) {
            return jsonError(
                "I couldn't turn that into a valid workflow change. Try rephrasing it, or describe one change at a time.",
                502,
                best?.blocking,
            );
        }

        const message = best.issues.length
            ? `${best.message}\n\nStill to finish before publishing:\n${best.issues.map((issue) => `- ${issue}`).join("\n")}`
            : best.message;

        return NextResponse.json(
            { message, operations: best.operations },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        if (error instanceof AuthError) return jsonError(error.message, error.status);
        if (error instanceof OpenClawError) {
            return NextResponse.json(
                { error: error.message, code: error.code },
                { status: error.status, headers: { "Cache-Control": "no-store" } },
            );
        }
        console.error("automation-builder error", error);
        return jsonError("Unable to update the workflow right now.", 500);
    }
}
