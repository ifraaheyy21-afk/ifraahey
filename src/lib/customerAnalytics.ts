// Shared customer record shape: what the customers API returns and what
// automation audience rules are evaluated against.

export const customerAnalyticsInclude = {
    emailEvents: { select: { id: true, status: true, scheduledEmailId: true, createdAt: true } },
    scheduledEmails: { select: { id: true, status: true, sentAt: true, scheduledFor: true } },
} as const;

type EmailEventLite = {
    id: string;
    status: string;
    scheduledEmailId: string | null;
    createdAt: Date;
};

type ScheduledEmailLite = {
    id: string;
    status: string;
    sentAt: Date | null;
    scheduledFor: Date;
};

export type CustomerWithRelations = {
    id: string;
    name: string;
    email: string;
    company: string;
    mrr: number;
    syncedMrr: number | null;
    manualName: string | null;
    manualEmail: string | null;
    manualCompany: string | null;
    manualMrr: number | null;
    plan: string | null;
    manualPlan: string | null;
    status: string;
    manualStatus: string | null;
    renewalDate: Date | null;
    manualRenewalDate: Date | null;
    notes: string | null;
    manualNotes: string | null;
    source: string;
    externalId: string | null;
    archivedAt: Date | null;
    emailsSent: number;
    openRate: number;
    clickRate: number;
    lastEmail: string;
    createdAt: Date;
    emailEvents: EmailEventLite[];
    scheduledEmails: ScheduledEmailLite[];
};

export function formatPercent(value: number) {
    return `${Number(value || 0).toFixed(1)}%`;
}

function normalizeStatus(status: string) {
    return status.toLowerCase().trim();
}

function getUniqueEventCount(events: EmailEventLite[], statuses: string[]) {
    const allowedStatuses = new Set(statuses);
    const uniqueIds = new Set<string>();

    events.forEach((event) => {
        const status = normalizeStatus(event.status);
        if (allowedStatuses.has(status)) uniqueIds.add(event.scheduledEmailId || event.id);
    });

    return uniqueIds.size;
}

function calculateRate(count: number, total: number) {
    return total ? (count / total) * 100 : 0;
}

function calculateEngagementScore(openRate: number, clickRate: number) {
    return Math.round(Number(openRate || 0) * 0.7 + Number(clickRate || 0) * 0.3);
}

function getLastActivity(customerLastEmail: string, emailEvents: EmailEventLite[], scheduledEmails: ScheduledEmailLite[]) {
    const latestEvent = [...emailEvents].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (latestEvent) return latestEvent.createdAt.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

    const latestSentEmail = [...scheduledEmails]
        .filter((email) => normalizeStatus(email.status) === "sent")
        .sort((a, b) => (b.sentAt || b.scheduledFor).getTime() - (a.sentAt || a.scheduledFor).getTime())[0];

    if (latestSentEmail) return (latestSentEmail.sentAt || latestSentEmail.scheduledFor).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    return customerLastEmail || "No activity yet";
}

export function buildCustomerAnalytics(customer: CustomerWithRelations) {
    const sentFromEvents = getUniqueEventCount(customer.emailEvents, ["sent"]);
    const sentFromScheduledEmails = customer.scheduledEmails.filter((email) => normalizeStatus(email.status) === "sent").length;
    const emailsSent = sentFromEvents || sentFromScheduledEmails || Number(customer.emailsSent || 0);
    const openedEmails = getUniqueEventCount(customer.emailEvents, ["open", "opened"]);
    const clickedEmails = getUniqueEventCount(customer.emailEvents, ["click", "clicked"]);
    const repliedEmails = getUniqueEventCount(customer.emailEvents, ["reply", "replied"]);
    const openRate = emailsSent && openedEmails ? calculateRate(openedEmails, emailsSent) : Number(customer.openRate || 0);
    const clickRate = emailsSent && clickedEmails ? calculateRate(clickedEmails, emailsSent) : Number(customer.clickRate || 0);

    const name = customer.manualName ?? customer.name;
    const email = customer.manualEmail ?? customer.email;
    const company = customer.manualCompany ?? customer.company;
    const mrr = customer.manualMrr ?? customer.syncedMrr ?? customer.mrr ?? 0;
    const plan = customer.manualPlan ?? customer.plan;
    const status = customer.manualStatus ?? customer.status;
    const renewalDate = customer.manualRenewalDate ?? customer.renewalDate;
    const notes = customer.manualNotes ?? customer.notes;
    const hasManualOverrides = [customer.manualName, customer.manualEmail, customer.manualCompany, customer.manualMrr, customer.manualPlan, customer.manualStatus, customer.manualRenewalDate, customer.manualNotes].some((value) => value !== null);

    return {
        id: customer.id,
        name,
        email,
        company,
        mrr,
        syncedMrr: customer.syncedMrr,
        manualMrr: customer.manualMrr,
        plan,
        status,
        renewalDate: renewalDate?.toISOString() ?? null,
        notes,
        source: customer.source,
        externalId: customer.externalId,
        hasManualOverrides,
        emailsSent,
        openRate: formatPercent(openRate),
        clickRate: formatPercent(clickRate),
        engagementScore: calculateEngagementScore(openRate, clickRate),
        lastActivity: getLastActivity(customer.lastEmail, customer.emailEvents, customer.scheduledEmails),
        analytics: { sent: emailsSent, opened: openedEmails, clicked: clickedEmails, replied: repliedEmails, openRate, clickRate },
    };
}
