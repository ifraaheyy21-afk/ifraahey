export type EmailOption = {
    id: string;
    name: string;
    goal: string;
    subject: string;
    preview: string;
    effectiveness: number;
    sent: number;
    replies: number;
    clicks: number;
    tone: string;
};

export const emailOptions: EmailOption[] = [
    {
        id: "retention",
        name: "Retention Email",
        goal: "Win back at-risk customers",
        subject: "Can we help before you leave?",
        preview:
            "We noticed your team has been less active recently. Is there anything we can help with?",
        effectiveness: 84,
        sent: 420,
        replies: 68,
        clicks: 112,
        tone: "Helpful",
    },
    {
        id: "follow-up",
        name: "Follow-up Email",
        goal: "Get replies from silent leads",
        subject: "Just checking in",
        preview:
            "Wanted to follow up and see if this is still something worth exploring.",
        effectiveness: 76,
        sent: 310,
        replies: 44,
        clicks: 71,
        tone: "Friendly",
    },
    {
        id: "upgrade",
        name: "Upgrade Email",
        goal: "Move users to a higher plan",
        subject: "You’re close to needing more capacity",
        preview:
            "Your account is growing. Here’s why upgrading could help your team move faster.",
        effectiveness: 69,
        sent: 260,
        replies: 29,
        clicks: 96,
        tone: "Strategic",
    },
    {
        id: "reengagement",
        name: "Re-engagement Email",
        goal: "Bring inactive users back",
        subject: "Still want to get value from Cobrai?",
        preview:
            "Here are 3 quick ways to get more value from your retention dashboard this week.",
        effectiveness: 72,
        sent: 390,
        replies: 51,
        clicks: 104,
        tone: "Warm",
    },
];

export const builderBlocks = [
    "Personalised intro",
    "Customer behaviour insight",
    "Value reminder",
    "Clear CTA",
];