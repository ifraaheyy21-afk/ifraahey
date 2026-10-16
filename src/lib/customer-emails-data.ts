import { customers, type Customer, type CustomerStatus } from "./customersData";

export type EmailFolder = "received" | "sent" | "scheduled";
export type EmailCategory =
    | "Retention"
    | "Onboarding"
    | "Billing"
    | "Product"
    | "Support"
    | "Renewal"
    | "Expansion"
    | "Check-in";

export type EmailAttachment = {
    id: string;
    name: string;
    size: string;
};

export type CustomerEmail = {
    id: string;
    customerId: string;
    folder: EmailFolder;
    category: EmailCategory;
    from: string;
    fromEmail: string;
    to: string;
    toEmail: string;
    subject: string;
    preview: string;
    body: string[];
    sentAt: string;
    sentAtIso: string;
    opened: boolean;
    replied: boolean;
    starred: boolean;
    archived: boolean;
    deleted: boolean;
    attachments: EmailAttachment[];
};

type EmailTemplate = {
    key: string;
    folder: EmailFolder;
    category: EmailCategory;
    dayOffset: number;
    hour: number;
    minute: number;
    from: (customer: Customer) => { name: string; email: string };
    to: (customer: Customer) => { name: string; email: string };
    subject: (customer: Customer) => string;
    preview: (customer: Customer) => string;
    body: (customer: Customer) => string[];
    opened: (customer: Customer) => boolean;
    replied: (customer: Customer) => boolean;
    starred?: (customer: Customer, index: number) => boolean;
    archived?: (customer: Customer) => boolean;
    deleted?: (customer: Customer) => boolean;
    attachments?: (customer: Customer) => EmailAttachment[];
};

function parsePercentage(value: string) {
    const parsedValue = Number.parseFloat(value.replace("%", ""));
    return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function formatInboxTimestamp(dayOffset: number, hour: number, minute: number) {
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    date.setDate(date.getDate() - dayOffset);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const compare = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const msPerDay = 1000 * 60 * 60 * 24;
    const diffDays = Math.round((today.getTime() - compare.getTime()) / msPerDay);

    const time = date.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
    });

    let label = "";

    if (diffDays === 0) {
        label = `Today ${time}`;
    } else if (diffDays === 1) {
        label = `Yesterday ${time}`;
    } else {
        label = `${date.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
        })} ${time}`;
    }

    return {
        label,
        iso: date.toISOString(),
    };
}

function getCustomerManager(customer: Customer) {
    const managers = [
        { name: "Sarah Chen", email: "sarah@cobrai.ai" },
        { name: "Alex Morgan", email: "alex@cobrai.ai" },
        { name: "Nina Patel", email: "nina@cobrai.ai" },
        { name: "James Walker", email: "james@cobrai.ai" },
    ];

    const index = customers.findIndex((item) => item.id === customer.id);
    return managers[index % managers.length];
}

function getSupportAgent(customer: Customer) {
    const agents = [
        { name: "Maya Thompson", email: "maya@cobrai.ai" },
        { name: "Leo Carter", email: "leo@cobrai.ai" },
        { name: "Emma Brooks", email: "emma@cobrai.ai" },
    ];

    const index = customers.findIndex((item) => item.id === customer.id);
    return agents[index % agents.length];
}

function getStatusTone(status: CustomerStatus) {
    switch (status) {
        case "Active":
            return {
                riskLabel: "growth opportunities",
                nextStep: "identify accounts likely to expand",
                retentionFocus: "upsell and expansion opportunities",
            };
        case "At Risk":
            return {
                riskLabel: "drop in engagement",
                nextStep: "prioritise at-risk accounts for follow-up",
                retentionFocus: "re-engagement and churn prevention",
            };
        case "Unengaged":
            return {
                riskLabel: "consistent inactivity",
                nextStep: "reconnect inactive accounts before renewal",
                retentionFocus: "win-back and activation",
            };
    }
}

function buildAttachments(names: string[]) {
    return names.map((name, index) => ({
        id: `${name}-${index + 1}`.toLowerCase().replace(/\s+/g, "-"),
        name,
        size: `${(index + 1) * 120} KB`,
    }));
}

