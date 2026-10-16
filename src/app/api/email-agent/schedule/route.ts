import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const {
            workspaceId,
            customerId,
            generatedEmailId,
            emailType,
            subject,
            html,
            plainText,
            scheduledFor,
        } = body;

        if (!workspaceId || !customerId || !emailType || !subject || !scheduledFor) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        let finalHtml = html;
        let finalPlainText = plainText || null;

        if (generatedEmailId) {
            const generatedEmail = await prisma.generatedEmail.findFirst({
                where: {
                    id: generatedEmailId,
                    workspaceId,
                },
                select: {
                    html: true,
                    plainText: true,
                    subject: true,
                },
            });

            if (!generatedEmail) {
                return NextResponse.json(
                    { error: "Generated email not found" },
                    { status: 404 }
                );
            }

            finalHtml = generatedEmail.html;
            finalPlainText = generatedEmail.plainText || plainText || null;
        }

        if (!finalHtml) {
            return NextResponse.json(
                { error: "Email HTML is required" },
                { status: 400 }
            );
        }

        const scheduledEmail = await prisma.scheduledEmail.create({
            data: {
                workspaceId,
                customerId,
                generatedEmailId: generatedEmailId || null,
                emailType,
                subject,
                html: finalHtml,
                plainText: finalPlainText,
                scheduledFor: new Date(scheduledFor),
                status: "scheduled",
            },
        });

        return NextResponse.json({ scheduledEmail });
    } catch (error) {
        console.error("Schedule email error:", error);

        return NextResponse.json(
            { error: "Failed to schedule email" },
            { status: 500 }
        );
    }
}