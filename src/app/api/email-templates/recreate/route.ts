import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

type RecreatedEmailTemplate = {
    subject: string;
    editable: {
        eyebrow?: string;
        heading: string;
        body: string;
        ctaText: string;
    };
    lockedDesign: {
        backgroundColor: string;
        cardColor: string;
        textColor: string;
        mutedTextColor: string;
        buttonColor: string;
        buttonTextColor: string;
        fontFamily: string;
        borderRadius: string;
        spacing: "compact" | "medium" | "spacious";
        alignment: "left" | "center";
    };
    html: string;
};

function safeJsonParse(text: string): RecreatedEmailTemplate {
    const cleaned = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

    return JSON.parse(cleaned);
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const imageUrl = body.imageUrl as string | undefined;

        if (!imageUrl) {
            return NextResponse.json(
                { error: "imageUrl is required" },
                { status: 400 }
            );
        }

        const response = await openai.responses.create({
            model: "gpt-4.1",
            input: [
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text: `
You are an expert email designer.

Analyse this email screenshot and recreate it as an editable HTML email template.

Rules:
- Match the design as closely as possible.
- Preserve colours, spacing, button style, card shape, font feeling, icons, dividers, layout, and visual hierarchy.
- Do NOT make a Canva editor.
- The design must be locked.
- Only messaging should be editable.
- Replace the original copy with reusable editable fields.
- Return ONLY valid JSON.
- No markdown.

Return this exact JSON shape:

{
  "subject": "string",
  "editable": {
    "eyebrow": "string optional",
    "heading": "string",
    "body": "string",
    "ctaText": "string"
  },
  "lockedDesign": {
    "backgroundColor": "hex",
    "cardColor": "hex",
    "textColor": "hex",
    "mutedTextColor": "hex",
    "buttonColor": "hex",
    "buttonTextColor": "hex",
    "fontFamily": "string",
    "borderRadius": "string",
    "spacing": "compact | medium | spacious",
    "alignment": "left | center"
  },
  "html": "complete editable email html using {{eyebrow}}, {{heading}}, {{body}}, {{ctaText}} placeholders"
}

Important:
- Use inline CSS only inside the html.
- Keep the HTML email-safe.
- Use emoji or simple HTML icons only if the screenshot uses icons.
- Do not include JavaScript.
`,
                        },
                        {
                            type: "input_image",
                            image_url: imageUrl,
                            detail: "auto",
                        },
                    ],
                },
            ],
        });

        
        const text = response.output_text;

        if (!text) {
            return NextResponse.json(
                { error: "No template was generated" },
                { status: 500 }
            );
        }

        const template = safeJsonParse(text);

        return NextResponse.json({ template });
    } catch (error) {
        console.error("Template recreation error:", error);

        return NextResponse.json(
            { error: "Failed to recreate email template" },
            { status: 500 }
        );
    }
}