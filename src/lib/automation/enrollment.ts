import { after } from "next/server";

import { prisma } from "../prisma";
import {
    buildCustomerAnalytics,
    customerAnalyticsInclude,
    type CustomerWithRelations,
} from "../customerAnalytics";
import { createAutomationRun } from "./run-service";
import { asWorkflowDefinition } from "./serializer";
import {
    resolveTrigger,
    triggerMatches,
    type AutomationEvent,
    type TriggerSpec,
} from "./triggers";
import { runAutomation } from "./workflow-runner";
import type { WorkflowNode } from "./types";
import { inAudience, readAudience } from "./audience";

export type ActiveTriggerWorkflow = {
    id: string;
    trigger: TriggerSpec;
    triggerNode: WorkflowNode;
};

const ACTIVE_RUN_STATUSES = ["queued", "running", "waiting"] as const;

/** Active workflows in a workspace with a usable trigger, optionally of one type. */
export async function findActiveTriggerWorkflows(
    workspaceId: string | null,
    type?: TriggerSpec["type"],
): Promise<Array<ActiveTriggerWorkflow & { workspaceId: string }>> {
    const workflows = await prisma.automationWorkflow.findMany({
        where: { status: "active", ...(workspaceId ? { workspaceId } : {}) },
        select: { id: true, workspaceId: true, definition: true },
    });

    const result: Array<ActiveTriggerWorkflow & { workspaceId: string }> = [];
    for (const workflow of workflows) {
        let triggerNode: WorkflowNode | undefined;
        try {
            triggerNode = asWorkflowDefinition(workflow.definition).nodes.find((node) => node.type === "trigger");
        } catch {
            continue;
        }
        const trigger = triggerNode ? resolveTrigger(triggerNode) : null;
        if (!triggerNode || !trigger || (type && trigger.type !== type)) continue;
        result.push({ id: workflow.id, workspaceId: workflow.workspaceId, trigger, triggerNode });
    }
    return result;
}

// `ignoreSuppression` exists for "Email bounced": the bounce itself suppresses
// the address, and that workflow's job is to react to it (tag, notify).
async function loadEnrollableCustomer(workspaceId: string, customerId: string, ignoreSuppression = false) {
    const customer = await prisma.customer.findFirst({
        where: { id: customerId, workspaceId, archivedAt: null, unsubscribedAt: null },
        include: customerAnalyticsInclude,
    });
    if (!customer) return null;
    if (ignoreSuppression) return buildCustomerAnalytics(customer as CustomerWithRelations);

    const email = (customer.manualEmail ?? customer.email).toLowerCase();
    const suppressed = await prisma.suppression.findUnique({
        where: { workspaceId_email: { workspaceId, email } },
        select: { id: true },
    });
    if (suppressed) return null;

    return buildCustomerAnalytics(customer as CustomerWithRelations);
}

/**
 * Enroll one customer into one workflow, honouring the trigger's audience
 * and re-entry settings. Returns the new run id, or null when skipped.
 *
 * Duplicate enrollment is prevented by the (workflowId, idempotencyKey)
 * unique index, so concurrent deliveries of the same event are safe.
 */
export async function enrollCustomer({
    workspaceId,
    workflow,
    customerId,
    customerRecord,
    eventKey,
    input,
}: {
    workspaceId: string;
    workflow: ActiveTriggerWorkflow;
    customerId: string;
    customerRecord: unknown;
    eventKey: string;
    input: Record<string, unknown>;
}): Promise<string | null> {
    const audience = readAudience(workflow.triggerNode);
    if (!inAudience(audience, customerId, customerRecord)) return null;

    if (audience.allowReentry) {
        // Re-entry still means one active run at a time per customer.
        const active = await prisma.automationRun.findFirst({
            where: { workflowId: workflow.id, customerId, status: { in: [...ACTIVE_RUN_STATUSES] } },
            select: { id: true },
        });
        if (active) return null;
    }

    const idempotencyKey = audience.allowReentry
        ? `event:${eventKey}`.slice(0, 190)
        : `enroll-once:${customerId}`;

    try {
        const { run, reused } = await createAutomationRun({
            workspaceId,
            workflowId: workflow.id,
            customerId,
            idempotencyKey,
            input,
        });
        return reused ? null : run.id;
    } catch (error) {
        // The workflow may have been paused or edited since it was listed.
        console.warn("Automation enrollment skipped", {
            workflowId: workflow.id,
            reason: error instanceof Error ? error.message : "unknown",
        });
        return null;
    }
}

/**
 * Start new runs right after the current response is sent. Anything this
 * misses (timeouts, crashes, calls outside a request) stays queued for the
 * automation worker cron, so it is never lost.
 */
