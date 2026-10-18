import type { NodeType, WorkflowNode, WorkflowNodeConfig } from "./types";

/**
 * The steps the builder offers and the factory that creates them. Kept free
 * of browser code so the AI route can build steps exactly like the builder.
 */

export type NodeDefinition = {
    id: string;
    type: NodeType;
    title: string;
    description: string;
    defaults?: Partial<Pick<WorkflowNode, "title" | "description">> & {
        config?: WorkflowNodeConfig;
    };
};

export const NODE_LIBRARY: NodeDefinition[] = [
    // TRIGGERS (config.triggerType decides what starts the workflow)
    {
        id: "trigger-contact-added",
        type: "trigger",
        title: "New contact added",
        description: "Start when a new contact is added.",
        defaults: {
            title: "New contact added",
            config: { condition: "New contact added", triggerType: "customer_created" },
        },
    },
    {
        id: "trigger-tag-added",
        type: "trigger",
        title: "Tag added",
        description: "Start when a contact gets a specific tag.",
        defaults: {
            title: "Tag added",
            config: { condition: "Tag added", triggerType: "tag_added", triggerTag: "" },
        },
    },
    {
        id: "trigger-email-opened",
        type: "trigger",
        title: "Email opened",
        description: "Start when a contact opens any email you send.",
        defaults: {
            title: "Email opened",
            config: { condition: "Email opened", triggerType: "email_opened" },
        },
    },
    {
        id: "trigger-email-clicked",
        type: "trigger",
        title: "Email link clicked",
        description: "Start when a contact clicks a link in any email you send.",
        defaults: {
            title: "Email link clicked",
            config: { condition: "Email clicked", triggerType: "email_clicked" },
        },
    },
    {
        id: "trigger-reply-received",
        type: "trigger",
        title: "Reply received",
        description: "Start when a customer replies to an email.",
        defaults: {
            title: "Reply received",
            config: { condition: "Reply received", triggerType: "email_replied" },
        },
    },
    {
        id: "trigger-email-bounced",
        type: "trigger",
        title: "Email bounced",
        description: "Start when an email to a contact bounces.",
        defaults: {
            title: "Email bounced",
            config: { condition: "Email bounced", triggerType: "email_bounced" },
        },
    },
    {
        id: "trigger-renewal-upcoming",
        type: "trigger",
        title: "Renewal coming up",
        description: "Start a set number of days before a contact's renewal date.",
        defaults: {
            title: "Renewal coming up",
            config: { condition: "Renewal coming up", triggerType: "renewal_upcoming", triggerDaysBefore: 14 },
        },
    },
    {
        id: "trigger-payment-failed",
        type: "trigger",
        title: "Payment failed",
        description: "Start when a payment_failed event is sent for a contact.",
        defaults: {
            title: "Payment failed",
            config: { condition: "Payment failed", triggerType: "custom_event", triggerEventName: "payment_failed" },
        },
    },
    {
        id: "trigger-custom-event",
        type: "trigger",
        title: "Custom event",
        description: "Start when your app or Zapier sends a named event.",
        defaults: {
            title: "Custom event",
            config: { condition: "Custom event", triggerType: "custom_event", triggerEventName: "" },
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
                config: { condition: "New contact added", triggerType: "customer_created" },
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
