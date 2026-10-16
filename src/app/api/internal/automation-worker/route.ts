import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { automationConfig } from "../../../../lib/automation/config";
import { processAutomationWorker } from "../../../../lib/automation/workflow-runner";

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
    const workerSecret =
        automationConfig.workerSecret();

    if (!workerSecret) {
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

    if (
        !secureEqual(
            bearerToken(req),
            workerSecret,
        )
    ) {
        return json(
            { error: "Unauthorised." },
            401,
        );
    }

    try {
        const results =
            await processAutomationWorker();

        const failed = results.filter(
            (item) => Boolean(item.error),
        ).length;

        return json({
            ok: true,
            processed: results.length,
            failed,
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
