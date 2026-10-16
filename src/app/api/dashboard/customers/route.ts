import { NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";
import {
    customers as demoCustomers,
    customerStats as demoCustomerStats,
} from "../../../../lib/customersData";

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

type CustomerWithRelations = {
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

function formatPercent(value: number) {
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

function buildCustomerAnalytics(customer: CustomerWithRelations) {
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

function formatCurrency(value: number) {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
}

function buildDashboardStats(customers: ReturnType<typeof buildCustomerAnalytics>[]) {
    const totalAccounts = customers.length;
    const totalMrr = customers.reduce((total, customer) => total + Number(customer.mrr || 0), 0);
    const totalEmailsSent = customers.reduce((total, customer) => total + customer.analytics.sent, 0);
    const totalOpened = customers.reduce((total, customer) => total + customer.analytics.opened, 0);
    const averageOpenRate = totalEmailsSent ? (totalOpened / totalEmailsSent) * 100 : 0;

    return [
        { label: "Total Accounts", value: totalAccounts.toLocaleString("en-GB"), change: "0.0%", comparison: "previous month", comparisonValue: totalAccounts.toLocaleString("en-GB") },
        { label: "MRR Tracked", value: formatCurrency(totalMrr), change: "0.0%", comparison: "previous month", comparisonValue: formatCurrency(totalMrr) },
        { label: "Emails Sent", value: totalEmailsSent.toLocaleString("en-GB"), change: "0.0%", comparison: "previous month", comparisonValue: totalEmailsSent.toLocaleString("en-GB") },
        { label: "Avg. Open Rate", value: formatPercent(averageOpenRate), change: "0.0%", comparison: "previous month", comparisonValue: formatPercent(averageOpenRate) },
    ];
}

function cleanText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function parseMrr(value: unknown) {
    if (value === null || value === "" || value === undefined) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get("workspaceId");

        if (!workspaceId || workspaceId === "demo-workspace") {
            return NextResponse.json({
                customers: demoCustomers.map((customer) => ({ ...customer, source: "manual", hasManualOverrides: false })),
                stats: demoCustomerStats,
                source: "demo",
            });
        }

        const customers = await prisma.customer.findMany({
            where: { workspaceId, archivedAt: null },
            orderBy: { createdAt: "desc" },
            include: {
                emailEvents: { select: { id: true, status: true, scheduledEmailId: true, createdAt: true } },
                scheduledEmails: { select: { id: true, status: true, sentAt: true, scheduledFor: true } },
            },
        });

        const customerAnalytics = customers.map((customer) => buildCustomerAnalytics(customer as CustomerWithRelations));
        return NextResponse.json({ customers: customerAnalytics, stats: buildDashboardStats(customerAnalytics), source: customers.length ? "live" : "empty-live" });
    } catch (error) {
        console.error("Customers GET error:", error);
        return NextResponse.json({ error: "Failed to load customers", customers: [], stats: [] }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const workspaceId = cleanText(body.workspaceId);
        const name = cleanText(body.name);
        const email = cleanText(body.email).toLowerCase();
        const company = cleanText(body.company);
        const mrr = parseMrr(body.mrr);

        if (!workspaceId || workspaceId === "demo-workspace") return NextResponse.json({ error: "A live workspace is required before adding accounts." }, { status: 400 });
        if (!name || !email || !company) return NextResponse.json({ error: "Name, email and company are required." }, { status: 400 });
        if (mrr === null) return NextResponse.json({ error: "MRR must be zero or a positive number." }, { status: 400 });

        const duplicate = await prisma.customer.findFirst({ where: { workspaceId, email, archivedAt: null } });
        if (duplicate) return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });

        const customer = await prisma.customer.create({
            data: {
                workspaceId,
                name,
                email,
                company,
                mrr,
                syncedMrr: null,
                plan: cleanText(body.plan) || null,
                status: cleanText(body.status) || "Active",
                renewalDate: body.renewalDate ? new Date(body.renewalDate) : null,
                notes: cleanText(body.notes) || null,
                source: "manual",
                lastEmail: "No activity yet",
            },
            include: {
                emailEvents: { select: { id: true, status: true, scheduledEmailId: true, createdAt: true } },
                scheduledEmails: { select: { id: true, status: true, sentAt: true, scheduledFor: true } },
            },
        });

        return NextResponse.json({ customer: buildCustomerAnalytics(customer as CustomerWithRelations) }, { status: 201 });
    } catch (error) {
        console.error("Customers POST error:", error);
        return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
    }
}
