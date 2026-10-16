import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireWorkspace } from "../../../../lib/auth/requireWorkspace";
import { limitAiRequest } from "../../../../lib/rateLimit";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;
    const limited = await limitAiRequest(auth.workspaceId);
    if (limited) return limited;

    try {
        const body = await req.json();

        const customer = body.customer;
        const email = body.email;
        const replyPreview = body.replyPreview || "";

        if (!customer || !email) {
            return NextResponse.json(
                { error: "Customer and email are required." },
                { status: 400 },
            );
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
                {
                    role: "system",
                    content:
                        "You are an AI customer success email agent. Write short, warm, human B2B SaaS retention replies. Do not sound robotic. Do not use emojis. Return only the reply text.",
                },
                {
                    role: "user",
                    content: `
Write a reply or follow-up email.

Customer:
${JSON.stringify(customer, null, 2)}

Original email:
${JSON.stringify(email, null, 2)}

Customer reply, if any:
${replyPreview || "No customer reply yet."}

Rules:
- Keep it short
- Sound human
- Mention the customer's company naturally
- Help the customer get value
- End with a simple next step
`,
                },
            ],
            temperature: 0.5,
        });

        const reply = completion.choices[0]?.message?.content?.trim();

        if (!reply) {
            return NextResponse.json(
                { error: "AI did not return a reply." },
                { status: 500 },
            );
        }

        return NextResponse.json({ reply });
    } catch (error) {
        console.error("Generate reply error:", error);

        return NextResponse.json(
            { error: "Something went wrong generating the reply." },
            { status: 500 },
        );
    }
}