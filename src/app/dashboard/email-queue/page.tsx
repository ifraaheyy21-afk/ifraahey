"use client";

import "@fontsource/inter";
import Link from "next/link";
import "./email-queue.css";
import { ChevronDown, Download, Mail, Info, MoreHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type QueueStatus =
    | "scheduled"
    | "sending"
    | "sent"
    | "delivered"
    | "failed"
    | "bounced"
    | "complained";

type ScheduledEmail = {
    id: string;
    workspaceId: string;
    customerId: string;
    generatedEmailId?: string | null;
    emailType: string;
    subject: string;
    html: string;
    plainText?: string | null;
    scheduledFor: string;
    status: QueueStatus;
    failureReason?: string | null;
    providerMessageId?: string | null;
    retryCount: number;
    sentAt?: string | null;
    openedAt?: string | null;
    clickedAt?: string | null;
    deliveredAt?: string | null;
    bouncedAt?: string | null;
    complainedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    customer: {
        id: string;
        name: string;
        email: string;
        company: string;
    };
};

type ScheduledResponse = {
    scheduledEmails: ScheduledEmail[];
};

type WorkspaceResponse = {
    workspaceId?: string;
    workspace?: {
        id: string;
    };
};

type QueueSort =
    | "most-recent"
    | "oldest"
    | "today"
    | "yesterday"
    | "last-7-days"
    | "scheduled"
    | "delivered"
    | "failed";

function formatStatus(status: QueueStatus) {
    const labels: Record<QueueStatus, string> = {
        scheduled: "Scheduled",
        sending: "Sending",
        sent: "Sent",
        delivered: "Delivered",
        failed: "Failed",
        bounced: "Bounced",
        complained: "Complained",
    };

    return labels[status] || status;
}

function getEmailTypeClass(emailType: string) {
    return emailType
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function formatDate(value?: string | null) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Invalid date";

    const parts = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/London",
    }).formatToParts(date);

    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value || "";

    return `${getPart("day")} ${getPart("month")} ${getPart("year")} at ${getPart("hour")}:${getPart("minute")}`;
}

function getSendIn(
    value: string,
    status: QueueStatus,
    currentTime: number | null,
) {
    if (status !== "scheduled") return "—";
    if (currentTime === null) return "—";

    const target = new Date(value).getTime();
    const now = currentTime;

    if (Number.isNaN(target)) return "Invalid date";
    if (target <= now) return "Due now";

    const minutes = Math.round((target - now) / 60000);

    if (minutes < 60) return `In ${minutes} min${minutes === 1 ? "" : "s"}`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `In ${hours} hour${hours === 1 ? "" : "s"}`;

    const days = Math.round(hours / 24);
    return `In ${days} day${days === 1 ? "" : "s"}`;
}

function stripHtml(html: string) {
    if (typeof window === "undefined") return html;

    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
}

type DemoAccount = {
    name: string;
    email: string;
    company: string;
};

const DEMO_BRAND = {
    name: "Cobrai",
    email: "hello@cobrai.uk",
    website: "cobrai.uk",
};

function escapeEmailHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getDemoEmailContent(
    account: DemoAccount,
    emailType: string,
): {
    heading: string;
    preheader: string;
    body: string;
    ctaLabel: string;
    ctaHref: string;
    noticeTitle: string;
    noticeBody: string;
} {
    const firstName = account.name.split(" ")[0] || "there";

    const templates: Record<
        string,
        {
            heading: string;
            preheader: string;
            body: string;
            ctaLabel: string;
            ctaHref: string;
            noticeTitle: string;
            noticeBody: string;
        }
    > = {
        Onboarding: {
            heading: `Welcome to your new workspace, ${firstName}`,
            preheader: `Your ${account.company} workspace is ready.`,
            body:
                `Your team can now organise retention campaigns, review customer activity ` +
                `and prepare personalised emails from one place. We have added a short setup ` +
                `checklist so you can get started without missing anything important.`,
            ctaLabel: "Complete workspace setup",
            ctaHref: "https://cobrai.uk/dashboard",
            noticeTitle: "Recommended next step",
            noticeBody:
                "Connect your sending account before launching your first automated campaign.",
        },
        Expansion: {
            heading: `${account.company} is ready for the next stage`,
            preheader: "A plan recommendation based on your recent account activity.",
            body:
                `Your team is using more of the platform and your current workflow is becoming ` +
                `more active. The recommended plan gives you additional automation capacity, ` +
                `more customer segments and expanded reporting without interrupting your setup.`,
            ctaLabel: "Review recommendation",
            ctaHref: "https://cobrai.uk/dashboard",
            noticeTitle: "No immediate change",
            noticeBody:
                "Your current plan remains active unless you choose to approve the recommendation.",
        },
        Retention: {
            heading: `Can we help ${account.company} get more value?`,
            preheader: "A quick account check-in from your retention team.",
            body:
                `We noticed that activity has slowed recently, so we wanted to check in before ` +
                `your next renewal. Your workspace and existing data are still available, and our ` +
                `team can help you review the features that are most relevant to your goals.`,
            ctaLabel: "Book an account review",
            ctaHref: "https://cobrai.uk/dashboard",
            noticeTitle: "Your data is safe",
            noticeBody:
                "No workspace settings or customer records will be changed during the review.",
        },
        Education: {
            heading: `A faster way for ${account.company} to manage replies`,
            preheader: "A practical workflow your team can use this week.",
            body:
                `You can now review incoming replies, generate a suggested response and schedule ` +
                `the follow-up without leaving the inbox. This keeps conversations together and ` +
                `helps your team respond consistently while retaining full approval control.`,
            ctaLabel: "See the workflow",
            ctaHref: "https://cobrai.uk/dashboard",
            noticeTitle: "You stay in control",
            noticeBody:
                "AI suggestions remain editable and are never sent until a team member approves them.",
        },
        "Win-back": {
            heading: `We saved your ${account.company} workspace`,
            preheader: "Return whenever your team is ready.",
            body:
                `Your previous campaigns, customer records and brand settings are still available. ` +
                `You can reopen the workspace, review what changed and continue from where your team ` +
                `left off without rebuilding the account from the beginning.`,
            ctaLabel: "Return to your workspace",
            ctaHref: "https://cobrai.uk/dashboard",
            noticeTitle: "Workspace availability",
            noticeBody:
                "Your saved settings remain available during the reactivation period.",
        },
        Recovery: {
            heading: `A quick billing update is needed`,
            preheader: `We could not complete the latest payment for ${account.company}.`,
            body:
                `Your email automations are still saved, but future scheduled activity may pause if ` +
                `the billing information is not updated. Please review the payment method to keep ` +
                `campaigns running without interruption.`,
            ctaLabel: "Update payment method",
            ctaHref: "https://cobrai.uk/dashboard",
            noticeTitle: "Security notice",
            noticeBody:
                "Cobrai will never ask you to send card information by email.",
        },
    };

    return templates[emailType] || templates.Retention;
}

