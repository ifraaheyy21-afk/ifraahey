export type ChartRange = "24hrs" | "7days" | "30days" | "60days";

export type EmailStat = {
    label: string;
    value: string;
    change: string;
    trend?: "up" | "down" | "neutral";
};

export type ChartPoint = {
    label: string;
    sent: number;
};

export type AgentActivityType =
    | "sent"
    | "scheduled"
    | "optimised"
    | "warning"
    | "reply"
    | "sequence";

export type AgentActivity = {
    id: string;
    type: AgentActivityType;
    title: string;
    account: string;
    detail: string;
    time: string;
};

export type Agent = {
    name: string;
    description: string;
    status: "Active" | "Paused";
};

export type Campaign = {
    title: string;
    preview: string;
    status: "Sent" | "Draft" | "Scheduled";
    openRate: string;
};

export type Activity = {
    title: string;
    email: string;
    date: string;
};

const currentMonthDays = Array.from({ length: 30 }, (_, index) => ({
    label: `Jun ${index + 1}`,
    sent: 220 + index * 22 + ((index * 37) % 140),
}));

const previousAndCurrentMonth = [
    ...Array.from({ length: 30 }, (_, index) => ({
        label: `May ${index + 1}`,
        sent: 160 + index * 13 + ((index * 29) % 110),
    })),
    ...Array.from({ length: 30 }, (_, index) => ({
        label: `Jun ${index + 1}`,
        sent: 260 + index * 18 + ((index * 41) % 130),
    })),
];

export const emailStats: EmailStat[] = [
    {
        label: "Emails sent",
        value: "1,181",
        change: "+0.5%",
        trend: "up",
    },
    {
        label: "Avg. open rate",
        value: "86.84%",
        change: "+7.1%",
        trend: "up",
    },
    {
        label: "Avg. reply rate",
        value: "22.7%",
        change: "+5.4%",
        trend: "up",
    },
    {
        label: "Next scheduled",
        value: "13:05",
        change: "248 emails queued",
        trend: "neutral",
    },
];

export const chartDataByRange: Record<ChartRange, ChartPoint[]> = {
    "24hrs": Array.from({ length: 24 }, (_, index) => ({
        label: `${String(index).padStart(2, "0")}:00`,
        sent: 45 + index * 9 + ((index * 19) % 70),
    })),

    "7days": [
        { label: "Mon", sent: 340 },
        { label: "Tue", sent: 420 },
        { label: "Wed", sent: 510 },
        { label: "Thu", sent: 680 },
        { label: "Fri", sent: 720 },
        { label: "Sat", sent: 610 },
        { label: "Sun", sent: 790 },
    ],

    "30days": currentMonthDays,

    "60days": previousAndCurrentMonth,
};

export const agentActivity: AgentActivity[] = [
    {
        id: "act-001",
        type: "reply",
        title: "Reply detected",
        account: "Acme AI",
        detail: "Customer replied to follow-up email",
        time: "2 mins ago",
    },
    {
        id: "act-002",
        type: "optimised",
        title: "Subject line improved",
        account: "CloudCore",
        detail: "AI rewrote the subject for higher open rate",
        time: "8 mins ago",
    },
    {
        id: "act-003",
        type: "scheduled",
        title: "Email scheduled",
        account: "FlowDesk",
        detail: "Best send time selected automatically",
        time: "14 mins ago",
    },
    {
        id: "act-004",
        type: "warning",
        title: "Engagement dropped",
        account: "Metricly",
        detail: "Open rate fell below the usual average",
        time: "22 mins ago",
    },
    {
        id: "act-005",
        type: "sent",
        title: "Follow-up sent",
        account: "SalesPilot",
        detail: "Email sent after no response for 3 days",
        time: "31 mins ago",
    },
    {
        id: "act-006",
        type: "sequence",
        title: "Sequence started",
        account: "BrightDesk",
        detail: "AI started a 3-step outreach sequence",
        time: "46 mins ago",
    },
    {
        id: "act-007",
        type: "scheduled",
        title: "Reminder queued",
        account: "DataNest",
        detail: "Follow-up added to tomorrow’s queue",
        time: "1 hr ago",
    },
    {
        id: "act-008",
        type: "optimised",
        title: "Send time adjusted",
        account: "Northstar",
        detail: "Moved to a higher-performing time slot",
        time: "1 hr ago",
    },
];

export const agents: Agent[] = [
    { name: "Acme AI", description: "Low usage recovery", status: "Active" },
    { name: "FlowDesk", description: "Support check-in", status: "Active" },
    { name: "CloudCore", description: "Upgrade opportunity", status: "Active" },
    { name: "SalesPilot", description: "Payment recovery", status: "Active" },
];

export const campaigns: Campaign[] = [
    {
        title: "Product Update May",
        preview: "Sent 15 Aug, 8:30",
        status: "Sent",
        openRate: "40.6%",
    },
    {
        title: "Newsletter — August",
        preview: "Sent 15 Aug, 8:30",
        status: "Sent",
        openRate: "67.1%",
    },
    {
        title: "Re-engagement",
        preview: "Scheduled for inactive users",
        status: "Draft",
        openRate: "50.3%",
    },
    {
        title: "Welcome Series",
        preview: "New customer onboarding",
        status: "Sent",
        openRate: "72.8%",
    },
];

export const recentActivity: Activity[] = [
    { title: "Acme AI email scheduled", email: "sarah@acme.ai", date: "18 Aug, 09:00" },
    { title: "FlowDesk email scheduled", email: "amina@flowdesk.co", date: "18 Aug, 11:30" },
    { title: "CloudCore email scheduled", email: "james@cloudcore.io", date: "19 Aug, 10:00" },
];