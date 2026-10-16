import OpenAI from "openai";
import { NextResponse } from "next/server";
import { requireWorkspace } from "../../../../../lib/auth/requireWorkspace";

export const runtime = "nodejs";

type SummaryRequestBody = {
    workspaceId?: unknown;
    thread?: unknown;
    message?: unknown;
};

type InboxMessageLike = {
    fromName?: unknown;
    fromEmail?: unknown;
    toName?: unknown;
    toEmail?: unknown;
    subject?: unknown;
    plainText?: unknown;
    html?: unknown;
    sentAt?: unknown;
    status?: unknown;
};

type InboxThreadLike = {
    customerName?: unknown;
    customerEmail?: unknown;
    customerCompany?: unknown;
    subject?: unknown;
    preview?: unknown;
    messages?: unknown;
};

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

function normaliseText(value: unknown, maxLength = 8_000) {
    return typeof value === "string"
        ? value.trim().slice(0, maxLength)
        : "";
}

function stripHtml(value: unknown) {
    return normaliseText(value)
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function serialiseMessage(value: unknown) {
    if (!isRecord(value)) return null;

    const message = value as InboxMessageLike;
    const plainText = normaliseText(message.plainText);
    const htmlText = stripHtml(message.html);

    return {
        fromName: normaliseText(message.fromName, 180),
        fromEmail: normaliseText(message.fromEmail, 320),
        toName: normaliseText(message.toName, 180),
        toEmail: normaliseText(message.toEmail, 320),
        subject: normaliseText(message.subject, 500),
        body: (plainText || htmlText).slice(0, 8_000),
        sentAt: normaliseText(message.sentAt, 100),
        status: normaliseText(message.status, 80),
    };
}

export async function POST(request: Request) {
    const auth = await requireWorkspace(request);
    if (auth instanceof NextResponse) return auth;

    try {
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json(
                { error: "OPENAI_API_KEY is not configured." },
                { status: 500 },
            );
        }

        const body = (await request.json()) as SummaryRequestBody;

        if (!isRecord(body.thread) || !isRecord(body.message)) {
            return NextResponse.json(
                { error: "A valid email thread and message are required." },
                { status: 400 },
            );
        }

        const thread = body.thread as InboxThreadLike;
        const selectedMessage = serialiseMessage(body.message);
        const threadMessages = Array.isArray(thread.messages)
            ? thread.messages
                .slice(-10)
                .map(serialiseMessage)
                .filter(Boolean)
            : [];

        if (!selectedMessage?.body) {
            return NextResponse.json(
                { error: "This email does not contain enough text to summarise." },
                { status: 400 },
            );
        }

        const context = {
            account: {
                name: normaliseText(thread.customerName, 180),
                email: normaliseText(thread.customerEmail, 320),
                company: normaliseText(thread.customerCompany, 180),
            },
            threadSubject: normaliseText(thread.subject, 500),
            threadPreview: normaliseText(thread.preview, 1_000),
            selectedMessage,
            recentConversation: threadMessages,
        };

        const response = await openai.responses.create({
            model:
                process.env.OPENAI_SUMMARY_MODEL ||
                process.env.OPENAI_MODEL ||
                "gpt-5-mini",
            instructions: [
                "You summarise customer emails for a B2B SaaS retention inbox.",
                "Write like a sharp human customer-success teammate, not a chatbot.",
                "Use the actual details in the email. Do not repeat the subject or pad the answer with generic wording.",
                "Keep the main summary to one or two natural sentences.",
                "Make the recommended action specific and immediately useful.",
                "Only include key details that materially affect the response, such as dates, names, money, blockers, promised actions, or questions.",
                "Do not invent facts, risks, sentiment, urgency, or next steps that are not supported by the conversation.",
                "Avoid phrases such as 'The customer is reaching out', 'This email discusses', and 'It is recommended'.",
            ].join(" "),
            input: JSON.stringify(context),
            text: {
                format: {
                    type: "json_schema",
                    name: "email_summary",
                    strict: true,
                    schema: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            summary: { type: "string" },
                            intent: { type: "string" },
                            recommendedAction: { type: "string" },
                            sentiment: {
                                type: "string",
                                enum: [
                                    "Positive",
                                    "Neutral",
                                    "Concerned",
                                    "Negative",
                                ],
                            },
                            urgency: {
                                type: "string",
                                enum: ["Low", "Normal", "High"],
                            },
                            keyDetails: {
                                type: "array",
                                items: { type: "string" },
                                maxItems: 4,
                            },
                        },
                        required: [
                            "summary",
                            "intent",
                            "recommendedAction",
                            "sentiment",
                            "urgency",
                            "keyDetails",
                        ],
                    },
                },
            },
        });

        if (!response.output_text) {
            throw new Error("OpenAI returned an empty summary.");
        }

        const summary = JSON.parse(response.output_text) as unknown;

        if (!isRecord(summary)) {
            throw new Error("OpenAI returned an invalid summary.");
        }

        return NextResponse.json({ summary });
    } catch (error) {
        console.error("AI inbox summary error", error);

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "The email summary could not be generated.",
            },
            { status: 500 },
        );
    }
}
