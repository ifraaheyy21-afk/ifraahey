import { NextResponse } from "next/server";

import { prisma } from "../../../../../lib/prisma";
import { requireWorkspace } from "../../../../../lib/auth/requireWorkspace";

function cleanText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function parseMrr(value: unknown) {
    if (value === null || value === "" || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const { id } = await context.params;
        const body = await req.json();
        const { workspaceId } = auth;

        const existing = await prisma.customer.findFirst({ where: { id, workspaceId } });
        if (!existing) return NextResponse.json({ error: "Account not found." }, { status: 404 });

        if (body.restoreSyncedValues === true) {
            if (existing.source === "manual") return NextResponse.json({ error: "Manual accounts do not have synced values." }, { status: 400 });

            const customer = await prisma.customer.update({
                where: { id },
                data: {
                    manualName: null,
                    manualEmail: null,
                    manualCompany: null,
                    manualMrr: null,
                    manualPlan: null,
                    manualStatus: null,
                    manualRenewalDate: null,
                    manualNotes: null,
                },
            });
            return NextResponse.json({ customer });
        }

        const name = cleanText(body.name);
        const email = cleanText(body.email).toLowerCase();
        const company = cleanText(body.company);
        const mrr = parseMrr(body.mrr);

        if (!name || !email || !company) return NextResponse.json({ error: "Name, email and company are required." }, { status: 400 });
        if (mrr === undefined) return NextResponse.json({ error: "MRR must be zero or a positive number." }, { status: 400 });

        const duplicate = await prisma.customer.findFirst({
            where: {
                workspaceId,
                id: { not: id },
                archivedAt: null,
                OR: [{ email }, { manualEmail: email }],
            },
        });
        if (duplicate) return NextResponse.json({ error: "Another account already uses this email." }, { status: 409 });

        const commonValues = {
            name,
            email,
            company,
            mrr: mrr ?? 0,
            plan: cleanText(body.plan) || null,
            status: cleanText(body.status) || "Active",
            renewalDate: body.renewalDate ? new Date(body.renewalDate) : null,
            notes: cleanText(body.notes) || null,
        };

        const customer = await prisma.customer.update({
            where: { id },
            data:
                existing.source === "manual"
                    ? commonValues
                    : {
                        manualName: commonValues.name,
                        manualEmail: commonValues.email,
                        manualCompany: commonValues.company,
                        manualMrr: commonValues.mrr,
                        manualPlan: commonValues.plan,
                        manualStatus: commonValues.status,
                        manualRenewalDate: commonValues.renewalDate,
                        manualNotes: commonValues.notes,
                    },
        });

        return NextResponse.json({ customer });
    } catch (error) {
        console.error("Customer PATCH error:", error);
        return NextResponse.json({ error: "Failed to update account." }, { status: 500 });
    }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const { id } = await context.params;
        const { workspaceId } = auth;

        const existing = await prisma.customer.findFirst({ where: { id, workspaceId } });
        if (!existing) return NextResponse.json({ error: "Account not found." }, { status: 404 });

        if (existing.source === "manual") {
            await prisma.customer.delete({ where: { id } });
            return NextResponse.json({ deleted: true });
        }

        await prisma.customer.update({ where: { id }, data: { archivedAt: new Date() } });
        return NextResponse.json({ archived: true });
    } catch (error) {
        console.error("Customer DELETE error:", error);
        return NextResponse.json({ error: "Failed to remove account." }, { status: 500 });
    }
}
