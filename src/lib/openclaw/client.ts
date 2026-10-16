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

type OpenClawChatResponse = {
    choices?: Array<{
        finish_reason?: string | null;
        message?: {
            content?: string | null;
        };
    }>;
    error?: {
        message?: string;
        type?: string;
        code?: string;
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

function cleanBaseUrl(value: string) {
    return value.replace(/\/+$/, "");
}

function getOpenClawConfig() {
    const baseUrl = cleanBaseUrl(
        process.env.OPENCLAW_BASE_URL?.trim() ||
        "http://127.0.0.1:18789",
    );

    const token =
        process.env.OPENCLAW_GATEWAY_TOKEN?.trim();

    const agentId =
        process.env.OPENCLAW_AGENT_ID?.trim() ||
        "main";

    const timeoutMs = Number(
        process.env.OPENCLAW_REQUEST_TIMEOUT_MS ||
        "90000",
    );

    if (!token) {
        throw new OpenClawError(
            "OPENCLAW_GATEWAY_TOKEN is not configured.",
            500,
            "OPENCLAW_NOT_CONFIGURED",
        );
    }

    if (
        !Number.isFinite(timeoutMs) ||
        timeoutMs < 1000
    ) {
        throw new OpenClawError(
            "OPENCLAW_REQUEST_TIMEOUT_MS must be at least 1000 milliseconds.",
            500,
            "OPENCLAW_INVALID_CONFIG",
        );
    }

    return {
        baseUrl,
        token,
        agentId,
        timeoutMs,
    };
}

function stripCodeFence(value: string) {
    const trimmed = value.trim();

    if (
        trimmed.startsWith("```") &&
        trimmed.endsWith("```")
    ) {
        return trimmed
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, "")
            .trim();
    }

    return trimmed;
}

export async function callOpenClawFunction({
    messages,
    tool,
}: {
    messages: OpenClawChatMessage[];
    tool: OpenClawFunctionTool;
    temperature?: number;
}) {
    const {
        baseUrl,
        token,
        agentId,
        timeoutMs,
    } = getOpenClawConfig();

    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () => controller.abort(),
            timeoutMs,
        );

    try {
        const schemaInstruction: OpenClawChatMessage = {
            role: "developer",
            content: [
                "Return ONLY one valid JSON object.",
                "Do not use markdown outside JSON string values.",
                "Do not wrap the JSON in code fences.",
                "Do not explain your answer outside the JSON.",

                "USER-FACING RESPONSE STYLE:",
                "If the schema includes an assistantMessage, message, summary, or similar user-facing field, write it like a polished AI assistant.",
                "Use clear, natural language rather than one dense paragraph.",
                "Begin with one short sentence explaining what was completed or changed.",
                "When several workflow steps are involved, add a blank line and list the important steps using lines beginning with '- '.",
                "Keep workflow steps in execution order.",
                "Make each step short but informative.",
                "For conditions, put the Yes and No outcomes on separate lines.",
                "Example:",
                "I’ve created the workflow and connected the steps.",
                "",
                "- New contact added — starts the workflow.",
                "- Send welcome email — sends the first email.",
                "- Wait 2 days — pauses before checking engagement.",
                "- Check reply status — checks whether the recipient replied.",
                "- Yes: mark the contact as Engaged.",
                "- No: send a follow-up email.",
                "",
                "Do not mention operation IDs, indexes, schemas, internal tool names, raw JSON, implementation details, or debugging information in normal success messages.",
                "Do not add unnecessary filler.",
                "Only describe actions that were actually completed.",
                "",
                "The JSON must satisfy this schema exactly:",
                JSON.stringify(tool.function.parameters),
            ].join("\n"),
        };

        const response =
            await fetch(
                `${baseUrl}/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        Authorization:
                            `Bearer ${token}`,
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        model:
                            `openclaw/${agentId}`,
                        stream:
                            false,
                        messages: [
                            schemaInstruction,
                            ...messages,
                        ],
                    }),
                    cache:
                        "no-store",
                    signal:
                        controller.signal,
                },
            );

        let payload:
            OpenClawChatResponse | null =
            null;

        try {
            payload =
                await response.json() as
                OpenClawChatResponse;
        } catch {
            payload =
                null;
        }

        if (!response.ok) {
            const gatewayMessage =
                payload?.error?.message?.trim();

            throw new OpenClawError(
                gatewayMessage ||
                `OpenClaw returned HTTP ${response.status}.`,
                response.status >= 500
                    ? 502
                    : response.status,
                "OPENCLAW_HTTP_ERROR",
            );
        }

        const content =
            payload?.choices?.[0]
                ?.message?.content;

        if (
            !content ||
            !content.trim()
        ) {
            throw new OpenClawError(
                "OpenClaw returned an empty workflow response.",
                502,
                "OPENCLAW_EMPTY_RESPONSE",
            );
        }

        const jsonText =
            stripCodeFence(content);

        try {
            return JSON.parse(
                jsonText,
            ) as unknown;
        } catch {
            console.error(
                "[OpenClaw invalid JSON response]",
                content,
            );

            throw new OpenClawError(
                "OpenClaw returned invalid workflow JSON.",
                502,
                "OPENCLAW_INVALID_JSON",
            );
        }
    } catch (error) {
        if (
            error instanceof OpenClawError
        ) {
            throw error;
        }

        if (
            error instanceof Error &&
            error.name === "AbortError"
        ) {
            throw new OpenClawError(
                "OpenClaw timed out while building the workflow.",
                504,
                "OPENCLAW_TIMEOUT",
            );
        }

        console.error(
            "[OpenClaw unexpected error]",
            error,
        );

        throw new OpenClawError(
            "Unable to reach the OpenClaw Gateway.",
            503,
            "OPENCLAW_UNAVAILABLE",
        );
    } finally {
        clearTimeout(timeout);
    }
}
