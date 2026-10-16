import { NextResponse } from "next/server";

import { prisma } from "../../../../../lib/prisma";
import {
    AuthError,
    getWorkspaceFromRequest,
} from "../../../../../lib/auth/getWorkspaceFromRequest";

type Period = "W" | "12M";

function cleanText(value: string | null) {
    return value?.trim() ?? "";
}

function parsePeriod(value: string | null): Period {
    return value === "12M" ? "12M" : "W";
}

function startOfWeek(reference: Date) {
    const start = new Date(reference);
    const day = start.getUTCDay();
    const offset = day === 0 ? -6 : 1 - day;

    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() + offset);

    return start;
}

function startOfTwelveMonths(reference: Date) {
    return new Date(
        Date.UTC(
            reference.getUTCFullYear(),
            reference.getUTCMonth() - 11,
            1,
            0,
            0,
            0,
            0,
        ),
    );
}

function dayKey(date: Date) {
    return `${date.getUTCFullYear()}-${String(
        date.getUTCMonth() + 1,
    ).padStart(2, "0")}-${String(date.getUTCDate()).padStart(
        2,
        "0",
    )}`;
}

function monthKey(date: Date) {
    return `${date.getUTCFullYear()}-${String(
        date.getUTCMonth() + 1,
    ).padStart(2, "0")}`;
}

export async function GET(req: Request) {
    try {
        const { workspaceId } =
            await getWorkspaceFromRequest(req);

        const { searchParams } = new URL(req.url);
        const requestedWorkspaceId = cleanText(
            searchParams.get("workspaceId"),
        );
        const period = parsePeriod(searchParams.get("period"));

        if (
            requestedWorkspaceId &&
            requestedWorkspaceId !== workspaceId
        ) {
            throw new AuthError(
                "You do not have access to this workspace.",
                403,
            );
        }

        const now = new Date();
        const from =
            period === "W"
                ? startOfWeek(now)
                : startOfTwelveMonths(now);

        const runs = await prisma.automationRun.findMany({
            where: {
                workspaceId,
                createdAt: {
                    gte: from,
                },
            },
            select: {
                status: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: "asc",
            },
        });

        const buckets = new Map<
            string,
            {
                key: string;
                runs: number;
                successful: number;
                unsuccessful: number;
            }
        >();

        for (const run of runs) {
            const key =
                period === "W"
                    ? dayKey(run.createdAt)
                    : monthKey(run.createdAt);

            const bucket =
                buckets.get(key) ?? {
                    key,
                    runs: 0,
                    successful: 0,
                    unsuccessful: 0,
                };

            bucket.runs += 1;

            if (run.status === "completed") {
                bucket.successful += 1;
            }

            if (
                run.status === "failed" ||
                run.status === "cancelled"
            ) {
                bucket.unsuccessful += 1;
            }

            buckets.set(key, bucket);
        }

        const points = Array.from(buckets.values()).map(
            (bucket) => {
                const settled =
                    bucket.successful + bucket.unsuccessful;

                return {
                    ...bucket,
                    successRate:
                        settled > 0
                            ? Math.round(
                                (bucket.successful / settled) *
                                100,
                            )
                            : 0,
                };
            },
        );

        return NextResponse.json({
            period,
            from: from.toISOString(),
            to: now.toISOString(),
            points,
        });
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { error: error.message },
                { status: error.status },
            );
        }

        console.error("Automation analytics GET error:", error);

        return NextResponse.json(
            { error: "Failed to load automation analytics." },
            { status: 500 },
        );
    }
}
