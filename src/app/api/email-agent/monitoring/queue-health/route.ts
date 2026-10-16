import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";

function unauthorized() {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
    try {
        const cronSecret = process.env.CRON_SECRET;

        if (!cronSecret) {
            return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 });
        }

        const authHeader = req.headers.get("authorization");
        const token = authHeader?.replace("Bearer ", "");

        if (token !== cronSecret) return unauthorized();

        const now = new Date();
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

        const [
            scheduledDue,
            sendingStuck,
            failedRetryable,
            failedFinal,
            bounced,
            complained,
            sentLast24h,
            openedLast24h,
            clickedLast24h,
            repliedLast24h,
            recentFailures,
        ] = await Promise.all([
            prisma.scheduledEmail.count({
                where: {
                    status: "scheduled",
                    scheduledFor: { lte: now },
                },
            }),

            prisma.scheduledEmail.count({
                where: {
                    status: "sending",
                    updatedAt: { lte: fifteenMinutesAgo },
                },
            }),

            prisma.scheduledEmail.count({
                where: {
                    status: "failed",
                    retryCount: { lt: 3 },
                },
            }),

            prisma.scheduledEmail.count({
                where: {
                    status: "failed",
                    retryCount: { gte: 3 },
                },
            }),

            prisma.scheduledEmail.count({
                where: { status: "bounced" },
            }),

            prisma.scheduledEmail.count({
                where: { status: "complained" },
            }),

            prisma.emailEvent.count({
                where: {
                    status: "sent",
                    createdAt: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    },
                },
            }),

            prisma.emailEvent.count({
                where: {
                    status: "opened",
                    createdAt: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    },
                },
            }),

            prisma.emailEvent.count({
                where: {
                    status: "clicked",
                    createdAt: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    },
                },
            }),

            prisma.emailEvent.count({
                where: {
                    status: "replied",
                    createdAt: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    },
                },
            }),

            prisma.emailEvent.findMany({
                where: {
                    status: {
                        in: ["failed", "bounced", "complained"],
                    },
                },
                orderBy: { createdAt: "desc" },
                take: 10,
                include: {
                    customer: {
                        select: {
                            name: true,
                            email: true,
                            company: true,
                        },
                    },
                },
            }),
        ]);

        const healthy =
            scheduledDue < 50 &&
            sendingStuck === 0 &&
            failedFinal < 20 &&
            complained < 10;

        return NextResponse.json({
            healthy,
            checkedAt: new Date().toISOString(),
            queue: {
                scheduledDue,
                sendingStuck,
                failedRetryable,
                failedFinal,
                bounced,
                complained,
            },
            activityLast24h: {
                sent: sentLast24h,
                opened: openedLast24h,
                clicked: clickedLast24h,
                replied: repliedLast24h,
            },
            recentFailures,
        });
    } catch (error) {
        console.error("Queue health error:", error);
        return NextResponse.json({ error: "Queue health check failed" }, { status: 500 });
    }
}