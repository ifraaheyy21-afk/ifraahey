import { NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";

const DEMO_WORKSPACE_ID = "demo-workspace";

function isValidDate(value: unknown): value is string {
    if (typeof value !== "string" || !value.trim()) {
        return false;
    }

    const date = new Date(value);

    return !Number.isNaN(date.getTime());
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);

        const workspaceId = searchParams.get("workspaceId")?.trim();
        const customerId = searchParams.get("customerId")?.trim();

        if (!workspaceId) {
            return NextResponse.json(
                { error: "Missing workspaceId" },
                { status: 400 },
            );
        }

        /*
         * Demo content is created and displayed by the dashboard client.
         * Do not query the production database for the demo workspace.
         */
        if (workspaceId === DEMO_WORKSPACE_ID) {
            return NextResponse.json({ scheduledEmails: [] });
        }

        const scheduledEmails = await prisma.scheduledEmail.findMany({
            where: {
                workspaceId,
                ...(customerId ? { customerId } : {}),
                status: {
                    in: [
                        "scheduled",
                        "sending",
                        "sent",
                        "delivered",
                        "failed",
                        "bounced",
                        "complained",
                    ],
                },
            },
            orderBy: {
                scheduledFor: "asc",
            },
            include: {
                customer: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        company: true,
                    },
                },
            },
        });

        return NextResponse.json({ scheduledEmails });
    } catch (error) {
        console.error("Get scheduled emails error:", error);

        return NextResponse.json(
            { error: "Failed to load scheduled emails" },
            { status: 500 },
        );
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const workspaceId =
            typeof body.workspaceId === "string"
                ? body.workspaceId.trim()
                : "";

        const customerId =
            typeof body.customerId === "string"
                ? body.customerId.trim()
                : "";

        const generatedEmailId =
            typeof body.generatedEmailId === "string" &&
                body.generatedEmailId.trim()
                ? body.generatedEmailId.trim()
                : null;

        const emailType =
            typeof body.emailType === "string"
                ? body.emailType.trim()
                : "";

        const subject =
            typeof body.subject === "string"
                ? body.subject.trim()
                : "";

        const html =
            typeof body.html === "string" && body.html.trim()
                ? body.html
                : null;

        const plainText =
            typeof body.plainText === "string" && body.plainText.trim()
                ? body.plainText
                : null;

        const scheduledFor = body.scheduledFor;

        if (
            !workspaceId ||
            !customerId ||
            !emailType ||
            !subject ||
            !scheduledFor
        ) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 },
            );
        }

        if (workspaceId === DEMO_WORKSPACE_ID) {
            return NextResponse.json(
                {
                    error: "Demo emails are managed locally and cannot be persisted.",
                },
                { status: 400 },
            );
        }

        if (!isValidDate(scheduledFor)) {
            return NextResponse.json(
                { error: "Invalid scheduledFor date" },
                { status: 400 },
            );
        }

        const scheduledDate = new Date(scheduledFor);

        const customer = await prisma.customer.findFirst({
            where: {
                id: customerId,
                workspaceId,
            },
            select: {
                id: true,
                email: true,
                unsubscribedAt: true,
            },
        });

        if (!customer) {
            return NextResponse.json(
                { error: "Customer not found" },
                { status: 404 },
            );
        }

        const suppressed = await prisma.suppression.findUnique({
            where: {
                workspaceId_email: {
                    workspaceId,
                    email: customer.email.toLowerCase(),
                },
            },
            select: {
                id: true,
            },
        });

        if (suppressed || customer.unsubscribedAt) {
            return NextResponse.json(
                { error: "Customer is unsubscribed or suppressed" },
                { status: 400 },
            );
        }

        let finalHtml = html;
        let finalPlainText = plainText;

        if (generatedEmailId) {
            const generatedEmail = await prisma.generatedEmail.findFirst({
                where: {
                    id: generatedEmailId,
                    workspaceId,
                },
                select: {
                    html: true,
                    plainText: true,
                },
            });

            if (!generatedEmail) {
                return NextResponse.json(
                    { error: "Generated email not found" },
                    { status: 404 },
                );
            }

            finalHtml = generatedEmail.html;
            finalPlainText =
                generatedEmail.plainText || finalPlainText;
        }

        if (!finalHtml && !finalPlainText) {
            return NextResponse.json(
                { error: "Email content is required" },
                { status: 400 },
            );
        }

        const safeHtml =
            finalHtml ||
            `<p>${escapeHtml(finalPlainText || "")}</p>`;

        const scheduledEmail = await prisma.$transaction(
            async (transaction) => {
                const createdScheduledEmail =
                    await transaction.scheduledEmail.create({
                        data: {
                            workspaceId,
                            customerId,
                            generatedEmailId,
                            emailType,
                            subject,
                            html: safeHtml,
                            plainText: finalPlainText,
                            scheduledFor: scheduledDate,
                            status: "scheduled",
                        },
                        include: {
                            customer: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    company: true,
                                },
                            },
                        },
                    });

                await transaction.emailEvent.create({
                    data: {
                        workspaceId,
                        customerId,
                        generatedEmailId,
                        scheduledEmailId:
                            createdScheduledEmail.id,
                        emailType,
                        subject,
                        status: "scheduled",
                        reason: "Email scheduled",
                    },
                });

                return createdScheduledEmail;
            },
        );

        return NextResponse.json(
            { scheduledEmail },
            { status: 201 },
        );
    } catch (error) {
        console.error("Schedule email error:", error);

        return NextResponse.json(
            { error: "Failed to schedule email" },
            { status: 500 },
        );
    }
}

function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;")
        .replaceAll("\n", "<br />");
}