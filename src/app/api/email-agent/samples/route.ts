import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "../../../../lib/prisma";
import { supabaseAdmin } from "../../../../lib/supabase";

const BUCKET_NAME = "email-samples";
const DEMO_WORKSPACE_ID = "demo-workspace";

type SamplePayload = {
    workspaceId?: unknown;
    title?: unknown;
    imageUrl?: unknown;
    fileName?: unknown;
    mimeType?: unknown;
    sizeBytes?: unknown;
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

function normaliseSize(value: unknown) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return null;
    }

    return Math.round(value);
}

function getStoragePathFromPublicUrl(imageUrl: string) {
    const marker = `/storage/v1/object/public/${BUCKET_NAME}/`;
    const index = imageUrl.indexOf(marker);

    if (index === -1) {
        return null;
    }

    try {
        return decodeURIComponent(imageUrl.slice(index + marker.length));
    } catch {
        return imageUrl.slice(index + marker.length);
    }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get("workspaceId")?.trim();

        if (!workspaceId) {
            return NextResponse.json(
                { samples: [] },
                { status: 200 },
            );
        }

        /*
         * Demo samples are supplied by the client.
         * Never query the production database for demo mode.
         */
        if (workspaceId === DEMO_WORKSPACE_ID) {
            return NextResponse.json(
                { samples: [] },
                { status: 200 },
            );
        }

        const samples = await prisma.emailSample.findMany({
            where: {
                workspaceId,
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        return NextResponse.json(
            { samples },
            { status: 200 },
        );
    } catch (error) {
        console.error("Get samples error:", error);

        if (isDatabaseUnavailable(error)) {
            return NextResponse.json(
                {
                    error: "Database is temporarily unavailable.",
                    samples: [],
                },
                { status: 503 },
            );
        }

        return NextResponse.json(
            {
                error: "Failed to load samples.",
                samples: [],
            },
            { status: 500 },
        );
    }
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as SamplePayload;

        const workspaceId = normaliseString(body.workspaceId);
        const title = normaliseString(body.title);
        const imageUrl = normaliseString(body.imageUrl);
        const fileName = normaliseNullableString(body.fileName);
        const mimeType = normaliseNullableString(body.mimeType);
        const sizeBytes = normaliseSize(body.sizeBytes);

        if (!workspaceId || !title || !imageUrl) {
            return NextResponse.json(
                {
                    error: "workspaceId, title and imageUrl are required",
                },
                { status: 400 },
            );
        }

        /*
         * Demo mode remains local and does not write to Prisma.
         * Return the submitted sample so the UI can continue normally.
         */
        if (workspaceId === DEMO_WORKSPACE_ID) {
            return NextResponse.json(
                {
                    sample: {
                        id: `demo-sample-${Date.now()}`,
                        workspaceId: DEMO_WORKSPACE_ID,
                        title,
                        imageUrl,
                        fileName,
                        mimeType,
                        sizeBytes,
                        createdAt: new Date().toISOString(),
                    },
                    mode: "demo",
                },
                { status: 201 },
            );
        }

        const sample = await prisma.emailSample.create({
            data: {
                workspaceId,
                title,
                imageUrl,
                fileName,
                mimeType,
                sizeBytes,
            },
        });

        return NextResponse.json(
            { sample },
            { status: 201 },
        );
    } catch (error) {
        console.error("Create sample error:", error);

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
                error: "Failed to save sample.",
            },
            { status: 500 },
        );
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);

        const id = searchParams.get("id")?.trim();
        const workspaceId = searchParams.get("workspaceId")?.trim();

        if (!id) {
            return NextResponse.json(
                { error: "id is required" },
                { status: 400 },
            );
        }

        /*
         * Demo samples exist only in the client.
         * Confirm deletion without calling Prisma or Supabase Storage.
         */
        if (
            workspaceId === DEMO_WORKSPACE_ID ||
            id.startsWith("demo-sample-")
        ) {
            return NextResponse.json(
                {
                    success: true,
                    mode: "demo",
                },
                { status: 200 },
            );
        }

        const sample = await prisma.emailSample.findUnique({
            where: {
                id,
            },
        });

        if (!sample) {
            return NextResponse.json(
                { error: "Sample not found" },
                { status: 404 },
            );
        }

        const storagePath = getStoragePathFromPublicUrl(sample.imageUrl);

        if (storagePath) {
            const { error: storageError } = await supabaseAdmin.storage
                .from(BUCKET_NAME)
                .remove([storagePath]);

            if (storageError) {
                console.error(
                    "Delete sample storage error:",
                    storageError,
                );

                return NextResponse.json(
                    {
                        error: "Failed to delete the sample image.",
                    },
                    { status: 502 },
                );
            }
        }

        await prisma.emailSample.delete({
            where: {
                id,
            },
        });

        return NextResponse.json(
            { success: true },
            { status: 200 },
        );
    } catch (error) {
        console.error("Delete sample error:", error);

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
                error: "Failed to delete sample.",
            },
            { status: 500 },
        );
    }
}
