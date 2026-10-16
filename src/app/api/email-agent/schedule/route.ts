import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireWorkspace } from "../../../../lib/auth/requireWorkspace";

export async function POST(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const body = await req.json();

        const { workspaceId } = auth;

        const {
            customerId,
            generatedEmailId,
            emailType,
            subject,
            html,
            plainText,
            scheduledFor,
        } = body;

        if (!customerId || !emailType || !subject || !scheduledFor) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        const scheduledDate = new Date(scheduledFor);
        if (Number.isNaN(scheduledDate.getTime())) {
            return NextResponse.json(
                { error: "Invalid scheduledFor date" },
                { status: 400 }
            );
        }

        const customer = await prisma.customer.findFirst({
            where: { id: customerId, workspaceId },
            select: { id: true },
        });

        if (!customer) {
            return NextResponse.json(
                { error: "Customer not found" },
                { status: 404 }
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
                scheduledFor: scheduledDate,
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