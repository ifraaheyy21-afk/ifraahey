import { NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";
import { authenticateOAuthRequest } from "../../../../lib/oauth";
import { requireWorkspace } from "../../../../lib/auth/requireWorkspace";
import { emitAutomationEvent } from "../../../../lib/automation/enrollment";
import { normalizeEventName } from "../../../../lib/automation/triggers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DATA_BYTES = 10_000;

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: { "Cache-Control": "no-store" },
    });
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

// Integrations (Zapier) use an OAuth token with events:write; the dashboard
// uses the signed-in session.
async function resolveWorkspaceId(req: Request) {
    const token = await authenticateOAuthRequest(req, "events:write");
    if (token) return token.workspaceId;

    const auth = await requireWorkspace(req);
    return auth instanceof NextResponse ? auth : auth.workspaceId;
}

/**
 * Report a named event for one customer, such as "payment_failed" or
 * "trial_started". Every active workflow whose trigger is that event
 * enrolls the customer.
 *
 * Body: { event, email | customerId, eventId?, data? }
 * Send a stable `eventId` (for example the Stripe event id) so retries do
 * not enroll the customer twice.
 */
export async function POST(req: Request) {
    const workspaceId = await resolveWorkspaceId(req);
    if (workspaceId instanceof NextResponse) return workspaceId;

    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json({ error: "Send a JSON object." }, 400);
    }
    const input = body as Record<string, unknown>;

    const eventName = normalizeEventName(text(input.event));
    if (!eventName) {
        return json({ error: "`event` is required, for example \"payment_failed\"." }, 400);
    }

    const customerId = text(input.customerId);
    const email = text(input.email).toLowerCase();
    if (!customerId && !email) {
        return json({ error: "Send the customer's `email` or `customerId`." }, 400);
    }

    let data: Record<string, unknown> = {};
    if (input.data !== undefined) {
        if (!input.data || typeof input.data !== "object" || Array.isArray(input.data)) {
            return json({ error: "`data` must be a JSON object." }, 400);
        }
        if (JSON.stringify(input.data).length > MAX_DATA_BYTES) {
            return json({ error: `\`data\` must be under ${MAX_DATA_BYTES} bytes.` }, 413);
        }
        data = input.data as Record<string, unknown>;
    }

    const customer = await prisma.customer.findFirst({
        where: {
            workspaceId,
            archivedAt: null,
            ...(customerId
                ? { id: customerId }
                : {
                    OR: [
                        { email: { equals: email, mode: "insensitive" } },
                        { manualEmail: { equals: email, mode: "insensitive" } },
                    ],
                }),
        },
        select: { id: true },
    });

    if (!customer) {
        return json({ error: "No customer with that email or id in this workspace." }, 404);
    }

    const eventId = text(input.eventId).slice(0, 120);
    const runIds = await emitAutomationEvent({
        workspaceId,
        customerId: customer.id,
        event: { type: "custom_event", eventName },
        eventKey: eventId ? `${eventName}:${eventId}` : `${eventName}:${crypto.randomUUID()}`,
        data: { ...data, eventName },
    });

    return json({ accepted: true, event: eventName, customerId: customer.id, enrolled: runIds.length, runIds }, 202);
}
