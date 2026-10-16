"use client";

import "@fontsource/inter";
import {
    Calendar,
    CalendarClock,
    BarChart3,
    Clock3,
    Eye,
    Mail,
    MousePointer2,
    Plus,
    ChevronLeft,
    ChevronRight,
    MoreVertical,
    Send,
    X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { customers } from "../../lib/customersData";
import {
    chartDataByRange,
    ChartRange,
} from "../../lib/emailDashboardDemoData";

import "./email-dashboard.css";

const DEMO_WORKSPACE_ID = "demo-workspace";
const kpiIcons = [Mail, Eye, MousePointer2, CalendarClock];
const EMAILS_PER_PAGE = 6;

const chartRanges: Array<{ label: string; value: ChartRange }> = [
    { label: "24hrs", value: "24hrs" },
    { label: "7 days", value: "7days" },
    { label: "30 days", value: "30days" },
];

type WorkspaceResponse = {
    workspaceId?: string;
    workspace?: { id: string };
};

type ScheduledEmail = {
    id: string;
    account: string;
    email: string;
    subject: string;
    type: string;
    status: string;
    scheduledDate: string;
    scheduledTime: string;
    scheduledFor: string;
    isDemo?: boolean;
};

type ScheduledEmailChartPoint = {
    key: string;
    label: string;
    count: number;
    emails: ScheduledEmail[];
};

type ApiScheduledEmail = {
    id: string;
    emailType: string;
    subject: string;
    scheduledFor: string;
    status: string;
    customer?: {
        id: string;
        name: string;
        email: string;
        company: string;
    };
};

type ApiCustomer = {
    id: string;
    name?: string | null;
    email?: string | null;
    company?: string | null;
    emailsSent?: number | null;
    openRate?: number | string | null;
    clickRate?: number | string | null;
    lastActivity?: string | null;
};

type EmailSentChartPoint = {
    label: string;
    sent: number;
    value: number;
};

type ReplyClickChartPoint = {
    label: string;
    replies: number;
    clicks: number;
    value: number;
    sent: number;
    actionRate: number;
};

type Tooltip =
    | {
        type: "emails";
        point: EmailSentChartPoint;
        x: number;
        y: number;
    }
    | {
        type: "actions";
        point: ReplyClickChartPoint;
        x: number;
        y: number;
    };

type RecentEmail = {
    id: string;
    customerId: string;
    account: string;
    email: string;
    subject: string;
    preview: string;
    status: string;
    sentDate: string;
    sentTime: string;
};

type DashboardEvent = {
    id: string;
    status: string;
    subject?: string;
    emailType?: string;
    reason?: string | null;
    createdAt?: string;
    customer?: {
        id?: string;
        name?: string;
        email?: string;
        company?: string;
    };
};

type DashboardAnalytics = {
    customers: number;
    scheduled: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    failed: number;
    replied: number;
    openRate: number;
    clickRate: number;
    bounceRate: number;
    recentEvents: DashboardEvent[];
};

const demoAnalytics: DashboardAnalytics = {
    customers: customers.length,
    scheduled: 5,
    sent: 1248,
    delivered: 1198,
    opened: 684,
    clicked: 142,
    bounced: 8,
    failed: 4,
    replied: 37,
    openRate: 57,
    clickRate: 12,
    bounceRate: 1,
    recentEvents: [],
};

function getEmailSubject(status: string) {
    if (status === "At Risk") return "We noticed a drop in usage";
    if (status === "Unengaged") return "Can we help recover activity?";
    return "Quick check-in before renewal";
}

function getEmailType(status: string) {
    if (status === "At Risk") return "Retention";
    if (status === "Unengaged") return "Recovery";
    return "Follow-up";
}


function formatDateInput(date: Date) {
    return date.toISOString().split("T")[0];
}

function formatTimeInput(date: Date) {
    return date.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function formatLondonTime(date: Date) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).formatToParts(date);

    const hourPart = parts.find((part) => part.type === "hour")?.value || "12";
    const minutePart = parts.find((part) => part.type === "minute")?.value || "00";
    const dayPeriodPart =
        parts.find((part) => part.type === "dayPeriod")?.value.toLowerCase() || "";

    const hour = Number(hourPart) % 12 || 12;
    const minutes = minutePart === "00" ? "" : `:${minutePart}`;

    return `${hour}${minutes}${dayPeriodPart}`;
}

