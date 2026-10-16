import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireWorkspace } from "../../../../lib/auth/requireWorkspace";

export const dynamic = "force-dynamic";

function mapQueueEmail(email: any) {
    return {
        id: email.id,
        customerName: email.customer?.company || email.customer?.name || "Customer",
        customerEmail: email.customer?.email || "",
        subject: email.subject,
        html: email.html,
        plainText: email.plainText,
        template: email.emailType,
        recommendedAction: email.recommendedAction || email.emailType || "Retention follow-up",
        status: email.status,
        priority: email.priority,
        scheduledFor: email.scheduledFor,
        createdAt: email.createdAt,
        failureReason: email.failureReason || null,
    };
}

export async function GET(req: Request) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const { searchParams } = new URL(req.url);

        const page = Math.max(Number(searchParams.get("page") || 1), 1);
        const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") || 10), 1), 50);

        const search = searchParams.get("search")?.trim();
        const status = searchParams.get("status");
        const priority = searchParams.get("priority");

        const where: any = { workspaceId: auth.workspaceId };

        if (status && status !== "all") {
            where.status = status;
        }

        if (priority && priority !== "all") {
            where.priority = priority;
        }

        if (search) {
            where.OR = [
                { subject: { contains: search, mode: "insensitive" } },
                { emailType: { contains: search, mode: "insensitive" } },
                { plainText: { contains: search, mode: "insensitive" } },
                {
                    customer: {
                        OR: [
                            { name: { contains: search, mode: "insensitive" } },
                            { company: { contains: search, mode: "insensitive" } },
                            { email: { contains: search, mode: "insensitive" } },
                        ],
                    },
                },
            ];
        }

        const [emails, total] = await Promise.all([
            prisma.scheduledEmail.findMany({
                where,
                include: {
                    customer: true,
                },
                orderBy: {
                    scheduledFor: "asc",
                },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),

            prisma.scheduledEmail.count({ where }),
        ]);

        return NextResponse.json({
            emails: emails.map(mapQueueEmail),
            total,
            page,
            pageSize,
        });
    } catch (error) {
        console.error("EMAIL_QUEUE_GET_ERROR", error);

        return NextResponse.json(
            { error: "Failed to load email queue." },
            { status: 500 }
        );
    }
}