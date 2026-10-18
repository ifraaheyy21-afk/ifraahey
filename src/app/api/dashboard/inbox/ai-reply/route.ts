import OpenAI from "openai";
import { NextResponse } from "next/server";

import { requireWorkspace } from "../../../../../lib/auth/requireWorkspace";
import { isRecord, normaliseText, serialiseMessage, type InboxThreadLike } from "../../../../../lib/inbox-ai";
import { limitAiRequest } from "../../../../../lib/rateLimit";

export const runtime = "nodejs";

type ReplyRequestBody = {
    instruction?: unknown;
    thread?: unknown;
};

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/** Drafts a reply to an inbox thread, following the user's instruction. */
export async function POST(request: Request) {
    const auth = await requireWorkspace(request);
    if (auth instanceof NextResponse) return auth;
    const limited = await limitAiRequest(auth.workspaceId);
    if (limited) return limited;

    try {
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
        }

        const body = (await request.json().catch(() => ({}))) as ReplyRequestBody;
        const instruction = normaliseText(body.instruction, 2_000);
        if (!instruction) {
            return NextResponse.json({ error: "Say what the reply should do." }, { status: 400 });
        }
        if (!isRecord(body.thread)) {
            return NextResponse.json({ error: "A valid email thread is required." }, { status: 400 });
        }

        const thread = body.thread as InboxThreadLike;
        const conversation = Array.isArray(thread.messages)
            ? thread.messages.slice(-10).map(serialiseMessage).filter(Boolean)
            : [];
        if (conversation.length === 0) {
            return NextResponse.json({ error: "This conversation has no messages to reply to." }, { status: 400 });
        }

        const channel = normaliseText(thread.channel, 30) || "email";
        const context = {
            channel,
            contact: {
                name: normaliseText(thread.customerName, 180),
                email: normaliseText(thread.customerEmail, 320),
                company: normaliseText(thread.customerCompany, 180),
            },
            subject: normaliseText(thread.subject, 500),
            conversation,
            instruction,
        };

        const response = await openai.responses.create({
            model: process.env.OPENAI_REPLY_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini",
            instructions: [
                "You draft email replies for a B2B SaaS customer-success team.",
                "Follow the user's instruction exactly; it decides what the reply says.",
                "Reply to the latest message in the conversation, using its real details (names, dates, questions). Answer every question it asks.",
                "Write like a thoughtful person: warm, direct, no filler, no emojis, no subject line.",
                "Keep it short unless the instruction asks for detail: usually 3-6 sentences in short paragraphs.",
                channel === "email"
                    ? "Greet the contact by first name. End with a clear next step. Do not add a signature; the app adds one."
                    : "This is a chat message, not an email: 1-3 short sentences, friendly and direct, no greeting line, no sign-off.",
                "Never invent facts, prices, dates or promises that are not in the conversation or the instruction.",
                "Return only the email text.",
            ].join(" "),
            input: JSON.stringify(context),
        });

        const reply = response.output_text?.trim();
        if (!reply) throw new Error("The AI did not return a reply.");

        return NextResponse.json({ reply });
    } catch (error) {
        console.error("AI inbox reply error", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "The AI reply could not be generated." },
            { status: 500 },
        );
    }
}
