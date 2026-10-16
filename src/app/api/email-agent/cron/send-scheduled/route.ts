import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import {
    getEmailSenderConfig,
    eligibleScheduledEmailsWhere,
    processScheduledEmail,
    type WorkerResult,
} from "../../../../../lib/scheduled-email-sender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: { "Cache-Control": "private, no-store" },
    });
}

export async function GET(req: Request) {
    const secret = process.env.CRON_SECRET;
    if (!secret?.trim()) return json({ error: "Missing CRON_SECRET" }, 500);
    const supplied = req.headers.get("authorization") ?? "";
    const hash = (value: string) => createHash("sha256").update(value).digest();
    if (!timingSafeEqual(hash(supplied), hash(`Bearer ${secret}`))) return json({ error: "Unauthorized" }, 401);
    try {
        const config = getEmailSenderConfig();
        const dueEmails = await prisma.scheduledEmail.findMany({
            where: eligibleScheduledEmailsWhere(new Date(), config),
            orderBy: { scheduledFor: "asc" }, take: config.batchSize,
        });
        const results: WorkerResult[] = [];
        for (const email of dueEmails) {
            try {
                results.push(await processScheduledEmail(email, config));
            } catch (error) {
                console.error("Scheduled email worker error", { scheduledEmailId: email.id, errorType: error instanceof Error ? error.name : "unknown" });
                results.push({ id: email.id, status: "recovery_pending" });
            }
        }
        const recoveryPending = results.some((result) => result.status === "recovery_pending" || result.status === "sent_pending_reconciliation");
        return json({ processed: results.length, results }, recoveryPending ? 503 : 200);
    } catch (error) {
        console.error("Cron send scheduled emails error", { errorType: error instanceof Error ? error.name : "unknown" });
        return json({ error: "Scheduled email processing failed. Check server logs and worker configuration." }, 500);
    }
}
