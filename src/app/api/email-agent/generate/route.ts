import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { openai } from "../../../../lib/openai";
import { Prisma } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import { requireWorkspace } from "../../../../lib/auth/requireWorkspace";
import { limitAiRequest } from "../../../../lib/rateLimit";

function safeJsonParse(text: string) {
    const cleaned = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

    try {
        return JSON.parse(cleaned);
    } catch {
        return null;
    }
}

function getRawProfile(profile: { rawProfile: Prisma.JsonValue } | null) {
    if (
        profile?.rawProfile &&
        typeof profile.rawProfile === "object" &&
        !Array.isArray(profile.rawProfile)
    ) {
        return profile.rawProfile as Record<string, unknown>;
    }

    return {};
}

function stripHtml(html: string) {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function fallbackHtml(subject: string) {
    return `
<div style="width:100%;background:#f7f7fb;padding:36px 0;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;padding:42px 34px;text-align:center;">
    <div style="font-size:42px;line-height:1;margin-bottom:18px;">🚀</div>
    <h1 style="margin:0 0 10px;font-size:24px;line-height:1.25;color:#111827;">${subject}</h1>
    <p style="margin:0 auto 24px;max-width:420px;font-size:14px;line-height:1.7;color:#6b7280;">
      Hi {{first_name}}, here is a quick personalised update for you.
    </p>
    <a href="{{cta_link}}" style="display:inline-block;background:#5b4df7;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 22px;font-size:13px;font-weight:600;">
      Explore now
    </a>
    <p style="margin:28px 0 0;font-size:11px;line-height:1.6;color:#9ca3af;">
      <a href="{{unsubscribe_link}}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
    </p>
  </div>
</div>
`.trim();
}

async function getImageUrlForOpenAI(sampleImageUrl?: string) {
    try {
        if (!sampleImageUrl) return null;

        if (sampleImageUrl.startsWith("http")) {
            return sampleImageUrl;
        }

        if (sampleImageUrl.startsWith("/")) {
            const cleanPath = sampleImageUrl.replace(/^\//, "");
            const publicPath = path.join(process.cwd(), "public", cleanPath);

            const fileBuffer = await fs.readFile(publicPath);
            const ext = path.extname(sampleImageUrl).toLowerCase();

            const mimeType =
                ext === ".png"
                    ? "image/png"
                    : ext === ".webp"
                        ? "image/webp"
                        : "image/jpeg";

            return `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
        }

        return null;
    } catch (error) {
        console.error("Could not read sample image:", sampleImageUrl, error);
        return null;
    }
}

export async function POST(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;
    const limited = await limitAiRequest(auth.workspaceId);
    if (limited) return limited;

    const body = await req.json();

    const { workspaceId } = auth;
    const emailType = body.emailType || "Personalised email";
    const subject = body.subject || "Just checking in";
    const prompt = body.prompt || "";
    const companyName = body.companyName || "your company";
    const guidelines = Array.isArray(body.guidelines) ? body.guidelines : [];
    const sampleImageUrl = body.sampleImageUrl as string | undefined;

    const shouldSaveScheduledEmail = body.saveScheduledEmail === true;
    const customerId = body.customerId as string | undefined;
    const scheduledFor = body.scheduledFor as string | undefined;

    if (!workspaceId) {
        return NextResponse.json(
            { error: "workspaceId is required" },
            { status: 400 }
        );
    }

    if (shouldSaveScheduledEmail && (!customerId || !scheduledFor)) {
        return NextResponse.json(
            { error: "customerId and scheduledFor are required to schedule email" },
            { status: 400 }
        );
    }

    try {
        const profile = await prisma.brandEmailProfile.findFirst({
            where: { workspaceId },
            orderBy: { createdAt: "desc" },
        });

        const rawProfile = getRawProfile(profile);
        const imageUrl = await getImageUrlForOpenAI(sampleImageUrl);

        const response = await openai.responses.create({
            model: "gpt-5",
            input: [
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text" as const,
                            text: `
Recreate the uploaded email screenshot as closely as possible in editable HTML.

Company: ${companyName}
Email type: ${emailType}
Subject: ${subject}

Instructions:
${prompt || "Create a clean editable email based on the image style."}

Guidelines:
${guidelines.length
                                    ? guidelines.map((item: string) => `- ${item}`).join("\n")
                                    : "- Keep it clean and professional."
                                }

Learned profile:
${JSON.stringify(rawProfile, null, 2)}

Return ONLY JSON:
{
  "subject": "exact subject",
  "html": "full editable HTML email with inline CSS",
  "plainText": "plain text version"
}

Rules:
- Match the uploaded screenshot closely.
- Use inline CSS only.
- No markdown.
- No scripts.
- Use placeholders {{first_name}}, {{cta_link}}, {{unsubscribe_link}}.
`,
                        },
                        ...(imageUrl
                            ? [
                                {
                                    type: "input_image" as const,
                                    image_url: imageUrl,
                                    detail: "high" as const,
                                },
                            ]
                            : []),
                    ],
                },
            ],
        });

        const generated = safeJsonParse(response.output_text || "");

        const finalSubject = generated?.subject || subject;
        const finalHtml = generated?.html || fallbackHtml(subject);
        const finalPlainText = generated?.plainText || stripHtml(finalHtml);
        const fallback = !generated?.html;

        let scheduledEmail = null;

      if (shouldSaveScheduledEmail && customerId && scheduledFor) {
    scheduledEmail = await prisma.scheduledEmail.create({
        data: {
            workspaceId,
            customerId,
            emailType,
            subject: finalSubject,
            html: finalHtml,
            plainText: finalPlainText,
            scheduledFor: new Date(scheduledFor),
            status: "scheduled",
        },
    });
}

        return NextResponse.json({
            subject: finalSubject,
            html: finalHtml,
            plainText: finalPlainText,
            fallback,
            scheduledEmail,
        });
    } catch (error) {
        console.error("Generate email error:", error);

        const html = fallbackHtml(subject);
        const plainText = stripHtml(html);

        return NextResponse.json({
            subject,
            html,
            plainText,
            fallback: true,
            scheduledEmail: null,
        });
    }
}