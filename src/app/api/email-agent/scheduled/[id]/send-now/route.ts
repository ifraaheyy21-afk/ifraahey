import { NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import {
    AuthError,
    getWorkspaceFromRequest,
} from "../../../../../../lib/auth/getWorkspaceFromRequest";
import {
    getEmailSenderConfig,
    processScheduledEmail,
} from "../../../../../../lib/scheduled-email-sender";

type RouteParams = {
    params: Promise<{ id: string }>;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: { "Cache-Control": "private, no-store" },
    });
}

function assertMutationOrigin(req: Request) {
    // Firebase bearer tokens are verified by getWorkspaceFromRequest. Cookie
    // authentication additionally needs an allowed browser origin for mutations.
    if (/^Bearer\s+\S+$/i.test(req.headers.get("authorization") ?? "")) return;
    const origin = req.headers.get("origin");
    const configuredUrl = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
    const allowedOrigin = new URL(configuredUrl || req.url).origin;
    if (!origin || origin !== allowedOrigin) {
        throw new AuthError("This send request must come from your application.", 403, "INVALID_ORIGIN");
    }
}

// Preserve the existing public email/customer response without exposing the
// saved provider payload, credential fingerprint or worker ownership fields.
async function publicEmail(id: string, workspaceId: string) {
    return prisma.scheduledEmail.findFirst({
        where: { id, workspaceId },
        select: {
            id: true,
            workspaceId: true,
            customerId: true,
            generatedEmailId: true,
            automationRunId: true,
            automationNodeId: true,
            emailType: true,
            subject: true,
            html: true,
            plainText: true,
            scheduledFor: true,
            sentAt: true,
            status: true,
            failureReason: true,
            providerMessageId: true,
            retryCount: true,
            lastRetryAt: true,
            openedAt: true,
            clickedAt: true,
            deliveredAt: true,
            bouncedAt: true,
            complainedAt: true,
            createdAt: true,
            updatedAt: true,
            customer: {
                select: { id: true, name: true, email: true, company: true },
            },
        },
    });
}

export async function POST(req: Request, { params }: RouteParams) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);
        assertMutationOrigin(req);
        const { id: rawId } = await params;
        const id = typeof rawId === "string" ? rawId.trim() : "";
        if (!id) return json({ error: "Scheduled email id is required." }, 400);

        let parsed: unknown;
        try {
            parsed = await req.json();
        } catch {
            return json({ error: "A valid JSON request body is required." }, 400);
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return json({ error: "The request body must be a JSON object." }, 400);
        }
        const body = parsed as Record<string, unknown>;
        if (body.workspaceId !== undefined) {
            if (typeof body.workspaceId !== "string") {
                return json({ error: "Invalid workspaceId." }, 400);
            }
            if (body.workspaceId.trim() !== workspaceId) {
                return json({ error: "You do not have access to this workspace." }, 403);
            }
        }

        const email = await prisma.scheduledEmail.findFirst({
            where: { id, workspaceId },
        });
        if (!email) return json({ error: "Scheduled email not found." }, 404);

        // Repeated clicks after success return the current record without sending.
        if (email.status === "sent") {
            const scheduledEmail = await publicEmail(id, workspaceId);
            if (!scheduledEmail) return json({ error: "Scheduled email not found." }, 404);
            return json({ scheduledEmail });
        }
        if (!["scheduled", "failed", "sending"].includes(email.status)) {
            return json({
                error: email.status === "review_required"
                    ? "This email needs review of its previous send outcome before it can be sent again."
                    : "This email cannot be sent in its current state.",
                code: "EMAIL_NOT_SENDABLE",
                status: email.status,
            }, 409);
        }

        const config = getEmailSenderConfig();
        // The shared sender atomically brings scheduled emails forward. Existing
        // retries retain their cooldown, attempt count, payload and provider key.
        const result = await processScheduledEmail(email, config, "manual");
        const scheduledEmail = await publicEmail(id, workspaceId);
        if (!scheduledEmail) {
            return json({ error: "The email's current status could not be read. Refresh before retrying." }, 503);
        }
        if (scheduledEmail.status === "sent") return json({ scheduledEmail });

        // Only confirmed, locally recorded success receives HTTP 200, so existing
        // callers do not mistake an accepted/in-progress request for a sent email.
        if (result.status === "sent_pending_reconciliation" || result.status === "recovery_pending") {
            return json({
                error: result.status === "sent_pending_reconciliation"
                    ? "The provider accepted this email. Its saved status is being recovered; do not create a replacement send."
                    : "Email processing was interrupted. The worker will recover this attempt; refresh its status before retrying.",
                code: "EMAIL_RECOVERY_PENDING",
                scheduledEmail,
            }, 503);
        }
        return json({
            error: result.status === "skipped_suppressed"
                ? "This customer is unsubscribed or suppressed. The email was not sent."
                : result.status === "review_required"
                    ? "This email needs review of its previous send outcome before any further attempt."
                    : result.status === "failed_retry_scheduled"
                        ? "The send outcome is not confirmed. A protected retry has been scheduled."
                        : "This email is already processing, waiting for its retry time, or is no longer eligible to send. Refresh its status.",
            code: "EMAIL_NOT_SENT",
            scheduledEmail,
        }, 409);
    } catch (error) {
        if (error instanceof AuthError) {
            return json({ error: error.message, code: error.code }, error.status);
        }
        // Never reset a claimed or accepted email to failed here. Recovery is
        // controlled by the same shared sender used by the cron worker.
        console.error("Send now error", {
            errorType: error instanceof Error ? error.name : "unknown",
        });
        return json({ error: "Unable to confirm the send result. Refresh the email's status before retrying." }, 500);
    }
}
