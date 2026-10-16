import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { automationConfig } from "../../../../../lib/automation/config";
import { processAutomationWorker } from "../../../../../lib/automation/workflow-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: { "Cache-Control": "no-store" },
    });
}

function authorized(req: Request, secret: string) {
    const match = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
    if (!match) return false;

    const supplied = Buffer.from(match[1], "utf8");
    const expected = Buffer.from(secret, "utf8");
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(req: Request) {
    // Preserve the secret used by this route before adopting the shared config.
    const secret = process.env.AUTOMATION_CRON_SECRET?.trim()
        || automationConfig.workerSecret();

    if (!secret) {
        return json({ error: "Automation worker authentication is not configured." }, 503);
    }

    if (!authorized(req, secret)) {
        return json({ error: "Unauthorized" }, 401);
    }

    try {
        const results = await processAutomationWorker();
        const errors = results.filter((result) => Boolean(result.error)).length;

        return json({
            // Keep the existing response field for callers of this endpoint.
            resumed: results.filter((result) => result.source === "due").length,
            processed: results.length,
            errors,
            results,
        });
    } catch (error) {
        console.error("Automation worker error:", error);
        return json({ error: "Failed to process automations." }, 500);
    }
}