export function startRunsSoon(runIds: string[]) {
    if (runIds.length === 0) return;
    try {
        after(async () => {
            for (const runId of runIds) {
                try {
                    await runAutomation(runId);
                } catch (error) {
                    console.error("Automation run failed to start", {
                        runId,
                        reason: error instanceof Error ? error.message : "unknown",
                    });
                }
            }
        });
    } catch {
        // Not inside a request scope; the worker will pick the runs up.
    }
}

/**
 * Record that something happened to a customer and enroll them into every
 * active workflow whose trigger matches. Never throws: automation problems
 * must not break the request that reported the event.
 *
 * `eventKey` must identify this occurrence (for example the email id for an
 * open), so retried or duplicate deliveries do not enroll twice.
 */
export async function emitAutomationEvent({
    workspaceId,
    customerId,
    event,
    eventKey,
    data = {},
}: {
    workspaceId: string;
    customerId: string;
    event: AutomationEvent;
    eventKey: string;
    data?: Record<string, unknown>;
}): Promise<string[]> {
    try {
        const workflows = (await findActiveTriggerWorkflows(workspaceId, event.type))
            .filter((workflow) => triggerMatches(workflow.trigger, event));
        if (workflows.length === 0) return [];

        const customerRecord = await loadEnrollableCustomer(
            workspaceId,
            customerId,
            event.type === "email_bounced",
        );
        if (!customerRecord) return [];

        const input = {
            source: "trigger",
            trigger: {
                ...data,
                type: event.type,
                ...(event.type === "tag_added" ? { tag: event.tag } : {}),
                ...(event.type === "custom_event" ? { eventName: event.eventName } : {}),
                occurredAt: new Date().toISOString(),
            },
        };

        const runIds: string[] = [];
        for (const workflow of workflows) {
            const runId = await enrollCustomer({
                workspaceId,
                workflow,
                customerId,
                customerRecord,
                eventKey: `${event.type}:${eventKey}`,
                input,
            });
            if (runId) runIds.push(runId);
        }

        startRunsSoon(runIds);
        return runIds;
    } catch (error) {
        console.error("Automation event could not be processed", {
            type: event.type,
            reason: error instanceof Error ? error.message : "unknown",
        });
        return [];
    }
}

/**
 * Daily-style scan for customers whose renewal falls inside a workflow's
 * "days before renewal" window. Each renewal date enrolls at most once.
 */
export async function enrollUpcomingRenewals(limitPerWorkflow = 200) {
    const workflows = await findActiveTriggerWorkflows(null, "renewal_upcoming");
    const runIds: string[] = [];
    const now = new Date();

    for (const workflow of workflows) {
        if (workflow.trigger.type !== "renewal_upcoming") continue;
        const dayMs = 24 * 60 * 60 * 1000;
        const windowEnd = new Date(now.getTime() + workflow.trigger.daysBefore * dayMs);
        // Anyone enrolled since this window opened is already handled; older
        // runs (last year's renewal) must not block this one.
        const windowOpenedAt = new Date(now.getTime() - (workflow.trigger.daysBefore + 1) * dayMs);

        const customers = await prisma.customer.findMany({
            where: {
                workspaceId: workflow.workspaceId,
                archivedAt: null,
                unsubscribedAt: null,
                OR: [
                    { manualRenewalDate: { gt: now, lte: windowEnd } },
                    { manualRenewalDate: null, renewalDate: { gt: now, lte: windowEnd } },
                ],
                automationRuns: { none: { workflowId: workflow.id, createdAt: { gte: windowOpenedAt } } },
            },
            select: { id: true, renewalDate: true, manualRenewalDate: true },
            take: limitPerWorkflow,
        });

        for (const customer of customers) {
            const renewalDate = customer.manualRenewalDate ?? customer.renewalDate;
            if (!renewalDate) continue;

            const customerRecord = await loadEnrollableCustomer(workflow.workspaceId, customer.id);
            if (!customerRecord) continue;

            const renewalDay = renewalDate.toISOString().slice(0, 10);
            const runId = await enrollCustomer({
                workspaceId: workflow.workspaceId,
                workflow,
                customerId: customer.id,
                customerRecord,
                eventKey: `renewal_upcoming:${customer.id}:${renewalDay}`,
                input: {
                    source: "trigger",
                    trigger: {
                        type: "renewal_upcoming",
                        renewalDate: renewalDate.toISOString(),
                        daysBefore: workflow.trigger.daysBefore,
                        occurredAt: now.toISOString(),
                    },
                },
            });
            if (runId) runIds.push(runId);
        }
    }

    return runIds;
}
