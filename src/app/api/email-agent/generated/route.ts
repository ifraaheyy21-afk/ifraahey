import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "../../../../lib/prisma";
import { requireWorkspace } from "../../../../lib/auth/requireWorkspace";

const DEMO_WORKSPACE_ID = "demo-workspace";

type GeneratedEmailPayload = {
    workspaceId?: unknown;
    emailType?: unknown;
    subject?: unknown;
    html?: unknown;
    plainText?: unknown;
};

function isDatabaseUnavailable(error: unknown) {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P1001"
    );
}

function normaliseString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function normaliseNullableString(value: unknown) {
    const normalised = normaliseString(value);
    return normalised || null;
}

export async function GET(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const { workspaceId } = auth;

        if (!workspaceId) {
            return NextResponse.json(
                { emails: [] },
                { status: 200 },
            );
        }

        /*
         * Demo generated emails are supplied by the client.
         * Never query Prisma for the demo workspace.
         */
        if (workspaceId === DEMO_WORKSPACE_ID) {
            return NextResponse.json(
                { emails: [] },
                { status: 200 },
            );
        }

        const emails = await prisma.generatedEmail.findMany({
            where: {
                workspaceId,
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        return NextResponse.json(
            { emails },
            { status: 200 },
        );
    } catch (error) {
        console.error("Get generated emails error:", error);

        if (isDatabaseUnavailable(error)) {
            return NextResponse.json(
                {
                    error: "Database is temporarily unavailable.",
                    emails: [],
                },
                { status: 503 },
            );
        }

        return NextResponse.json(
            {
                error: "Failed to load generated emails.",
                emails: [],
            },
            { status: 500 },
        );
    }
}

export async function POST(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const body = (await req.json()) as GeneratedEmailPayload;

        const { workspaceId } = auth;
        const emailType = normaliseString(body.emailType);
        const subject = normaliseString(body.subject);
        const html = normaliseString(body.html);
        const plainText = normaliseNullableString(body.plainText);

        if (!workspaceId || !emailType || !subject || !html) {
            return NextResponse.json(
                {
                    error:
                        "workspaceId, emailType, subject and html are required",
                },
                { status: 400 },
            );
        }

        /*
         * Demo mode stays local. Return the generated draft so the UI can
         * continue normally without writing to the production database.
         */
        if (workspaceId === DEMO_WORKSPACE_ID) {
            const now = new Date().toISOString();

            return NextResponse.json(
                {
                    email: {
                        id: `demo-generated-email-${Date.now()}`,
                        workspaceId: DEMO_WORKSPACE_ID,
                        emailType,
                        subject,
                        html,
                        plainText,
                        status: "draft",
                        createdAt: now,
                        updatedAt: now,
                    },
                    mode: "demo",
                },
                { status: 201 },
            );
        }

        const email = await prisma.generatedEmail.create({
            data: {
                workspaceId,
                emailType,
                subject,
                html,
                plainText,
                status: "draft",
            },
        });

        return NextResponse.json(
            { email },
            { status: 201 },
        );
    } catch (error) {
        console.error("Create generated email error:", error);

        if (isDatabaseUnavailable(error)) {
            return NextResponse.json(
                {
                    error: "Database is temporarily unavailable.",
                },
                { status: 503 },
            );
        }

        return NextResponse.json(
            {
                error: "Failed to save generated email.",
            },
            { status: 500 },
        );
    }
}

export async function DELETE(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const { searchParams } = new URL(req.url);

        const id = searchParams.get("id")?.trim();
        const { workspaceId } = auth;

        if (!id) {
            return NextResponse.json(
                { error: "Email id is required" },
                { status: 400 },
            );
        }

        /*
         * Demo drafts only exist on the client.
         * Confirm deletion without calling Prisma.
         */
        if (
            workspaceId === DEMO_WORKSPACE_ID ||
            id.startsWith("demo-generated-email-")
        ) {
            return NextResponse.json(
                {
                    success: true,
                    mode: "demo",
                },
                { status: 200 },
            );
        }

        const deleted = await prisma.generatedEmail.deleteMany({
            where: {
                id,
                workspaceId,
            },
        });

        if (deleted.count === 0) {
            return NextResponse.json(
                { error: "Generated email not found." },
                { status: 404 },
            );
        }

        return NextResponse.json(
            { success: true },
            { status: 200 },
        );
    } catch (error) {
        console.error("Failed to delete generated email:", error);

        if (isDatabaseUnavailable(error)) {
            return NextResponse.json(
                {
                    error: "Database is temporarily unavailable.",
                },
                { status: 503 },
            );
        }

        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2025"
        ) {
            return NextResponse.json(
                {
                    error: "Generated email not found.",
                },
                { status: 404 },
            );
        }

        return NextResponse.json(
            {
                error: "Failed to delete email.",
            },
            { status: 500 },
        );
    }
}
