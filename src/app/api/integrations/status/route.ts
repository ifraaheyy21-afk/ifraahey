import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "../../../../lib/prisma";
import { requireWorkspace } from "../../../../lib/auth/requireWorkspace";

export const runtime = "nodejs";

const DEMO_WORKSPACE_ID = "demo-workspace";

function isDatabaseUnavailable(error: unknown) {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P1001"
    );
}

export async function GET(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const { workspaceId } = auth;

        /*
         * Demo integrations are not persisted in the production database.
         * Return an empty connected-integration list without calling Prisma.
         */
        if (workspaceId === DEMO_WORKSPACE_ID) {
            return NextResponse.json(
                {
                    integrations: [],
                    mode: "demo",
                },
                { status: 200 },
            );
        }

        const integrations = await prisma.workspaceIntegration.findMany({
            where: {
                workspaceId,
                status: "connected",
            },
            select: {
                provider: true,
                status: true,
            },
            orderBy: {
                provider: "asc",
            },
        });

        return NextResponse.json(
            { integrations },
            { status: 200 },
        );
    } catch (error) {
        console.error("Integration status error:", error);

        if (isDatabaseUnavailable(error)) {
            return NextResponse.json(
                {
                    integrations: [],
                    error: "Database is temporarily unavailable.",
                },
                { status: 503 },
            );
        }

        return NextResponse.json(
            {
                integrations: [],
                error: "Failed to load integration status.",
            },
            { status: 500 },
        );
    }
}
