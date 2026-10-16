import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { automationConfig } from "../../../../lib/automation/config";
import { processAutomationWorker } from "../../../../lib/automation/workflow-runner";
import { enrollUpcomingRenewals } from "../../../../lib/automation/enrollment";

// Renewal windows are measured in days, so scanning every 15 minutes is
// plenty and keeps the every-minute worker cheap.
const RENEWAL_SCAN_EVERY_MINUTES = 15;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(
    body: Record<string, unknown>,
    status = 200,
) {
    return NextResponse.json(body, {
        status,
        headers: {
            "Cache-Control": "no-store",
        },
    });
}

function bearerToken(req: Request) {
    const header =
        req.headers.get("authorization");

    if (
        !header ||
        !header.startsWith("Bearer ")
    ) {
        return "";
    }

    return header.slice(7).trim();
}

function secureEqual(
    received: string,
    expected: string,
) {
    if (!received || !expected) return false;

    const receivedBuffer =
        Buffer.from(received);
    const expectedBuffer =
        Buffer.from(expected);

    if (
        receivedBuffer.length !==
        expectedBuffer.length
    ) {
        return false;
    }

    return timingSafeEqual(
        receivedBuffer,
        expectedBuffer,
    );
}

async function handleWorker(req: Request) {
    // Vercel Cron authenticates with CRON_SECRET; other schedulers may use
    // AUTOMATION_WORKER_SECRET. Accept either when configured.
    const secrets = [
        process.env.CRON_SECRET?.trim(),
        automationConfig.workerSecret(),
    ].filter((value): value is string => Boolean(value));

    if (secrets.length === 0) {
        console.error(
            "Automation worker secret is not configured.",
        );

        return json(
            {
                error:
                    "Automation worker is not configured.",
            },
            503,
        );
    }

    const token = bearerToken(req);

    if (!secrets.some((secret) => secureEqual(token, secret))) {
        return json(
            { error: "Unauthorised." },
            401,
        );
    }

    try {
        const url = new URL(req.url);
        const scanRenewals =
            url.searchParams.get("renewals") === "1" ||
            new Date().getUTCMinutes() % RENEWAL_SCAN_EVERY_MINUTES === 0;

        // Enroll first so new renewal runs are executed in this same pass.
        const renewalRunIds = scanRenewals
            ? await enrollUpcomingRenewals()
            : [];

        const results =
            await processAutomationWorker();

        const failed = results.filter(
            (item) => Boolean(item.error),
        ).length;

        return json({
            ok: true,
            processed: results.length,
            failed,
            renewalsEnrolled: renewalRunIds.length,
            results,
        });
    } catch (error) {
        console.error(
            "Automation worker failed:",
            error,
        );

        return json(
            {
                error:
                    "Automation worker could not complete.",
            },
            500,
        );
    }
}

export async function GET(req: Request) {
    return handleWorker(req);
}

export async function POST(req: Request) {
    return handleWorker(req);
}
