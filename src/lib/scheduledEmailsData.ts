export type ScheduledEmailStatus = "Scheduled" | "Paused" | "Sent";
export type ScheduledEmailPriority = "High" | "Normal" | "Low";

export type ScheduledEmail = {
    id: string;
    account: string;
    email: string;
    subject: string;
    template: string;
    status: ScheduledEmailStatus;
    priority: ScheduledEmailPriority;
    scheduledAt: string;
    scheduledFor: string;
    sendIn: string;
    mrrAtRisk: number;
};

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

function formatScheduledFor(date: Date) {
    return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function getSendIn(date: Date) {
    const diffMinutes = Math.round((date.getTime() - Date.now()) / 60000);

    if (diffMinutes <= 0) return "Due now";
    if (diffMinutes < 60) return `In ${diffMinutes} mins`;
    if (diffMinutes < 120) return "In 1 hr";

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";

    return `In ${Math.round(diffMinutes / 60)} hrs`;
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
    return {
        id,
        account,
        email,
        subject,
        template,
        status,
        priority,
        scheduledAt: scheduledAtDate.toISOString(),
        scheduledFor: formatScheduledFor(scheduledAtDate),
        sendIn: getSendIn(scheduledAtDate),
        mrrAtRisk,
    };
}

export const scheduledEmails: ScheduledEmail[] = [
    buildEmail("sch_001", "Acme AI", "brooklyn@acme.ai", "Quick check-in before renewal", "Follow-up", "Scheduled", "High", addMinutes(10), 340),
    buildEmail("sch_002", "CloudCore", "dianne@cloudcore.io", "Quick check-in before renewal", "Follow-up", "Scheduled", "Normal", addMinutes(45), 179),
    buildEmail("sch_003", "FlowDesk", "jerome@flowdesk.co", "We noticed a drop in usage", "Retention", "Scheduled", "High", addMinutes(120), 89),
    buildEmail("sch_004", "Metricly", "ronald@metricly.com", "Can we help recover activity?", "Recovery", "Scheduled", "High", addMinutes(175), 260),
    buildEmail("sch_005", "SalesPilot", "cody@salespilot.io", "We noticed a drop in usage", "Retention", "Paused", "Normal", addMinutes(240), 112),
    buildEmail("sch_006", "BrightDesk", "wade@brightdesk.co", "Let’s improve adoption together", "Re-engagement", "Scheduled", "Normal", addMinutes(295), 190),
    buildEmail("sch_007", "Northstar", "cameron@northstar.ai", "Your team is missing key insights", "Feature Adoption", "Scheduled", "High", addDays(1, 10), 450),
    buildEmail("sch_008", "LaunchFlow", "amina@launchflow.io", "Can we help your team get more value?", "Recovery", "Scheduled", "Low", addDays(1, 15), 75),
];