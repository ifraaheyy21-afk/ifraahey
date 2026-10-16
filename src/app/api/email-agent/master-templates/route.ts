import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "../../../../lib/prisma";
import { requireWorkspace } from "../../../../lib/auth/requireWorkspace";

const DEMO_WORKSPACE_ID = "demo-workspace";

type MasterTemplatePayload = {
    workspaceId?: unknown;
    sampleId?: unknown;
    title?: unknown;
    html?: unknown;
    subject?: unknown;
    heading?: unknown;
    body?: unknown;
    ctaText?: unknown;
    ctaLink?: unknown;
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
                { templates: [] },
                { status: 200 },
            );
        }

        /*
         * Demo templates are supplied and managed by the client.
         * Never query Prisma for the demo workspace.
         */
        if (workspaceId === DEMO_WORKSPACE_ID) {
            return NextResponse.json(
                { templates: [] },
                { status: 200 },
            );
        }

        const templates = await prisma.emailMasterTemplate.findMany({
            where: {
                workspaceId,
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        return NextResponse.json(
            { templates },
            { status: 200 },
        );
    } catch (error) {
        console.error("Get master templates error:", error);

        if (isDatabaseUnavailable(error)) {
            return NextResponse.json(
                {
                    error: "Database is temporarily unavailable.",
                    templates: [],
                },
                { status: 503 },
            );
        }

        return NextResponse.json(
            {
                error: "Failed to load master templates.",
                templates: [],
            },
            { status: 500 },
        );
    }
}

export async function POST(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const body = (await req.json()) as MasterTemplatePayload;

        const { workspaceId } = auth;
        const title = normaliseString(body.title);
        const html = normaliseString(body.html);
        const sampleId = normaliseNullableString(body.sampleId);
        const subject = normaliseString(body.subject);
        const heading = normaliseString(body.heading);
        const templateBody = normaliseString(body.body);
        const ctaText = normaliseString(body.ctaText);
        const ctaLink = normaliseString(body.ctaLink) || "{{cta_link}}";

        if (!workspaceId || !title || !html) {
            return NextResponse.json(
                {
                    error: "workspaceId, title and html are required.",
                },
                { status: 400 },
            );
        }

        /*
         * Demo mode stays local. Return the submitted template so the
         * builder can continue without writing to the production database.
         */
        if (workspaceId === DEMO_WORKSPACE_ID) {
            const now = new Date().toISOString();

            return NextResponse.json(
                {
                    template: {
                        id: `demo-master-template-${Date.now()}`,
                        workspaceId: DEMO_WORKSPACE_ID,
                        sampleId,
                        title,
                        html,
                        subject,
                        heading,
                        body: templateBody,
                        ctaText,
                        ctaLink,
                        createdAt: now,
                        updatedAt: now,
                    },
                    mode: "demo",
                },
                { status: 201 },
            );
        }

        const template = await prisma.emailMasterTemplate.create({
            data: {
                workspaceId,
                sampleId,
                title,
                html,
                subject,
                heading,
                body: templateBody,
                ctaText,
                ctaLink,
            },
        });

        return NextResponse.json(
            { template },
            { status: 201 },
        );
    } catch (error) {
        console.error("Create master template error:", error);

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
                error: "Failed to save master template.",
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
                { error: "id is required." },
                { status: 400 },
            );
        }

        /*
         * Demo templates exist only on the client.
         * Confirm deletion without calling Prisma.
         */
        if (
            workspaceId === DEMO_WORKSPACE_ID ||
            id.startsWith("demo-master-template-")
        ) {
            return NextResponse.json(
                {
                    success: true,
                    mode: "demo",
                },
                { status: 200 },
            );
        }

        const deleted = await prisma.emailMasterTemplate.deleteMany({
            where: {
                id,
                workspaceId,
            },
        });

        if (deleted.count === 0) {
            return NextResponse.json(
                { error: "Master template not found." },
                { status: 404 },
            );
        }

        return NextResponse.json(
            { success: true },
            { status: 200 },
        );
    } catch (error) {
        console.error("Delete master template error:", error);

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
                    error: "Master template not found.",
                },
                { status: 404 },
            );
        }

        return NextResponse.json(
            {
                error: "Failed to delete master template.",
            },
            { status: 500 },
        );
    }
}
