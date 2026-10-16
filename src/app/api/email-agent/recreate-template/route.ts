import { NextResponse } from "next/server";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";
import { requireWorkspace } from "../../../../lib/auth/requireWorkspace";
import { limitAiRequest } from "../../../../lib/rateLimit";

export const runtime = "nodejs";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

function safeJsonParse(text: string) {
    return JSON.parse(text.replace(/```json/g, "").replace(/```/g, "").trim());
}

function getMimeType(filePath: string) {
    if (filePath.endsWith(".png")) return "image/png";
    if (filePath.endsWith(".webp")) return "image/webp";
    return "image/jpeg";
}

async function resolveImageUrl(imageUrl: string) {
    if (imageUrl.startsWith("http")) return imageUrl;

    if (imageUrl.startsWith("/")) {
        const publicPath = path.join(process.cwd(), "public", imageUrl);
        const file = await fs.readFile(publicPath);
        return `data:${getMimeType(publicPath)};base64,${file.toString("base64")}`;
    }

    return imageUrl;
}

function normalizeTemplate(template: any) {
    const subject =
        typeof template.subject === "string" && template.subject.trim()
            ? template.subject.trim()
            : "Untitled email";

    const heading =
        typeof template.heading === "string" && template.heading.trim()
            ? template.heading.trim()
            : subject;

    const body =
        typeof template.body === "string" && template.body.trim()
            ? template.body.trim()
            : "Hi {{first_name}}, here is your email content.";

    const ctaText =
        typeof template.ctaText === "string" && template.ctaText.trim()
            ? template.ctaText.trim()
            : "Continue";

    const ctaLink =
        typeof template.ctaLink === "string" && template.ctaLink.trim()
            ? template.ctaLink.trim()
            : "{{cta_link}}";

    let html =
        typeof template.html === "string" && template.html.trim()
            ? template.html.trim()
            : "";

    if (!html) {
        html = `
<div style="width:100%;background:#f7f7fb;padding:34px 0;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;padding:38px 34px;text-align:center;">
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#111827;">{{heading}}</h1>
    <p style="margin:0 auto 24px;max-width:430px;font-size:14px;line-height:1.7;color:#6b7280;white-space:pre-line;">{{body}}</p>
    <a href="{{ctaLink}}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 22px;font-size:13px;font-weight:600;">{{ctaText}}</a>
  </div>
</div>`.trim();
    }

    if (!html.includes("{{heading}}")) {
        html = html.replace(heading, "{{heading}}");
    }

    if (!html.includes("{{body}}")) {
        html = html.replace(body, "{{body}}");
    }

    if (!html.includes("{{ctaText}}")) {
        html = html.replace(ctaText, "{{ctaText}}");
    }

    if (!html.includes("{{ctaLink}}")) {
        html = html.replace(/href="[^"]*"/, `href="{{ctaLink}}"`);
    }

    return {
        subject,
        heading,
        body,
        ctaText,
        ctaLink,
        html,
    };
}

export async function POST(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;
    const limited = await limitAiRequest(auth.workspaceId);
    if (limited) return limited;

    try {
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json(
                { error: "OPENAI_API_KEY is missing" },
                { status: 500 }
            );
        }

        const body = await req.json();
        const imageUrl = body.imageUrl as string | undefined;

        if (!imageUrl) {
            return NextResponse.json(
                { error: "imageUrl is required" },
                { status: 400 }
            );
        }

        const resolvedImageUrl = await resolveImageUrl(imageUrl);

        const response = await openai.responses.create({
            model: "gpt-4.1",
            input: [
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text: `
You are recreating an email screenshot into editable email HTML.

Return ONLY valid JSON. No markdown. No explanation.

The JSON must be:
{
  "subject": "real extracted email subject",
  "heading": "real main heading text from the screenshot",
  "body": "real extracted body copy from the screenshot as plain text",
  "ctaText": "real button text from the screenshot",
  "ctaLink": "{{cta_link}}",
  "html": "complete email-safe HTML with inline CSS"
}

CRITICAL RULES:
- Extract the REAL visible content from the screenshot.
- Do NOT return "{{heading}}" as the heading value.
- Do NOT return "{{body}}" as the body value.
- Do NOT return "{{ctaText}}" as the ctaText value.
- Do NOT leave the editable fields empty.
- The user should see the original email content first, then edit it manually.
- The HTML must use placeholders only inside the HTML layout:
  {{heading}}
  {{body}}
  {{ctaText}}
  {{ctaLink}}
- The HTML must NOT hardcode the heading text.
- The HTML must NOT hardcode the body text.
- The HTML must NOT hardcode the CTA text.
- Body must be plain text only, no HTML tags.
- Use white-space:pre-line on the body area so line breaks display correctly.
- Inline CSS only.
- No JavaScript.
- Match the screenshot layout, colours, spacing, button, borders, footer, notice boxes and overall structure closely.
- Do NOT use emoji icons like ⚠️, 📧, ☎️, ⏰, 🔒, ✅.
- Use professional email-safe icons only.
- Prefer simple inline SVG icons or small circular/outlined icon shapes.
- Icons must look like the screenshot: clean, grey/blue, minimal, professional.
- Security notice icon should be a small shield/info style icon, not an emoji.
- Support icons should be simple line icons for email, phone and clock, not emojis.
- Social icons should be small neutral circles or simple letters/icons, not emojis.- If there is a logo, recreate it with simple text/image-safe HTML or a simple shape.
- If there are help/support/footer sections, include them in the HTML as fixed layout content.
- Only the main heading, main body, CTA text and CTA link should be editable placeholders.
`,
                        },
                        {
                            type: "input_image",
                            image_url: resolvedImageUrl,
                            detail: "high",
                        },
                    ],
                },
            ],
        });

        const parsedTemplate = safeJsonParse(response.output_text || "");
        const template = normalizeTemplate(parsedTemplate);

        return NextResponse.json({ template });
    } catch (error) {
        console.error("Recreate template error:", error);

        return NextResponse.json(
            { error: "Failed to recreate email template" },
            { status: 500 }
        );
    }
}