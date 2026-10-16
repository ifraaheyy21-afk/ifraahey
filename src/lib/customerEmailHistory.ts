export type CustomerEmailHistory = {
    id: string;
    customerId: string;

    subject: string;
    previewText: string;

    type: "Onboarding" | "Retention" | "Expansion" | "Education";

    outcome: "Opened" | "Not Opened" | "Replied";

    reply: boolean;
    replyPreview?: string;
    replyAt?: string;

    sentAt: string;
    from: string;
    html: string;
};

export const customerEmailHistory: CustomerEmailHistory[] = [
    {
        id: "1",
        customerId: "demo",

        subject: "Welcome to Cobrai",
        previewText: "Let's get your workspace set up.",

        type: "Onboarding",

        outcome: "Opened",
        reply: false,

        sentAt: "Today · 09:42",

        from: "Sarah",

        html: "<html>...</html>",
    },

    {
        id: "2",
        customerId: "demo",

        subject: "Your weekly retention report",
        previewText: "See which customers require attention today.",

        type: "Retention",

        outcome: "Replied",
        reply: true,

        replyPreview: `Hi Sarah,

Thanks for sending this over.

The report was really useful. We noticed two accounts that look at risk and would like to understand what actions Cobrai recommends next.

Best,
Brooklyn Simmons`,

        replyAt: "Yesterday · 16:04",

        sentAt: "Yesterday · 15:20",

        from: "Sarah",

        html: "<html>...</html>",
    },

    {
        id: "3",
        customerId: "demo",

        subject: "Unlock more automation",
        previewText: "Upgrade to automate customer journeys.",

        type: "Expansion",

        outcome: "Replied",
        reply: true,

        replyPreview: `Hi Sarah,

Thanks for reaching out.

We are interested in the automation features. Could you send over the Growth plan pricing and confirm whether annual billing includes a discount?

Thanks,
Emma Collins`,

        replyAt: "24 Jun · 13:02",

        sentAt: "24 Jun · 11:14",

        from: "Sarah",

        html: "<html>...</html>",
    },

    {
        id: "4",
        customerId: "demo",

        subject: "Customer engagement insights",
        previewText: "See what changed this week.",

        type: "Education",

        outcome: "Not Opened",
        reply: false,

        sentAt: "22 Jun · 13:41",

        from: "Sarah",

        html: "<html>...</html>",
    },
];

export type CustomerEmailOutcome = "Opened" | "Replied" | "Ignored";

export type CustomerEmail = {
    customerId: string;
    id: string;
    subject: string;
    reason: string;
    outcome: CustomerEmailOutcome;
    sentAt: string;

    html?: string;
    replyPreview?: string;
};

export const customerEmails: CustomerEmail[] = [
    {
        id: "1",
        customerId: "demo",

        subject: "Welcome to Cobrai",
        reason: "Let's get your workspace set up.",

        outcome: "Opened",

        sentAt: "Today · 09:42",

        html: "<html>...</html>",
    },

    {
        id: "2",
        customerId: "demo",

        subject: "Your weekly retention report",
        reason: "See which customers require attention today.",

        outcome: "Replied",

        sentAt: "Yesterday · 15:20",

        html: "<html>...</html>",

        replyPreview: `Hi Sarah,

Thanks for sending this over.

The report was really useful. We noticed two accounts that look at risk and would like to understand what actions Cobrai recommends next.

Best,
Brooklyn Simmons`,
    },

    {
        id: "3",
        customerId: "demo",

        subject: "Unlock more automation",
        reason: "Upgrade to automate customer journeys.",

        outcome: "Replied",

        sentAt: "24 Jun · 11:14",

        html: "<html>...</html>",

        replyPreview: `Hi Sarah,

Thanks for reaching out.

We are interested in the automation features. Could you send over the Growth plan pricing and confirm whether annual billing includes a discount?

Thanks,
Emma Collins`,
    },

    {
        id: "4",
        customerId: "demo",

        subject: "Customer engagement insights",
        reason: "See what changed this week.",

        outcome: "Ignored",

        sentAt: "22 Jun · 13:41",

        html: "<html>...</html>",
    },
];

export function getCustomerEmailsById(customerId: string) {
    return customerEmails.filter((email) => email.customerId === customerId);
}