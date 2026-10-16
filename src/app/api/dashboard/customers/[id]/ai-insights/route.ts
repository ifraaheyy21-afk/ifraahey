import { NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "../../../../../../lib/prisma";
import { requireWorkspace } from "../../../../../../lib/auth/requireWorkspace";

type RouteParams = {
    params: Promise<{ id: string }>;
};

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

function countByStatus(events: { status: string }[], statusNames: string[]) {
    const allowed = new Set(statusNames.map((status) => status.toLowerCase()));

    return events.filter((event) =>
        allowed.has(event.status.toLowerCase())
    ).length;
}

export async function GET(req: Request, { params }: RouteParams) {
    const auth = await requireWorkspace(req);
    if (auth instanceof NextResponse) return auth;

    try {
        const { workspaceId } = auth;
        const { id } = await params;

        const customerId = decodeURIComponent(id);

        if (!workspaceId) {
            return NextResponse.json(
                { insight: "No workspace selected." },
                { status: 200 }
            );
        }

        const customer = await prisma.customer.findFirst({
            where: {
                id: customerId,
                workspaceId,
            },
            include: {
                emailEvents: {
                    orderBy: {
                        createdAt: "desc",
                    },
                    take: 50,
                },
                scheduledEmails: {
                    orderBy: {
                        scheduledFor: "desc",
                    },
                    take: 20,
                },
            },
        });

        if (!customer) {
            return NextResponse.json(
                { insight: "Customer not found." },
                { status: 404 }
            );
        }

        const sent = customer.scheduledEmails.filter(
            (email) => email.status === "sent"
        ).length;

        const opened = countByStatus(customer.emailEvents, ["open", "opened"]);
        const clicked = countByStatus(customer.emailEvents, ["click", "clicked"]);
        const replied = countByStatus(customer.emailEvents, ["reply", "replied"]);
        const bounced = countByStatus(customer.emailEvents, ["bounce", "bounced"]);

        const response = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
                {
                    role: "system",
                    content:
                        "You are an AI retention assistant for a SaaS dashboard. Give concise, practical customer insights. Focus on churn risk, engagement, and the next best action.",
                },
                {
                    role: "user",
                    content: JSON.stringify({
                        customer: {
                            name: customer.name,
                            email: customer.email,
                            company: customer.company,
                            status: customer.status,
                            lastEmail: customer.lastEmail,
                        },
                        metrics: {
                            sent,
                            opened,
                            clicked,
                            replied,
                            bounced,
                        },
                        recentEvents: customer.emailEvents.map((event) => ({
                            status: event.status,
                            subject: event.subject,
                            reason: event.reason,
                            createdAt: event.createdAt,
                        })),
                    }),
                },
            ],
            temperature: 0.4,
        });

        const insight =
            response.choices[0]?.message?.content ||
            "No insight generated yet.";

        return NextResponse.json({
            insight,
            metrics: {
                sent,
                opened,
                clicked,
                replied,
                bounced,
            },
        });
    } catch (error) {
        console.error("AI insights error:", error);

        return NextResponse.json(
            { error: "Failed to generate AI insight." },
            { status: 500 }
        );
    }
}