const emailTemplates: EmailTemplate[] = [
    {
        key: "weekly-retention-report",
        folder: "received",
        category: "Retention",
        dayOffset: 0,
        hour: 15,
        minute: 20,
        from: () => ({ name: "Team", email: "brooklyn@acme.ai" }),
        to: (customer) => {
            const manager = getCustomerManager(customer);
            return { name: manager.name, email: manager.email };
        },
        subject: () => "Your weekly retention report",
        preview: (customer) =>
            `We noticed ${customer.company} has ${getStatusTone(customer.status).riskLabel}. Could you share the recommended next steps?`,
        body: (customer) => {
            const manager = getCustomerManager(customer);

            return [
                `Hi ${manager.name.split(" ")[0]},`,
                `Thanks for sending this over.`,
                `The report was really helpful. We noticed ${customer.company} has shown ${getStatusTone(customer.status).riskLabel}, and we’d like to better understand which actions you recommend we take first.`,
                `Could you send us the recommended next steps for this account and highlight anything we should prioritise this week?`,
                `Best,`,
                `Brooklyn Simmons`,
            ];
        },
        opened: () => true,
        replied: () => true,
        starred: () => true,
        attachments: () => buildAttachments(["retention-report.pdf"]),
    },
    {
        key: "recommended-next-steps",
        folder: "sent",
        category: "Retention",
        dayOffset: 0,
        hour: 13,
        minute: 10,
        from: (customer) => {
            const manager = getCustomerManager(customer);
            return { name: manager.name, email: manager.email };
        },
        to: () => ({ name: "Brooklyn Simmons", email: "brooklyn@acme.ai" }),
        subject: (customer) => `Recommended next steps for ${customer.company}`,
        preview: (customer) =>
            `Here are the priority actions we recommend for ${customer.company}, based on current engagement and recent activity.`,
        body: (customer) => {
            const manager = getCustomerManager(customer);
            const tone = getStatusTone(customer.status);

            return [
                `Hi Brooklyn,`,
                `Absolutely — based on the most recent signals for ${customer.company}, I’d recommend we focus on ${tone.nextStep}.`,
                `The account currently has an engagement score of ${customer.engagementScore} with an open rate of ${customer.openRate} and a click rate of ${customer.clickRate}.`,
                `My recommended plan is:`,
                `1. Send a focused follow-up tied to ${tone.retentionFocus}.`,
                `2. Prioritise any accounts with no activity in the last 7–14 days.`,
                `3. Review CTA performance and adjust the next message accordingly.`,
                `Happy to turn this into a customer-specific playbook if helpful.`,
                `Best,`,
                `${manager.name}`,
            ];
        },
        opened: () => true,
        replied: () => false,
        starred: () => false,
    },
    {
        key: "onboarding-checkin",
        folder: "sent",
        category: "Onboarding",
        dayOffset: 2,
        hour: 10,
        minute: 5,
        from: (customer) => {
            const manager = getCustomerManager(customer);
            return { name: manager.name, email: manager.email };
        },
        to: (customer) => ({ name: customer.name, email: customer.email }),
        subject: (customer) => `Checking in on ${customer.company}'s onboarding`,
        preview: (customer) =>
            `Just checking in to see how onboarding is going and whether your team needs help with setup or activation.`,
        body: (customer) => {
            const manager = getCustomerManager(customer);

            return [
                `Hi ${customer.name.split(" ")[0]},`,
                `Just checking in to see how onboarding is going for ${customer.company}.`,
                `I wanted to make sure your team has everything needed to get value quickly, including setup guidance, campaign recommendations and reporting support.`,
                `If helpful, I can also share a short activation checklist tailored to your account.`,
                `Best,`,
                `${manager.name}`,
            ];
        },
        opened: (customer) => customer.engagementScore >= 40,
        replied: (customer) => customer.engagementScore >= 70,
        starred: () => false,
    },
    {
        key: "billing-question",
        folder: "received",
        category: "Billing",
        dayOffset: 3,
        hour: 11,
        minute: 35,
        from: (customer) => ({ name: customer.name, email: customer.email }),
        to: (customer) => {
            const manager = getCustomerManager(customer);
            return { name: manager.name, email: manager.email };
        },
        subject: (customer) => `${customer.company} billing question`,
        preview: () =>
            `We had a quick question about the latest invoice and wanted to confirm the charge before processing payment.`,
        body: (customer) => {
            const manager = getCustomerManager(customer);

            return [
                `Hi ${manager.name.split(" ")[0]},`,
                `We had a quick question about our latest invoice before we process it.`,
                `Could you confirm whether the current amount includes the add-on seats we discussed last month?`,
                `Once we have that clarification, we should be able to move ahead on our side.`,
                `Thanks,`,
                `${customer.name}`,
            ];
        },
        opened: () => true,
        replied: () => false,
        starred: () => false,
        attachments: () => buildAttachments(["invoice.pdf"]),
    },
    {
        key: "support-request",
        folder: "received",
        category: "Support",
        dayOffset: 4,
        hour: 9,
        minute: 18,
        from: (customer) => ({ name: customer.name, email: customer.email }),
        to: (customer) => {
            const agent = getSupportAgent(customer);
            return { name: agent.name, email: agent.email };
        },
        subject: (customer) => `${customer.company} needs help with setup`,
        preview: () =>
            `A few members of our team are unsure how to configure the workflow, so we’d appreciate a quick walkthrough.`,
        body: (customer) => {
            const agent = getSupportAgent(customer);

            return [
                `Hi ${agent.name.split(" ")[0]},`,
                `A few people on our team are unsure how to configure the workflow correctly.`,
                `Would it be possible to send over a quick setup guide or point us to the best help article for getting started?`,
                `If there’s a recommended template we should use first, that would also be helpful.`,
                `Thanks,`,
                `${customer.name}`,
            ];
        },
        opened: () => true,
        replied: (customer) => customer.status === "Active",
        starred: (customer) => customer.status === "At Risk",
        attachments: () => buildAttachments(["setup-screenshot.png"]),
    },
    {
        key: "product-update",
        folder: "sent",
        category: "Product",
        dayOffset: 5,
        hour: 14,
        minute: 50,
        from: (customer) => {
            const manager = getCustomerManager(customer);
            return { name: manager.name, email: manager.email };
        },
        to: (customer) => ({ name: customer.name, email: customer.email }),
        subject: () => "New product update now available",
        preview: () =>
            `We’ve shipped a few improvements this week that should help with reporting, segmentation and follow-up workflows.`,
        body: (customer) => {
            const manager = getCustomerManager(customer);

            return [
                `Hi ${customer.name.split(" ")[0]},`,
                `We’ve shipped a few product improvements this week that should make it easier for your team to manage email performance.`,
                `The update includes better reporting visibility, clearer segmentation controls and improvements to workflow follow-ups.`,
                `If you’d like, I can also share a short summary of which changes are most relevant for ${customer.company}.`,
                `Best,`,
                `${manager.name}`,
            ];
        },
        opened: (customer) => parsePercentage(customer.openRate) >= 35,
        replied: () => false,
        starred: () => false,
    },
    {
        key: "renewal-checkin",
        folder: "scheduled",
        category: "Renewal",
        dayOffset: -2,
        hour: 8,
        minute: 30,
        from: (customer) => {
            const manager = getCustomerManager(customer);
            return { name: manager.name, email: manager.email };
        },
        to: (customer) => ({ name: customer.name, email: customer.email }),
        subject: (customer) => `${customer.company} renewal check-in`,
        preview: () =>
            `A scheduled renewal message prepared to review recent outcomes, usage and next steps.`,
        body: (customer) => {
            const manager = getCustomerManager(customer);

            return [
                `Hi ${customer.name.split(" ")[0]},`,
                `I wanted to check in ahead of your renewal and share a short summary of recent progress.`,
                `We can also review performance, answer any open questions and make sure the next phase of your plan is aligned with your team’s goals.`,
                `Let me know if you’d like me to tailor this review for your account before the email goes out.`,
                `Best,`,
                `${manager.name}`,
            ];
        },
        opened: () => false,
        replied: () => false,
        starred: (customer) => customer.status !== "Active",
    },
    {
        key: "upsell-interest",
        folder: "received",
        category: "Expansion",
        dayOffset: 1,
        hour: 16,
        minute: 40,
        from: (customer) => ({ name: customer.name, email: customer.email }),
        to: (customer) => {
            const manager = getCustomerManager(customer);
            return { name: manager.name, email: manager.email };
        },
        subject: (customer) => `Question about expanding ${customer.company}'s plan`,
        preview: () =>
            `We’re interested in understanding what additional value we’d get from moving to a higher plan.`,
        body: (customer) => {
            const manager = getCustomerManager(customer);

            return [
                `Hi ${manager.name.split(" ")[0]},`,
                `We’re interested in understanding what additional value we’d get from moving to a higher plan.`,
                `Could you share which reporting, automation or collaboration features would make the biggest difference for a team like ours?`,
                `If there’s a recommended upgrade path, I’d be happy to review it.`,
                `Thanks,`,
                `${customer.name}`,
            ];
        },
        opened: () => true,
        replied: (customer) => customer.status === "Active",
        starred: (customer) => customer.status === "Active",
    },
    {
        key: "reengagement-nudge",
        folder: "sent",
        category: "Check-in",
        dayOffset: 7,
        hour: 12,
        minute: 15,
        from: (customer) => {
            const manager = getCustomerManager(customer);
            return { name: manager.name, email: manager.email };
        },
        to: (customer) => ({ name: customer.name, email: customer.email }),
        subject: () => "Quick check-in from our side",
        preview: () =>
            `We noticed activity has slowed a little, so I wanted to reach out and see how your team is getting on.`,
        body: (customer) => {
            const manager = getCustomerManager(customer);

            return [
                `Hi ${customer.name.split(" ")[0]},`,
                `I noticed activity has slowed a little recently, so I wanted to check in and see how things are going on your side.`,
                `If helpful, I can suggest a few quick wins to help your team get more value from the product this week.`,
                `Let me know if you’d like me to put that together.`,
                `Best,`,
                `${manager.name}`,
            ];
        },
        opened: (customer) => customer.status !== "Unengaged",
        replied: falseCondition,
        starred: (customer) => customer.status === "At Risk",
    },
    {
        key: "monthly-summary",
        folder: "sent",
        category: "Product",
        dayOffset: 10,
        hour: 8,
        minute: 45,
        from: (customer) => {
            const manager = getCustomerManager(customer);
            return { name: manager.name, email: manager.email };
        },
        to: (customer) => ({ name: customer.name, email: customer.email }),
        subject: (customer) => `${customer.company} monthly performance summary`,
        preview: (customer) =>
            `Your latest summary includes ${customer.emailsSent} emails sent, ${customer.openRate} open rate and an engagement score of ${customer.engagementScore}.`,
        body: (customer) => {
            const manager = getCustomerManager(customer);

            return [
                `Hi ${customer.name.split(" ")[0]},`,
                `Here’s your latest monthly summary for ${customer.company}.`,
                `This period, your team sent ${customer.emailsSent} emails, with an open rate of ${customer.openRate}, a click rate of ${customer.clickRate}, and an engagement score of ${customer.engagementScore}.`,
                `If you’d like, I can also share a few suggestions on where we can improve performance next month.`,
                `Best,`,
                `${manager.name}`,
            ];
        },
        opened: () => true,
        replied: () => false,
        starred: () => false,
        attachments: () => buildAttachments(["monthly-summary.pdf"]),
    },
];