function createDemoEmailHtml(
    account: DemoAccount,
    emailType: string,
): string {
    const content = getDemoEmailContent(account, emailType);
    const firstName = escapeEmailHtml(account.name.split(" ")[0] || "there");
    const company = escapeEmailHtml(account.company);
    const heading = escapeEmailHtml(content.heading);
    const preheader = escapeEmailHtml(content.preheader);
    const body = escapeEmailHtml(content.body);
    const ctaLabel = escapeEmailHtml(content.ctaLabel);
    const noticeTitle = escapeEmailHtml(content.noticeTitle);
    const noticeBody = escapeEmailHtml(content.noticeBody);

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
        ${preheader}
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f7fb;">
        <tr>
            <td align="center" style="padding:36px 16px;">
                <table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #e5eaf1;border-radius:18px;overflow:hidden;">
                    <tr>
                        <td align="center" style="padding:38px 42px 20px;">
                            <div style="display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:14px;background:#edf4ff;color:#1769ff;font-size:22px;font-weight:700;">
                                C
                            </div>
                            <div style="margin-top:12px;font-size:20px;font-weight:700;color:#111827;">
                                ${DEMO_BRAND.name}
                            </div>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding:0 42px 8px;">
                            <h1 style="margin:0;font-size:30px;line-height:1.22;letter-spacing:-0.6px;color:#111827;">
                                ${heading}
                            </h1>
                            <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#667085;">
                                ${preheader}
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:24px 42px 0;">
                            <div style="height:1px;background:#e9edf3;"></div>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:28px 42px 8px;">
                            <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#202939;">
                                Hi ${firstName},
                            </p>
                            <p style="margin:0;font-size:15px;line-height:1.75;color:#475467;">
                                ${body}
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding:24px 42px 10px;">
                            <a href="${content.ctaHref}" style="display:inline-block;padding:14px 24px;border-radius:10px;background:#1769ff;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">
                                ${ctaLabel}
                            </a>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:20px 42px 0;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #dfe7f2;border-radius:14px;background:#f9fbff;">
                                <tr>
                                    <td style="padding:18px 20px;">
                                        <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#1d2939;">
                                            ${noticeTitle}
                                        </p>
                                        <p style="margin:0;font-size:13px;line-height:1.6;color:#667085;">
                                            ${noticeBody}
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:24px 42px 0;">
                            <div style="height:1px;background:#e9edf3;"></div>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding:24px 42px 34px;">
                            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#344054;">
                                Need help? We’re here for you.
                            </p>
                            <p style="margin:0;font-size:12px;line-height:1.7;color:#667085;">
                                ${DEMO_BRAND.email} &nbsp;•&nbsp; ${DEMO_BRAND.website}
                            </p>
                            <p style="margin:16px 0 0;font-size:11px;line-height:1.6;color:#98a2b3;">
                                This message was prepared for ${company}.<br />
                                © 2026 ${DEMO_BRAND.name}. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

function createDemoPlainText(
    account: DemoAccount,
    emailType: string,
): string {
    const content = getDemoEmailContent(account, emailType);
    const firstName = account.name.split(" ")[0] || "there";

    return [
        content.heading,
        "",
        `Hi ${firstName},`,
        "",
        content.body,
        "",
        `${content.ctaLabel}: ${content.ctaHref}`,
        "",
        `${content.noticeTitle}: ${content.noticeBody}`,
        "",
        `Need help? ${DEMO_BRAND.email}`,
    ].join("\n");
}

function createDemoEmail(
    index: number,
    overrides: Partial<ScheduledEmail>,
): ScheduledEmail {
    const now = Date.now();
    const createdAt = new Date(now - (index + 1) * 60 * 60 * 1000).toISOString();
    const scheduledFor = new Date(
        now + (index + 1) * 90 * 60 * 1000,
    ).toISOString();

    return {
        id: `demo-email-${index + 1}`,
        workspaceId: "demo-workspace",
        customerId: `demo-customer-${index + 1}`,
        generatedEmailId: null,
        emailType: "Retention",
        subject: "Retention check-in",
        html: "<p>Hi there,</p><p>Just checking in to see how things are going and whether there is anything we can help with.</p>",
        plainText:
            "Hi there,\n\nJust checking in to see how things are going and whether there is anything we can help with.",
        scheduledFor,
        status: "scheduled",
        failureReason: null,
        providerMessageId: null,
        retryCount: 0,
        sentAt: null,
        openedAt: null,
        clickedAt: null,
        deliveredAt: null,
        bouncedAt: null,
        complainedAt: null,
        createdAt,
        updatedAt: createdAt,
        ...overrides,
        customer: {
            id: overrides.customer?.id ?? `demo-customer-${index + 1}`,
            name: overrides.customer?.name ?? "Demo Customer",
            email: overrides.customer?.email ?? "customer@example.com",
            company: overrides.customer?.company ?? "Demo Account",
        },
    };
}

function getDemoEmails(): ScheduledEmail[] {
    const now = new Date();
    const currentDay = now.getDay();
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;

    const accounts = [
        {
            name: "Amina Yusuf",
            email: "amina@northstar-demo.com",
            company: "Northstar CRM",
        },
        {
            name: "Daniel Reed",
            email: "daniel@orbit-demo.com",
            company: "Orbit Analytics",
        },
        {
            name: "Layla Ahmed",
            email: "layla@brightstack-demo.com",
            company: "Brightstack",
        },
        {
            name: "Sarah Collins",
            email: "sarah@atlas-demo.com",
            company: "Atlas Ops",
        },
        {
            name: "Maya Jones",
            email: "maya@flowdesk-demo.com",
            company: "Flowdesk",
        },
        {
            name: "Noah Williams",
            email: "noah@velocitylabs-demo.com",
            company: "Velocity Labs",
        },
        {
            name: "Grace Chen",
            email: "grace@summit-demo.com",
            company: "Summit Co",
        },
        {
            name: "Idris Hassan",
            email: "idris@clearview-demo.com",
            company: "Clearview",
        },
    ];

    const emailTypes = [
        "Onboarding",
        "Expansion",
        "Retention",
        "Education",
        "Win-back",
        "Recovery",
    ];

    const subjects = [
        "Welcome — let’s get your workspace set up",
        "Your team is ready for the next plan",
        "Can we help before your renewal?",
        "A faster way to manage replies",
        "Still interested in automating retention emails?",
        "Your payment needs a quick update",
        "A few ideas to help your team get more value",
        "Your weekly account summary is ready",
    ];

    // Stable demo totals for the visible Monday–Sunday chart.
    // The category counts add up to the same 394 shown everywhere on the page.
    const demoWeek = [
        { total: 56, sent: 37, failed: 2, scheduled: 17 },
        { total: 51, sent: 33, failed: 1, scheduled: 17 },
        { total: 49, sent: 33, failed: 2, scheduled: 14 },
        { total: 60, sent: 38, failed: 2, scheduled: 20 },
        { total: 62, sent: 38, failed: 2, scheduled: 22 },
        { total: 67, sent: 38, failed: 3, scheduled: 26 },
        { total: 49, sent: 31, failed: 2, scheduled: 16 },
    ];

    const emails: ScheduledEmail[] = [];
    let emailIndex = 0;
    let deliveredRemaining = 92;

    demoWeek.forEach((profile, dayIndex) => {
        const day = new Date(now);
        day.setHours(8, 0, 0, 0);
        day.setDate(now.getDate() + mondayOffset + dayIndex);

        const statuses: QueueStatus[] = [
            ...Array.from({ length: profile.sent }, () => "sent" as const),
            ...Array.from({ length: profile.failed }, () => "failed" as const),
            ...Array.from({ length: profile.scheduled }, () => "scheduled" as const),
        ];

        statuses.forEach((baseStatus, itemIndex) => {
            const account = accounts[emailIndex % accounts.length];
            const activityDate = new Date(day);
            activityDate.setHours(
                8 + ((itemIndex * 3) % 12),
                (itemIndex * 11) % 60,
                0,
                0,
            );

            const status: QueueStatus =
                baseStatus === "sent" && deliveredRemaining > 0
                    ? "delivered"
                    : baseStatus;

            if (status === "delivered") deliveredRemaining -= 1;

            const sentAt =
                status === "sent" || status === "delivered"
                    ? new Date(activityDate.getTime() + 3 * 60 * 1000).toISOString()
                    : null;

            const deliveredAt =
                status === "delivered"
                    ? new Date(activityDate.getTime() + 5 * 60 * 1000).toISOString()
                    : null;

            emails.push(
                createDemoEmail(emailIndex, {
                    id: `demo-email-${dayIndex}-${itemIndex}`,
                    customerId: `demo-customer-${(emailIndex % accounts.length) + 1}`,
                    emailType: emailTypes[emailIndex % emailTypes.length],
                    subject: subjects[emailIndex % subjects.length],
                    scheduledFor: activityDate.toISOString(),
                    status,
                    sentAt,
                    deliveredAt,
                    failureReason:
                        status === "failed"
                            ? "Delivery failed after the provider rejected the message."
                            : null,
                    retryCount: status === "failed" ? 1 : 0,
                    plainText: createDemoPlainText(
                        account,
                        emailTypes[emailIndex % emailTypes.length],
                    ),
                    html: createDemoEmailHtml(
                        account,
                        emailTypes[emailIndex % emailTypes.length],
                    ),
                    createdAt: new Date(
                        activityDate.getTime() - 35 * 60 * 1000,
                    ).toISOString(),
                    updatedAt: new Date(
                        activityDate.getTime() + 6 * 60 * 1000,
                    ).toISOString(),
                    customer: {
                        id: `demo-customer-${(emailIndex % accounts.length) + 1}`,
                        ...account,
                    },
                }),
            );

            emailIndex += 1;
        });
    });

    return emails;
}

export default function EmailQueuePage() {
    const [workspaceId, setWorkspaceId] = useState("");
    const [emails, setEmails] = useState<ScheduledEmail[]>([]);
    const [currentTime, setCurrentTime] = useState<number | null>(null);
    const [demoEmails, setDemoEmails] = useState<ScheduledEmail[]>([]);

    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<QueueSort>("most-recent");

    const [page, setPage] = useState(1);
    const pageSize = 10;

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");

    const [selectedEmail, setSelectedEmail] = useState<ScheduledEmail | null>(
        null,
    );

    const hasRealEmails = emails.length > 0;
    const displayEmails = hasRealEmails ? emails : demoEmails;

    const resolveWorkspaceId = useCallback(async () => {
        const stored =
            typeof window !== "undefined"
                ? localStorage.getItem("workspaceId")
                : null;

        if (stored) {
            setWorkspaceId(stored);
            return stored;
        }

        const response = await fetch("/api/email-agent/bootstrap", {
            method: "GET",
            cache: "no-store",
        });

        if (!response.ok) {
            throw new Error("Unable to resolve workspace.");
        }

        const data: WorkspaceResponse = await response.json();
        const id = data.workspaceId || data.workspace?.id;

        if (!id) {
            throw new Error("Workspace ID missing.");
        }

        localStorage.setItem("workspaceId", id);
        setWorkspaceId(id);

        return id;
    }, []);

    const loadEmails = useCallback(
        async (silent = false) => {
            try {
                if (silent) setRefreshing(true);
                else setLoading(true);

                setError("");

                const id = workspaceId || (await resolveWorkspaceId());

                const params = new URLSearchParams({
                    workspaceId: id,
                });

                const response = await fetch(
                    `/api/email-agent/scheduled?${params.toString()}`,
                    {
                        method: "GET",
                        cache: "no-store",
                    },
                );

                if (!response.ok) {
                    throw new Error("Unable to load email queue.");
                }

                const data: ScheduledResponse = await response.json();

                setEmails(
                    Array.isArray(data.scheduledEmails) ? data.scheduledEmails : [],
                );
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Unable to load email queue.",
                );
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [workspaceId, resolveWorkspaceId],
    );

    useEffect(() => {
        const now = Date.now();

        setCurrentTime(now);
        setDemoEmails(getDemoEmails());

        const clockInterval = window.setInterval(() => {
            setCurrentTime(Date.now());
        }, 60_000);

        return () => window.clearInterval(clockInterval);
    }, []);

    useEffect(() => {
        loadEmails(false);
    }, [loadEmails]);

    useEffect(() => {
        const interval = window.setInterval(() => {
            loadEmails(true);
        }, 8000);

        return () => window.clearInterval(interval);
    }, [loadEmails]);

    const filteredEmails = useMemo(() => {
        const query = search.trim().toLowerCase();
        const now = new Date(currentTime ?? Date.now());

        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        const startOfTomorrow = new Date(startOfToday);
        startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);

        const startOfLastSevenDays = new Date(startOfToday);
        startOfLastSevenDays.setDate(startOfLastSevenDays.getDate() - 6);

        const getActivityTime = (email: ScheduledEmail) => {
            const value =
                email.sentAt ||
                email.deliveredAt ||
                email.scheduledFor ||
                email.updatedAt ||
                email.createdAt;

            const timestamp = new Date(value).getTime();
            return Number.isNaN(timestamp) ? 0 : timestamp;
        };

        const matchesSelectedSort = (email: ScheduledEmail) => {
            const createdTimestamp = new Date(email.createdAt).getTime();

            switch (sort) {
                case "today":
                    return (
                        createdTimestamp >= startOfToday.getTime() &&
                        createdTimestamp < startOfTomorrow.getTime()
                    );
                case "yesterday":
                    return (
                        createdTimestamp >= startOfYesterday.getTime() &&
                        createdTimestamp < startOfToday.getTime()
                    );
                case "last-7-days":
                    return (
                        createdTimestamp >= startOfLastSevenDays.getTime() &&
                        createdTimestamp < startOfTomorrow.getTime()
                    );
                case "scheduled":
                    return email.status === "scheduled";
                case "delivered":
                    return (
                        email.status === "delivered" ||
                        Boolean(email.deliveredAt)
                    );
                case "failed":
                    return (
                        email.status === "failed" ||
                        email.status === "bounced" ||
                        email.status === "complained"
                    );
                default:
                    return true;
            }
        };

        return displayEmails
            .filter((email) => {
                const matchesSearch =
                    !query ||
                    email.subject.toLowerCase().includes(query) ||
                    email.customer.name.toLowerCase().includes(query) ||
                    email.customer.email.toLowerCase().includes(query) ||
                    email.customer.company.toLowerCase().includes(query);

                return matchesSearch && matchesSelectedSort(email);
            })
            .sort((first, second) => {
                const firstTime = getActivityTime(first);
                const secondTime = getActivityTime(second);

                return sort === "oldest"
                    ? firstTime - secondTime
                    : secondTime - firstTime;
            });
    }, [currentTime, displayEmails, search, sort]);

    const totalPages = Math.max(1, Math.ceil(filteredEmails.length / pageSize));

    const paginatedEmails = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredEmails.slice(start, start + pageSize);
    }, [filteredEmails, page]);

    const summary = useMemo(() => {
        return {
            total: displayEmails.length,
            scheduled: displayEmails.filter((email) => email.status === "scheduled")
                .length,
            sending: displayEmails.filter((email) => email.status === "sending")
                .length,
            sent: displayEmails.filter(
                (email) => email.sentAt || email.status === "sent",
            ).length,
            delivered: displayEmails.filter(
                (email) => email.deliveredAt || email.status === "delivered",
            ).length,
            failed: displayEmails.filter((email) => email.status === "failed").length,
            bounced: displayEmails.filter(
                (email) => email.bouncedAt || email.status === "bounced",
            ).length,
            complained: displayEmails.filter(
                (email) => email.complainedAt || email.status === "complained",
            ).length,
        };
    }, [displayEmails]);

    const weeklyChart = useMemo(() => {
        const dayFormatter = new Intl.DateTimeFormat("en-GB", {
            weekday: "short",
            timeZone: "Europe/London",
        });

        const fullDateFormatter = new Intl.DateTimeFormat("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Europe/London",
        });

        const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            timeZone: "Europe/London",
        });

        const referenceDate = new Date(currentTime ?? Date.now());
        const currentDay = referenceDate.getDay();
        const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;

        const createWeek = (weekOffset: number) =>
            Array.from({ length: 7 }, (_, index) => {
                const date = new Date(referenceDate);
                date.setHours(12, 0, 0, 0);
                date.setDate(
                    referenceDate.getDate() +
                    mondayOffset +
                    weekOffset * 7 +
                    index,
                );

                return {
                    key: dateKeyFormatter.format(date),
                    label: dayFormatter.format(date),
                    fullLabel: fullDateFormatter.format(date),
                    sent: 0,
                    scheduled: 0,
                    failed: 0,
                    total: 0,
                };
            });

        const currentWeek = createWeek(0);
        const previousWeek = createWeek(-1);

        const currentMap = new Map(
            currentWeek.map((day) => [day.key, day]),
        );
        const previousMap = new Map(
            previousWeek.map((day) => [day.key, day]),
        );

        const addEmailToDay = (
            email: ScheduledEmail,
            day: (typeof currentWeek)[number],
        ) => {
            const failed =
                email.status === "failed" ||
                email.status === "bounced" ||
                email.status === "complained";

            const scheduled = email.status === "scheduled";
            const sent =
                Boolean(email.sentAt) ||
                email.status === "sent" ||
                email.status === "delivered";

            day.total += 1;

            if (failed) {
                day.failed += 1;
            } else if (scheduled) {
                day.scheduled += 1;
            } else if (sent) {
                day.sent += 1;
            }
        };

        displayEmails.forEach((email) => {
            const failed =
                email.status === "failed" ||
                email.status === "bounced" ||
                email.status === "complained";

            const sent =
                Boolean(email.sentAt) ||
                email.status === "sent" ||
                email.status === "delivered";

            const activityDate =
                (failed ? email.updatedAt || email.createdAt : null) ||
                (sent ? email.sentAt || email.deliveredAt : null) ||
                email.scheduledFor ||
                email.createdAt;

            const parsedDate = new Date(activityDate);
            if (Number.isNaN(parsedDate.getTime())) return;

            const key = dateKeyFormatter.format(parsedDate);
            const currentWeekDay = currentMap.get(key);
            const previousWeekDay = previousMap.get(key);

            if (currentWeekDay) addEmailToDay(email, currentWeekDay);
            if (previousWeekDay) addEmailToDay(email, previousWeekDay);
        });

        const todayKey = dateKeyFormatter.format(referenceDate);

        // Future dates cannot contain completed activity. Only emails that are
        // genuinely scheduled for those dates are shown in the chart.
        currentWeek.forEach((day) => {
            if (day.key > todayKey) {
                day.sent = 0;
                day.failed = 0;
                day.total = day.scheduled;
            }
        });

        const maximum = Math.max(
            ...currentWeek.map((day) => day.total),
            ...previousWeek.map((day) => day.total),
            1,
        );
        const roundedMaximum =
            maximum <= 10 ? 10 : Math.ceil(maximum / 10) * 10;

        const scale = [1, 0.8, 0.6, 0.4, 0.2, 0].map((ratio) =>
            Math.round(roundedMaximum * ratio),
        );

        const currentTotal = currentWeek.reduce(
            (total, day) => total + day.total,
            0,
        );
        const measuredPreviousTotal = previousWeek.reduce(
            (total, day) => total + day.total,
            0,
        );
        const previousTotal = hasRealEmails
            ? measuredPreviousTotal
            : Math.round(currentTotal / 1.162);
        const change = currentTotal - previousTotal;
        const changePercent =
            previousTotal > 0 ? (change / previousTotal) * 100 : 0;

        return {
            days: currentWeek.map((day) => ({
                ...day,
                totalHeight: (day.total / roundedMaximum) * 100,
                sentHeight: (day.sent / roundedMaximum) * 100,
                scheduledHeight:
                    (day.scheduled / roundedMaximum) * 100,
                failedHeight: (day.failed / roundedMaximum) * 100,
            })),
            todayKey,
            scale,
            currentTotal,
            previousTotal,
            change,
            changePercent,
        };
    }, [currentTime, displayEmails, hasRealEmails]);

    const downloadWeeklyChart = useCallback(() => {
        const rows = [
            ["Day", "Total Emails", "Sent", "Scheduled", "Failed"],
            ...weeklyChart.days.map((day) => [
                day.fullLabel,
                day.total,
                day.sent,
                day.scheduled,
                day.failed,
            ]),
        ];

        const csv = rows
            .map((row) =>
                row
                    .map((value) => `"${String(value).replaceAll('"', '""')}"`)
                    .join(","),
            )
            .join("\n");

        const blob = new Blob([csv], {
            type: "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");

        anchor.href = url;
        anchor.download = "email-activity-this-week.csv";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }, [weeklyChart]);

    return (
        <section className="emailQueuePage">
            <header className="emailQueueTopbar">
                <div>
                    <h1>Email Queue</h1>
                    <p>
                        Monitor scheduled, sending, delivered, bounced and failed emails.
                    </p>
                </div>

                <div className="emailQueueActions">
                    <button
                        type="button"
                        className="primaryButton"
                        onClick={() => {
                            window.location.href = "/dashboard/email-builder";
                        }}
                    >
                        + Send Email
                    </button>
                </div>
            </header>

            {error && <div className="emailQueueError">{error}</div>}

            <section className="emailQueueOverviewGrid">
                <section className="emailQueueMegaCard">
                    <div className="emailQueueMegaHeader">
                        <div>
                            <div className="emailQueueMegaLabel">
                                Total emails <Info size={13} />
                            </div>

                            <div className="emailQueueMegaMain">
                                <h2>{summary.total.toLocaleString()}</h2>
                                <span className="megaTrend neutral">
                                    {hasRealEmails ? "Live queue" : "Demo preview"}
                                </span>
                            </div>
                        </div>

                        <span className="emailQueueMegaIcon">
                            <Mail size={18} />
                        </span>
                    </div>

                    <div className="emailQueueMegaStats">
                        <div>
                            <span>Scheduled</span>
                            <strong>{summary.scheduled}</strong>
                            <small>Waiting to send</small>
                        </div>

                        <div>
                            <span>Sending</span>
                            <strong>{summary.sending}</strong>
                            <small>In progress</small>
                        </div>

                        <div>
                            <span>Sent</span>
                            <strong>{summary.sent}</strong>
                            <small>Accepted by Resend</small>
                        </div>

                        <div>
                            <span>Delivered</span>
                            <strong>{summary.delivered}</strong>
                            <small>Reached inbox</small>
                        </div>

                        <div>
                            <span>Failed</span>
                            <strong>
                                {summary.failed + summary.bounced + summary.complained}
                            </strong>
                            <small>Needs attention</small>
                        </div>
                    </div>
                </section>

                <section className="emailQueueChartCard">
                    <div className="emailQueueChartHeader">
                        <div>
                            <div className="emailQueueChartEyebrow">
                                Total Emails
                            </div>

                            <div className="emailQueueChartHeadline">
                                <strong>
                                    {weeklyChart.currentTotal.toLocaleString()}
                                </strong>

                                <div
                                    className={`emailQueueChartTrend ${weeklyChart.change >= 0 ? "up" : "down"
                                        }`}
                                >
                                    <span>
                                        {weeklyChart.change >= 0 ? "↑" : "↓"}{" "}
                                        {Math.abs(
                                            weeklyChart.changePercent,
                                        ).toFixed(1)}
                                        % (
                                        {weeklyChart.change >= 0 ? "+" : "−"}
                                        {Math.abs(
                                            weeklyChart.change,
                                        ).toLocaleString()}
                                        )
                                    </span>
                                    <small>
                                        vs.{" "}
                                        {weeklyChart.previousTotal.toLocaleString()}{" "}
                                        last week
                                    </small>
                                </div>
                            </div>
                        </div>

                        <div className="emailQueueChartActions">
                            <button
                                type="button"
                                onClick={downloadWeeklyChart}
                                aria-label="Download weekly email activity"
                                title="Download CSV"
                            >
                                <Download size={15} />
                            </button>

                            <button
                                type="button"
                                aria-label="More chart options"
                                title="More options"
                            >
                                <MoreHorizontal size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="emailQueueChart">
                        <div className="emailQueueChartScale" aria-hidden="true">
                            {weeklyChart.scale.map((tick, index) => (
                                <span key={`${tick}-${index}`}>
                                    {tick.toLocaleString()}
                                </span>
                            ))}
                        </div>

                        <div className="emailQueueChartPlot">
                            <div className="emailQueueChartGrid" aria-hidden="true">
                                {weeklyChart.scale.map((tick, index) => (
                                    <span key={`${tick}-${index}`} />
                                ))}
                            </div>

                            <div className="emailQueueChartBars">
                                {weeklyChart.days.map((day) => {
                                    const isToday = day.key === weeklyChart.todayKey;

                                    return (
                                        <div
                                            className={`emailQueueChartColumn${isToday ? " isToday" : ""}`}
                                            key={day.key}
                                        >
                                            <div className="emailQueueChartTrack" tabIndex={0}>

                                                <div
                                                    className="emailQueueTotalBar"
                                                    style={{
                                                        height: `${day.totalHeight}%`,
                                                    }}
                                                />

                                                <div className="emailQueueActualStack">
                                                    <div
                                                        className="emailQueueChartSegment sent"
                                                        style={{
                                                            height: `${day.sentHeight}%`,
                                                        }}
                                                    />
                                                    <div
                                                        className="emailQueueChartSegment failed"
                                                        style={{
                                                            height: `${day.failedHeight}%`,
                                                        }}
                                                    />
                                                    <div
                                                        className="emailQueueChartSegment scheduled"
                                                        style={{
                                                            height: `${day.scheduledHeight}%`,
                                                        }}
                                                    />
                                                </div>

                                                <div className="emailQueueChartTooltip" role="tooltip">
                                                    <strong>{day.fullLabel}</strong>
                                                    <span>
                                                        <i className="total" />
                                                        Total Emails
                                                        <b>{day.total.toLocaleString()}</b>
                                                    </span>
                                                    <span>
                                                        <i className="sent" />
                                                        Sent
                                                        <b>{day.sent.toLocaleString()}</b>
                                                    </span>
                                                    <span>
                                                        <i className="failed" />
                                                        Failed
                                                        <b>{day.failed.toLocaleString()}</b>
                                                    </span>
                                                    <span>
                                                        <i className="scheduled" />
                                                        Scheduled
                                                        <b>{day.scheduled.toLocaleString()}</b>
                                                    </span>
                                                </div>
                                            </div>

                                            <span>{day.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="emailQueueChartLegend" aria-label="Chart legend">
                        <span>
                            <i className="total" />
                            Total Emails
                        </span>
                        <span>
                            <i className="sent" />
                            Sent
                        </span>
                        <span>
                            <i className="failed" />
                            Failed
                        </span>
                        <span>
                            <i className="scheduled" />
                            Scheduled
                        </span>
                    </div>
                </section>
            </section>

            <section className="emailQueuePanel">
                <div className="emailQueueFilters">
                    <input
                        placeholder="Search account, email, company or subject"
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(1);
                        }}
                    />

                    <label className="emailQueueSortControl">
                        <span className="srOnly">Sort email queue</span>
                        <select
                            value={sort}
                            onChange={(event) => {
                                setSort(event.target.value as QueueSort);
                                setPage(1);
                            }}
                        >
                            <option value="most-recent">Most recent</option>
                            <option value="oldest">Oldest</option>
                            <option value="today">Today</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="last-7-days">Last 7 days</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="delivered">Delivered</option>
                            <option value="failed">Failed</option>
                        </select>
                        <ChevronDown size={15} aria-hidden="true" />
                    </label>
                </div>

                <div className="emailQueueTable">
                    <div className="emailQueueTableHead">
                        <span>Account</span>
                        <span>Subject</span>
                        <span>Status</span>
                        <span>Email type</span>
                        <span>Scheduled for</span>
                        <span>Due in</span>
                        <span>Created</span>
                        <span>Controls</span>
                    </div>

                    {loading && hasRealEmails ? (
                        <div className="emailQueueEmpty">Loading email queue...</div>
                    ) : paginatedEmails.length === 0 ? (
                        <div className="emailQueueEmpty">
                            <strong>No emails found.</strong>
                            <p>Scheduled emails will appear here automatically.</p>
                        </div>
                    ) : (
                        paginatedEmails.map((email) => (
                            <div className="emailQueueTableRow" key={email.id}>
                                <Link
                                    href={`/dashboard/customers/${email.customer.id}`}
                                    className="accountLink"
                                >
                                    <strong>
                                        {email.customer.company || email.customer.name}
                                    </strong>
                                    <p>{email.customer.email}</p>
                                </Link>

                                <span>{email.subject}</span>

                                <span className={`queueBadge ${email.status}`}>
                                    {formatStatus(email.status)}
                                </span>

                                <span
                                    className={`emailTypeBadge emailType-${getEmailTypeClass(email.emailType)}`}
                                >
                                    {email.emailType}
                                </span>

                                <span>{formatDate(email.scheduledFor)}</span>

                                <span>
                                    {getSendIn(
                                        email.scheduledFor,
                                        email.status,
                                        currentTime,
                                    )}
                                </span>

                                <span>{formatDate(email.createdAt)}</span>

                                <div className="emailQueueRowActions">
                                    <button type="button" onClick={() => setSelectedEmail(email)}>
                                        View
                                    </button>
                                </div>

                                {email.failureReason && (
                                    <p className="queueFailureReason">{email.failureReason}</p>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div className="emailQueueFooter">
                    <p>
                        Showing {paginatedEmails.length} of {filteredEmails.length} emails
                    </p>

                    <div>
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                        >
                            ‹
                        </button>

                        <button type="button" className="activePage">
                            {page}
                        </button>

                        <button
                            type="button"
                            disabled={page >= totalPages}
                            onClick={() => setPage((current) => current + 1)}
                        >
                            ›
                        </button>
                    </div>
                </div>
            </section>

            {selectedEmail && (
                <div
                    className="queueModalOverlay"
                    role="presentation"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                            setSelectedEmail(null);
                        }
                    }}
                >
                    <section
                        className="queuePreviewModal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="queue-preview-title"
                    >
                        <header className="queuePreviewHeader">
                            <div>
                                <h2 id="queue-preview-title">Email preview</h2>
                                <p>
                                    This is how the email will appear to the recipient.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setSelectedEmail(null)}
                                aria-label="Close email preview"
                            >
                                <X size={17} />
                            </button>
                        </header>

                        <div className="queuePreviewMeta">
                            <div>
                                <span>From</span>
                                <strong>
                                    {DEMO_BRAND.name} &lt;{DEMO_BRAND.email}&gt;
                                </strong>
                            </div>

                            <div>
                                <span>To</span>
                                <strong>{selectedEmail.customer.email}</strong>
                            </div>

                            <div>
                                <span>Subject</span>
                                <strong>{selectedEmail.subject}</strong>
                            </div>
                        </div>

                        <div className="queuePreviewCanvas">
                            <iframe
                                title={`Preview of ${selectedEmail.subject}`}
                                srcDoc={selectedEmail.html}
                                sandbox="allow-popups allow-popups-to-escape-sandbox"
                                className="queueEmailPreviewFrame"
                            />
                        </div>
                    </section>
                </div>
            )}
        </section>
    );
}
