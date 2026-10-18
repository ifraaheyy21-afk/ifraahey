import OpenAI from "openai";
import { NextResponse } from "next/server";
import { requireWorkspace } from "../../../../../lib/auth/requireWorkspace";
import { limitAiRequest } from "../../../../../lib/rateLimit";
import { isRecord, normaliseText, serialiseMessage, type InboxThreadLike } from "../../../../../lib/inbox-ai";

export const runtime = "nodejs";

type SummaryRequestBody = {
    workspaceId?: unknown;
    thread?: unknown;
    message?: unknown;
};

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});


export async function POST(request: Request) {
    const auth = await requireWorkspace(request);
    if (auth instanceof NextResponse) return auth;
    const limited = await limitAiRequest(auth.workspaceId);
    if (limited) return limited;

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
            channel: normaliseText(thread.channel, 30) || "email",
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
                "You summarise customer conversations for a B2B SaaS retention inbox. The channel field says whether it is an email thread or a chat (WhatsApp, Telegram, Instagram, Messenger); for chats, summarise the whole recent conversation, not just the last message.",
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