function falseCondition() {
    return false;
}

function shouldIncludeTemplate(customer: Customer, templateKey: string) {
    if (templateKey === "upsell-interest") {
        return customer.status === "Active" || customer.mrr >= 700;
    }

    if (templateKey === "reengagement-nudge") {
        return customer.status !== "Active" || customer.engagementScore < 75;
    }

    return true;
}

function buildEmailFromTemplate(
    customer: Customer,
    template: EmailTemplate,
    index: number,
): CustomerEmail {
    const from = template.from(customer);
    const to = template.to(customer);
    const timestamp = formatInboxTimestamp(
        template.dayOffset,
        template.hour,
        template.minute,
    );

    return {
        id: `${customer.id}-${template.key}`,
        customerId: customer.id,
        folder: template.folder,
        category: template.category,
        from: from.name,
        fromEmail: from.email,
        to: to.name,
        toEmail: to.email,
        subject: template.subject(customer),
        preview: template.preview(customer),
        body: template.body(customer),
        sentAt: timestamp.label,
        sentAtIso: timestamp.iso,
        opened: template.opened(customer),
        replied: template.replied(customer),
        starred: template.starred ? template.starred(customer, index) : false,
        archived: template.archived ? template.archived(customer) : false,
        deleted: template.deleted ? template.deleted(customer) : false,
        attachments: template.attachments ? template.attachments(customer) : [],
    };
}

