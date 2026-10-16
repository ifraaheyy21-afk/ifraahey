export type IntegrationItem = {
    name: string;
    domain: string;
    category: string;
    status: "Available" | "Coming soon";
    description: string;
};
export const integrations: IntegrationItem[] = [
    { name: "Salesforce", domain: "salesforce.com", category: "CRM", status: "Available", description: "Sync accounts, leads and customer relationship data." },
    { name: "HubSpot", domain: "hubspot.com", category: "CRM", status: "Available", description: "Import contacts, companies, lifecycle stages and deals." },
    { name: "Stripe", domain: "stripe.com", category: "Payments", status: "Available", description: "Sync customers, subscriptions, payments and revenue data." },
    { name: "Pipedrive", domain: "pipedrive.com", category: "CRM", status: "Available", description: "Connect deals, contacts and pipeline activity." },
    { name: "Intercom", domain: "intercom.com", category: "Support", status: "Available", description: "Sync conversations, support activity and customer signals." },
    { name: "Slack", domain: "slack.com", category: "Workspace", status: "Available", description: "Send alerts, summaries and customer updates to your team." },
    { name: "Google Calendar", domain: "calendar.google.com", category: "Calendar", status: "Available", description: "Sync meetings, events and scheduling activity so Mailgine can personalise follow-up emails." },
    { name: "Resend", domain: "resend.com", category: "Email delivery", status: "Available", description: "Send personalised transactional and lifecycle emails through your own Resend account." },
    { name: "SendGrid", domain: "sendgrid.com", category: "Email", status: "Available", description: "Sync email delivery, engagement and campaign activity." },
    { name: "Mailgun", domain: "mailgun.com", category: "Email", status: "Available", description: "Track delivery, opens, clicks and outbound email activity." },
    { name: "PostHog", domain: "posthog.com", category: "Product analytics", status: "Available", description: "Use product behaviour and usage events for smarter emails." },
    { name: "Zapier", domain: "zapier.com", category: "Automation", status: "Available", description: "Connect Mailgine with thousands of other workflow tools." },
];
