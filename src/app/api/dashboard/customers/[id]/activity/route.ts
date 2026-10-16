import { NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";

type RouteParams = {
    params: Promise<{ id: string }>;
};

function formatActivityTime(value: Date) {
    return value.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function getActivityTitle(status: string) {
    const normalizedStatus = status.toLowerCase();

    if (normalizedStatus === "sent") return "Email sent";
    if (normalizedStatus === "open" || normalizedStatus === "opened") return "Email opened";
    if (normalizedStatus === "click" || normalizedStatus === "clicked") return "Link clicked";
    if (normalizedStatus === "reply" || normalizedStatus === "replied") return "Customer replied";
    if (normalizedStatus === "bounce" || normalizedStatus === "bounced") return "Email bounced";

    return "Email activity";
}

function getActivityDescription(status: string, subject: string, reason?: string | null) {
    const normalizedStatus = status.toLowerCase();

    if (reason) return reason;
    if (normalizedStatus === "sent") return `Sent: ${subject}`;
    if (normalizedStatus === "open" || normalizedStatus === "opened") return `Opened: ${subject}`;
    if (normalizedStatus === "click" || normalizedStatus === "clicked") return `Clicked a link in: ${subject}`;
    if (normalizedStatus === "reply" || normalizedStatus === "replied") return `Replied to: ${subject}`;
    if (normalizedStatus === "bounce" || normalizedStatus === "bounced") return `Bounced: ${subject}`;

    return subject;
}

export async function GET(req: Request, { params }: RouteParams) {
    try {
        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get("workspaceId");
        const { id } = await params;

        const customerId = decodeURIComponent(id);

        if (!workspaceId) {
            return NextResponse.json({ activities: [] }, { status: 200 });
        }

        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const emailEvents = await prisma.emailEvent.findMany({
            where: {
                workspaceId,
                customerId,
                createdAt: {
                    gte: last24Hours,
                    lte: now,
                },
            },
            orderBy: {
                createdAt: "desc",
            },
            take: 30,
        });

        const sentEmails = await prisma.scheduledEmail.findMany({
            where: {
                workspaceId,
                customerId,
                status: "sent",
                OR: [
                    {
                        sentAt: {
                            gte: last24Hours,
                            lte: now,
                        },
                    },
                    {
                        sentAt: null,
                        scheduledFor: {
                            gte: last24Hours,
                            lte: now,
                        },
                    },
                ],
            },
            orderBy: {
                sentAt: "desc",
            },
            take: 30,
        });

        const eventActivities = emailEvents.map((event) => ({
            id: event.id,
            type: event.status,
            title: getActivityTitle(event.status),
            description: getActivityDescription(
                event.status,
                event.subject,
                event.reason
            ),
            subject: event.subject,
            emailType: event.emailType,
            time: formatActivityTime(event.createdAt),
            createdAt: event.createdAt.toISOString(),
        }));

        const sentActivities = sentEmails.map((email) => {
            const activityDate = email.sentAt || email.scheduledFor;

            return {
                id: email.id,
                type: "sent",
                title: "Email sent",
                description: `Sent: ${email.subject}`,
                subject: email.subject,
                emailType: email.emailType,
                time: formatActivityTime(activityDate),
                createdAt: activityDate.toISOString(),
            };
        });

        const activities = [...eventActivities, ...sentActivities]
            .sort(
                (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
            )
            .slice(0, 30);

        return NextResponse.json({ activities });
    } catch (error) {
        console.error("Customer activity GET error:", error);

        return NextResponse.json(
            { error: "Failed to load customer activity", activities: [] },
            { status: 500 }
        );
    }
}