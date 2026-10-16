import { NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";
import { requireWorkspace } from "../../../../lib/auth/requireWorkspace";
import {
    customers as demoCustomers,
    customerStats as demoCustomerStats,
} from "../../../../lib/customersData";
import {
    buildCustomerAnalytics,
    customerAnalyticsInclude,
    formatPercent,
    type CustomerWithRelations,
} from "../../../../lib/customerAnalytics";
import { emitAutomationEvent } from "../../../../lib/automation/enrollment";

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
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const { workspaceId } = auth;

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
            include: customerAnalyticsInclude,
        });

        const customerAnalytics = customers.map((customer) => buildCustomerAnalytics(customer as CustomerWithRelations));
        return NextResponse.json({ customers: customerAnalytics, stats: buildDashboardStats(customerAnalytics), source: customers.length ? "live" : "empty-live" });
    } catch (error) {
        console.error("Customers GET error:", error);
        return NextResponse.json({ error: "Failed to load customers", customers: [], stats: [] }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const body = await req.json();
        const { workspaceId } = auth;
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
            include: customerAnalyticsInclude,
        });

        await emitAutomationEvent({
            workspaceId,
            customerId: customer.id,
            event: { type: "customer_created" },
            eventKey: customer.id,
            data: { source: "manual" },
        });

        return NextResponse.json({ customer: buildCustomerAnalytics(customer as CustomerWithRelations) }, { status: 201 });
    } catch (error) {
        console.error("Customers POST error:", error);
        return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
    }
}
