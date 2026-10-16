import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "../../../../lib/prisma";
import { requireWorkspace } from "../../../../lib/auth/requireWorkspace";

const DEMO_WORKSPACE_ID = "demo-workspace";

type ProfilePayload = {
    workspaceId?: unknown;
    companyName?: unknown;
    website?: unknown;
    companyDescription?: unknown;
    idealCustomer?: unknown;
    guidelines?: unknown;
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

function normaliseGuidelines(value: unknown) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
}

function createProfileData(body: ProfilePayload) {
    return {
        companyName: normaliseString(body.companyName),
        website: normaliseString(body.website),
        companyDescription: normaliseString(body.companyDescription),
        idealCustomer: normaliseString(body.idealCustomer),
        guidelines: normaliseGuidelines(body.guidelines),
    };
}

export async function GET(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const { workspaceId } = auth;

        if (!workspaceId) {
            return NextResponse.json(
                { profile: null },
                { status: 200 },
            );
        }

        /*
         * Demo profile data is managed by the client.
         * Never query the production database for the demo workspace.
         */
        if (workspaceId === DEMO_WORKSPACE_ID) {
            return NextResponse.json(
                { profile: null },
                { status: 200 },
            );
        }

        const profile = await prisma.brandEmailProfile.findFirst({
            where: {
                workspaceId,
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        if (!profile) {
            return NextResponse.json(
                { profile: null },
                { status: 200 },
            );
        }

        return NextResponse.json(
            {
                profile: {
                    companyName: profile.companyName || "",
                    website: profile.website || "",
                    companyDescription: profile.companyDescription || "",
                    idealCustomer: profile.idealCustomer || "",
                    guidelines: profile.guidelines || [],
                },
            },
            { status: 200 },
        );
    } catch (error) {
        console.error("Get brand profile error:", error);

        if (isDatabaseUnavailable(error)) {
            return NextResponse.json(
                {
                    error: "Database is temporarily unavailable.",
                    profile: null,
                },
                { status: 503 },
            );
        }

        return NextResponse.json(
            {
                error: "Failed to load brand profile.",
                profile: null,
            },
            { status: 500 },
        );
    }
}

export async function POST(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const body = (await req.json()) as ProfilePayload;
        const { workspaceId } = auth;

        if (!workspaceId) {
            return NextResponse.json(
                { error: "workspaceId is required" },
                { status: 400 },
            );
        }

        const data = createProfileData(body);

        /*
         * Keep demo mode local and avoid writes to the production database.
         * Return the submitted profile so the client can continue normally.
         */
        if (workspaceId === DEMO_WORKSPACE_ID) {
            return NextResponse.json(
                {
                    profile: {
                        id: "demo-brand-profile",
                        workspaceId: DEMO_WORKSPACE_ID,
                        ...data,
                    },
                    mode: "demo",
                },
                { status: 200 },
            );
        }

        const existingProfile = await prisma.brandEmailProfile.findFirst({
            where: {
                workspaceId,
            },
            orderBy: {
                createdAt: "desc",
            },
            select: {
                id: true,
            },
        });

        const profile = existingProfile
            ? await prisma.brandEmailProfile.update({
                where: {
                    id: existingProfile.id,
                },
                data,
            })
            : await prisma.brandEmailProfile.create({
                data: {
                    workspaceId,
                    ...data,
                },
            });

        return NextResponse.json(
            { profile },
            { status: 200 },
        );
    } catch (error) {
        console.error("Save brand profile error:", error);

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
                error: "Failed to save brand profile.",
            },
            { status: 500 },
        );
    }
}
