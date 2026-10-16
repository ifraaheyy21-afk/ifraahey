import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "../../../../../../lib/prisma";

const DEMO_WORKSPACE_ID = "demo-workspace";

type RouteParams = {
    params: Promise<{ id: string }>;
};

type EmailEventLite = {
    scheduledEmailId: string | null;
    status: string;
    createdAt: Date;
};

function formatSentAt(value: Date | null) {
    if (!value) return "Unknown";

    const parts = new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/London",
    }).formatToParts(value);

    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value || "";

    return `${getPart("day")} ${getPart("month")} ${getPart("year")} at ${getPart("hour")}:${getPart("minute")}`;
}

function getEmailType(value?: string | null) {
    if (value === "Engagement") return "Education";
    if (value === "Reply") return "Retention";

    return value || "Retention";
}

function getPreviewText(emailType?: string | null) {
    if (emailType === "Onboarding") {
        return "Guide the customer toward completing setup.";
    }

    if (emailType === "Expansion") {
        return "Suggest an upgrade based on customer usage.";
    }

    if (emailType === "Education" || emailType === "Engagement") {
        return "Educate the customer on a useful feature.";
    }

    if (emailType === "Reply") {
        return "Reply sent to continue the customer conversation.";
    }

    return "Retention email sent to improve account engagement.";
}

function getOutcome(events: EmailEventLite[]) {
    const statuses = events.map((event) => event.status.toLowerCase());

    if (statuses.includes("replied") || statuses.includes("reply")) {
        return "Replied";
    }

    if (statuses.includes("opened") || statuses.includes("open")) {
        return "Opened";
    }

    return "Not Opened";
}

function isDatabaseUnavailable(error: unknown) {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P1001"
    );
}

export async function GET(req: Request, { params }: RouteParams) {
    try {
        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get("workspaceId")?.trim();
        const { id } = await params;
        const customerId = decodeURIComponent(id).trim();

        if (!workspaceId || !customerId) {
            return NextResponse.json({ emails: [] }, { status: 200 });
        }

        /*
         * Demo customer email history is supplied by the client-side demo data.
         * Never query the production database for the demo workspace.
         */
        if (workspaceId === DEMO_WORKSPACE_ID) {
            return NextResponse.json({ emails: [] }, { status: 200 });
        }

        const scheduledEmails = await prisma.scheduledEmail.findMany({
            where: {
                workspaceId,
                customerId,
                status: "sent",
            },
            orderBy: {
                sentAt: "desc",
            },
        });

        const scheduledEmailIds = scheduledEmails.map((email) => email.id);

        const emailEvents =
            scheduledEmailIds.length > 0
                ? await prisma.emailEvent.findMany({
                    where: {
                        workspaceId,
                        customerId,
                        scheduledEmailId: {
                            in: scheduledEmailIds,
                        },
                    },
                    select: {
                        scheduledEmailId: true,
                        status: true,
                        createdAt: true,
                    },
                    orderBy: {
                        createdAt: "desc",
                    },
                })
                : [];

        const eventsByScheduledEmailId = emailEvents.reduce<
            Record<string, EmailEventLite[]>
        >((accumulator, event) => {
            if (!event.scheduledEmailId) {
                return accumulator;
            }

            if (!accumulator[event.scheduledEmailId]) {
                accumulator[event.scheduledEmailId] = [];
            }

            accumulator[event.scheduledEmailId].push(event);

            return accumulator;
        }, {});

        const emails = scheduledEmails.map((email) => {
            const events = eventsByScheduledEmailId[email.id] || [];
            const outcome = getOutcome(events);

            const replyEvent = events.find((event) => {
                const status = event.status.toLowerCase();

                return status === "replied" || status === "reply";
            });

            return {
                id: email.id,
                customerId: email.customerId,
                subject: email.subject,
                previewText: getPreviewText(email.emailType),
                type: getEmailType(email.emailType),
                outcome,
                reply: outcome === "Replied",
                replyText: undefined,
                replyPreview: undefined,
                replyAt: replyEvent
                    ? formatSentAt(replyEvent.createdAt)
                    : undefined,
                sentAt: formatSentAt(email.sentAt || email.scheduledFor),
                from: "Team",
                html: email.html,
            };
        });

        return NextResponse.json({ emails }, { status: 200 });
    } catch (error) {
        console.error("Customer emails GET error:", error);

        if (isDatabaseUnavailable(error)) {
            return NextResponse.json(
                {
                    error: "Database is temporarily unavailable.",
                    emails: [],
                },
                { status: 503 },
            );
        }

        return NextResponse.json(
            {
                error: "Failed to load customer emails.",
                emails: [],
            },
            { status: 500 },
        );
    }
}
