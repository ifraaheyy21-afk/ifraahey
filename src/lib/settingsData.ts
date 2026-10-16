import { CreditCard, HelpCircle, Plug, User } from "lucide-react";

export const settingsTabs = [
    {
        id: "personal",
        label: "Personal details",
        icon: User,
    },
    {
        id: "plan",
        label: "Manage plan",
        icon: CreditCard,
    },
    {
        id: "integrations",
        label: "Manage integrations",
        icon: Plug,
    },
    {
        id: "support",
        label: "Contact support",
        icon: HelpCircle,
    },
] as const;

export type SettingsTabId = (typeof settingsTabs)[number]["id"];

export const personalDetails = {
    name: "Ifrah Haji",
    email: "ifraahharun@gmail.com",
    workspace: "Cobrai",
};

export const planDetails = {
    plan: "Starter",
    price: "£149/month",
    status: "Active",
};

export const integrations = [
    {
        name: "Stripe",
        description: "Billing and customer revenue data",
        connected: true,
    },
    {
        name: "HubSpot",
        description: "CRM and customer activity data",
        connected: false,
    },
    {
        name: "Gmail",
        description: "Send and manage retention emails",
        connected: true,
    },
];

export const supportDetails = {
    email: "support@cobrai.ai",
    responseTime: "Usually replies within 24 hours",
};