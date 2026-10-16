export type DemoIntegration = {
    id: string;
    name: string;
    description: string;
    connected: boolean;
    iconUrl: string;
};

/**
 * Marketing/demo data only.
 * The workflow builder does not contain provider-specific rendering logic.
 * It simply consumes integration records and step-to-tool defaults from here.
 */
export const DEMO_INTEGRATIONS: DemoIntegration[] = [
    {
        id: "gmail",
        name: "Gmail",
        description: "Send and receive email through Gmail.",
        connected: true,
        iconUrl: "https://cdn.simpleicons.org/gmail",
    },
    {
        id: "slack",
        name: "Slack",
        description: "Send messages and notifications to Slack.",
        connected: true,
        iconUrl: "https://cdn.simpleicons.org/slack",
    },
    {
        id: "salesforce",
        name: "Salesforce",
        description: "Read and update CRM records in Salesforce.",
        connected: true,
        iconUrl: "https://cdn.simpleicons.org/salesforce",
    },
    {
        id: "hubspot",
        name: "HubSpot",
        description: "Use HubSpot contacts, companies and CRM activity.",
        connected: true,
        iconUrl: "https://cdn.simpleicons.org/hubspot",
    },
    {
        id: "stripe",
        name: "Stripe",
        description: "Use customer, subscription and payment events from Stripe.",
        connected: true,
        iconUrl: "https://cdn.simpleicons.org/stripe",
    },
    {
        id: "google-calendar",
        name: "Google Calendar",
        description: "Create and manage Google Calendar events.",
        connected: true,
        iconUrl: "https://cdn.simpleicons.org/googlecalendar",
    },
];

/**
 * Demo defaults are data, not rendering logic.
 * They only apply when the user is in demo-workspace and the AI has not
 * explicitly chosen a tool for that step.
 */
export const DEMO_STEP_TOOL_DEFAULTS: Record<string, string> = {
    "trigger-contact-added": "hubspot",
    "trigger-email-received": "gmail",
    "trigger-reply-received": "gmail",
    "trigger-payment-failed": "stripe",
    "email": "gmail",
};
