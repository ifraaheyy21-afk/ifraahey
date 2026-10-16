import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/prisma";
import { openai } from "../../../../lib/openai";
import { buildEmailStyleAnalysisPrompt } from "../../../../lib/emailStylePrompt";
import { requireWorkspace } from "../../../../lib/auth/requireWorkspace";
import { limitAiRequest } from "../../../../lib/rateLimit";

type AnalysedProfile = {
    logoStyle?: string;
    primaryColor?: string;
    secondaryColor?: string;
    backgroundColor?: string;
    fontFamily?: string;
    layoutStyle?: string;
    buttonStyle?: Prisma.InputJsonValue;
    emojiStyle?: string;
    iconStyle?: string;
    headerStyle?: string;
    footerStyle?: string;
    tone?: string;
    spacing?: string;
    contentPattern?: string;
    ctaPattern?: string;
    recommendedEmailTypes?: Prisma.InputJsonValue;
};

function safeJsonParse(text: string): AnalysedProfile {
    const cleaned = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

    try {
        return JSON.parse(cleaned) as AnalysedProfile;
    } catch {
        return {};
    }
}

function toJsonObject(value: AnalysedProfile): Prisma.InputJsonObject {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

export async function POST(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;
    const limited = await limitAiRequest(auth.workspaceId);
    if (limited) return limited;

    try {
        const { workspaceId } = auth;

        if (!workspaceId) {
            return NextResponse.json(
                { error: "workspaceId is required" },
                { status: 400 }
            );
        }

        const samples = await prisma.emailSample.findMany({
            where: { workspaceId },
            orderBy: { createdAt: "desc" },
            take: 8,
        });

        if (samples.length === 0) {
            return NextResponse.json(
                { error: "Upload at least one email sample first." },
                { status: 400 }
            );
        }

        const response = await openai.responses.create({
            model: "gpt-5",
            input: [
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text: buildEmailStyleAnalysisPrompt(),
                        },
                        ...samples.map((sample) => ({
                            type: "input_image" as const,
                            image_url: sample.imageUrl,
                            detail: "high" as const,
                        })),
                    ],
                },
            ],
        });

        const analysed = safeJsonParse(response.output_text);
        const rawProfile = toJsonObject(analysed);

        const profile = await prisma.brandEmailProfile.create({
            data: {
                workspaceId,
                logoStyle: analysed.logoStyle ?? null,
                primaryColor: analysed.primaryColor ?? null,
                secondaryColor: analysed.secondaryColor ?? null,
                backgroundColor: analysed.backgroundColor ?? null,
                fontFamily: analysed.fontFamily ?? null,
                layoutStyle: analysed.layoutStyle ?? null,
                buttonStyle: analysed.buttonStyle ?? undefined,
                emojiStyle: analysed.emojiStyle ?? null,
                iconStyle: analysed.iconStyle ?? null,
                headerStyle: analysed.headerStyle ?? null,
                footerStyle: analysed.footerStyle ?? null,
                tone: analysed.tone ?? null,
                spacing: analysed.spacing ?? null,
                contentPattern: analysed.contentPattern ?? null,
                ctaPattern: analysed.ctaPattern ?? null,
                recommendedEmailTypes: analysed.recommendedEmailTypes ?? undefined,
                rawProfile,
            },
        });

        return NextResponse.json({ profile });
    } catch (error) {
        console.error("Analyse samples error:", error);

        return NextResponse.json(
            { error: "Failed to analyse email samples." },
            { status: 500 }
        );
    }
}