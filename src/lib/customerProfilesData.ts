export type CustomerProfile = {
    customerId: string;
    plan: string;
    renewalDate: string;
    healthSummary: string;
    recommendedAction: string;
};

export const customerProfiles: CustomerProfile[] = [
    {
        customerId: "#56578",
        plan: "Growth",
        renewalDate: "2026-07-18",
        healthSummary: "Strong engagement with recent onboarding activity.",
        recommendedAction: "Send a product adoption email with one clear next step.",
    },
    {
        customerId: "#56579",
        plan: "Pro",
        renewalDate: "2026-07-24",
        healthSummary: "Healthy account with recent product update interest.",
        recommendedAction: "Send a feature education email based on the clicked update.",
    },
    {
        customerId: "#56580",
        plan: "Starter",
        renewalDate: "2026-07-09",
        healthSummary: "Low engagement and no recent email opens.",
        recommendedAction: "Send a soft re-engagement email with a simple value reminder.",
    },
    {
        customerId: "#56581",
        plan: "Starter",
        renewalDate: "2026-07-05",
        healthSummary: "Very low activity and no recent engagement.",
        recommendedAction: "Send a win-back email or flag for manual follow-up.",
    },
    {
        customerId: "#56582",
        plan: "Growth",
        renewalDate: "2026-08-01",
        healthSummary: "Some engagement remains, but activity is weakening.",
        recommendedAction: "Send a helpful check-in email focused on quick customer value.",
    },
    {
        customerId: "#56583",
        plan: "Enterprise",
        renewalDate: "2026-08-14",
        healthSummary: "High-value account showing strong upgrade intent.",
        recommendedAction: "Send a personalised upgrade email with a clear benefit-led CTA.",
    },
    {
        customerId: "#56584",
        plan: "Growth",
        renewalDate: "2026-08-06",
        healthSummary: "Responsive account with recent reply activity.",
        recommendedAction: "Continue the conversation with a personal reply or useful resource.",
    },
    {
        customerId: "#56585",
        plan: "Pro",
        renewalDate: "2026-08-11",
        healthSummary: "Healthy account with recent newsletter engagement.",
        recommendedAction: "Send a targeted nurture email based on the latest newsletter topic.",
    },
    {
        customerId: "#56586",
        plan: "Starter",
        renewalDate: "2026-07-28",
        healthSummary: "Low engagement with no clicks in recent weeks.",
        recommendedAction: "Send a short reactivation email with one low-friction CTA.",
    },
];

export function getCustomerProfileById(customerId: string) {
    return customerProfiles.find((profile) => profile.customerId === customerId);
}