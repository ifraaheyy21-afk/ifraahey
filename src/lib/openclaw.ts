import OpenAI from "openai";

export type OpenClawChatMessage = {
    role: "system" | "developer" | "user" | "assistant";
    content: string;
};

export type OpenClawFunctionTool = {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters: Record<string, unknown>;
    };
};

export class OpenClawError extends Error {
    status: number;
    code: string;

    constructor(
        message: string,
        status = 502,
        code = "OPENCLAW_ERROR",
    ) {
        super(message);
        this.name = "OpenClawError";
        this.status = status;
        this.code = code;
    }
}

function getWorkflowAiConfig() {
    const apiKey =
        process.env.OPENAI_API_KEY?.trim();

    const model =
        process.env.WORKFLOW_AI_MODEL?.trim() ||
        "gpt-5.6-sol";

    const timeoutMs =
        Number(
            process.env.WORKFLOW_AI_TIMEOUT_MS ||
                "90000",
        );

    if (!apiKey) {
        throw new OpenClawError(
            "OPENAI_API_KEY is not configured.",
            500,
            "WORKFLOW_AI_NOT_CONFIGURED",
        );
    }

    if (
        !Number.isFinite(timeoutMs) ||
        timeoutMs < 1000
    ) {
        throw new OpenClawError(
            "WORKFLOW_AI_TIMEOUT_MS must be at least 1000 milliseconds.",
            500,
            "WORKFLOW_AI_INVALID_CONFIG",
        );
    }

    return {
        apiKey,
        model,
        timeoutMs,
    };
}

function normaliseMessages(
    messages: OpenClawChatMessage[],
) {
    return messages.map((message) => ({
        role: message.role,
        content: message.content,
    }));
}

const WORKFLOW_RESPONSE_STYLE: OpenClawChatMessage = {
    role: "developer",
    content: [
        "Keep any user-facing workflow message concise and easy to scan.",
        "If the tool schema includes an assistantMessage, message, summary, or similar user-facing text field, format it naturally.",
        "Use a short opening sentence, then bullet lines beginning with '- ' for workflow steps, conditions, actions, or outcomes when a list improves clarity.",
        "Do not put every sentence in a bullet.",
        "When a condition exists, clearly state the Yes and No outcomes.",
        "Keep workflow steps in execution order.",
        "Do not expose internal tool names, raw JSON, implementation details, or debugging language in normal success messages.",
        "If something genuinely fails, explain the failure briefly and clearly.",
    ].join("\n"),
};

/**
 * Kept under the existing function name intentionally so the
 * automation-builder route does not need a large refactor.
 *
 * OpenClaw remains available elsewhere in Mailgine, but workflow
 * mutation uses OpenAI directly because the OpenClaw gateway's
 * required/pinned client-tool path failed our isolated tests.
 */
export async function callOpenClawFunction({
    messages,
    tool,
    temperature = 0.1,
}: {
    messages: OpenClawChatMessage[];
    tool: OpenClawFunctionTool;
    temperature?: number;
}) {
    const {
        apiKey,
        model,
        timeoutMs,
    } = getWorkflowAiConfig();

    const client = new OpenAI({
        apiKey,
        timeout: timeoutMs,
        maxRetries: 2,
    });

    try {
        const response =
            await client.responses.create({
                model,
                input: normaliseMessages([
                    WORKFLOW_RESPONSE_STYLE,
                    ...messages,
                ]),
                tools: [
                    {
                        type: "function",
                        name:
                            tool.function.name,
                        description:
                            tool.function.description,
                        parameters:
                            tool.function.parameters,
                        strict: true,
                    },
                ],
                tool_choice: {
                    type: "function",
                    name:
                        tool.function.name,
                },
                parallel_tool_calls: false,
            });

        const matchingCall =
            response.output.find(
                (
                    item,
                ): item is Extract<
                    typeof item,
                    {
                        type: "function_call";
                    }
                > =>
                    item.type ===
                        "function_call" &&
                    item.name ===
                        tool.function.name,
            );

        if (!matchingCall) {
            throw new OpenClawError(
                "The workflow AI did not return the required workflow operation tool call.",
                502,
                "WORKFLOW_AI_MISSING_TOOL_CALL",
            );
        }

        if (
            !matchingCall.arguments ||
            !matchingCall.arguments.trim()
        ) {
            throw new OpenClawError(
                "The workflow AI returned an empty workflow operation.",
                502,
                "WORKFLOW_AI_EMPTY_TOOL_ARGUMENTS",
            );
        }

        try {
            return JSON.parse(
                matchingCall.arguments,
            ) as unknown;
        } catch {
            throw new OpenClawError(
                "The workflow AI returned malformed workflow operation arguments.",
                502,
                "WORKFLOW_AI_INVALID_TOOL_ARGUMENTS",
            );
        }
    } catch (error) {
        if (
            error instanceof OpenClawError
        ) {
            throw error;
        }

        if (
            error instanceof OpenAI.APIConnectionTimeoutError
        ) {
            throw new OpenClawError(
                "The workflow AI timed out while building the workflow.",
                504,
                "WORKFLOW_AI_TIMEOUT",
            );
        }

        if (
            error instanceof OpenAI.APIConnectionError
        ) {
            throw new OpenClawError(
                "Unable to reach the workflow AI service.",
                503,
                "WORKFLOW_AI_UNAVAILABLE",
            );
        }

        if (
            error instanceof OpenAI.APIError
        ) {
            const status =
                typeof error.status === "number"
                    ? error.status
                    : 502;

            const safeStatus =
                status >= 500
                    ? 502
                    : status;

            console.error(
                "[Workflow AI]",
                error.status,
                error.name,
                error.message,
            );

            throw new OpenClawError(
                "The workflow AI request failed.",
                safeStatus,
                "WORKFLOW_AI_API_ERROR",
            );
        }

        console.error(
            "[Workflow AI unexpected error]",
            error,
        );

        throw new OpenClawError(
            "The workflow AI request failed unexpectedly.",
            502,
            "WORKFLOW_AI_ERROR",
        );
    }
}
