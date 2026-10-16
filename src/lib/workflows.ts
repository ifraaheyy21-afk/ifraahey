"use client";
import { getAutomationActionCapability } from "./automation/action-capabilities";
import type { WorkflowNodeConfig } from "./automation/types";
export type WorkflowStatus = "draft" | "active" | "paused";
export type NodeType = "trigger" | "email" | "delay" | "condition" | "action";
export type NodeStatus = "ready" | "warning";
export type DelayUnit = "minutes" | "hours" | "days";
export type NodePosition = {
    x: number;
    y: number;
};
export type WorkflowConnection = {
    id: string;
    from: string;
    to: string;
    label?: string;
};
export type NodeConfig = WorkflowNodeConfig;
export type WorkflowNode = {
    id: string;
    type: NodeType;
    label: string;
    title: string;
    description: string;
    status: NodeStatus;
    warningText?: string;
    config: NodeConfig;
    position: NodePosition;
};
export type WorkflowMetrics = {
    enrolled: number;
    completed: number;
    successRate: number;
    revenueRecoveredMinor?: number;
    customersRecovered?: number;
};
export type Workflow = {
    version?: number;
    id: string;
    name: string;
    description: string;
    status: WorkflowStatus;
    nodes: WorkflowNode[];
    connections: WorkflowConnection[];
    metrics: WorkflowMetrics;
    createdAt: string;
    updatedAt: string;
    lastRunAt?: string;
};
export type NodeDefinition = {
    id: string;
    type: NodeType;
    title: string;
    description: string;
    defaults?: Partial<Pick<WorkflowNode, "title" | "description">> & {
        config?: NodeConfig;
    };
};
export const WORKFLOW_STORAGE_KEY = "cobri-workflows-demo-v1";
export const NODE_LIBRARY: NodeDefinition[] = [
    // TRIGGERS
    {
        id: "trigger-contact-added",
        type: "trigger",
        title: "New contact added",
        description: "Start when a new contact is added.",
        defaults: {
            title: "New contact added",
            config: { condition: "New contact added" },
        },
    },
    {
        id: "trigger-email-received",
        type: "trigger",
        title: "Email received",
        description: "Start when a new email is received.",
        defaults: {
            title: "Email received",
            config: { condition: "Email received" },
        },
    },
    {
        id: "trigger-reply-received",
        type: "trigger",
        title: "Reply received",
        description: "Start when a customer replies.",
        defaults: {
            title: "Reply received",
            config: { condition: "Reply received" },
        },
    },
    {
        id: "trigger-payment-failed",
        type: "trigger",
        title: "Payment failed",
        description: "Start when a subscription payment fails.",
        defaults: {
            title: "Payment failed",
            config: { condition: "Payment failed" },
        },
    },
    // FLOW & LOGIC
    {
        id: "delay",
        type: "delay",
        title: "Wait",
        description: "Pause the workflow for a fixed amount of time.",
        defaults: {
            title: "Wait 1 day",
            config: {
                delayValue: 1,
                delayUnit: "days",
            },
        },
    },
    {
        id: "condition",
        type: "condition",
        title: "Condition",
        description: "Branch the workflow based on customer behaviour.",
        defaults: {
            title: "Condition",
            config: { condition: "Email was opened" },
        },
    },
    // ACTIONS
    {
        id: "email-send",
        type: "email",
        title: "Send email",
        description: "Send a personalised email to the enrolled contact.",
        defaults: {
            title: "Send email",
            config: {
                sendingAccount: "primary",
                subject: "",
                body:
                    "Hi {{first_name}},\n\nWrite your email here.\n\nBest,\n{{sender_name}}",
            },
        },
    },
    {
        id: "action-add-tag",
        type: "action",
        title: "Add contact tag",
        description: "Add a tag to the enrolled customer.",
        defaults: {
            title: "Add contact tag",
            config: {
                actionType: "Add contact tag",
                actionValue: "",
            },
        },
    },
    {
        id: "action-notify-team",
        type: "action",
        title: "Notify team member",
        description: "Notify the account owner or another team member.",
        defaults: {
            title: "Notify account owner",
            config: {
                actionType: "Notify team member",
                actionValue: "Account owner",
            },
        },
    },
    {
        id: "action-stop",
        type: "action",
        title: "End workflow",
        description: "Stop the workflow for this customer.",
        defaults: {
            title: "End workflow",
            config: { actionType: "Stop sequence" },
        },
    },
];
function nowIso() {
    return new Date().toISOString();
}
function daysAgo(days: number) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
}
function node(
    id: string,
    type: NodeType,
    title: string,
    description: string,
    position: NodePosition,
    config: NodeConfig = {},
): WorkflowNode {
    return {
        id,
        type,
        label:
            type === "email"
                ? "Send email"
                : type === "delay"
                    ? "Wait"
                    : type === "condition"
                        ? "Condition"
                        : type === "trigger"
                            ? "Trigger"
                            : "Action",
        title,
        description,
        status: "ready",
        config,
        position,
    };
}
function edge(
    id: string,
    from: string,
    to: string,
    label?: string,
): WorkflowConnection {
    return { id, from, to, label };
}
export function createNode(
    type: NodeType,
    index = 0,
    presetId?: string,
): WorkflowNode {
    const definition =
        (presetId
            ? NODE_LIBRARY.find((item) => item.id === presetId)
            : NODE_LIBRARY.find((item) => item.type === type)) ??
        NODE_LIBRARY.find((item) => item.type === type);
    const column = index % 3;
    const row = Math.floor(index / 3);
    const base: WorkflowNode = {
        id: `${type}-${crypto.randomUUID()}`,
        type,
        label:
            type === "email"
                ? "Send email"
                : type === "delay"
                    ? "Wait"
                    : type === "condition"
                        ? "Condition"
                        : type === "trigger"
                            ? "Trigger"
                            : "Action",
        title: definition?.defaults?.title ?? definition?.title ?? "Step",
        description:
            definition?.defaults?.description ??
            definition?.description ??
            "",
        status: "ready",
        config: {
            ...(definition?.defaults?.config ?? {}),
        },
        position: {
            x: 180 + column * 320,
            y: 100 + row * 160,
        },
    };
    // Backwards-compatible defaults for code paths that create by NodeType only.
    if (!presetId) {
        if (type === "trigger") {
            return {
                ...base,
                title: "New contact added",
                config: { condition: "New contact added" },
            };
        }
        if (type === "email") {
            return {
                ...base,
                title: "Send email",
                config: {
                    sendingAccount: "primary",
                    subject: "",
                    body:
                        "Hi {{first_name}},\n\nWrite your email here.\n\nBest,\n{{sender_name}}",
                },
            };
        }
        if (type === "delay") {
            return {
                ...base,
                title: "Wait 1 day",
                config: {
                    delayValue: 1,
                    delayUnit: "days",
                },
            };
        }
        if (type === "condition") {
            return {
                ...base,
                title: "Condition",
                config: {
                    condition: "Email was opened",
                },
            };
        }
        return {
            ...base,
            title: "Action",
            config: {
                actionType: "Stop sequence",
            },
        };
    }
    return base;
}
export function createBlankWorkflow(
    name = "Untitled workflow",
): Workflow {
    const createdAt = nowIso();
    const trigger = createNode("trigger", 0);
    return {
        id: crypto.randomUUID(),
        name,
        description: "Build a customer automation workflow.",
        status: "draft",
        nodes: [trigger],
        connections: [],
        metrics: {
            enrolled: 0,
            completed: 0,
            successRate: 0,
        },
        createdAt,
        updatedAt: createdAt,
    };
}
function onboardingWorkflow(): Workflow {
    return {
        id: "customer-onboarding",
        name: "Customer onboarding",
        description:
            "Guide new customers from signup to activation and help anyone who gets stuck.",
        status: "active",
        metrics: {
            enrolled: 428,
            completed: 334,
            successRate: 78,
            customersRecovered: 61,
        },
        createdAt: daysAgo(32),
        updatedAt: daysAgo(1),
        lastRunAt: daysAgo(0),
        nodes: [
            node(
                "onboarding-trigger",
                "trigger",
                "New contact added",
                "Starts when a new customer is added to the workspace.",
                { x: 650, y: 70 },
                { condition: "New contact added" },
            ),
            node(
                "onboarding-welcome",
                "email",
                "Welcome email",
                "Welcome the customer and guide them to the first setup action.",
                { x: 650, y: 220 },
                {
                    sendingAccount: "primary",
                    subject: "Welcome to {{company_name}}, {{first_name}}",
                    body:
                        "Hi {{first_name}},\n\nWelcome to {{company_name}}.\n\nYour workspace is ready. The best place to start is by completing your account setup so you can begin getting value from the platform.\n\nIt should only take a few minutes.\n\nBest,\n{{sender_name}}",
                },
            ),
            node(
                "onboarding-wait-1",
                "delay",
                "Wait 1 day",
                "Give the customer time to complete their first setup steps.",
                { x: 650, y: 370 },
                { delayValue: 1, delayUnit: "days" },
            ),
            node(
                "onboarding-setup-email",
                "email",
                "Getting started",
                "Prompt the customer to complete the most important activation step.",
                { x: 650, y: 520 },
                {
                    sendingAccount: "primary",
                    subject: "Let's get your account set up",
                    body:
                        "Hi {{first_name}},\n\nYou're one step away from getting the most out of {{company_name}}.\n\nComplete your setup today so everything is ready for you and your team.\n\nBest,\n{{sender_name}}",
                },
            ),
            node(
                "onboarding-wait-2",
                "delay",
                "Wait 2 days",
                "Wait before checking whether setup has been completed.",
                { x: 650, y: 670 },
                { delayValue: 2, delayUnit: "days" },
            ),
            node(
                "onboarding-setup-condition",
                "condition",
                "Completed account setup?",
                "Branch based on whether the customer finished setup.",
                { x: 650, y: 820 },
                { condition: "Completed account setup" },
            ),
            node(
                "onboarding-reminder",
                "email",
                "Setup reminder",
                "Help customers who still have not completed setup.",
                { x: 330, y: 980 },
                {
                    sendingAccount: "primary",
                    subject: "Need help getting started?",
                    body:
                        "Hi {{first_name}},\n\nIt looks like your setup is not quite finished yet.\n\nIf anything is getting in the way, reply to this email and we'll help you get everything running.\n\nBest,\n{{sender_name}}",
                },
            ),
            node(
                "onboarding-value",
                "email",
                "Value discovery",
                "Show activated customers the highest-value product capabilities.",
                { x: 960, y: 980 },
                {
                    sendingAccount: "primary",
                    subject: "3 ways to get more value from {{company_name}}",
                    body:
                        "Hi {{first_name}},\n\nNow that you're set up, here are three ways to get more value from {{company_name}}:\n\n1. Complete your core workflow\n2. Invite your team\n3. Turn on the features that match your goals\n\nBest,\n{{sender_name}}",
                },
            ),
            node(
                "onboarding-active-condition",
                "condition",
                "Active in the last 3 days?",
                "Check whether the customer is actively using the product.",
                { x: 650, y: 1140 },
                { condition: "Active in the last 3 days" },
            ),
            node(
                "onboarding-power-user",
                "email",
                "Power-user tips",
                "Give active customers more advanced tips.",
                { x: 360, y: 1300 },
                {
                    sendingAccount: "primary",
                    subject: "You're up and running — here's what's next",
                    body:
                        "Hi {{first_name}},\n\nGreat to see you getting value from {{company_name}}.\n\nYou're ready for the next step. Try the advanced workflows that can save your team even more time.\n\nBest,\n{{sender_name}}",
                },
            ),
            node(
                "onboarding-reengage",
                "email",
                "Re-engagement",
                "Bring inactive customers back before onboarding stalls.",
                { x: 940, y: 1300 },
                {
                    sendingAccount: "primary",
                    subject: "Still working on {{primary_goal}}, {{first_name}}?",
                    body:
                        "Hi {{first_name}},\n\nWe haven't seen you in {{company_name}} recently.\n\nIf something is blocking you, reply and let us know. We're happy to help you get back on track.\n\nBest,\n{{sender_name}}",
                },
            ),
            node(
                "onboarding-complete",
                "action",
                "Mark as onboarded",
                "Mark the customer as successfully onboarded.",
                { x: 650, y: 1470 },
                {
                    actionType: "Add contact tag",
                    actionValue: "Onboarded",
                },
            ),
        ],
        connections: [
            edge("ob-1", "onboarding-trigger", "onboarding-welcome"),
            edge("ob-2", "onboarding-welcome", "onboarding-wait-1"),
            edge("ob-3", "onboarding-wait-1", "onboarding-setup-email"),
            edge("ob-4", "onboarding-setup-email", "onboarding-wait-2"),
            edge("ob-5", "onboarding-wait-2", "onboarding-setup-condition"),
            edge(
                "ob-6",
                "onboarding-setup-condition",
                "onboarding-value",
                "Yes",
            ),
            edge(
                "ob-7",
                "onboarding-setup-condition",
                "onboarding-reminder",
                "No",
            ),
            edge("ob-8", "onboarding-reminder", "onboarding-active-condition"),
            edge("ob-9", "onboarding-value", "onboarding-active-condition"),
            edge(
                "ob-10",
                "onboarding-active-condition",
                "onboarding-power-user",
                "Yes",
            ),
            edge(
                "ob-11",
                "onboarding-active-condition",
                "onboarding-reengage",
                "No",
            ),
            edge("ob-12", "onboarding-power-user", "onboarding-complete"),
            edge("ob-13", "onboarding-reengage", "onboarding-complete"),
        ],
    };
}
function trialConversionWorkflow(): Workflow {
    return {
        id: "trial-conversion",
        name: "Trial conversion",
        description:
            "Engage trial users based on usage and convert high-intent accounts before their trial ends.",
        status: "active",
        metrics: {
            enrolled: 186,
            completed: 63,
            successRate: 34,
            customersRecovered: 27,
        },
        createdAt: daysAgo(28),
        updatedAt: daysAgo(2),
        lastRunAt: daysAgo(0),
        nodes: [
            node(
                "trial-trigger",
                "trigger",
                "Trial started",
                "Starts when a customer begins a free trial.",
                { x: 650, y: 80 },
                { condition: "Trial started" },
            ),
            node(
                "trial-wait-3",
                "delay",
                "Wait 3 days",
                "Give the customer time to explore the product.",
                { x: 650, y: 230 },
                { delayValue: 3, delayUnit: "days" },
            ),
            node(
                "trial-usage",
                "condition",
                "Product usage above 50?",
                "Separate high-intent trial users from low-usage users.",
                { x: 650, y: 380 },
                { condition: "Product usage above 50" },
            ),
            node(
                "trial-advanced",
                "email",
                "Advanced features",
                "Show highly engaged trial users what they can unlock next.",
                { x: 340, y: 550 },
                {
                    sendingAccount: "primary",
                    subject: "You're getting value — here's what to try next",
                    body:
                        "Hi {{first_name}},\n\nYou've already made great progress in {{company_name}}.\n\nHere are the advanced features most teams explore next before upgrading.\n\nBest,\n{{sender_name}}",
                },
            ),
            node(
                "trial-help",
                "email",
                "Getting-started help",
                "Help low-usage trial users reach activation.",
                { x: 960, y: 550 },
                {
                    sendingAccount: "primary",
                    subject: "Need help getting started?",
                    body:
                        "Hi {{first_name}},\n\nWe noticed you haven't had much time to explore {{company_name}} yet.\n\nReply to this email if you'd like help getting set up around your goals.\n\nBest,\n{{sender_name}}",
                },
            ),
            node(
                "trial-wait-5",
                "delay",
                "Wait 5 days",
                "Wait until the trial is close to ending.",
                { x: 650, y: 720 },
                { delayValue: 5, delayUnit: "days" },
            ),
            node(
                "trial-ending",
                "condition",
                "Trial ends within 3 days?",
                "Check whether the account is entering the conversion window.",
                { x: 650, y: 870 },
                { condition: "Trial ends within 3 days" },
            ),
            node(
                "trial-ending-email",
                "email",
                "Trial ending",
                "Create urgency before the trial expires.",
                { x: 650, y: 1030 },
                {
                    sendingAccount: "primary",
                    subject: "Your trial ends in {{days_remaining}} days",
                    body:
                        "Hi {{first_name}},\n\nYour {{company_name}} trial ends in {{days_remaining}} days.\n\nUpgrade now to keep your workspace, workflows, and progress active.\n\nBest,\n{{sender_name}}",
                },
            ),
            node(
                "trial-upgraded",
                "condition",
                "Upgraded?",
                "Check whether the trial account converted.",
                { x: 650, y: 1190 },
                { condition: "Subscription upgraded" },
            ),
            node(
                "trial-converted",
                "action",
                "Mark as converted",
                "Mark the customer as converted from trial.",
                { x: 350, y: 1360 },
                { actionType: "Add contact tag", actionValue: "Trial converted" },
            ),
            node(
                "trial-final-email",
                "email",
                "Final trial reminder",
                "Send a final reminder to customers who have not upgraded.",
                { x: 950, y: 1360 },
                {
                    sendingAccount: "primary",
                    subject: "Your {{company_name}} trial ends tomorrow",
                    body:
                        "Hi {{first_name}},\n\nA quick reminder that your trial ends tomorrow.\n\nIf you'd like to keep everything you've built, upgrade your workspace before the trial expires.\n\nBest,\n{{sender_name}}",
                },
            ),
        ],
        connections: [
            edge("tc-1", "trial-trigger", "trial-wait-3"),
            edge("tc-2", "trial-wait-3", "trial-usage"),
            edge("tc-3", "trial-usage", "trial-advanced", "Yes"),
            edge("tc-4", "trial-usage", "trial-help", "No"),
            edge("tc-5", "trial-advanced", "trial-wait-5"),
            edge("tc-6", "trial-help", "trial-wait-5"),
            edge("tc-7", "trial-wait-5", "trial-ending"),
            edge("tc-8", "trial-ending", "trial-ending-email", "Yes"),
            edge("tc-9", "trial-ending-email", "trial-upgraded"),
            edge("tc-10", "trial-upgraded", "trial-converted", "Yes"),
            edge("tc-11", "trial-upgraded", "trial-final-email", "No"),
        ],
    };
}
function failedPaymentWorkflow(): Workflow {
    return {
        id: "failed-payment-recovery",
        name: "Failed payment recovery",
        description:
            "Recover failed subscription payments before the account becomes delinquent.",
        status: "active",
        metrics: {
            enrolled: 47,
            completed: 32,
            successRate: 68,
            revenueRecoveredMinor: 128400,
            customersRecovered: 32,
        },
        createdAt: daysAgo(21),
        updatedAt: daysAgo(1),
        lastRunAt: daysAgo(0),
        nodes: [
            node(
                "fp-trigger",
                "trigger",
                "Payment failed",
                "Starts whenever a subscription payment fails.",
                { x: 650, y: 80 },
                { condition: "Payment failed" },
            ),
            node(
                "fp-email-1",
                "email",
                "Payment failed email",
                "Tell the customer their payment could not be processed.",
                { x: 650, y: 240 },
                {
                    sendingAccount: "primary",
                    subject: "Action needed: We couldn't process your payment",
                    body:
                        "Hi {{first_name}},\n\nWe couldn't process your latest {{company_name}} payment.\n\nPlease update your payment details to keep your account active.\n\nBest,\n{{sender_name}}",
                },
            ),
            node(
                "fp-wait-2",
                "delay",
                "Wait 2 days",
                "Allow time for the customer to update their payment method.",
                { x: 650, y: 400 },
                { delayValue: 2, delayUnit: "days" },
            ),
            node(
                "fp-recovered-1",
                "condition",
                "Payment recovered?",
                "Check whether the failed payment has been recovered.",
                { x: 650, y: 560 },
                { condition: "Payment recovered" },
            ),
            node(
                "fp-success",
                "action",
                "Mark recovered",
                "Mark the payment recovery as successful.",
                { x: 340, y: 740 },
                { actionType: "Add contact tag", actionValue: "Payment recovered" },
            ),
            node(
                "fp-email-2",
                "email",
                "Second payment reminder",
                "Send a stronger reminder when payment is still outstanding.",
                { x: 960, y: 740 },
                {
                    sendingAccount: "primary",
                    subject: "Your {{company_name}} payment still needs attention",
                    body:
                        "Hi {{first_name}},\n\nYour payment is still outstanding.\n\nPlease update your billing details to avoid interruption to your account.\n\nBest,\n{{sender_name}}",
                },
            ),
            node(
                "fp-wait-3",
                "delay",
                "Wait 3 days",
                "Give the customer a final recovery window.",
                { x: 960, y: 900 },
                { delayValue: 3, delayUnit: "days" },
            ),
            node(
                "fp-recovered-2",
                "condition",
                "Recovered after reminder?",
                "Check payment status after the second reminder.",
                { x: 960, y: 1060 },
                { condition: "Payment recovered" },
            ),
            node(
                "fp-final-success",
                "action",
                "Mark recovered",
                "Mark the payment as successfully recovered.",
                { x: 700, y: 1230 },
                { actionType: "Add contact tag", actionValue: "Payment recovered" },
            ),
            node(
                "fp-risk",
                "action",
                "Flag account at risk",
                "Flag the account for manual retention intervention.",
                { x: 1160, y: 1230 },
                { actionType: "Add contact tag", actionValue: "Billing risk" },
            ),
        ],
        connections: [
            edge("fp-1", "fp-trigger", "fp-email-1"),
            edge("fp-2", "fp-email-1", "fp-wait-2"),
            edge("fp-3", "fp-wait-2", "fp-recovered-1"),
            edge("fp-4", "fp-recovered-1", "fp-success", "Yes"),
            edge("fp-5", "fp-recovered-1", "fp-email-2", "No"),
            edge("fp-6", "fp-email-2", "fp-wait-3"),
            edge("fp-7", "fp-wait-3", "fp-recovered-2"),
            edge("fp-8", "fp-recovered-2", "fp-final-success", "Yes"),
            edge("fp-9", "fp-recovered-2", "fp-risk", "No"),
        ],
    };
}
function reengagementWorkflow(): Workflow {
    return {
        id: "inactive-customer-recovery",
        name: "Re-engage inactive customers",
        description:
            "Reach customers whose activity drops and bring them back before they disengage.",
        status: "active",
        metrics: {
            enrolled: 124,
            completed: 51,
            successRate: 41,
            customersRecovered: 51,
        },
        createdAt: daysAgo(18),
        updatedAt: daysAgo(3),
        lastRunAt: daysAgo(1),
        nodes: [
            node(
                "re-trigger",
                "trigger",
                "No activity for 7 days",
                "Starts when a customer has no product activity for seven days.",
                { x: 650, y: 80 },
                { condition: "No activity for 7 days" },
            ),
            node(
                "re-active-sub",
                "condition",
                "Subscription active?",
                "Only continue for paying active subscriptions.",
                { x: 650, y: 240 },
                { condition: "Subscription active" },
            ),
            node(
                "re-email-1",
                "email",
                "We noticed you've been away",
                "Send a friendly re-engagement message.",
                { x: 650, y: 400 },
                {
                    sendingAccount: "primary",
                    subject: "Still working on {{primary_goal}}, {{first_name}}?",
                    body:
                        "Hi {{first_name}},\n\nWe noticed you haven't been active in {{company_name}} recently.\n\nIf something is getting in the way, reply to this email and let us know. We're happy to help you get back on track.\n\nBest,\n{{sender_name}}",
                },
            ),
            node(
                "re-wait",
                "delay",
                "Wait 3 days",
                "Give the customer time to return.",
                { x: 650, y: 560 },
                { delayValue: 3, delayUnit: "days" },
            ),
            node(
                "re-returned",
                "condition",
                "Returned to product?",
                "Check whether product activity resumed.",
                { x: 650, y: 720 },
                { condition: "Returned to product" },
            ),
            node(
                "re-engaged",
                "action",
                "Mark engaged",
                "Mark the customer as successfully re-engaged.",
                { x: 350, y: 890 },
                { actionType: "Add contact tag", actionValue: "Re-engaged" },
            ),
            node(
                "re-email-2",
                "email",
                "Can we help?",
                "Send a more personal intervention email.",
                { x: 950, y: 890 },
                {
                    sendingAccount: "primary",
                    subject: "Can we help, {{first_name}}?",
                    body:
                        "Hi {{first_name}},\n\nJust checking in one more time.\n\nIf you're stuck or something isn't working the way you expected, reply here and we'll help.\n\nBest,\n{{sender_name}}",
                },
            ),
            node(
                "re-risk",
                "action",
                "Flag as at risk",
                "Escalate the customer for retention follow-up.",
                { x: 950, y: 1060 },
                { actionType: "Add contact tag", actionValue: "At risk" },
            ),
        ],
        connections: [
            edge("re-1", "re-trigger", "re-active-sub"),
            edge("re-2", "re-active-sub", "re-email-1", "Yes"),
            edge("re-3", "re-email-1", "re-wait"),
            edge("re-4", "re-wait", "re-returned"),
            edge("re-5", "re-returned", "re-engaged", "Yes"),
            edge("re-6", "re-returned", "re-email-2", "No"),
            edge("re-7", "re-email-2", "re-risk"),
        ],
    };
}
function churnRiskWorkflow(): Workflow {
    return {
        id: "churn-risk-intervention",
        name: "Churn-risk intervention",
        description:
            "Intervene automatically when customer health deteriorates or usage declines.",
        status: "active",
        metrics: {
            enrolled: 38,
            completed: 24,
            successRate: 63,
            customersRecovered: 17,
        },
        createdAt: daysAgo(15),
        updatedAt: daysAgo(1),
        lastRunAt: daysAgo(0),
        nodes: [
            node(
                "cr-trigger",
                "trigger",
                "Risk score becomes high",
                "Starts when a customer enters the high-risk segment.",
                { x: 650, y: 80 },
                { condition: "Risk score becomes high" },
            ),
            node(
                "cr-usage",
                "condition",
                "Product usage declining?",
                "Check whether declining usage is contributing to risk.",
                { x: 650, y: 250 },
                { condition: "Product usage declining" },
            ),
            node(
                "cr-email",
                "email",
                "Value check-in",
                "Reach customers whose usage is falling.",
                { x: 350, y: 430 },
                {
                    sendingAccount: "primary",
                    subject: "Can we help you get more value from {{company_name}}?",
                    body:
                        "Hi {{first_name}},\n\nWe wanted to check in and make sure you're getting the value you expected from {{company_name}}.\n\nIf anything has changed or you need help, reply here and we'll work through it with you.\n\nBest,\n{{sender_name}}",
                },
            ),
            node(
                "cr-support",
                "condition",
                "Support tickets above 2?",
                "Check whether unresolved support issues are contributing to risk.",
                { x: 950, y: 430 },
                { condition: "Support tickets above 2" },
            ),
            node(
                "cr-notify",
                "action",
                "Notify account owner",
                "Escalate the account to the responsible team member.",
                { x: 950, y: 600 },
                { actionType: "Notify team member", actionValue: "Account owner" },
            ),
            node(
                "cr-wait",
                "delay",
                "Wait 3 days",
                "Give the customer time to respond.",
                { x: 650, y: 770 },
                { delayValue: 3, delayUnit: "days" },
            ),
            node(
                "cr-replied",
                "condition",
                "Customer replied?",
                "Check whether the customer engaged with outreach.",
                { x: 650, y: 930 },
                { condition: "Recipient replied" },
            ),
            node(
                "cr-engaged",
                "action",
                "Mark engaged",
                "Mark the customer as engaged after intervention.",
                { x: 350, y: 1100 },
                { actionType: "Add contact tag", actionValue: "Retention engaged" },
            ),
            node(
                "cr-personal",
                "email",
                "Personal check-in",
                "Send a final high-touch check-in when there is no reply.",
                { x: 950, y: 1100 },
                {
                    sendingAccount: "primary",
                    subject: "A quick check-in from {{company_name}}",
                    body:
                        "Hi {{first_name}},\n\nI wanted to personally check whether there's anything we can do to make {{company_name}} more useful for you.\n\nReply directly and let me know what's changed.\n\nBest,\n{{sender_name}}",
                },
            ),
        ],
        connections: [
            edge("cr-1", "cr-trigger", "cr-usage"),
            edge("cr-2", "cr-usage", "cr-email", "Yes"),
            edge("cr-3", "cr-usage", "cr-support", "No"),
            edge("cr-4", "cr-support", "cr-notify", "Yes"),
            edge("cr-5", "cr-email", "cr-wait"),
            edge("cr-6", "cr-notify", "cr-wait"),
            edge("cr-7", "cr-wait", "cr-replied"),
            edge("cr-8", "cr-replied", "cr-engaged", "Yes"),
            edge("cr-9", "cr-replied", "cr-personal", "No"),
        ],
    };
}
function renewalWorkflow(): Workflow {
    return {
        id: "renewal-reminder",
        name: "Renewal reminder",
        description:
            "Prepare customers for renewal and intervene early when account health is weak.",
        status: "draft",
        metrics: {
            enrolled: 0,
            completed: 0,
            successRate: 0,
        },
        createdAt: daysAgo(8),
        updatedAt: daysAgo(2),
        nodes: [
            node(
                "rn-trigger",
                "trigger",
                "Renewal in 14 days",
                "Starts fourteen days before a subscription renewal.",
                { x: 650, y: 80 },
                { condition: "Renewal in 14 days" },
            ),
            node(
                "rn-health",
                "condition",
                "Account health",
                "Branch based on customer health before renewal.",
                { x: 650, y: 250 },
                { condition: "Account health is healthy" },
            ),
            node(
                "rn-healthy-email",
                "email",
                "Renewal reminder",
                "Give healthy accounts a simple renewal reminder.",
                { x: 340, y: 430 },
                {
                    sendingAccount: "primary",
                    subject: "Your {{company_name}} renewal is coming up",
                    body:
                        "Hi {{first_name}},\n\nYour {{company_name}} subscription renews soon.\n\nEverything is set to continue automatically. If you need anything before renewal, just reply here.\n\nBest,\n{{sender_name}}",
                },
            ),
            node(
                "rn-risk-email",
                "email",
                "Renewal check-in",
                "Start a conversation with at-risk customers before renewal.",
                { x: 950, y: 430 },
                {
                    sendingAccount: "primary",
                    subject: "Let's check in before your renewal",
                    body:
                        "Hi {{first_name}},\n\nYour renewal is coming up and we wanted to check in first.\n\nIf anything could be working better for your team, reply here and let us know.\n\nBest,\n{{sender_name}}",
                },
            ),
            node(
                "rn-notify",
                "action",
                "Notify account owner",
                "Alert the account owner about the at-risk renewal.",
                { x: 950, y: 600 },
                { actionType: "Notify team member", actionValue: "Account owner" },
            ),
            node(
                "rn-wait",
                "delay",
                "Wait 10 days",
                "Wait until the renewal is close.",
                { x: 650, y: 770 },
                { delayValue: 10, delayUnit: "days" },
            ),
            node(
                "rn-renewed",
                "condition",
                "Renewed?",
                "Check whether the subscription renewed successfully.",
                { x: 650, y: 930 },
                { condition: "Subscription renewed" },
            ),
            node(
                "rn-success",
                "action",
                "Mark renewed",
                "Mark the renewal as complete.",
                { x: 350, y: 1100 },
                { actionType: "Add contact tag", actionValue: "Renewed" },
            ),
            node(
                "rn-final",
                "email",
                "Final renewal reminder",
                "Send a final reminder when renewal is still outstanding.",
                { x: 950, y: 1100 },
                {
                    sendingAccount: "primary",
                    subject: "Reminder: Your renewal is due soon",
                    body:
                        "Hi {{first_name}},\n\nA quick reminder that your {{company_name}} renewal is due soon.\n\nIf you have any questions before then, reply to this email.\n\nBest,\n{{sender_name}}",
                },
            ),
        ],
        connections: [
            edge("rn-1", "rn-trigger", "rn-health"),
            edge("rn-2", "rn-health", "rn-healthy-email", "Healthy"),
            edge("rn-3", "rn-health", "rn-risk-email", "At risk"),
            edge("rn-4", "rn-risk-email", "rn-notify"),
            edge("rn-5", "rn-healthy-email", "rn-wait"),
            edge("rn-6", "rn-notify", "rn-wait"),
            edge("rn-7", "rn-wait", "rn-renewed"),
            edge("rn-8", "rn-renewed", "rn-success", "Yes"),
            edge("rn-9", "rn-renewed", "rn-final", "No"),
        ],
    };
}
function featureAdoptionWorkflow(): Workflow {
    return {
        id: "feature-adoption",
        name: "Feature adoption",
        description:
            "Educate customers who have not adopted an important product feature.",
        status: "paused",
        metrics: {
            enrolled: 92,
            completed: 48,
            successRate: 52,
            customersRecovered: 48,
        },
        createdAt: daysAgo(12),
        updatedAt: daysAgo(4),
        lastRunAt: daysAgo(3),
        nodes: [
            node(
                "fa-trigger",
                "trigger",
                "Feature not used after 7 days",
                "Starts when a customer has not used a key feature after seven days.",
                { x: 650, y: 80 },
                { condition: "Feature not used after 7 days" },
            ),
            node(
                "fa-email",
                "email",
                "Feature education",
                "Explain the value of the feature and how to get started.",
                { x: 650, y: 250 },
                {
                    sendingAccount: "primary",
                    subject: "Have you tried {{feature_name}} yet?",
                    body:
                        "Hi {{first_name}},\n\nOne feature you may not have tried yet is {{feature_name}}.\n\nIt can help you {{feature_outcome}} and only takes a few minutes to set up.\n\nBest,\n{{sender_name}}",
                },
            ),
            node(
                "fa-wait",
                "delay",
                "Wait 3 days",
                "Give the customer time to try the feature.",
                { x: 650, y: 410 },
                { delayValue: 3, delayUnit: "days" },
            ),
            node(
                "fa-used",
                "condition",
                "Feature used?",
                "Check whether the feature was adopted after education.",
                { x: 650, y: 570 },
                { condition: "Feature used" },
            ),
            node(
                "fa-adopted",
                "action",
                "Mark adopted",
                "Mark the feature as adopted.",
                { x: 350, y: 740 },
                { actionType: "Add contact tag", actionValue: "Feature adopted" },
            ),
            node(
                "fa-tutorial",
                "email",
                "Feature tutorial",
                "Send a more practical tutorial to customers who still have not adopted.",
                { x: 950, y: 740 },
                {
                    sendingAccount: "primary",
                    subject: "A quick guide to {{feature_name}}",
                    body:
                        "Hi {{first_name}},\n\nHere's a quick walkthrough of {{feature_name}} so you can see exactly how it works.\n\nIf you'd like help setting it up, reply here.\n\nBest,\n{{sender_name}}",
                },
            ),
            node(
                "fa-end",
                "action",
                "End workflow",
                "Stop the feature adoption workflow after the tutorial.",
                { x: 950, y: 910 },
                { actionType: "Stop sequence" },
            ),
        ],
        connections: [
            edge("fa-1", "fa-trigger", "fa-email"),
            edge("fa-2", "fa-email", "fa-wait"),
            edge("fa-3", "fa-wait", "fa-used"),
            edge("fa-4", "fa-used", "fa-adopted", "Yes"),
            edge("fa-5", "fa-used", "fa-tutorial", "No"),
            edge("fa-6", "fa-tutorial", "fa-end"),
        ],
    };
}
export function seedWorkflows(): Workflow[] {
    return [
        onboardingWorkflow(),
        trialConversionWorkflow(),
        failedPaymentWorkflow(),
        reengagementWorkflow(),
        churnRiskWorkflow(),
        renewalWorkflow(),
        featureAdoptionWorkflow(),
    ];
}
function normalizeWorkflow(workflow: Workflow): Workflow {
    return {
        ...workflow,
        metrics: workflow.metrics ?? {
            enrolled: 0,
            completed: 0,
            successRate: 0,
        },
        nodes: workflow.nodes.map((item, index) => ({
            ...item,
            position:
                item.position ?? {
                    x: 180 + (index % 3) * 320,
                    y: 100 + Math.floor(index / 3) * 160,
                },
        })),
        connections: Array.isArray(workflow.connections)
            ? workflow.connections
            : [],
    };
}
export function readWorkflows(): Workflow[] {
    if (typeof window === "undefined") {
        return [];
    }
    try {
        const raw = window.localStorage.getItem(WORKFLOW_STORAGE_KEY);
        if (!raw) {
            const seeded = seedWorkflows();
            writeWorkflows(seeded);
            return seeded;
        }
        const parsed = JSON.parse(raw) as Workflow[];
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.map(normalizeWorkflow);
    } catch {
        return [];
    }
}
export function writeWorkflows(workflows: Workflow[]) {
    if (typeof window === "undefined") {
        return;
    }
    window.localStorage.setItem(
        WORKFLOW_STORAGE_KEY,
        JSON.stringify(workflows),
    );
}
export function saveWorkflow(workflow: Workflow) {
    const workflows = readWorkflows();
    const nextWorkflow: Workflow = {
        ...workflow,
        updatedAt: nowIso(),
    };
    const exists = workflows.some((item) => item.id === workflow.id);
    const next = exists
        ? workflows.map((item) =>
            item.id === workflow.id ? nextWorkflow : item,
        )
        : [nextWorkflow, ...workflows];
    writeWorkflows(next);
    return nextWorkflow;
}
export function deleteWorkflowById(workflowId: string) {
    const workflows = readWorkflows();
    writeWorkflows(
        workflows.filter((workflow) => workflow.id !== workflowId),
    );
}
export function resetDemoWorkflows() {
    const seeded = seedWorkflows();
    writeWorkflows(seeded);
    return seeded;
}
export const EMAIL_EVENT_CONDITIONS = [
    "Email was opened", "Email was clicked", "Recipient replied", "Recipient did not reply", "Email bounced",
] as const;
export function getUpstreamEmailNodes(workflow: Workflow, nodeId: string): WorkflowNode[] {
    const upstream = new Set<string>();
    const queue = [nodeId];
    while (queue.length) {
        const id = queue.shift()!;
        for (const edge of workflow.connections) {
            if (edge.to === id && edge.from !== nodeId && !upstream.has(edge.from)) {
                upstream.add(edge.from);
                queue.push(edge.from);
            }
        }
    }
    return workflow.nodes.filter((node) => node.type === "email" && upstream.has(node.id));
}
export function validateWorkflowNode(node: WorkflowNode): string[] {
    const issues: string[] = [];
    const name = node.title?.trim() || "Step";
    if (!node.title?.trim()) issues.push("Every step needs a name.");
    if (node.type === "email") {
        if (!node.config.subject?.trim()) issues.push(`${name} needs a subject.`);
        if (!node.config.body?.trim()) issues.push(`${name} needs a message.`);
    }
    if (node.type === "trigger" && !node.config.condition?.trim()) issues.push(`${name} needs a trigger rule.`);
    if (node.type === "delay") {
        const value = node.config.delayValue;
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) issues.push(`${name} needs a positive wait time.`);
        if (!new Set(["minutes", "hours", "days"]).has(node.config.delayUnit ?? "days")) issues.push(`${name} needs a valid wait unit.`);
    }
    if (node.type === "action") {
        const capability = getAutomationActionCapability(node.config.actionType);
        if (!capability) issues.push(`${name} has no supported action executor. Choose a supported action or remove this step.`);
        else if (capability.requiresValue && !node.config.actionValue?.trim()) issues.push(`${name} needs a tag name.`);
    }
    if (node.type === "condition") {
        const rules = node.config.conditionRules ?? [];
        if (!rules.length) {
            const condition = node.config.condition?.trim().toLowerCase() ?? "";
            if (!EMAIL_EVENT_CONDITIONS.some((value) => value.toLowerCase() === condition)) {
                issues.push(`${name} needs a supported email condition or structured rules.`);
            } else if (!node.config.sourceEmailNodeId?.trim()) {
                issues.push(`${name} must select the exact email step it evaluates.`);
            }
        } else {
            const operators = new Set(["equals", "not_equals", "contains", "not_contains", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "is_true", "is_false", "exists", "not_exists"]);
            for (const rule of rules) {
                if (!rule.field?.trim() || !operators.has(rule.operator)) issues.push(`${name} has an invalid condition rule.`);
            }
        }
    }
    return [...new Set(issues)];
}
export function validateWorkflow(workflow: Workflow): string[] {
    if (!workflow.nodes.length) return ["Add at least one step."];
    const issues = workflow.nodes.flatMap(validateWorkflowNode);
    const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
    if (byId.size !== workflow.nodes.length) issues.push("Workflow step ids must be unique.");
    const triggers = workflow.nodes.filter((node) => node.type === "trigger");
    if (triggers.length !== 1) issues.push("A workflow needs exactly one trigger.");
    const outgoing = new Map<string, WorkflowConnection[]>();
    const edgeKeys = new Set<string>();
    for (const edge of workflow.connections) {
        if (!byId.has(edge.from) || !byId.has(edge.to)) issues.push("A connection points to a missing step.");
        if (edge.from === edge.to) issues.push("A step cannot connect to itself.");
        const key = `${edge.from}:${edge.to}:${edge.label?.trim().toUpperCase() ?? ""}`;
        if (edgeKeys.has(key)) issues.push("The workflow has a duplicate connection.");
        edgeKeys.add(key);
        outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
    }
    const visiting = new Set<string>(), visited = new Set<string>();
    const visit = (id: string): boolean => {
        if (visiting.has(id)) return true;
        if (visited.has(id)) return false;
        visiting.add(id);
        for (const edge of outgoing.get(id) ?? []) if (visit(edge.to)) return true;
        visiting.delete(id); visited.add(id); return false;
    };
    if (workflow.nodes.some((node) => visit(node.id))) issues.push("The workflow contains a cycle.");
    if (triggers.length === 1) {
        const reachable = new Set<string>(), queue = [triggers[0].id];
        while (queue.length) {
            const id = queue.shift()!;
            if (reachable.has(id)) continue;
            reachable.add(id);
            for (const edge of outgoing.get(id) ?? []) queue.push(edge.to);
        }
        if (workflow.nodes.some((node) => !reachable.has(node.id))) issues.push("Every step must be connected to the trigger.");
        if (workflow.connections.some((edge) => edge.to === triggers[0].id)) issues.push("The trigger cannot have incoming connections.");
    }
    for (const node of workflow.nodes) {
        const edges = outgoing.get(node.id) ?? [];
        if (node.type === "condition") {
            const branches = edges.map((edge) => edge.label?.trim().toUpperCase());
            if (edges.length !== 2 || !branches.includes("YES") || !branches.includes("NO")) issues.push(`${node.title} needs exactly one YES and one NO branch.`);
            if (!(node.config.conditionRules?.length) && node.config.sourceEmailNodeId && !getUpstreamEmailNodes(workflow, node.id).some((email) => email.id === node.config.sourceEmailNodeId)) {
                issues.push(`${node.title} must reference an email step before it on the workflow path.`);
            }
        } else if (getAutomationActionCapability(node.config.actionType)?.terminal && node.type === "action") {
            if (edges.length) issues.push(`${node.title} ends the sequence and cannot have outgoing connections.`);
        } else if (edges.length > 1) issues.push(`${node.title} needs a condition node to branch.`);
    }
    return [...new Set(issues)];
}
