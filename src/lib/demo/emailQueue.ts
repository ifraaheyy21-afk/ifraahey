export type EmailQueueStatus = "pending" | "sending" | "sent" | "failed";

export type EmailQueuePriority = "low" | "normal" | "high";

export type EmailQueueItem = {
    id: string;
    customerId: string;
    customerName: string;
    customerEmail: string;
    subject: string;
    template: string;
    status: EmailQueueStatus;
    priority: EmailQueuePriority;
    scheduledFor: string;
    createdAt: string;
    churnRisk: number;
    mrrAtRiskMinor: number;
    recommendedAction: string;
};

export function getDemoEmailQueue(): EmailQueueItem[] {
    const now = Date.now();
    const hour = 1000 * 60 * 60;

    return [
        {
            id: "email-queue-cedarworks",
            customerId: "demo-cedarworks",
            customerName: "CedarWorks",
            customerEmail: "support@cedarworks.io",
            subject: "We've noticed a drop in usage",
            template: "Retention Campaign",
            status: "pending",
            priority: "high",
            scheduledFor: new Date(now).toISOString(),
            createdAt: new Date(now - hour).toISOString(),
            churnRisk: 91,
            mrrAtRiskMinor: 21900,
            recommendedAction: "Send retention outreach",
        },
        {
            id: "email-queue-metricly",
            customerId: "demo-metricly",
            customerName: "Metricly",
            customerEmail: "daniel@metricly.com",
            subject: "Can we help recover activity?",
            template: "Recovery",
            status: "sending",
            priority: "high",
            scheduledFor: new Date(now).toISOString(),
            createdAt: new Date(now - hour).toISOString(),
            churnRisk: 82,
            mrrAtRiskMinor: 26000,
            recommendedAction: "Executive outreach",
        },
        {
            id: "email-queue-cloudcore",
            customerId: "demo-cloudcore",
            customerName: "CloudCore",
            customerEmail: "james@cloudcore.io",
            subject: "Unlock more retention insights",
            template: "Expansion Opportunity",
            status: "sent",
            priority: "low",
            scheduledFor: new Date(now - hour).toISOString(),
            createdAt: new Date(now - hour * 5).toISOString(),
            churnRisk: 47,
            mrrAtRiskMinor: 17900,
            recommendedAction: "Upsell analytics package",
        },
        {
            id: "email-queue-retainly",
            customerId: "demo-retainly",
            customerName: "Retainly",
            customerEmail: "ops@retainly.co",
            subject: "Payment issue on your account",
            template: "Failed Payment",
            status: "failed",
            priority: "high",
            scheduledFor: new Date(now - hour * 3).toISOString(),
            createdAt: new Date(now - hour * 11).toISOString(),
            churnRisk: 92,
            mrrAtRiskMinor: 41000,
            recommendedAction: "Retry payment and notify admin",
        },
        {
            id: "email-queue-invoicekit",
            customerId: "demo-invoicekit",
            customerName: "InvoiceKit",
            customerEmail: "finance@invoicekit.io",
            subject: "Let's prevent another failed invoice",
            template: "Billing Recovery",
            status: "sending",
            priority: "high",
            scheduledFor: new Date(now).toISOString(),
            createdAt: new Date(now - hour * 14).toISOString(),
            churnRisk: 84,
            mrrAtRiskMinor: 27600,
            recommendedAction: "Send billing recovery email",
        },
        {
            id: "email-queue-launchflow",
            customerId: "demo-launchflow",
            customerName: "LaunchFlow",
            customerEmail: "darlene@launchflow.co",
            subject: "Your usage has dropped 42%",
            template: "Usage Drop Recovery",
            status: "pending",
            priority: "high",
            scheduledFor: new Date(now + hour).toISOString(),
            createdAt: new Date(now - hour * 9).toISOString(),
            churnRisk: 94,
            mrrAtRiskMinor: 57000,
            recommendedAction: "Urgent retention outreach",
        },
        {
            id: "email-queue-datanest",
            customerId: "demo-datanest",
            customerName: "DataNest",
            customerEmail: "savannah@datanest.io",
            subject: "We're here if you need support",
            template: "Support Check-in",
            status: "sent",
            priority: "low",
            scheduledFor: new Date(now - hour * 2).toISOString(),
            createdAt: new Date(now - hour * 8).toISOString(),
            churnRisk: 39,
            mrrAtRiskMinor: 9800,
            recommendedAction: "Monitor engagement",
        },
    ];
}