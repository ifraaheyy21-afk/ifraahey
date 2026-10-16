export type AutomationNodeType =
    | "trigger"
    | "email"
    | "delay"
    | "condition"
    | "action";

export type AutomationNodePosition = {
    x: number;
    y: number;
};

export type AutomationNode = {
    id: string;
    type: AutomationNodeType;
    title: string;
    description: string;
    label: string;
    position: AutomationNodePosition;
    status?: "ready" | "warning";
    warningText?: string;
    config: {
        subject?: string;
        body?: string;
        delayValue?: number;
        delayUnit?: "minutes" | "hours" | "days";
        condition?: string;
        actionType?: string;
    };
};

export type AutomationConnection = {
    id: string;
    from: string;
    to: string;
};

export type AutomationWorkflow = {
    id: string;
    name: string;
    description: string;
    status: "active" | "draft";
    updatedAt: string;
    nodes: AutomationNode[];
    connections: AutomationConnection[];
};

export const automationNodeLibrary: Array<{
    type: AutomationNodeType;
    title: string;
    description: string;
}> = [
        {
            type: "email",
            title: "Send email",
            description: "Send a personalised email to the customer.",
        },
        {
            type: "delay",
            title: "Wait",
            description: "Pause the workflow before the next step.",
        },
        {
            type: "condition",
            title: "Condition",
            description: "Branch the workflow using account data.",
        },
        {
            type: "action",
            title: "Update account",
            description: "Apply a status, tag, or account update.",
        },
    ];

export const demoAutomationWorkflows: AutomationWorkflow[] = [
    {
        id: "retention-recovery",
        name: "Retention recovery",
        description: "Re-engage accounts showing a drop in product usage.",
        status: "active",
        updatedAt: "28 Jul 2026",
        nodes: [
            {
                id: "trigger-risk",
                type: "trigger",
                title: "Account becomes at risk",
                description: "Starts when the customer risk score reaches 60 or above.",
                label: "Trigger",
                position: { x: 72, y: 196 },
                status: "ready",
                config: {
                    condition: "Risk score is 60 or above",
                },
            },
            {
                id: "email-check-in",
                type: "email",
                title: "Send check-in email",
                description: "Ask whether the customer needs help getting value.",
                label: "Email",
                position: { x: 338, y: 196 },
                status: "ready",
                config: {
                    subject: "Can we help you get more value from {{company_name}}?",
                    body:
                        "Hi {{first_name}},\n\nWe noticed activity on your account has slowed down recently. I wanted to check whether there is anything preventing your team from getting the full value from {{company_name}}.\n\nReply to this email and we will help you get back on track.\n\nBest,\n{{sender_name}}",
                },
            },
            {
                id: "delay-one-day",
                type: "delay",
                title: "Wait 1 day",
                description: "Allow time for the customer to open or reply.",
                label: "Delay",
                position: { x: 604, y: 196 },
                status: "ready",
                config: {
                    delayValue: 1,
                    delayUnit: "days",
                },
            },
            {
                id: "condition-opened",
                type: "condition",
                title: "Email opened?",
                description: "Checks whether the customer opened the email.",
                label: "Condition",
                position: { x: 870, y: 196 },
                status: "ready",
                config: {
                    condition: "Email was opened",
                },
            },
            {
                id: "email-follow-up",
                type: "email",
                title: "Send follow-up",
                description: "Send a shorter reminder when there is no response.",
                label: "Email",
                position: { x: 870, y: 426 },
                status: "warning",
                warningText: "Review email copy before publishing",
                config: {
                    subject: "Quick follow-up",
                    body:
                        "Hi {{first_name}},\n\nJust following up in case you missed my previous email. We are here to help your team get more value from {{company_name}}.\n\nWould a quick call help?\n\nBest,\n{{sender_name}}",
                },
            },
            {
                id: "action-engaged",
                type: "action",
                title: "Mark as engaged",
                description: "Update the account after a positive engagement signal.",
                label: "Action",
                position: { x: 1136, y: 196 },
                status: "ready",
                config: {
                    actionType: "Set engagement status to Engaged",
                },
            },
        ],
        connections: [
            { id: "c1", from: "trigger-risk", to: "email-check-in" },
            { id: "c2", from: "email-check-in", to: "delay-one-day" },
            { id: "c3", from: "delay-one-day", to: "condition-opened" },
            { id: "c4", from: "condition-opened", to: "action-engaged" },
            { id: "c5", from: "condition-opened", to: "email-follow-up" },
        ],
    },
    {
        id: "failed-payment",
        name: "Failed payment recovery",
        description: "Recover failed payments with an automatic email sequence.",
        status: "draft",
        updatedAt: "26 Jul 2026",
        nodes: [
            {
                id: "payment-trigger",
                type: "trigger",
                title: "Payment fails",
                description: "Starts when Stripe reports a failed subscription payment.",
                label: "Trigger",
                position: { x: 110, y: 230 },
                status: "ready",
                config: {
                    condition: "Subscription payment failed",
                },
            },
            {
                id: "payment-email",
                type: "email",
                title: "Send payment email",
                description: "Ask the customer to update their payment method.",
                label: "Email",
                position: { x: 405, y: 230 },
                status: "ready",
                config: {
                    subject: "Action needed: update your payment details",
                    body:
                        "Hi {{first_name}},\n\nWe could not process your latest payment. Please update your payment details to keep your account active.\n\n{{billing_link}}\n\nBest,\n{{sender_name}}",
                },
            },
            {
                id: "payment-delay",
                type: "delay",
                title: "Wait 2 days",
                description: "Pause before checking the payment status again.",
                label: "Delay",
                position: { x: 700, y: 230 },
                status: "ready",
                config: {
                    delayValue: 2,
                    delayUnit: "days",
                },
            },
            {
                id: "payment-condition",
                type: "condition",
                title: "Payment recovered?",
                description: "Check whether the invoice was paid.",
                label: "Condition",
                position: { x: 995, y: 230 },
                status: "warning",
                warningText: "Connect Stripe before publishing",
                config: {
                    condition: "Invoice status is paid",
                },
            },
        ],
        connections: [
            { id: "p1", from: "payment-trigger", to: "payment-email" },
            { id: "p2", from: "payment-email", to: "payment-delay" },
            { id: "p3", from: "payment-delay", to: "payment-condition" },
        ],
    },
];
