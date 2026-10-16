export type CustomerStatus = "Active" | "At Risk" | "Unengaged";

export type Customer = {
    id: string;
    name: string;
    company: string;
    email: string;
    mrr: number;
    emailsSent: number;
    openRate: string;
    clickRate: string;
    engagementScore: number;
    status: CustomerStatus;
    lastActivity: string;
};

export type CustomerStat = {
    label: string;
    value: string;
    change: string;
    comparison: string;
    comparisonValue: string;
};

export const customers: Customer[] = [
    {
        id: "#56578",
        name: "Brooklyn Simmons",
        company: "Acme AI",
        email: "brooklyn@acme.ai",
        mrr: 499,
        emailsSent: 18,
        openRate: "62.4%",
        clickRate: "8.1%",
        engagementScore: 76,
        status: "Active",
        lastActivity: "Opened onboarding email 2h ago",
    },
    {
        id: "#56579",
        name: "Dianne Russell",
        company: "CloudCore",
        email: "dianne@cloudcore.io",
        mrr: 999,
        emailsSent: 12,
        openRate: "48.2%",
        clickRate: "3.4%",
        engagementScore: 61,
        status: "Active",
        lastActivity: "Clicked product update email yesterday",
    },
    {
        id: "#56580",
        name: "Jerome Bell",
        company: "FlowDesk",
        email: "jerome@flowdesk.co",
        mrr: 149,
        emailsSent: 3,
        openRate: "21.8%",
        clickRate: "1.2%",
        engagementScore: 28,
        status: "At Risk",
        lastActivity: "No opens in 14 days",
    },
    {
        id: "#56581",
        name: "Ronald Richards",
        company: "Metricly",
        email: "ronald@metricly.com",
        mrr: 299,
        emailsSent: 0,
        openRate: "11.4%",
        clickRate: "0.8%",
        engagementScore: 15,
        status: "Unengaged",
        lastActivity: "No activity in 31 days",
    },
    {
        id: "#56582",
        name: "Cody Fisher",
        company: "SalesPilot",
        email: "cody@salespilot.io",
        mrr: 749,
        emailsSent: 9,
        openRate: "39.5%",
        clickRate: "5.6%",
        engagementScore: 52,
        status: "At Risk",
        lastActivity: "Opened re-engagement email 3 days ago",
    },
    {
        id: "#56583",
        name: "Cameron Williamson",
        company: "Northstar",
        email: "cameron@northstar.ai",
        mrr: 1299,
        emailsSent: 21,
        openRate: "71.2%",
        clickRate: "10.9%",
        engagementScore: 88,
        status: "Active",
        lastActivity: "Clicked upgrade CTA today",
    },
    {
        id: "#56584",
        name: "Wade Warren",
        company: "BrightDesk",
        email: "wade@brightdesk.com",
        mrr: 399,
        emailsSent: 6,
        openRate: "44.1%",
        clickRate: "6.2%",
        engagementScore: 58,
        status: "Active",
        lastActivity: "Replied to follow-up 1 day ago",
    },
    {
        id: "#56585",
        name: "Savannah Nguyen",
        company: "DataNest",
        email: "savannah@datanest.io",
        mrr: 899,
        emailsSent: 15,
        openRate: "52.7%",
        clickRate: "7.4%",
        engagementScore: 67,
        status: "Active",
        lastActivity: "Opened newsletter 4h ago",
    },
    {
        id: "#56586",
        name: "Darlene Robertson",
        company: "LaunchFlow",
        email: "darlene@launchflow.co",
        mrr: 199,
        emailsSent: 1,
        openRate: "18.9%",
        clickRate: "1.1%",
        engagementScore: 24,
        status: "Unengaged",
        lastActivity: "No clicks in 21 days",
    },
];

function parsePercentage(value: string) {
    const parsedValue = Number.parseFloat(value.replace("%", ""));
    return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function calculateAverage(values: number[]) {
    if (values.length === 0) return 0;

    return values.reduce((total, value) => total + value, 0) / values.length;
}

const totalCustomers = customers.length;

const totalEmailsSent = customers.reduce(
    (total, customer) => total + customer.emailsSent,
    0,
);

const averageEngagementScore = calculateAverage(
    customers.map((customer) => customer.engagementScore),
);

const averageOpenRate = calculateAverage(
    customers.map((customer) => parsePercentage(customer.openRate)),
);

export const customerStats: CustomerStat[] = [
    {
        label: "Total Customers",
        value: totalCustomers.toLocaleString("en-GB"),
        change: "+3.1%",
        comparison: "previous month",
        comparisonValue: "8",
    },
    {
        label: "Engagement Score",
        value: `${averageEngagementScore.toFixed(1)}%`,
        change: "+4.2%",
        comparison: "previous month",
        comparisonValue: "50.0%",
    },
    {
        label: "Emails Sent",
        value: totalEmailsSent.toLocaleString("en-GB"),
        change: "+12.4%",
        comparison: "previous month",
        comparisonValue: "76",
    },
    {
        label: "Avg. Open Rate",
        value: `${averageOpenRate.toFixed(1)}%`,
        change: "+5.8%",
        comparison: "previous month",
        comparisonValue: "38.9%",
    },
];

export type CustomerKpi = {
    customerId: string;
    mrrChange: number;
    emailsSentToday: number;
    emailsSentYesterday: number;
    openRateYesterday: number;
    queuedEmails: number;
};

export const customerKpis: CustomerKpi[] = [
    {
        customerId: "#56578",
        mrrChange: 24,
        emailsSentToday: 18,
        emailsSentYesterday: 13,
        openRateYesterday: 58.1,
        queuedEmails: 5,
    },
    {
        customerId: "#56579",
        mrrChange: 83,
        emailsSentToday: 12,
        emailsSentYesterday: 9,
        openRateYesterday: 45.8,
        queuedEmails: 3,
    },
    {
        customerId: "#56580",
        mrrChange: -12,
        emailsSentToday: 3,
        emailsSentYesterday: 17,
        openRateYesterday: 24.6,
        queuedEmails: 2,
    },
    {
        customerId: "#56581",
        mrrChange: -31,
        emailsSentToday: 0,
        emailsSentYesterday: 5,
        openRateYesterday: 14.2,
        queuedEmails: 0,
    },
    {
        customerId: "#56582",
        mrrChange: 41,
        emailsSentToday: 9,
        emailsSentYesterday: 7,
        openRateYesterday: 36.2,
        queuedEmails: 7,
    },
    {
        customerId: "#56583",
        mrrChange: 102,
        emailsSentToday: 21,
        emailsSentYesterday: 18,
        openRateYesterday: 68.4,
        queuedEmails: 8,
    },
    {
        customerId: "#56584",
        mrrChange: 17,
        emailsSentToday: 6,
        emailsSentYesterday: 4,
        openRateYesterday: 41.7,
        queuedEmails: 2,
    },
    {
        customerId: "#56585",
        mrrChange: 58,
        emailsSentToday: 15,
        emailsSentYesterday: 12,
        openRateYesterday: 49.3,
        queuedEmails: 6,
    },
    {
        customerId: "#56586",
        mrrChange: -9,
        emailsSentToday: 1,
        emailsSentYesterday: 4,
        openRateYesterday: 22.7,
        queuedEmails: 1,
    },
];
