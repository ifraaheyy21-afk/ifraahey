export type PopularWorkflowPromptTool = {
    provider: string;
    aliases: readonly string[];
    logoUrl?: string;
};

export type PopularWorkflowPrompt = {
    id: string;
    prompt: string;
    tools: readonly PopularWorkflowPromptTool[];
};

/**
 * Curated starter prompts shown on the workflow builder landing state.
 *
 * These are definitions only. Clicking a prompt sends its natural-language
 * instruction through the existing AI workflow builder. No workflow nodes,
 * connections, integration state, or user data are faked here.
 */
export const POPULAR_WORKFLOW_PROMPTS: readonly PopularWorkflowPrompt[] = [
    {
        id: "inactive-customer-follow-up",
        prompt:
            "When a customer has been inactive for 14 days, send them an email and notify the account owner in Slack.",
        tools: [
            {
                provider: "gmail",
                aliases: ["gmail", "googlemail"],
                logoUrl: "https://cdn.simpleicons.org/gmail/EA4335",
            },
            {
                provider: "slack",
                aliases: ["slack"],
                logoUrl: "https://cdn.simpleicons.org/slack/4A154B",
            },
        ],
    },
    {
        id: "failed-payment-recovery",
        prompt:
            "When a Stripe payment fails, send the customer a payment reminder email.",
        tools: [
            {
                provider: "stripe",
                aliases: ["stripe"],
                logoUrl: "https://cdn.simpleicons.org/stripe/635BFF",
            },
            {
                provider: "gmail",
                aliases: ["gmail", "googlemail"],
                logoUrl: "https://cdn.simpleicons.org/gmail/EA4335",
            },
        ],
    },
    {
        id: "new-lead-follow-up",
        prompt:
            "When a new lead is added in HubSpot, send them a personalised welcome email.",
        tools: [
            {
                provider: "hubspot",
                aliases: ["hubspot"],
                logoUrl: "https://cdn.simpleicons.org/hubspot/FF7A59",
            },
            {
                provider: "gmail",
                aliases: ["gmail", "googlemail"],
                logoUrl: "https://cdn.simpleicons.org/gmail/EA4335",
            },
        ],
    },
] as const;
