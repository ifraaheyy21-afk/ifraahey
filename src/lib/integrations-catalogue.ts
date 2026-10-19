/**
 * Every tool shown on the Integrations page, grouped by category.
 *
 * Only entries with a `provider` exist in the database (the
 * IntegrationProvider enum), and only entries with a `connect` route actually
 * connect. The page shows "Connect" on every tool; for the rest it says the
 * tool is on its way.
 */

export type IntegrationCategory =
    | "crm"
    | "email"
    | "communication"
    | "support"
    | "payments"
    | "analytics"
    | "calendar"
    | "automation";

export type IntegrationEntry = {
    /** Stable id; equals the IntegrationProvider value when `provider` is set. */
    id: string;
    name: string;
    description: string;
    category: IntegrationCategory;
    domain: string;
    /** Brand logo; falls back to the domain's favicon when it fails to load. */
    logo: string;
    /** Set when the workspace can store a connection for this tool. */
    provider?: string;
    /** Where "Connect" goes: an OAuth start route or a setup page. */
    connect?: string;
    /** Settings page for a connected tool. */
    manage?: string;
};

export const CATEGORIES: { id: IntegrationCategory; label: string; blurb: string }[] = [
    { id: "crm", label: "CRM", blurb: "Bring in accounts, contacts, deals and pipeline activity" },
    { id: "email", label: "Email", blurb: "Send personalised emails through your own provider" },
    { id: "communication", label: "Communication", blurb: "Reach customers and your team where they already talk" },
    { id: "support", label: "Support", blurb: "Use conversations and tickets as signals for follow-ups" },
    { id: "payments", label: "Payments", blurb: "Sync customers, subscriptions, payments and revenue" },
    { id: "analytics", label: "Analytics", blurb: "Trigger emails from what customers actually do in your product" },
    { id: "calendar", label: "Calendar", blurb: "Personalise follow-ups around meetings and bookings" },
    { id: "automation", label: "Automation", blurb: "Connect Mailgine to the rest of your workflow" },
];

const icon = (slug: string, colour?: string) =>
    `https://cdn.simpleicons.org/${slug}${colour ? `/${colour}` : ""}`;

export const favicon = (domain: string) =>
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

export const INTEGRATIONS: IntegrationEntry[] = [
    // CRM
    { id: "salesforce", provider: "salesforce", connect: "/api/integrations/salesforce/connect", name: "Salesforce", category: "crm", domain: "salesforce.com", logo: favicon("salesforce.com"), description: "Sync accounts, leads and customer relationship data." },
    { id: "hubspot", provider: "hubspot", name: "HubSpot", category: "crm", domain: "hubspot.com", logo: icon("hubspot"), description: "Import contacts, companies, lifecycle stages and deals." },
    { id: "pipedrive", provider: "pipedrive", connect: "/api/integrations/pipedrive/connect", name: "Pipedrive", category: "crm", domain: "pipedrive.com", logo: favicon("pipedrive.com"), description: "Connect deals, contacts and pipeline activity." },

    // Email
    { id: "resend", provider: "resend", connect: "/dashboard/integrations/resend", manage: "/dashboard/integrations/resend", name: "Resend", category: "email", domain: "resend.com", logo: icon("resend", "000000"), description: "Send transactional and lifecycle emails from your own Resend account." },
    { id: "sendgrid", provider: "sendgrid", name: "SendGrid", category: "email", domain: "sendgrid.com", logo: favicon("sendgrid.com"), description: "Sync delivery, engagement and campaign activity." },
    { id: "mailgun", provider: "mailgun", name: "Mailgun", category: "email", domain: "mailgun.com", logo: icon("mailgun"), description: "Track delivery, opens, clicks and outbound activity." },
    { id: "mailchimp", name: "Mailchimp", category: "email", domain: "mailchimp.com", logo: icon("mailchimp"), description: "Import audiences and campaign engagement." },

    // Communication
    { id: "gmail", name: "Gmail", category: "communication", domain: "gmail.com", logo: icon("gmail", "EA4335"), description: "Read and reply to Gmail threads from the inbox." },
    { id: "outlook", name: "Outlook", category: "communication", domain: "outlook.com", logo: favicon("outlook.com"), description: "Read and reply to Outlook and Microsoft 365 mail." },
    { id: "whatsapp", name: "WhatsApp", category: "communication", domain: "whatsapp.com", logo: icon("whatsapp", "25D366"), description: "Answer WhatsApp Business messages alongside email." },
    { id: "slack", provider: "slack", connect: "/api/integrations/slack/connect", name: "Slack", category: "communication", domain: "slack.com", logo: favicon("slack.com"), description: "Send alerts, summaries and customer updates to your team." },
    { id: "microsoft_teams", name: "Microsoft Teams", category: "communication", domain: "teams.microsoft.com", logo: favicon("teams.microsoft.com"), description: "Post customer alerts and summaries to Teams channels." },

    // Support
    { id: "intercom", provider: "intercom", connect: "/api/integrations/intercom/connect", name: "Intercom", category: "support", domain: "intercom.com", logo: icon("intercom"), description: "Sync conversations, support activity and customer signals." },
    { id: "zendesk", name: "Zendesk", category: "support", domain: "zendesk.com", logo: icon("zendesk"), description: "Use tickets and satisfaction scores as email signals." },

    // Payments
    { id: "stripe", provider: "stripe", name: "Stripe", category: "payments", domain: "stripe.com", logo: icon("stripe"), description: "Sync customers, subscriptions, payments and revenue." },
    { id: "shopify", name: "Shopify", category: "payments", domain: "shopify.com", logo: icon("shopify"), description: "Sync stores, orders and customer purchases." },

    // Analytics
    { id: "posthog", provider: "posthog", name: "PostHog", category: "analytics", domain: "posthog.com", logo: icon("posthog"), description: "Use product behaviour and usage events for smarter emails." },
    { id: "google_analytics", name: "Google Analytics", category: "analytics", domain: "analytics.google.com", logo: icon("googleanalytics"), description: "Bring in traffic and conversion data." },

    // Calendar
    { id: "google_calendar", provider: "google_calendar", connect: "/api/integrations/google-calendar/connect", name: "Google Calendar", category: "calendar", domain: "calendar.google.com", logo: icon("googlecalendar"), description: "Sync meetings and events to personalise follow-up emails." },
    { id: "calendly", name: "Calendly", category: "calendar", domain: "calendly.com", logo: icon("calendly"), description: "Follow up automatically after booked or missed meetings." },
    { id: "zoom", name: "Zoom", category: "calendar", domain: "zoom.us", logo: icon("zoom"), description: "Send recaps and follow-ups after Zoom meetings." },

    // Automation
    { id: "zapier", provider: "zapier", name: "Zapier", category: "automation", domain: "zapier.com", logo: icon("zapier"), description: "Connect Mailgine with thousands of other workflow tools." },
    { id: "make", name: "Make", category: "automation", domain: "make.com", logo: icon("make"), description: "Build visual scenarios that send and react to emails." },
];
