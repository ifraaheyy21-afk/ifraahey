// page.tsx
"use client";

import "@fontsource/inter";
import { useRouter } from "next/navigation";
import {
    CalendarClock,
    ChevronLeft,
    ChevronRight,
    Loader2,
    RefreshCw,
    Send,
    TrendingDown,
    TrendingUp,
    Minus,
    X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./scheduled-email.module.css";

type ApiQueueStatus =
    | "scheduled"
    | "sending"
    | "sent"
    | "delivered"
    | "failed"
    | "bounced"
    | "complained";

type ScheduledEmailStatus =
    | "Scheduled"
    | "Sending"
    | "Sent"
    | "Delivered"
    | "Failed"
    | "Bounced"
    | "Complained";
type ScheduledEmailPriority = "High" | "Normal" | "Low";

type ApiScheduledEmail = {
    id: string;
    workspaceId: string;
    customerId: string;
    generatedEmailId?: string | null;
    emailType: string;
    subject: string;
    html: string;
    plainText?: string | null;
    scheduledFor: string;
    status: ApiQueueStatus;
    failureReason?: string | null;
    providerMessageId?: string | null;
    retryCount?: number;
    sentAt?: string | null;
    openedAt?: string | null;
    clickedAt?: string | null;
    deliveredAt?: string | null;
    bouncedAt?: string | null;
    complainedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    priority?: ScheduledEmailPriority | string | null;
    mrrAtRisk?: number | null;
    customer: {
        id: string;
        name: string;
        email: string;
        company: string;
        mrr?: number | null;
        mrrAtRisk?: number | null;
    };
};

type ScheduledEmail = {
    id: string;
    workspaceId: string;
    customerId: string;
    generatedEmailId?: string | null;
    account: string;
    email: string;
    subject: string;
    template: string;
    status: ScheduledEmailStatus;
    rawStatus: ApiQueueStatus;
    priority: ScheduledEmailPriority;
    scheduledAt: string;
    scheduledFor: string;
    sendIn: string;
    mrrAtRisk: number;
    html: string;
    plainText: string;
};

type ScheduledResponse = {
    scheduledEmails?: ApiScheduledEmail[];
};

type WorkspaceResponse = {
    workspaceId?: string;
    workspace?: {
        id: string;
    };
};

const statuses: Array<"All statuses" | ScheduledEmailStatus> = [
    "All statuses",
    "Scheduled",
    "Sending",
    "Sent",
    "Delivered",
    "Failed",
    "Bounced",
    "Complained",
];

const priorities: Array<"All priorities" | ScheduledEmailPriority> = [
    "All priorities",
    "High",
    "Normal",
    "Low",
];

type TimeFilter =
    | "All times"
    | "Less than 1 hour"
    | "In 3 hours"
    | "In 5 hours"
    | "Tomorrow";

const timeFilters: TimeFilter[] = [
    "All times",
    "Less than 1 hour",
    "In 3 hours",
    "In 5 hours",
    "Tomorrow",
];

function addMinutes(minutes: number) {
    const date = new Date();
    date.setMinutes(date.getMinutes() + minutes);
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
}

function addDays(days: number, hour: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(hour, 0, 0, 0);
    return date;
}

function formatDateInput(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatScheduledFor(date: Date) {
    if (Number.isNaN(date.getTime())) return "Invalid date";

    return new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function getSendIn(date: Date, status?: ScheduledEmailStatus) {
    if (["Sent", "Delivered", "Failed", "Bounced", "Complained"].includes(status || "")) {
        return "—";
    }

    const diffMinutes = Math.round((date.getTime() - Date.now()) / 60000);

    if (Number.isNaN(diffMinutes)) return "Invalid date";
    if (diffMinutes <= 0) return "Due now";
    if (diffMinutes < 60) return `In ${diffMinutes} min${diffMinutes === 1 ? "" : "s"}`;
    if (diffMinutes < 120) return "In 1 hr";

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";

    const hours = Math.round(diffMinutes / 60);
    if (hours < 24) return `In ${hours} hrs`;

    const days = Math.round(hours / 24);
    return `In ${days} day${days === 1 ? "" : "s"}`;
}

function stripAgentMeta(html: string) {
    return html.replace(/<!--EMAIL_AGENT_META:[\s\S]*?-->/, "").trim();
}

function statusLabel(status: ApiQueueStatus): ScheduledEmailStatus {
    const labels: Record<ApiQueueStatus, ScheduledEmailStatus> = {
        scheduled: "Scheduled",
        sending: "Sending",
        sent: "Sent",
        delivered: "Delivered",
        failed: "Failed",
        bounced: "Bounced",
        complained: "Complained",
    };

    return labels[status] || "Scheduled";
}

function statusFromLabel(status: ScheduledEmailStatus): ApiQueueStatus {
    const labels: Record<ScheduledEmailStatus, ApiQueueStatus> = {
        Scheduled: "scheduled",
        Sending: "sending",
        Sent: "sent",
        Delivered: "delivered",
        Failed: "failed",
        Bounced: "bounced",
        Complained: "complained",
    };

    return labels[status] || "scheduled";
}

function normalizePriority(value?: string | null): ScheduledEmailPriority {
    if (value === "High" || value === "high") return "High";
    if (value === "Low" || value === "low") return "Low";
    return "Normal";
}

function derivePriority(email: ApiScheduledEmail): ScheduledEmailPriority {
    if (email.priority) return normalizePriority(email.priority);

    if (email.status === "failed" || email.status === "bounced" || email.status === "complained") {
        return "High";
    }

    if ((email.retryCount || 0) > 0) return "High";

    return "Normal";
}

function buildRealEmailHtml(subject: string, account: string, plainText: string) {
    const initial = account.slice(0, 1).toUpperCase();

    const bodyHtml = plainText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map(
            (line) =>
                `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#374151;">${line}</p>`
        )
        .join("");

    return `
<!doctype html>
<html>
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f6f8;margin:0;padding:0;">
        <tr>
            <td align="center" style="padding:40px 16px;">
                <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:560px;max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;">
                    <tr>
                        <td align="center" style="padding:34px 34px 18px;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td align="center" valign="middle" style="width:42px;height:42px;background:#1d9bf0;border-radius:12px;color:#ffffff;font-size:16px;font-weight:700;">
                                        ${initial}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding:0 34px 20px;">
                            <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:#111827;">
                                ${subject}
                            </h1>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:0 34px 8px;font-size:14px;line-height:1.65;color:#374151;">
                            ${bodyHtml}
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding:18px 34px 28px;">
                            <a href="#" style="display:inline-block;background:#1d9bf0;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 18px;font-size:13px;font-weight:700;">
                                View recommendation
                            </a>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding:0 34px 30px;font-size:11px;line-height:1.6;color:#9ca3af;">
                            You are receiving this because you are a customer contact.<br />
                            <a href="#" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`.trim();
}

function buildEmail(
    id: string,
    account: string,
    email: string,
    subject: string,
    template: string,
    status: ScheduledEmailStatus,
    priority: ScheduledEmailPriority,
    scheduledAtDate: Date,
    mrrAtRisk: number
): ScheduledEmail {
    const firstName = email.split("@")[0].split(".")[0];

    const plainText = `Hi ${firstName},

I noticed your team may not be getting full value from the account recently.

Before this affects renewal or adoption, I wanted to check in and see if there is anything blocking your team from getting the results you expected.

Would it be helpful if I shared a quick recommendation based on your recent activity?

Best,
Customer Success Team`;

    return {
        id,
        workspaceId: "demo-workspace",
        customerId: id.replace("sch_", "demo-customer-"),
        generatedEmailId: null,
        account,
        email,
        subject,
        template,
        status,
        rawStatus: statusFromLabel(status),
        priority,
        scheduledAt: scheduledAtDate.toISOString(),
        scheduledFor: formatScheduledFor(scheduledAtDate),
        sendIn: getSendIn(scheduledAtDate, status),
        mrrAtRisk,
        plainText,
        html: buildRealEmailHtml(subject, account, plainText),
    };
}

function createDemoEmails() {
    return [
        buildEmail("sch_001", "Finflow", "alex@finflow.io", "Quick check-in before renewal", "Retention", "Scheduled", "High", addMinutes(15), 2400),
        buildEmail("sch_002", "Growthlane", "sarah@growthlane.com", "Your team is missing key insights", "Feature Adoption", "Scheduled", "High", addMinutes(40), 1800),
        buildEmail("sch_003", "Hireloop", "daniel@hireloop.co", "We noticed a drop in usage", "Recovery", "Scheduled", "Normal", addMinutes(90), 950),
        buildEmail("sch_004", "SignalCRM", "emma@signalcrm.com", "Can we help recover activity?", "Retention", "Scheduled", "High", addMinutes(180), 3200),
        buildEmail("sch_005", "Leadstack", "mike@leadstack.io", "Let's improve adoption together", "Re-engagement", "Failed", "High", addMinutes(-80), 760),
        buildEmail("sch_006", "Tracklytics", "oliver@tracklytics.ai", "Your team is missing key insights", "Feature Adoption", "Scheduled", "High", addDays(1, 10), 4700),
        buildEmail("sch_007", "RevenueOS", "harry@revenueos.io", "Can we help your team get more value?", "Recovery", "Scheduled", "Low", addDays(1, 14), 540),
        buildEmail("sch_008", "CustomerPilot", "jessica@customerpilot.com", "We noticed a drop in usage", "Retention", "Scheduled", "High", addDays(2, 9), 6100),
    ];
}

function mapApiEmail(email: ApiScheduledEmail): ScheduledEmail {
    const scheduledAt = new Date(email.scheduledFor);
    const status = statusLabel(email.status);
    const account = email.customer?.company || email.customer?.name || "Customer";
    const plainText = email.plainText || "";
    const mrrAtRisk =
        email.mrrAtRisk ??
        email.customer?.mrrAtRisk ??
        email.customer?.mrr ??
        0;

    return {
        id: email.id,
        workspaceId: email.workspaceId,
        customerId: email.customerId,
        generatedEmailId: email.generatedEmailId || null,
        account,
        email: email.customer?.email || "",
        subject: email.subject,
        template: email.emailType,
        status,
        rawStatus: email.status,
        priority: derivePriority(email),
        scheduledAt: email.scheduledFor,
        scheduledFor: formatScheduledFor(scheduledAt),
        sendIn: getSendIn(scheduledAt, status),
        mrrAtRisk,
        html: email.html,
        plainText,
    };
}

function getDateParts(email: ScheduledEmail) {
    const scheduledAt = new Date(email.scheduledAt);

    return {
        date: formatDateInput(scheduledAt),
        time: `${String(scheduledAt.getHours()).padStart(2, "0")}:${String(
            scheduledAt.getMinutes()
        ).padStart(2, "0")}`,
    };
}

function matchesTimeFilter(email: ScheduledEmail, filter: TimeFilter) {
    if (filter === "All times") return true;

    const scheduledAt = new Date(email.scheduledAt);
    const now = new Date();
    const diffMinutes = (scheduledAt.getTime() - now.getTime()) / 60000;

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    if (filter === "Less than 1 hour") return diffMinutes > 0 && diffMinutes <= 60;
    if (filter === "In 3 hours") return diffMinutes > 60 && diffMinutes <= 180;
    if (filter === "In 5 hours") return diffMinutes > 180 && diffMinutes <= 300;
    if (filter === "Tomorrow") return scheduledAt.toDateString() === tomorrow.toDateString();

    return true;
}

function getMonthDays(date: Date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7;

    return [
        ...Array.from({ length: startOffset }, () => null),
        ...Array.from({ length: lastDay.getDate() }, (_, index) => {
            return new Date(year, month, index + 1);
        }),
    ];
}

export default function ScheduledEmailsPage() {
    const router = useRouter();

    const [workspaceId, setWorkspaceId] = useState("");
    const [emails, setEmails] = useState<ScheduledEmail[]>([]);
    const [search, setSearch] = useState("");
    const [selectedEmail, setSelectedEmail] = useState<ScheduledEmail | null>(null);
    const [activeEmailId, setActiveEmailId] = useState("");
    const [calendarDate, setCalendarDate] = useState<Date | null>(null);
    const [scheduleDate, setScheduleDate] = useState("");
    const [scheduleTime, setScheduleTime] = useState("13:00");
    const [status, setStatus] = useState<"All statuses" | ScheduledEmailStatus>("All statuses");
    const [priority, setPriority] = useState<"All priorities" | ScheduledEmailPriority>("All priorities");
    const [timeFilter, setTimeFilter] = useState<TimeFilter>("All times");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const demoEmails = useMemo(() => createDemoEmails(), []);
    const hasRealEmails = emails.length > 0;
    const displayEmails = hasRealEmails ? emails : demoEmails;

    const resolveWorkspaceId = useCallback(async () => {
        const stored =
            typeof window !== "undefined" ? localStorage.getItem("workspaceId") : null;

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

    const fetchEmails = useCallback(
        async (silent = false) => {
            try {
                if (silent) setRefreshing(true);
                else setLoading(true);

                setError("");

                const id = workspaceId || (await resolveWorkspaceId());

                const params = new URLSearchParams({
                    workspaceId: id,
                });

                const response = await fetch(`/api/email-agent/scheduled?${params.toString()}`, {
                    method: "GET",
                    cache: "no-store",
                });

                const data: ScheduledResponse & { error?: string } = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || "Failed to load scheduled emails.");
                }

                const realEmails = Array.isArray(data.scheduledEmails)
                    ? data.scheduledEmails.map(mapApiEmail)
                    : [];

                setEmails(realEmails);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Something went wrong.");
                setEmails([]);
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [workspaceId, resolveWorkspaceId]
    );

    useEffect(() => {
        setCalendarDate(new Date());
        setScheduleDate(formatDateInput(new Date()));
        fetchEmails(false);
    }, [fetchEmails]);

    const filteredEmails = useMemo(() => {
        return displayEmails.filter((email) => {
            const query = search.trim().toLowerCase();

            return (
                (!query ||
                    email.account.toLowerCase().includes(query) ||
                    email.email.toLowerCase().includes(query) ||
                    email.subject.toLowerCase().includes(query) ||
                    email.template.toLowerCase().includes(query)) &&
                (status === "All statuses" || email.status === status) &&
                (priority === "All priorities" || email.priority === priority) &&
                matchesTimeFilter(email, timeFilter)
            );
        });
    }, [displayEmails, search, status, priority, timeFilter]);

    useEffect(() => {
        if (filteredEmails.length === 0) {
            setActiveEmailId("");
            return;
        }

        const activeEmailStillVisible = filteredEmails.some(
            (email) => email.id === activeEmailId
        );

        if (!activeEmailStillVisible) {
            setActiveEmailId(filteredEmails[0].id);
        }
    }, [activeEmailId, filteredEmails]);

    const activeEmail = useMemo(
        () =>
            filteredEmails.find((email) => email.id === activeEmailId) ??
            filteredEmails[0] ??
            null,
        [activeEmailId, filteredEmails]
    );

    const stats = useMemo(() => {
        const now = new Date();
        const startOfToday = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
        );
        const startOfTomorrow = new Date(startOfToday);
        startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);

        const currentPeriodEnd = new Date(now);
        currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);

        const previousPeriodStart = new Date(now);
        previousPeriodStart.setDate(previousPeriodStart.getDate() - 30);

        const isWithin = (email: ScheduledEmail, start: Date, end: Date) => {
            const scheduledAt = new Date(email.scheduledAt);
            const scheduledTime = scheduledAt.getTime();

            return (
                !Number.isNaN(scheduledTime) &&
                scheduledTime >= start.getTime() &&
                scheduledTime < end.getTime()
            );
        };

        const currentPeriodEmails = displayEmails.filter((email) =>
            isWithin(email, now, currentPeriodEnd),
        );
        const previousPeriodEmails = displayEmails.filter((email) =>
            isWithin(email, previousPeriodStart, now),
        );
        const todayEmails = displayEmails.filter((email) =>
            isWithin(email, startOfToday, startOfTomorrow),
        );
        const yesterdayEmails = displayEmails.filter((email) =>
            isWithin(email, startOfYesterday, startOfToday),
        );

        return {
            total: currentPeriodEmails.length,
            previousTotal: previousPeriodEmails.length,
            scheduledToday: todayEmails.length,
            scheduledYesterday: yesterdayEmails.length,
            highPriority: currentPeriodEmails.filter(
                (email) => email.priority === "High",
            ).length,
            previousHighPriority: previousPeriodEmails.filter(
                (email) => email.priority === "High",
            ).length,
            mrrAtRisk: currentPeriodEmails.reduce(
                (total, email) => total + email.mrrAtRisk,
                0,
            ),
            previousMrrAtRisk: previousPeriodEmails.reduce(
                (total, email) => total + email.mrrAtRisk,
                0,
            ),
        };
    }, [displayEmails]);

    const getCountTrend = (
        current: number,
        previous: number,
        comparisonLabel: string,
        increaseIsPositive = true,
    ) => {
        const difference = current - previous;

        if (difference === 0) {
            return {
                direction: "flat" as const,
                tone: "neutral" as const,
                label: `Same as ${comparisonLabel}`,
            };
        }

        const direction = difference > 0 ? "up" : "down";
        const tone =
            difference > 0
                ? increaseIsPositive
                    ? "positive"
                    : "negative"
                : increaseIsPositive
                    ? "negative"
                    : "positive";
        const amount = Math.abs(difference);

        return {
            direction,
            tone,
            label: `${amount} ${amount === 1 ? "email" : "emails"} ${difference > 0 ? "more" : "fewer"
                } than ${comparisonLabel}`,
        };
    };

    const getMoneyTrend = (
        current: number,
        previous: number,
        comparisonLabel: string,
        increaseIsPositive = false,
    ) => {
        const difference = current - previous;

        if (difference === 0) {
            return {
                direction: "flat" as const,
                tone: "neutral" as const,
                label: `Same as ${comparisonLabel}`,
            };
        }

        const direction = difference > 0 ? "up" : "down";
        const tone =
            difference > 0
                ? increaseIsPositive
                    ? "positive"
                    : "negative"
                : increaseIsPositive
                    ? "negative"
                    : "positive";

        return {
            direction,
            tone,
            label: `£${Math.abs(difference).toLocaleString("en-GB")} ${difference > 0 ? "more" : "less"
                } than ${comparisonLabel}`,
        };
    };

    const totalTrend = getCountTrend(
        stats.total,
        stats.previousTotal,
        "the previous 30 days",
    );
    const todayTrend = getCountTrend(
        stats.scheduledToday,
        stats.scheduledYesterday,
        "yesterday",
    );
    const priorityTrend = getCountTrend(
        stats.highPriority,
        stats.previousHighPriority,
        "the previous 30 days",
        false,
    );
    const mrrTrend = getMoneyTrend(
        stats.mrrAtRisk,
        stats.previousMrrAtRisk,
        "the previous 30 days",
        false,
    );

    const editEmail = () => {
        if (!selectedEmail) return;

        router.push(`/dashboard/email-builder?tab=generate&scheduledEmailId=${selectedEmail.id}`);
    };

    const openEmail = (email: ScheduledEmail) => {
        const parts = getDateParts(email);
        const date = new Date(`${parts.date}T${parts.time}`);

        setSelectedEmail(email);
        setScheduleDate(parts.date);
        setScheduleTime(parts.time);
        setCalendarDate(Number.isNaN(date.getTime()) ? new Date() : date);
        setError("");
    };

    const previewHtml = useMemo(() => {
        if (!selectedEmail) return "";

        return stripAgentMeta(
            selectedEmail.html ||
            buildRealEmailHtml(selectedEmail.subject, selectedEmail.account, selectedEmail.plainText)
        );
    }, [selectedEmail]);

    const saveSchedule = async () => {
        if (!selectedEmail) return;

        const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`);

        if (Number.isNaN(scheduledAt.getTime())) {
            setError("Please choose a valid date and time.");
            return;
        }

        if (!hasRealEmails) {
            setSelectedEmail(null);
            return;
        }

        try {
            setSaving(true);
            setError("");

            const response = await fetch(`/api/email-agent/scheduled/${selectedEmail.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspaceId: selectedEmail.workspaceId,
                    scheduledFor: scheduledAt.toISOString(),
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to reschedule email.");
            }

            await fetchEmails(true);
            setSelectedEmail(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to reschedule email.");
        } finally {
            setSaving(false);
        }
    };

    const sendNow = async () => {
        if (!selectedEmail) return;

        if (!hasRealEmails) {
            setSelectedEmail(null);
            return;
        }

        try {
            setSaving(true);
            setError("");

            const response = await fetch(`/api/email-agent/scheduled/${selectedEmail.id}/send-now`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspaceId: selectedEmail.workspaceId,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to send email now.");
            }

            await fetchEmails(true);
            setSelectedEmail(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to send email now.");
        } finally {
            setSaving(false);
        }
    };

    const monthDays = calendarDate ? getMonthDays(calendarDate) : [];

    return (
        <section className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h1>Scheduled Emails</h1>
                    <p>Review, filter and manage upcoming customer retention emails.</p>
                </div>

                <div className={styles.actions}>
                    <button type="button" onClick={() => fetchEmails(true)} disabled={loading || refreshing}>
                        <RefreshCw size={14} />
                        {refreshing ? "Refreshing..." : "Refresh"}
                    </button>

                    <button
                        type="button"
                        className={styles.primaryBtn}
                        onClick={() => router.push("/dashboard/email-builder")}
                    >
                        + Schedule Email
                    </button>
                </div>
            </header>

            {error && <div className={styles.errorBox}>{error}</div>}

            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <span>Total scheduled</span>
                    <strong>{stats.total}</strong>
                    <p className={`${styles.statTrend} ${styles[totalTrend.tone]}`}>
                        {totalTrend.direction === "up" ? (
                            <TrendingUp size={12} />
                        ) : totalTrend.direction === "down" ? (
                            <TrendingDown size={12} />
                        ) : (
                            <Minus size={12} />
                        )}
                        {totalTrend.label}
                    </p>
                </div>

                <div className={styles.statCard}>
                    <span>Scheduled today</span>
                    <strong>{stats.scheduledToday}</strong>
                    <p className={`${styles.statTrend} ${styles[todayTrend.tone]}`}>
                        {todayTrend.direction === "up" ? (
                            <TrendingUp size={12} />
                        ) : todayTrend.direction === "down" ? (
                            <TrendingDown size={12} />
                        ) : (
                            <Minus size={12} />
                        )}
                        {todayTrend.label}
                    </p>
                </div>

                <div className={styles.statCard}>
                    <span>High priority</span>
                    <strong>{stats.highPriority}</strong>
                    <p className={`${styles.statTrend} ${styles[priorityTrend.tone]}`}>
                        {priorityTrend.direction === "up" ? (
                            <TrendingUp size={12} />
                        ) : priorityTrend.direction === "down" ? (
                            <TrendingDown size={12} />
                        ) : (
                            <Minus size={12} />
                        )}
                        {priorityTrend.label}
                    </p>
                </div>

                <div className={styles.statCard}>
                    <span>MRR at risk</span>
                    <strong>£{stats.mrrAtRisk.toLocaleString("en-GB")}</strong>
                    <p className={`${styles.statTrend} ${styles[mrrTrend.tone]}`}>
                        {mrrTrend.direction === "up" ? (
                            <TrendingUp size={12} />
                        ) : mrrTrend.direction === "down" ? (
                            <TrendingDown size={12} />
                        ) : (
                            <Minus size={12} />
                        )}
                        {mrrTrend.label}
                    </p>
                </div>
            </div>

            <div className={styles.emailWorkspace}>
                <div className={styles.toolbar}>
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search scheduled emails"
                    />

                    <select
                        value={status}
                        onChange={(event) =>
                            setStatus(
                                event.target.value as
                                | "All statuses"
                                | ScheduledEmailStatus
                            )
                        }
                    >
                        {statuses.map((item) => (
                            <option key={item}>{item}</option>
                        ))}
                    </select>

                    <select
                        value={priority}
                        onChange={(event) =>
                            setPriority(
                                event.target.value as
                                | "All priorities"
                                | ScheduledEmailPriority
                            )
                        }
                    >
                        {priorities.map((item) => (
                            <option key={item}>{item}</option>
                        ))}
                    </select>

                    <select
                        value={timeFilter}
                        onChange={(event) =>
                            setTimeFilter(event.target.value as TimeFilter)
                        }
                    >
                        {timeFilters.map((item) => (
                            <option key={item}>{item}</option>
                        ))}
                    </select>
                </div>

                <div className={styles.emailLayout}>
                    <aside className={styles.emailListPanel}>
                        <div className={styles.emailListHeading}>
                            <div>
                                <strong>Scheduled emails</strong>
                                <span>{filteredEmails.length} emails</span>
                            </div>
                        </div>

                        <div className={styles.emailList}>
                            {loading && hasRealEmails ? (
                                <div className={styles.emptyState}>
                                    <Loader2
                                        size={18}
                                        className={styles.spinning}
                                    />
                                    <p>Loading scheduled emails...</p>
                                </div>
                            ) : filteredEmails.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <p>No scheduled emails found.</p>
                                </div>
                            ) : (
                                filteredEmails.map((email) => (
                                    <button
                                        key={email.id}
                                        type="button"
                                        className={[
                                            styles.emailListItem,
                                            activeEmail?.id === email.id
                                                ? styles.emailListItemActive
                                                : "",
                                        ]
                                            .filter(Boolean)
                                            .join(" ")}
                                        onClick={() =>
                                            setActiveEmailId(email.id)
                                        }
                                    >
                                        <span className={styles.accountAvatar}>
                                            {email.account
                                                .split(/\s+/)
                                                .filter(Boolean)
                                                .slice(0, 2)
                                                .map((part) =>
                                                    part[0]?.toUpperCase()
                                                )
                                                .join("")}
                                        </span>

                                        <span
                                            className={
                                                styles.emailListItemContent
                                            }
                                        >
                                            <span
                                                className={
                                                    styles.emailListItemTop
                                                }
                                            >
                                                <strong>{email.account}</strong>
                                                <time>{email.sendIn}</time>
                                            </span>

                                            <span
                                                className={
                                                    styles.emailListItemEmail
                                                }
                                            >
                                                {email.email}
                                            </span>

                                            <span
                                                className={
                                                    styles.emailListItemSubject
                                                }
                                            >
                                                {email.subject}
                                            </span>

                                            <span
                                                className={
                                                    styles.emailListItemMeta
                                                }
                                            >
                                                <span
                                                    className={`${styles.pill} ${styles[
                                                        email.status.toLowerCase()
                                                        ] || ""
                                                        }`}
                                                >
                                                    {email.status}
                                                </span>
                                                <span
                                                    className={`${styles.pill} ${styles[
                                                        email.priority.toLowerCase()
                                                        ] || ""
                                                        }`}
                                                >
                                                    {email.priority}
                                                </span>
                                            </span>
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </aside>

                    <section className={styles.emailDetailPanel}>
                        {!activeEmail ? (
                            <div className={styles.detailEmptyState}>
                                <CalendarClock size={24} />
                                <strong>Select a scheduled email</strong>
                                <span>
                                    Choose an email to review its content and
                                    schedule.
                                </span>
                            </div>
                        ) : (
                            <>
                                <header className={styles.emailDetailHeader}>
                                    <div className={styles.emailDetailTitle}>
                                        <span
                                            className={styles.detailAvatar}
                                        >
                                            {activeEmail.account
                                                .split(/\s+/)
                                                .filter(Boolean)
                                                .slice(0, 2)
                                                .map((part) =>
                                                    part[0]?.toUpperCase()
                                                )
                                                .join("")}
                                        </span>

                                        <div>
                                            <span>Scheduled for</span>
                                            <strong>
                                                {activeEmail.account}
                                            </strong>
                                            <small>{activeEmail.email}</small>
                                        </div>
                                    </div>

                                    <div
                                        className={styles.emailDetailHeaderRight}
                                    >
                                        <span
                                            className={`${styles.pill} ${styles[
                                                activeEmail.status.toLowerCase()
                                                ] || ""
                                                }`}
                                        >
                                            {activeEmail.status}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                openEmail(activeEmail)
                                            }
                                        >
                                            Manage schedule
                                        </button>
                                    </div>
                                </header>

                                <div className={styles.scheduleInfoGrid}>
                                    <div>
                                        <span>Scheduled date</span>
                                        <strong>
                                            {activeEmail.scheduledFor}
                                        </strong>
                                    </div>
                                    <div>
                                        <span>Send in</span>
                                        <strong>{activeEmail.sendIn}</strong>
                                    </div>
                                    <div>
                                        <span>Priority</span>
                                        <strong>{activeEmail.priority}</strong>
                                    </div>
                                    <div>
                                        <span>MRR at risk</span>
                                        <strong>
                                            £
                                            {activeEmail.mrrAtRisk.toLocaleString(
                                                "en-GB"
                                            )}
                                        </strong>
                                    </div>
                                </div>

                                <article className={styles.emailMessage}>
                                    <div className={styles.emailMessageHeader}>
                                        <span>Subject</span>
                                        <h2>{activeEmail.subject}</h2>
                                    </div>

                                    <div className={styles.emailRecipientLine}>
                                        <span>To</span>
                                        <strong>{activeEmail.account}</strong>
                                        <small>{activeEmail.email}</small>
                                    </div>

                                    <div className={styles.emailMessageBody}>
                                        {activeEmail.plainText ? (
                                            activeEmail.plainText
                                                .split("\n")
                                                .map((line, index) =>
                                                    line.trim() ? (
                                                        <p key={`${activeEmail.id}-${index}`}>
                                                            {line}
                                                        </p>
                                                    ) : (
                                                        <br
                                                            key={`${activeEmail.id}-${index}`}
                                                        />
                                                    )
                                                )
                                        ) : (
                                            <p>
                                                This scheduled email does not
                                                include a plain-text preview.
                                                Open it to review the full HTML
                                                version.
                                            </p>
                                        )}
                                    </div>
                                </article>

                                <footer className={styles.emailDetailFooter}>
                                    <div>
                                        <span>Template</span>
                                        <strong>{activeEmail.template}</strong>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => openEmail(activeEmail)}
                                    >
                                        Review and reschedule
                                    </button>
                                </footer>
                            </>
                        )}
                    </section>
                </div>
            </div>

            {selectedEmail && calendarDate && (
                <div className={styles.modalOverlay}>
                    <div className={styles.wideEmailModal}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h2>Scheduled Email</h2>
                                <p>{selectedEmail.account}</p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setSelectedEmail(null)}
                                disabled={saving}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className={styles.modalTwoColumn}>
                            <div className={styles.realEmailPreview}>
                                <div className={styles.previewHeader}>
                                    <span>Real email preview</span>
                                </div>

                                <iframe
                                    title="Scheduled email preview"
                                    srcDoc={previewHtml}
                                    className={styles.emailPreviewFrame}
                                />
                            </div>

                            <div className={styles.schedulePanel}>
                                <div className={styles.calendarBox}>
                                    <div className={styles.calendarTop}>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setCalendarDate(
                                                    new Date(
                                                        calendarDate.getFullYear(),
                                                        calendarDate.getMonth() - 1,
                                                        1
                                                    )
                                                )
                                            }
                                            disabled={saving}
                                        >
                                            <ChevronLeft size={16} />
                                        </button>

                                        <h3>
                                            {`${[
                                                "January",
                                                "February",
                                                "March",
                                                "April",
                                                "May",
                                                "June",
                                                "July",
                                                "August",
                                                "September",
                                                "October",
                                                "November",
                                                "December",
                                            ][calendarDate.getMonth()]} ${calendarDate.getFullYear()}`}
                                        </h3>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                setCalendarDate(
                                                    new Date(
                                                        calendarDate.getFullYear(),
                                                        calendarDate.getMonth() + 1,
                                                        1
                                                    )
                                                )
                                            }
                                            disabled={saving}
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>

                                    <div className={styles.calendarWeek}>
                                        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => (
                                            <span key={day}>{day}</span>
                                        ))}
                                    </div>

                                    <div className={styles.calendarGrid}>
                                        {monthDays.map((date, index) => {
                                            if (!date) return <span key={`empty-${index}`} />;

                                            const formattedDate = formatDateInput(date);
                                            const selected = scheduleDate === formattedDate;

                                            return (
                                                <button
                                                    key={formattedDate}
                                                    type="button"
                                                    className={selected ? styles.selectedCalendarDay : ""}
                                                    onClick={() => setScheduleDate(formattedDate)}
                                                    disabled={saving}
                                                >
                                                    {date.getDate()}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <label className={styles.timeField}>
                                    Time
                                    <input
                                        type="time"
                                        value={scheduleTime}
                                        onChange={(event) => setScheduleTime(event.target.value)}
                                        disabled={saving}
                                    />
                                </label>

                                <div className={styles.modalActions}>
                                    <button
                                        type="button"
                                        onClick={editEmail}
                                        disabled={saving}
                                    >
                                        Edit email
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setSelectedEmail(null)}
                                        disabled={saving}
                                    >
                                        Cancel
                                    </button>

                                    <button
                                        type="button"
                                        className={styles.sendNowBtn}
                                        onClick={sendNow}
                                        disabled={saving}
                                    >
                                        <Send size={14} />
                                        Send now
                                    </button>

                                    <button
                                        type="button"
                                        className={styles.rescheduleBtn}
                                        onClick={saveSchedule}
                                        disabled={saving}
                                    >
                                        <CalendarClock size={14} />
                                        Reschedule
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