export const customerEmails: CustomerEmail[] = customers
    .flatMap((customer, index) =>
        emailTemplates
            .filter((template) => shouldIncludeTemplate(customer, template.key))
            .map((template) => buildEmailFromTemplate(customer, template, index)),
    )
    .sort(
        (a, b) =>
            new Date(b.sentAtIso).getTime() - new Date(a.sentAtIso).getTime(),
    );

export function getCustomerEmails(customerId: string) {
    return customerEmails.filter((email) => email.customerId === customerId);
}

export function getCustomerEmailsByFolder(
    customerId: string,
    folder: EmailFolder,
) {
    return customerEmails.filter(
        (email) => email.customerId === customerId && email.folder === folder,
    );
}

export function getReceivedEmails(customerId: string) {
    return getCustomerEmailsByFolder(customerId, "received");
}

export function getSentEmails(customerId: string) {
    return getCustomerEmailsByFolder(customerId, "sent");
}

export function getScheduledEmails(customerId: string) {
    return getCustomerEmailsByFolder(customerId, "scheduled");
}

export function getStarredEmails(customerId: string) {
    return getCustomerEmails(customerId).filter((email) => email.starred);
}

export function getInboxCounts(customerId: string) {
    const emails = getCustomerEmails(customerId);

    return {
        all: emails.length,
        received: emails.filter((email) => email.folder === "received").length,
        sent: emails.filter((email) => email.folder === "sent").length,
        scheduled: emails.filter((email) => email.folder === "scheduled").length,
        starred: emails.filter((email) => email.starred).length,
        replied: emails.filter((email) => email.replied).length,
        opened: emails.filter((email) => email.opened).length,
    };
}