import { prisma } from "../prisma";

import type {
    AutomationEmailEvent,
    ExecutionContext,
} from "./types";

type BuildExecutionContextArgs = {
    workspaceId: string;
    customerId?: string | null;
    workflowId?: string | null;
    // Supplied by the runner from the stored run, never from user input.
    automationRunId?: string | null;
    input?: Record<string, unknown> | null;
};

type RefreshExecutionContextArgs = {
    workspaceId: string;
    customerId?: string | null;
    workflowId?: string | null;
    automationRunId?: string | null;
    currentContext: ExecutionContext;
};

function eventNodeId(
    event: AutomationEmailEvent,
    workflowId: string | null,
) {
    const relationNodeId =
        typeof event.automationNodeId === "string"
            ? event.automationNodeId.trim()
            : "";

    if (relationNodeId) {
        return relationNodeId;
    }

    const emailType =
        typeof event.emailType === "string"
            ? event.emailType.trim()
            : "";

    if (!workflowId || !emailType) {
        return "";
    }

    const prefix = `automation:${workflowId}:`;

    return emailType.startsWith(prefix)
        ? emailType.slice(prefix.length)
        : "";
}

function groupAutomationEventsByNode(
    events: AutomationEmailEvent[],
    workflowId: string | null,
) {
    const grouped: Record<string, AutomationEmailEvent[]> = Object.create(null);

    for (const event of events) {
        const nodeId = eventNodeId(event, workflowId);

        if (!nodeId) {
            continue;
        }

        if (!grouped[nodeId]) {
            grouped[nodeId] = [];
        }

        grouped[nodeId].push(event);
    }

    return grouped;
}

export async function buildExecutionContext({
    workspaceId,
    customerId,
    workflowId,
    automationRunId,
    input,
}: BuildExecutionContextArgs): Promise<ExecutionContext> {
    const normalizedWorkflowId = workflowId?.trim() || null;
    const normalizedRunId = automationRunId?.trim() || null;

    if (normalizedWorkflowId && !normalizedRunId) {
        throw new Error("An automation run id is required to load workflow email events safely.");
    }

    const [
        workspace,
        brand,
        customer,
        customerEmailEvents,
        automationEmailEvents,
    ] = await Promise.all([
        prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                id: true,
                name: true,
                userEmail: true,
            },
        }),
        prisma.brandEmailProfile.findFirst({
            where: { workspaceId },
            orderBy: { updatedAt: "desc" },
            select: {
                companyName: true,
                website: true,
                companyDescription: true,
                idealCustomer: true,
                tone: true,
            },
        }),
        customerId
            ? prisma.customer.findFirst({
                where: {
                    id: customerId,
                    workspaceId,
                },
            })
            : Promise.resolve(null),
        customerId
            ? prisma.emailEvent.findMany({
                where: {
                    workspaceId,
                    customerId,
                },
                orderBy: { createdAt: "desc" },
                take: 100,
                select: {
                    id: true,
                    scheduledEmailId: true,
                    generatedEmailId: true,
                    emailType: true,
                    status: true,
                    reason: true,
                    subject: true,
                    providerMessageId: true,
                    createdAt: true,
                    scheduledEmail: {
                        select: {
                            automationNodeId: true,
                        },
                    },
                },
            })
            : Promise.resolve([]),
        customerId && normalizedWorkflowId && normalizedRunId
            ? prisma.emailEvent.findMany({
                where: {
                    workspaceId,
                    customerId,
                    emailType: {
                        startsWith: `automation:${normalizedWorkflowId}:`,
                    },
                    // No fallback to another run or to unlinked events.
                    scheduledEmail: {
                        is: {
                            workspaceId,
                            customerId,
                            automationRunId: normalizedRunId,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
                take: 100,
                select: {
                    id: true,
                    scheduledEmailId: true,
                    generatedEmailId: true,
                    emailType: true,
                    status: true,
                    reason: true,
                    subject: true,
                    providerMessageId: true,
                    createdAt: true,
                    scheduledEmail: {
                        select: {
                            automationNodeId: true,
                        },
                    },
                },
            })
            : Promise.resolve([]),
    ]);

    if (!workspace) {
        throw new Error("Workspace not found.");
    }

    if (customerId && !customer) {
        throw new Error("Customer not found in this workspace.");
    }

    const normalizeEvents = (
        events: Array<{
            id: string;
            scheduledEmailId: string | null;
            generatedEmailId: string | null;
            emailType: string;
            status: string;
            reason: string | null;
            subject: string;
            providerMessageId: string | null;
            createdAt: Date;
            scheduledEmail: {
                automationNodeId: string | null;
            } | null;
        }>,
    ): AutomationEmailEvent[] =>
        events.map((event) => ({
            id: event.id,
            scheduledEmailId: event.scheduledEmailId,
            generatedEmailId: event.generatedEmailId,
            emailType: event.emailType,
            status: event.status,
            reason: event.reason,
            subject: event.subject,
            providerMessageId: event.providerMessageId,
            createdAt: event.createdAt,
            automationNodeId:
                event.scheduledEmail?.automationNodeId ?? null,
        }));

    const normalizedCustomerEvents = normalizeEvents(customerEmailEvents);
    const normalizedAutomationEvents = normalizeEvents(automationEmailEvents);
    const automationEmailEventsByNode = groupAutomationEventsByNode(
        normalizedAutomationEvents,
        normalizedWorkflowId,
    );

    const firstName = customer?.name?.trim().split(/\s+/)[0] ?? "";
    const companyName = brand?.companyName ?? workspace.name ?? "";
    const relevantEmailEvents = normalizedWorkflowId
        ? normalizedAutomationEvents
        : normalizedCustomerEvents;

    return {
        ...(input ?? {}),
        automationRunId: normalizedRunId ?? undefined,
        workspace,
        brand: brand ?? {},
        customer: customer ?? undefined,
        emailEvents: relevantEmailEvents,
        automationEmailEvents: normalizedAutomationEvents,
        automationEmailEventsByNode,
        customerEmailEvents: normalizedCustomerEvents,
        first_name: firstName,
        customer_name: customer?.name ?? "",
        customer_email: customer?.email ?? "",
        customer_company: customer?.company ?? "",
        company_name: companyName,
        sender_name: companyName,
    };
}

export async function refreshExecutionContext({
    workspaceId,
    customerId,
    workflowId,
    automationRunId,
    currentContext,
}: RefreshExecutionContextArgs): Promise<ExecutionContext> {
    return buildExecutionContext({
        workspaceId,
        customerId,
        workflowId,
        automationRunId,
        input: currentContext,
    });
}
