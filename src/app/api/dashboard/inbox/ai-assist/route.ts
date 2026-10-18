import OpenAI from "openai";
import { NextResponse } from "next/server";

import { requireWorkspace } from "../../../../../lib/auth/requireWorkspace";
import { isRecord, normaliseText, serialiseMessage, type InboxThreadLike } from "../../../../../lib/inbox-ai";
import { limitAiRequest } from "../../../../../lib/rateLimit";

export const runtime = "nodejs";

type AssistRequestBody = {
    prompt?: unknown;
    thread?: unknown;
    /** Earlier turns of this assistant chat. */
    history?: unknown;
    /** What the user has typed in the message box so far. */
    draft?: unknown;
};

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

function parseHistory(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value
        .filter(isRecord)
        .map((item) => ({
            role: item.role === "assistant" ? "assistant" : "user",
            text: normaliseText(item.text, 2_000),
        }))
        .filter((item) => item.text)
        .slice(-8);
}

/**
 * The inbox's AI assistant: answers questions about one conversation and,
 * when asked to write something, returns a draft the user can insert.
 */
export async function POST(request: Request) {
    const auth = await requireWorkspace(request);
    if (auth instanceof NextResponse) return auth;
    const limited = await limitAiRequest(auth.workspaceId);
    if (limited) return limited;

    try {
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
        }

        const body = (await request.json().catch(() => ({}))) as AssistRequestBody;
        const prompt = normaliseText(body.prompt, 2_000);
        if (!prompt) return NextResponse.json({ error: "Ask the assistant something." }, { status: 400 });
        if (!isRecord(body.thread)) return NextResponse.json({ error: "A valid conversation is required." }, { status: 400 });

        const thread = body.thread as InboxThreadLike & Record<string, unknown>;
        const conversation = Array.isArray(thread.messages)
            ? thread.messages.slice(-20).map(serialiseMessage).filter(Boolean)
            : [];

        const context = {
            channel: normaliseText(thread.channel, 30) || "email",
            contact: {
                name: normaliseText(thread.customerName, 180),
                company: normaliseText(thread.customerCompany, 180),
                title: normaliseText(thread.customerTitle, 180),
                languages: Array.isArray(thread.customerLanguages) ? thread.customerLanguages.slice(0, 5) : [],
            },
            conversation,
            currentDraft: normaliseText(body.draft, 4_000),
            assistantChat: parseHistory(body.history),
            request: prompt,
        };

        const response = await openai.responses.create({
            model: process.env.OPENAI_ASSIST_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini",
            instructions: [
                "You are an assistant inside a customer-success inbox, helping the user with ONE conversation (given as JSON).",
                "Answer the user's request using only facts from the conversation and contact details. Never invent prices, dates or promises.",
                "Keep answers short and plain: a sentence or two, or a few short bullet lines starting with '- '. No headings, no filler.",
                "When the request asks you to write, draft, rewrite, shorten, translate or improve a message to the customer, put the message itself in `draft` and keep `answer` to one short line about it.",
                "Drafts for chat channels (whatsapp, telegram, instagram, messenger) are 1-3 short, friendly sentences with no greeting line or sign-off. Drafts for email may be longer and greet the contact by first name, with no signature.",
                "If currentDraft is set and the user asks to change 'it' or 'my message', rewrite currentDraft.",
                "Otherwise set `draft` to null.",
            ].join(" "),
            input: JSON.stringify(context),
            text: {
                format: {
                    type: "json_schema",
                    name: "assistant_reply",
                    strict: true,
                    schema: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            answer: { type: "string" },
                            draft: { anyOf: [{ type: "string" }, { type: "null" }] },
                        },
                        required: ["answer", "draft"],
                    },
                },
            },
        });

        const parsed = JSON.parse(response.output_text || "{}") as { answer?: unknown; draft?: unknown };
        const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
        const draft = typeof parsed.draft === "string" && parsed.draft.trim() ? parsed.draft.trim() : null;
        if (!answer && !draft) throw new Error("The assistant did not return an answer.");

        return NextResponse.json({ answer, draft });
    } catch (error) {
        console.error("AI inbox assistant error", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "The assistant could not answer right now." },
            { status: 500 },
        );
    }
}
