import { NextResponse } from "next/server";
import { openai } from "../../../../lib/openai";
import { requireWorkspace } from "../../../../lib/auth/requireWorkspace";

function safeJsonParse(text: string) {
    try {
        return JSON.parse(text.replace(/```json/g, "").replace(/```/g, "").trim());
    } catch {
        return null;
    }
}

export async function POST(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const body = await req.json();

        const currentEmail = body.currentEmail;
        const prompt = body.prompt || "";

        const brandProfile = body.brandProfile || {};
        const companyName = brandProfile.companyName || "{{company_name}}";
        const website = brandProfile.website || "";
        const companyDescription = brandProfile.companyDescription || "";
        const idealCustomer = brandProfile.idealCustomer || "";
        const guidelines = Array.isArray(brandProfile.guidelines)
            ? brandProfile.guidelines
            : [];

        if (!currentEmail) {
            return NextResponse.json({ error: "currentEmail is required" }, { status: 400 });
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
Rewrite ONLY the copy fields.

Do NOT create HTML.
Do NOT redesign the email.
Do NOT change the template layout.
Do NOT add HTML tags.
Do NOT change the CTA link unless requested.
Do NOT invent a fake company name.
Do NOT use any company name except the Brand Profile company name.

Brand Profile:
Company name: ${companyName}
Website: ${website}
Company description: ${companyDescription}
Ideal customer: ${idealCustomer}

User instruction:
${prompt}

Guidelines:
${guidelines.length ? guidelines.map((g: string) => `- ${g}`).join("\n") : "- Keep it short and clear."}

Current email:
${JSON.stringify(currentEmail, null, 2)}

Return ONLY valid JSON:
{
  "subject": "string",
  "heading": "string",
  "body": "plain text only",
  "ctaText": "string",
  "ctaLink": "string"
}

Rules:
- Always write for the company in the Brand Profile.
- Use the company name naturally where relevant.
- Use the company description to understand what the business does.
- Write for the ideal customer listed in the Brand Profile.
- Keep the email purpose the same.
- Keep placeholders like {{first_name}}, {{company_name}}, {{cta_link}}.
- Never replace {{first_name}} with a real name.
- Never replace {{cta_link}} with a real link unless requested.
- Body must match exactly what should appear in the preview.
`,
                        },
                    ],
                },
            ],
        });

        const generated = safeJsonParse(response.output_text || "");

        if (!generated) {
            return NextResponse.json({ error: "Invalid AI response" }, { status: 500 });
        }

        return NextResponse.json({
            subject: generated.subject || currentEmail.subject,
            heading: generated.heading || currentEmail.heading,
            body: generated.body || currentEmail.body,
            ctaText: generated.ctaText || currentEmail.ctaText,
            ctaLink: generated.ctaLink || currentEmail.ctaLink || "{{cta_link}}",
        });
    } catch (error) {
        console.error("Generate copy error:", error);

        return NextResponse.json(
            { error: "Failed to generate personalised copy" },
            { status: 500 }
        );
    }
}