function formatEventDateTime(value?: string) {
    if (!value) {
        return {
            sentDate: "Recently",
            sentTime: "",
        };
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        const parts = value.split(",").map((part) => part.trim());

        return {
            sentDate: parts[0] || value,
            sentTime: parts.slice(1).join(", "),
        };
    }

    const now = new Date();
    const diffMilliseconds = Math.max(0, now.getTime() - date.getTime());
    const diffMinutes = Math.floor(diffMilliseconds / 60000);
    const diffHours = Math.floor(diffMinutes / 60);

    let relativeTime: string;

    if (diffMinutes < 1) {
        relativeTime = "Just now";
    } else if (diffMinutes < 60) {
        relativeTime = `${diffMinutes} min${diffMinutes === 1 ? "" : "s"} ago`;
    } else if (diffHours < 24) {
        relativeTime = `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
    } else {
        relativeTime = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Europe/London",
            day: "2-digit",
            month: "short",
        }).format(date);
    }

    return {
        sentDate: relativeTime,
        sentTime: formatLondonTime(date),
    };
}

function isTodayActivity(value?: string | null) {
    if (!value) return false;

    const normalised = value.trim().toLowerCase();

    if (
        normalised === "today" ||
        normalised === "just now" ||
        normalised.includes("minute ago") ||
        normalised.includes("minutes ago") ||
        normalised.includes("min ago") ||
        normalised.includes("mins ago") ||
        normalised.includes("hour ago") ||
        normalised.includes("hours ago") ||
        normalised.includes("hr ago") ||
        normalised.includes("hrs ago")
    ) {
        return true;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return false;

    const now = new Date();

    return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
    );
}

function formatStatus(status: string) {
    const normalised = status.toLowerCase();

    if (normalised === "opened" || normalised === "open") return "Opened";
    if (normalised === "clicked" || normalised === "click") return "Clicked";
    if (normalised === "replied" || normalised === "reply") return "Replied";
    if (normalised === "failed") return "Failed";
    if (normalised === "bounced") return "Bounced";
    if (normalised === "complained") return "Complained";
    if (normalised === "delivered") return "Delivered";
    if (normalised === "sending") return "Sending";
    if (normalised === "scheduled") return "Scheduled";

    return "Sent";
}

function getScheduleDisplay(date: string, time: string) {
    const scheduledAt = new Date(`${date}T${time}`);
    const now = new Date();

    if (Number.isNaN(scheduledAt.getTime())) return "Invalid date";

    const diffMinutes = Math.round(
        (scheduledAt.getTime() - now.getTime()) / 60000,
    );

    if (diffMinutes <= 0) return "Due now";
    if (diffMinutes < 60) return `In ${diffMinutes} mins`;
    if (diffMinutes < 120) return "In 1 hr";

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    if (scheduledAt.toDateString() === tomorrow.toDateString()) {
        return "Tomorrow";
    }

    return scheduledAt.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
    });
}

function getDefaultScheduledDate(index: number) {
    const now = new Date();
    const scheduledAt = new Date(now);

    const spacing = Math.max(
        8,
        Math.floor(55 / Math.max(customers.slice(0, 5).length, 1)),
    );

    scheduledAt.setMinutes(now.getMinutes() + spacing * (index + 1));
    scheduledAt.setSeconds(0);
    scheduledAt.setMilliseconds(0);

    return scheduledAt;
}

function getScheduledBucketStart(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return null;

    const bucket = new Date(date);
    bucket.setSeconds(0, 0);
    bucket.setMinutes(bucket.getMinutes() < 30 ? 0 : 30);

    return bucket;
}

function formatScheduledBucketLabel(date: Date) {
    return date
        .toLocaleTimeString("en-GB", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        })
        .replace(" ", "")
        .toLowerCase();
}

function formatScheduledWindow(startValue: string) {
    const start = new Date(startValue);

    if (Number.isNaN(start.getTime())) return "Upcoming window";

    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 30);

    return `${formatLondonTime(start)} – ${formatLondonTime(end)}`;
}

function formatScheduledCountdown(value: string, isLive = false) {
    if (isLive) return "Sending now";

    const scheduledAt = new Date(value);
    const now = new Date();

    if (Number.isNaN(scheduledAt.getTime())) return "Upcoming";

    const diffMinutes = Math.max(
        0,
        Math.ceil((scheduledAt.getTime() - now.getTime()) / 60000),
    );

    if (diffMinutes < 1) return "Due now";
    if (diffMinutes < 60) return `In ${diffMinutes}m`;

    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;

    return minutes > 0 ? `In ${hours}h ${minutes}m` : `In ${hours}h`;
}

function isSameLocalDay(first: Date, second: Date) {
    return (
        first.getFullYear() === second.getFullYear() &&
        first.getMonth() === second.getMonth() &&
        first.getDate() === second.getDate()
    );
}

function buildScheduledEmailChart(
    emails: ScheduledEmail[],
): ScheduledEmailChartPoint[] {
    const grouped = new Map<string, ScheduledEmailChartPoint>();

    emails.forEach((email) => {
        const bucketStart = getScheduledBucketStart(email.scheduledFor);

        if (!bucketStart) return;

        const key = bucketStart.toISOString();
        const existing = grouped.get(key);

        if (existing) {
            existing.count += 1;
            existing.emails.push(email);
            return;
        }

        grouped.set(key, {
            key,
            label: formatScheduledBucketLabel(bucketStart),
            count: 1,
            emails: [email],
        });
    });

    return [...grouped.values()].sort((a, b) =>
        a.key.localeCompare(b.key),
    );
}

function getChartAxisLabels<T extends { label: string }>(data: T[]) {
    if (data.length <= 7) return data;

    return [data[0], data[Math.floor(data.length / 2)], data[data.length - 1]];
}

function toNumber(value: number | string | null | undefined) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === "string") {
        const parsed = Number(value.replace("%", "").replace(/,/g, "").trim());
        return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
}

function buildDashboardAnalytics(
    liveCustomers: ApiCustomer[],
    liveScheduledEmails: ScheduledEmail[],
): DashboardAnalytics {
    const sent = liveCustomers.reduce(
        (total, customer) => total + Math.max(0, toNumber(customer.emailsSent)),
        0,
    );

    const weightedOpenTotal = liveCustomers.reduce((total, customer) => {
        const customerSent = Math.max(0, toNumber(customer.emailsSent));
        return total + customerSent * Math.max(0, toNumber(customer.openRate));
    }, 0);

    const weightedClickTotal = liveCustomers.reduce((total, customer) => {
        const customerSent = Math.max(0, toNumber(customer.emailsSent));
        return total + customerSent * Math.max(0, toNumber(customer.clickRate));
    }, 0);

    const openRate = sent > 0 ? weightedOpenTotal / sent : 0;
    const clickRate = sent > 0 ? weightedClickTotal / sent : 0;
    const opened = Math.round(sent * (openRate / 100));
    const clicked = Math.round(sent * (clickRate / 100));

    return {
        customers: liveCustomers.length,
        scheduled: liveScheduledEmails.filter((email) =>
            ["scheduled", "sending"].includes(email.status.toLowerCase()),
        ).length,
        sent,
        delivered: sent,
        opened,
        clicked,
        bounced: 0,
        failed: liveScheduledEmails.filter(
            (email) => email.status.toLowerCase() === "failed",
        ).length,
        replied: 0,
        openRate,
        clickRate,
        bounceRate: 0,
        recentEvents: [],
    };
}

function getLiveStats(displayAnalytics: DashboardAnalytics) {
    return [
        {
            label: "Emails Sent",
            value: displayAnalytics.sent.toLocaleString("en-GB"),
            change: `${displayAnalytics.delivered.toLocaleString("en-GB")} delivered`,
            trend: "up",
        },
        {
            label: "Open Rate",
            value: `${Number(displayAnalytics.openRate || 0).toFixed(1)}%`,
            change: `${displayAnalytics.opened.toLocaleString("en-GB")} opens`,
            trend: "up",
        },
        {
            label: "Click Rate",
            value: `${Number(displayAnalytics.clickRate || 0).toFixed(1)}%`,
            change: `${displayAnalytics.clicked.toLocaleString("en-GB")} clicks`,
            trend: "up",
        },
        {
            label: "Scheduled",
            value: displayAnalytics.scheduled.toLocaleString("en-GB"),
            change:
                displayAnalytics.failed > 0
                    ? `${displayAnalytics.failed} failed`
                    : "Queue healthy",
            trend: displayAnalytics.failed > 0 ? "down" : "neutral",
        },
    ];
}

function getStoredWorkspaceId() {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("workspaceId") || "";
}

function isDemoWorkspaceId(workspaceId: string) {
    return workspaceId === DEMO_WORKSPACE_ID;
}

function mapScheduledEmail(email: ApiScheduledEmail): ScheduledEmail {
    const scheduledAt = new Date(email.scheduledFor);
    const safeDate = Number.isNaN(scheduledAt.getTime())
        ? new Date()
        : scheduledAt;

    return {
        id: email.id,
        account: email.customer?.company || email.customer?.name || "Customer",
        email: email.customer?.email || "",
        subject: email.subject,
        type: email.emailType || "Email",
        status: formatStatus(email.status),
        scheduledDate: formatDateInput(safeDate),
        scheduledTime: formatTimeInput(safeDate),
        scheduledFor: safeDate.toISOString(),
    };
}

function createDemoScheduledEmails(): ScheduledEmail[] {
    return customers.slice(0, 5).map((customer, index) => {
        const scheduledAt = getDefaultScheduledDate(index);

        return {
            id: customer.id,
            account: customer.company,
            email: customer.email,
            subject: getEmailSubject(customer.status),
            type: getEmailType(customer.status),
            status: "Scheduled",
            scheduledDate: formatDateInput(scheduledAt),
            scheduledTime: formatTimeInput(scheduledAt),
            scheduledFor: scheduledAt.toISOString(),
            isDemo: true,
        };
    });
}

function getBucketStart(date: Date, range: ChartRange) {
    const bucket = new Date(date);

    if (range === "24hrs") {
        bucket.setMinutes(0, 0, 0);
        return bucket;
    }

    bucket.setHours(0, 0, 0, 0);
    return bucket;
}

function getChartBuckets(range: ChartRange) {
    const now = new Date();
    const buckets: Array<{ label: string; key: string; start: Date }> = [];

    if (range === "24hrs") {
        for (let index = 23; index >= 0; index -= 1) {
            const date = new Date(now);
            date.setHours(now.getHours() - index, 0, 0, 0);
            buckets.push({
                label: date.toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
                key: date.toISOString(),
                start: date,
            });
        }

        return buckets;
    }

    const days = range === "7days" ? 7 : 30;

    for (let index = days - 1; index >= 0; index -= 1) {
        const date = new Date(now);
        date.setDate(now.getDate() - index);
        date.setHours(0, 0, 0, 0);
        buckets.push({
            label:
                range === "7days"
                    ? date.toLocaleDateString("en-GB", { weekday: "short" })
                    : date.toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                    }),
            key: date.toISOString(),
            start: date,
        });
    }

    return buckets;
}

function buildLiveCharts(events: DashboardEvent[], range: ChartRange) {
    const buckets = getChartBuckets(range);
    const counts = new Map<
        string,
        { sent: number; clicks: number; replies: number }
    >();

    buckets.forEach((bucket) => {
        counts.set(bucket.key, { sent: 0, clicks: 0, replies: 0 });
    });

    events.forEach((event) => {
        if (!event.createdAt) return;

        const eventDate = new Date(event.createdAt);
        if (Number.isNaN(eventDate.getTime())) return;

        const bucketStart = getBucketStart(eventDate, range);
        const key = bucketStart.toISOString();
        const bucket = counts.get(key);

        if (!bucket) return;

        const status = event.status.toLowerCase();

        if (
            ["sent", "delivered", "opened", "clicked", "replied"].includes(status)
        ) {
            if (status === "sent") bucket.sent += 1;
            if (status === "clicked") bucket.clicks += 1;
            if (status === "replied") bucket.replies += 1;
        }
    });

    const emailSentChart: EmailSentChartPoint[] = buckets.map((bucket) => {
        const value = counts.get(bucket.key)?.sent || 0;

        return {
            label: bucket.label,
            sent: value,
            value,
        };
    });

    const replyClickChart: ReplyClickChartPoint[] = buckets.map((bucket) => {
        const point = counts.get(bucket.key) || { sent: 0, clicks: 0, replies: 0 };
        const value = point.clicks + point.replies;
        const sent = Math.max(point.sent, 0);

        return {
            label: bucket.label,
            replies: point.replies,
            clicks: point.clicks,
            value,
            sent,
            actionRate: sent ? Number(((value / sent) * 100).toFixed(1)) : 0,
        };
    });

    return { emailSentChart, replyClickChart };
}

function buildDemoCharts(range: ChartRange) {
    const chartData = chartDataByRange[range];

    const emailSentChart: EmailSentChartPoint[] = chartData.map((point) => ({
        label: point.label,
        sent: point.sent,
        value: point.sent,
    }));

    const replyClickChart: ReplyClickChartPoint[] = chartData.map((point) => {
        const clicks = Math.max(
            1,
            Math.round(point.sent * (demoAnalytics.clickRate / 100)),
        );
        const replies = Math.max(
            1,
            Math.round(
                point.sent * (demoAnalytics.replied / Math.max(demoAnalytics.sent, 1)),
            ),
        );
        const value = clicks + replies;
        const actionRate = Number(
            ((value / Math.max(point.sent, 1)) * 100).toFixed(1),
        );

        return {
            label: point.label,
            replies,
            clicks,
            value,
            sent: point.sent,
            actionRate,
        };
    });

    return { emailSentChart, replyClickChart };
}

export default function DashboardPage() {
    const [range, setRange] = useState<ChartRange>("24hrs");
    const [sentEmailsPage, setSentEmailsPage] = useState(1);
    const [selectedEmail, setSelectedEmail] = useState<ScheduledEmail | null>(
        null,
    );
    const [calendarDate, setCalendarDate] = useState(new Date());
    const [schedule, setSchedule] = useState({ date: "", time: "" });
    const [tooltip, setTooltip] = useState<Tooltip | null>(null);
    const [workspaceId, setWorkspaceId] = useState("");
    const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
    const [liveCustomers, setLiveCustomers] = useState<ApiCustomer[]>([]);
    const [isLoadingScheduled, setIsLoadingScheduled] = useState(true);
    const [isSavingSchedule, setIsSavingSchedule] = useState(false);
    const [scheduleNotice, setScheduleNotice] = useState("");

    const resolveWorkspaceId = useCallback(async () => {
        const stored = getStoredWorkspaceId();

        if (stored) {
            setWorkspaceId(stored);
            return stored;
        }

        try {
            const response = await fetch("/api/email-agent/bootstrap", {
                method: "GET",
                cache: "no-store",
            });

            if (!response.ok) {
                setWorkspaceId(DEMO_WORKSPACE_ID);
                return DEMO_WORKSPACE_ID;
            }

            const data: WorkspaceResponse = await response.json();
            const id = data.workspaceId || data.workspace?.id || DEMO_WORKSPACE_ID;

            if (typeof window !== "undefined") {
                localStorage.setItem("workspaceId", id);
            }

            setWorkspaceId(id);
            return id;
        } catch {
            setWorkspaceId(DEMO_WORKSPACE_ID);
            return DEMO_WORKSPACE_ID;
        }
    }, []);

    const isDemoWorkspace = isDemoWorkspaceId(workspaceId);

    const liveAnalytics = useMemo(
        () => buildDashboardAnalytics(liveCustomers, scheduledEmails),
        [liveCustomers, scheduledEmails],
    );

    const hasRealData =
        !isDemoWorkspace &&
        (liveCustomers.length > 0 || scheduledEmails.length > 0);

    const displayAnalytics = hasRealData ? liveAnalytics : demoAnalytics;
    const displayStats = getLiveStats(displayAnalytics);

    const { emailSentChart, replyClickChart } = useMemo(() => {
        if (hasRealData) {
            return buildLiveCharts(displayAnalytics.recentEvents || [], range);
        }

        return buildDemoCharts(range);
    }, [displayAnalytics.recentEvents, hasRealData, range]);

    const maxSent = useMemo(() => {
        return Math.max(...emailSentChart.map((point) => point.value), 1);
    }, [emailSentChart]);

    const maxReplyClick = useMemo(() => {
        return Math.max(...replyClickChart.map((point) => point.value), 1);
    }, [replyClickChart]);

    const latestActions = replyClickChart[replyClickChart.length - 1] || {
        actionRate: 0,
        value: 0,
        sent: 0,
        clicks: 0,
        replies: 0,
        label: "Now",
    };

    const emailSentAxisLabels = getChartAxisLabels(emailSentChart);
    const replyClickAxisLabels = getChartAxisLabels(replyClickChart);

    const loadCustomers = useCallback(async () => {
        const id = workspaceId || (await resolveWorkspaceId());

        if (isDemoWorkspaceId(id)) {
            setLiveCustomers([]);
            return;
        }

        try {
            const response = await fetch(
                `/api/dashboard/customers?workspaceId=${encodeURIComponent(id)}`,
                { cache: "no-store" },
            );

            if (!response.ok) {
                setLiveCustomers([]);
                return;
            }

            const data = await response.json();
            const nextCustomers = Array.isArray(data)
                ? data
                : Array.isArray(data.customers)
                    ? data.customers
                    : [];

            setLiveCustomers(nextCustomers);
        } catch {
            setLiveCustomers([]);
        }
    }, [resolveWorkspaceId, workspaceId]);

    const loadScheduledEmails = useCallback(async () => {
        const id = workspaceId || (await resolveWorkspaceId());

        if (isDemoWorkspaceId(id)) {
            setScheduledEmails(createDemoScheduledEmails());
            setIsLoadingScheduled(false);
            return;
        }

        try {
            setIsLoadingScheduled(true);

            const response = await fetch(
                `/api/email-agent/scheduled?workspaceId=${encodeURIComponent(id)}`,
                { cache: "no-store" },
            );

            const data = await response.json();

            if (!response.ok || !Array.isArray(data.scheduledEmails)) {
                setScheduledEmails([]);
                return;
            }

            setScheduledEmails(
                data.scheduledEmails
                    .map(mapScheduledEmail)
                    .filter((email: ScheduledEmail) =>
                        ["scheduled", "sending", "failed"].includes(
                            email.status.toLowerCase(),
                        ),
                    )
                    .slice(0, 5),
            );
        } catch {
            setScheduledEmails([]);
        } finally {
            setIsLoadingScheduled(false);
        }
    }, [resolveWorkspaceId, workspaceId]);

    useEffect(() => {
        resolveWorkspaceId();
    }, [resolveWorkspaceId]);

    useEffect(() => {
        loadCustomers();
        loadScheduledEmails();
    }, [loadCustomers, loadScheduledEmails]);

    useEffect(() => {
        const interval = window.setInterval(() => {
            loadCustomers();
            loadScheduledEmails();
        }, 10000);

        return () => window.clearInterval(interval);
    }, [loadCustomers, loadScheduledEmails]);

    const emailsSentToday: RecentEmail[] = useMemo(() => {
        if (hasRealData && displayAnalytics.recentEvents?.length) {
            return displayAnalytics.recentEvents
                .filter(
                    (event: DashboardEvent) =>
                        [
                            "sent",
                            "delivered",
                            "opened",
                            "clicked",
                            "replied",
                            "failed",
                            "bounced",
                            "complained",
                        ].includes(event.status.toLowerCase()) &&
                        isTodayActivity(event.createdAt),
                )
                .map((event: DashboardEvent) => {
                    const account =
                        event.customer?.company ||
                        event.customer?.name ||
                        "Customer";
                    const email = event.customer?.email || "";
                    const sent = formatEventDateTime(event.createdAt);

                    return {
                        id: event.id,
                        customerId: event.customer?.id || "",
                        account,
                        email,
                        subject: event.subject || "Email update",
                        preview:
                            event.reason ||
                            (event.emailType
                                ? `${event.emailType} email sent to ${email || account}`
                                : `Email sent to ${email || account}`),
                        status: formatStatus(event.status),
                        sentDate: sent.sentDate,
                        sentTime: sent.sentTime,
                    };
                });
        }

        if (hasRealData) {
            return [...liveCustomers]
                .filter(
                    (customer) =>
                        toNumber(customer.emailsSent) > 0 &&
                        isTodayActivity(customer.lastActivity),
                )
                .sort(
                    (a, b) =>
                        toNumber(b.emailsSent) - toNumber(a.emailsSent),
                )
                .map((customer) => {
                    const openRateNumber = toNumber(customer.openRate);
                    const clickRateNumber = toNumber(customer.clickRate);
                    const account =
                        customer.company || customer.name || "Customer";
                    const email = customer.email || "";
                    const sent = formatEventDateTime(customer.lastActivity || undefined);

                    const status =
                        clickRateNumber >= 5
                            ? "Clicked"
                            : openRateNumber >= 40
                                ? "Opened"
                                : "Sent";

                    return {
                        id: customer.id,
                        customerId: customer.id,
                        account,
                        email,
                        subject: "Latest automated email",
                        preview: `Automated email sent to ${email || account}`,
                        status,
                        sentDate: sent.sentDate,
                        sentTime: sent.sentTime,
                    };
                });
        }

        return [...customers]
            .sort((a, b) => b.emailsSent - a.emailsSent)
            .map((customer, index) => {
                const openRateNumber = Number(customer.openRate.replace("%", ""));
                const clickRateNumber = Number(customer.clickRate.replace("%", ""));

                const status =
                    clickRateNumber >= 5
                        ? "Replied"
                        : openRateNumber >= 40
                            ? "Opened"
                            : "Ignored";

                const sentAt = new Date();
                sentAt.setMinutes(sentAt.getMinutes() - (index + 1) * 30);

                const sent = formatEventDateTime(sentAt.toISOString());

                return {
                    id: customer.id,
                    customerId: customer.id,
                    account: customer.company,
                    email: customer.email,
                    subject: getEmailSubject(customer.status),
                    preview: `${getEmailType(customer.status)} email sent to ${customer.email}`,
                    status,
                    sentDate: sent.sentDate,
                    sentTime: sent.sentTime,
                };
            });
    }, [displayAnalytics.recentEvents, hasRealData, liveCustomers]);

    const sentEmailsTotalPages = Math.max(
        1,
        Math.ceil(emailsSentToday.length / EMAILS_PER_PAGE),
    );

    const paginatedEmailsSentToday = useMemo(
        () =>
            emailsSentToday.slice(
                (sentEmailsPage - 1) * EMAILS_PER_PAGE,
                sentEmailsPage * EMAILS_PER_PAGE,
            ),
        [emailsSentToday, sentEmailsPage],
    );

    useEffect(() => {
        setSentEmailsPage((currentPage) =>
            Math.min(currentPage, sentEmailsTotalPages),
        );
    }, [sentEmailsTotalPages]);

    const scheduledEmailChart = useMemo(
        () => buildScheduledEmailChart(scheduledEmails),
        [scheduledEmails],
    );

    const scheduledCardSummary = useMemo(() => {
        const now = new Date();
        const activeEmails = scheduledEmails.filter((email) =>
            ["scheduled", "sending"].includes(email.status.toLowerCase()),
        );
        const scheduledToday = activeEmails.filter((email) => {
            const scheduledAt = new Date(email.scheduledFor);
            return !Number.isNaN(scheduledAt.getTime()) && isSameLocalDay(scheduledAt, now);
        }).length;
        const sendingNow = activeEmails.filter(
            (email) => email.status.toLowerCase() === "sending",
        ).length;
        const nextEmail = [...activeEmails]
            .map((email) => ({ email, date: new Date(email.scheduledFor) }))
            .filter(({ date }) => !Number.isNaN(date.getTime()) && date.getTime() >= now.getTime())
            .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
        const peakWindow = [...scheduledEmailChart].sort(
            (a, b) => b.count - a.count || a.key.localeCompare(b.key),
        )[0];
        const totalScheduled = scheduledEmailChart.reduce(
            (total, point) => total + point.count,
            0,
        );

        return {
            scheduledToday,
            sendingNow,
            nextSend: nextEmail ? formatLondonTime(nextEmail.date) : "—",
            nextSendIn: nextEmail
                ? formatScheduledCountdown(nextEmail.date.toISOString())
                : "No upcoming sends",
            peakWindow,
            peakPercentage:
                peakWindow && totalScheduled > 0
                    ? Math.round((peakWindow.count / totalScheduled) * 100)
                    : 0,
        };
    }, [scheduledEmailChart, scheduledEmails]);

    const openReschedule = (email: ScheduledEmail) => {
        const selectedDate = new Date(
            `${email.scheduledDate}T${email.scheduledTime}`,
        );

        setSelectedEmail(email);
        setCalendarDate(
            Number.isNaN(selectedDate.getTime()) ? new Date() : selectedDate,
        );
        setSchedule({
            date: email.scheduledDate,
            time: email.scheduledTime,
        });
    };

    const saveReschedule = async () => {
        if (!selectedEmail) return;

        const nextScheduledDate = new Date(`${schedule.date}T${schedule.time}`);

        if (Number.isNaN(nextScheduledDate.getTime())) {
            setScheduleNotice("Choose a valid date and time.");
            return;
        }

        if (selectedEmail.isDemo || isDemoWorkspace) {
            setScheduledEmails((currentEmails) =>
                currentEmails.map((email) =>
                    email.id === selectedEmail.id
                        ? {
                            ...email,
                            scheduledDate: schedule.date,
                            scheduledTime: schedule.time,
                            scheduledFor: nextScheduledDate.toISOString(),
                        }
                        : email,
                ),
            );

            setSelectedEmail(null);
            return;
        }

        try {
            setIsSavingSchedule(true);

            const response = await fetch(
                `/api/email-agent/scheduled/${encodeURIComponent(selectedEmail.id)}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        workspaceId,
                        scheduledFor: nextScheduledDate.toISOString(),
                    }),
                },
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to reschedule email.");
            }

            setScheduledEmails((currentEmails) =>
                currentEmails.map((email) =>
                    email.id === selectedEmail.id
                        ? mapScheduledEmail(data.scheduledEmail)
                        : email,
                ),
            );

            setSelectedEmail(null);
            setScheduleNotice("Email rescheduled.");
            window.setTimeout(() => setScheduleNotice(""), 3000);
        } catch {
            setScheduleNotice("Failed to reschedule email.");
            window.setTimeout(() => setScheduleNotice(""), 3000);
        } finally {
            setIsSavingSchedule(false);
        }
    };

    const daysInMonth = new Date(
        calendarDate.getFullYear(),
        calendarDate.getMonth() + 1,
        0,
    ).getDate();

    return (
        <main className="mailDashPage">
            <header className="mailDashHeader">
                <div>
                    <h1>Welcome back</h1>
                    <p>
                        {hasRealData
                            ? "Here’s what’s happening with your live email automation."
                            : "Here’s what’s happening with your demo email automation."}
                    </p>
                </div>

                <div className="mailDashActions">
                    <button>
                        <Calendar size={15} />
                        Live dashboard
                    </button>

                    <Link href="/dashboard/email-builder" className="mailDashPrimary">
                        <Plus size={15} />
                        Create Email
                    </Link>
                </div>
            </header>

            {scheduleNotice && (
                <div className="emailScheduleNotice">{scheduleNotice}</div>
            )}

            <section className="mailStatsGrid">
                {displayStats.map((stat, index) => {
                    const Icon = kpiIcons[index];

                    return (
                        <div className="mailStatCard" key={stat.label}>
                            <div className="mailStatIcon">
                                <Icon size={18} />
                            </div>

                            <div>
                                <p>{stat.label}</p>
                                <h2>{stat.value}</h2>
                                <span
                                    className={
                                        stat.trend === "down"
                                            ? "bad"
                                            : stat.trend === "up"
                                                ? "good"
                                                : "neutral"
                                    }
                                >
                                    {stat.change}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </section>

            <section className="mailMainGrid">
                <div className="mailPanel mailChartPanel">
                    <div className="mailPanelHeader">
                        <div>
                            <h2>Email Performance</h2>
                            <p className="panelSubheading">
                                Sent volume, clicks and replies over time.
                            </p>
                        </div>

                        <div className="rangeButtons">
                            {chartRanges.map((item) => (
                                <button
                                    key={item.value}
                                    className={range === item.value ? "activeRange" : ""}
                                    onClick={() => {
                                        setRange(item.value);
                                        setTooltip(null);
                                    }}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="performanceSplit">
                        <div className="performanceMetric">
                            <p>Emails sent</p>
                            <strong>{displayAnalytics.sent.toLocaleString("en-GB")}</strong>
                            <span>
                                {Number(displayAnalytics.openRate || 0).toFixed(1)}% open rate
                            </span>
                        </div>

                        <div
                            className="performanceChart"
                            onMouseLeave={() => setTooltip(null)}
                        >
                            {emailSentChart.map((point, index) => {
                                const height =
                                    point.value > 0
                                        ? Math.max((point.value / maxSent) * 100, 8)
                                        : 2;

                                return (
                                    <div
                                        className="mailBarWrap"
                                        key={`sent-${point.label}-${index}`}
                                        onMouseEnter={(event) => {
                                            const rect =
                                                event.currentTarget.parentElement?.getBoundingClientRect();

                                            if (!rect) return;

                                            setTooltip({
                                                type: "emails",
                                                point,
                                                x: event.clientX - rect.left,
                                                y: event.clientY - rect.top,
                                            });
                                        }}
                                    >
                                        <div className="mailBar" style={{ height: `${height}%` }} />
                                    </div>
                                );
                            })}

                            {tooltip?.type === "emails" && (
                                <div
                                    className="chartTooltip"
                                    style={{ left: tooltip.x, top: tooltip.y }}
                                >
                                    <strong>{tooltip.point.sent.toLocaleString()} emails</strong>
                                    <span>{tooltip.point.label}</span>
                                </div>
                            )}
                        </div>

                        <div className="chartAxis">
                            {emailSentAxisLabels.map((point) => (
                                <span key={`sent-axis-${point.label}`}>{point.label}</span>
                            ))}
                        </div>
                    </div>

                    <div className="performanceSplit bottomPerformance">
                        <div className="performanceMetric">
                            <p>Clicks + replies</p>
                            <strong>
                                {displayAnalytics.clicked + displayAnalytics.replied}
                            </strong>
                            <span>{latestActions.actionRate}% action rate</span>
                        </div>

                        <div
                            className="performanceChart mini"
                            onMouseLeave={() => setTooltip(null)}
                        >
                            {replyClickChart.map((point, index) => {
                                const height =
                                    point.value > 0
                                        ? Math.max((point.value / maxReplyClick) * 100, 8)
                                        : 2;

                                return (
                                    <div
                                        className="mailBarWrap"
                                        key={`reply-click-${point.label}-${index}`}
                                        onMouseEnter={(event) => {
                                            const rect =
                                                event.currentTarget.parentElement?.getBoundingClientRect();

                                            if (!rect) return;

                                            setTooltip({
                                                type: "actions",
                                                point,
                                                x: event.clientX - rect.left,
                                                y: event.clientY - rect.top,
                                            });
                                        }}
                                    >
                                        <div
                                            className="mailBar secondaryBar"
                                            style={{ height: `${height}%` }}
                                        />
                                    </div>
                                );
                            })}

                            {tooltip?.type === "actions" && (
                                <div
                                    className="chartTooltip"
                                    style={{ left: tooltip.x, top: tooltip.y }}
                                >
                                    <strong>
                                        {tooltip.point.value} actions from {tooltip.point.sent}{" "}
                                        emails
                                    </strong>
                                    <span>
                                        {tooltip.point.clicks} clicks · {tooltip.point.replies}{" "}
                                        replies · {tooltip.point.actionRate}%
                                    </span>
                                    <span>{tooltip.point.label}</span>
                                </div>
                            )}
                        </div>

                        <div className="chartAxis">
                            {replyClickAxisLabels.map((point) => (
                                <span key={`reply-axis-${point.label}`}>{point.label}</span>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mailPanel scheduledEmailsPanel">
                    <div className="mailPanelHeader scheduledPanelHeader">
                        <div>
                            <h2>Scheduled Emails</h2>
                        </div>

                        <Link href="/dashboard/scheduled-emails" className="viewAllBtn">
                            View all
                        </Link>
                    </div>

                    {isLoadingScheduled ? (
                        <div className="scheduledChartEmpty">
                            <strong>Loading scheduled emails...</strong>
                            <p>Checking your upcoming send windows.</p>
                        </div>
                    ) : scheduledEmailChart.length === 0 ? (
                        <div className="scheduledChartEmpty">
                            <strong>No scheduled emails yet</strong>
                            <p>Upcoming send windows will appear here automatically.</p>
                        </div>
                    ) : (
                        <>
                            <div className="scheduledSummaryGrid">
                                <div className="scheduledSummaryItem">
                                    <div className="scheduledSummaryCopy">
                                        <strong>{scheduledCardSummary.scheduledToday}</strong>
                                        <span>Scheduled today</span>
                                    </div>
                                </div>

                                <div className="scheduledSummaryItem">
                                    <div className="scheduledSummaryCopy">
                                        <strong>{scheduledCardSummary.nextSend}</strong>
                                        <span>Next send</span>
                                        <small>{scheduledCardSummary.nextSendIn}</small>
                                    </div>
                                </div>

                                <div className="scheduledSummaryItem">
                                    <div className="scheduledSummaryCopy">
                                        <strong>{scheduledCardSummary.sendingNow}</strong>
                                        <span>Sending now</span>
                                    </div>
                                </div>
                            </div>

                            <div className="scheduledActivityHeader">
                                <h3>Live activity</h3>
                                <span className="scheduledActivityBadge">
                                    <i aria-hidden="true" />
                                    Live
                                </span>
                            </div>

                            <div className="scheduledWindowList">
                                {scheduledEmailChart.map((point) => {
                                    const isLive = point.emails.some(
                                        (email) => email.status.toLowerCase() === "sending",
                                    );

                                    return (
                                        <div className="scheduledWindowRow" key={point.key}>
                                            <div className="scheduledTimeline">
                                                <div
                                                    className={`scheduledWindowIcon ${isLive ? "live" : ""}`}
                                                >
                                                    {isLive ? <Send size={15} /> : <Clock3 size={15} />}
                                                </div>
                                            </div>

                                            <div className="scheduledWindowMain">
                                                <strong>{formatScheduledWindow(point.key)}</strong>
                                                <span>
                                                    {isLive ? "Sending now" : "Upcoming"}
                                                    {!isLive && (
                                                        <>
                                                            {" · "}
                                                            <b>{formatScheduledCountdown(point.key)}</b>
                                                        </>
                                                    )}
                                                </span>
                                            </div>

                                            <div className="scheduledWindowCount">
                                                <strong>
                                                    {point.count} {point.count === 1 ? "email" : "emails"}
                                                </strong>
                                                <span>{isLive ? "Sending now" : "Scheduled"}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {scheduledCardSummary.peakWindow && (
                                <div className="scheduledPeakRow">
                                    <div className="scheduledPeakIcon">
                                        <BarChart3 size={18} />
                                    </div>
                                    <div className="scheduledPeakCopy">
                                        <span>Peak window</span>
                                        <strong>
                                            {formatScheduledWindow(
                                                scheduledCardSummary.peakWindow.key,
                                            )}
                                        </strong>
                                    </div>
                                    <div className="scheduledPeakValue">
                                        <strong>
                                            {scheduledCardSummary.peakWindow.count} {" "}
                                            {scheduledCardSummary.peakWindow.count === 1
                                                ? "email"
                                                : "emails"} {" "}
                                            ({scheduledCardSummary.peakPercentage}%)
                                        </strong>
                                        <span>of today&apos;s sends</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </section>

            <section className="mailBottomGrid">
                <div className="mailPanel recentEmailsPanel">
                    <div className="mailPanelHeader">
                        <h2>Emails Sent Today</h2>

                        <Link href="/dashboard/email-queue" className="mailViewLink">
                            View queue
                        </Link>
                    </div>

                    <div className="dashboardRecentTable">
                        <div className="dashboardRecentHead">
                            <span>Account</span>
                            <span>Subject</span>
                            <span>Status</span>
                            <span>Date & time sent</span>
                            <span className="dashboardRecentActionHeading">Action</span>
                        </div>

                        <div className="dashboardRecentBody">
                            {emailsSentToday.length === 0 ? (
                                <div className="dashboardRecentRow dashboardRecentEmptyRow">
                                    <div className="recentAccountCell">
                                        <div className="recentAccountDetails">
                                            <strong>No emails sent today</strong>
                                            <p>Emails sent today will appear here automatically.</p>
                                        </div>
                                    </div>
                                    <span>—</span>
                                    <span>—</span>
                                    <span>—</span>
                                    <span>—</span>
                                </div>
                            ) : (
                                paginatedEmailsSentToday.map((email) => {
                                    const profileHref = email.customerId
                                        ? `/dashboard/customers/${encodeURIComponent(email.customerId)}`
                                        : "/dashboard/customers";

                                    return (
                                        <Link
                                            href={profileHref}
                                            className="dashboardRecentRow dashboardRecentRowLink"
                                            key={email.id}
                                            aria-label={`Open ${email.account} account profile`}
                                        >
                                            <div className="recentAccountCell">
                                                <div className="recentAccountDetails">
                                                    <strong>{email.account}</strong>
                                                    <p>{email.email}</p>
                                                </div>
                                            </div>

                                            <div className="recentEmailContent">
                                                <strong title={email.subject}>{email.subject}</strong>
                                                <p title={email.preview}>{email.preview}</p>
                                            </div>

                                            <span
                                                className={`recentEmailStatus ${email.status.toLowerCase()}`}
                                            >
                                                {email.status}
                                            </span>

                                            <div className="recentEmailTime">
                                                <strong>
                                                    {email.sentDate}
                                                    {email.sentTime ? `, ${email.sentTime}` : ""}
                                                </strong>
                                            </div>

                                            <span
                                                className="recentEmailAction"
                                                aria-hidden="true"
                                            >
                                                <MoreVertical size={17} />
                                            </span>
                                        </Link>
                                    );
                                })
                            )}
                        </div>

                        {emailsSentToday.length > EMAILS_PER_PAGE && (
                            <div className="sentEmailsPagination">
                                <span>
                                    Page {sentEmailsPage} of {sentEmailsTotalPages}
                                </span>

                                <div className="sentEmailsPaginationActions">
                                    <button
                                        type="button"
                                        aria-label="Previous sent emails page"
                                        onClick={() =>
                                            setSentEmailsPage((currentPage) =>
                                                Math.max(1, currentPage - 1),
                                            )
                                        }
                                        disabled={sentEmailsPage === 1}
                                    >
                                        <ChevronLeft size={15} />
                                    </button>

                                    <button
                                        type="button"
                                        aria-label="Next sent emails page"
                                        onClick={() =>
                                            setSentEmailsPage((currentPage) =>
                                                Math.min(
                                                    sentEmailsTotalPages,
                                                    currentPage + 1,
                                                ),
                                            )
                                        }
                                        disabled={
                                            sentEmailsPage === sentEmailsTotalPages
                                        }
                                    >
                                        <ChevronRight size={15} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </section>

            {selectedEmail && (
                <div className="rescheduleOverlay">
                    <div className="rescheduleModal">
                        <div className="rescheduleHeader">
                            <div>
                                <h2>Reschedule Email</h2>
                                <p>{selectedEmail.account}</p>
                            </div>

                            <button type="button" onClick={() => setSelectedEmail(null)}>
                                <X size={16} />
                            </button>
                        </div>

                        <div className="reschedulePreview">
                            <span>{selectedEmail.type}</span>
                            <strong>{selectedEmail.subject}</strong>
                            <p>{selectedEmail.email}</p>
                        </div>

                        <div className="rescheduleCalendar">
                            <div className="calendarTop">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setCalendarDate(
                                            new Date(
                                                calendarDate.getFullYear(),
                                                calendarDate.getMonth() - 1,
                                                1,
                                            ),
                                        )
                                    }
                                >
                                    <ChevronLeft size={18} />
                                </button>

                                <h3>
                                    {calendarDate.toLocaleDateString("en-GB", {
                                        month: "long",
                                        year: "numeric",
                                    })}
                                </h3>

                                <button
                                    type="button"
                                    onClick={() =>
                                        setCalendarDate(
                                            new Date(
                                                calendarDate.getFullYear(),
                                                calendarDate.getMonth() + 1,
                                                1,
                                            ),
                                        )
                                    }
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>

                            <div className="calendarWeek">
                                {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => (
                                    <span key={day}>{day}</span>
                                ))}
                            </div>

                            <div className="calendarGrid">
                                {Array.from({ length: daysInMonth }, (_, index) => {
                                    const day = index + 1;
                                    const date = new Date(
                                        calendarDate.getFullYear(),
                                        calendarDate.getMonth(),
                                        day,
                                    );
                                    const formattedDate = formatDateInput(date);
                                    const selected = schedule.date === formattedDate;

                                    return (
                                        <button
                                            type="button"
                                            key={day}
                                            className={selected ? "selectedCalendarDay" : ""}
                                            onClick={() =>
                                                setSchedule((current) => ({
                                                    ...current,
                                                    date: formattedDate,
                                                }))
                                            }
                                        >
                                            {day}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="rescheduleFields oneColumn">
                            <label>
                                Time
                                <input
                                    type="time"
                                    value={schedule.time}
                                    onChange={(event) =>
                                        setSchedule((current) => ({
                                            ...current,
                                            time: event.target.value,
                                        }))
                                    }
                                />
                            </label>
                        </div>

                        <div className="quickScheduleButtons">
                            <button
                                type="button"
                                onClick={() => {
                                    const date = new Date();
                                    date.setDate(date.getDate() + 1);

                                    setSchedule((current) => ({
                                        ...current,
                                        date: formatDateInput(date),
                                    }));
                                }}
                            >
                                Tomorrow
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    setSchedule((current) => ({
                                        ...current,
                                        time: "13:00",
                                    }))
                                }
                            >
                                13:00
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    setSchedule((current) => ({
                                        ...current,
                                        time: "17:00",
                                    }))
                                }
                            >
                                17:00
                            </button>
                        </div>

                        <div className="rescheduleActions">
                            <button type="button" onClick={() => setSelectedEmail(null)}>
                                Cancel
                            </button>

                            <button
                                type="button"
                                className="saveReschedule"
                                onClick={saveReschedule}
                                disabled={isSavingSchedule}
                            >
                                {isSavingSchedule ? "Saving..." : "Save schedule"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
