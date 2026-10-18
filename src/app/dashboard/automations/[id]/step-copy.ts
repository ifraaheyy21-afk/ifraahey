// Plain-English copy for workflow steps, shown on the canvas cards.

import { isTerminalAutomationAction } from "../../../../lib/automation/action-capabilities";

type Config = Record<string, unknown>;

export type StepNode = {
    id: string;
    type: "trigger" | "email" | "delay" | "condition" | "action";
    title: string;
    config: Config;
};

export type StepCopy = {
    /** Small label above the card. */
    pill: string;
    title: string;
    subtitle: string;
    /** One or two sentences explaining what the step does. */
    description: string;
    /** App the step runs through, shown as a chip. */
    app: string | null;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function plural(value: number, unit: string) {
    const singular = unit.replace(/s$/, "");
    return `${value} ${value === 1 ? singular : `${singular}s`}`;
}

const TRIGGER_COPY: Record<string, { subtitle: string; description: string }> = {
    customer_created: {
        subtitle: "New contact added",
        description: "Starts when a new contact is added to your workspace, from the dashboard, an import or the API.",
    },
    tag_added: {
        subtitle: "Tag added to a contact",
        description: "Starts when a contact gets the chosen tag.",
    },
    email_opened: {
        subtitle: "Email opened",
        description: "Starts the first time a contact opens any email you send.",
    },
    email_clicked: {
        subtitle: "Link clicked",
        description: "Starts the first time a contact clicks a link in any email you send.",
    },
    email_replied: {
        subtitle: "Reply received",
        description: "Starts when a contact replies to one of your emails.",
    },
    email_bounced: {
        subtitle: "Email bounced",
        description: "Starts when an email to a contact bounces, so you can tag them or alert your team.",
    },
    renewal_upcoming: {
        subtitle: "Renewal coming up",
        description: "Starts a set number of days before a contact's renewal date.",
    },
    custom_event: {
        subtitle: "Event received",
        description: "Starts when your app or Zapier sends this event for a contact.",
    },
};

const CONDITION_COPY: Record<string, string> = {
    "email was opened": "opened",
    "email was clicked": "clicked a link in",
    "recipient replied": "replied to",
    "recipient did not reply": "did not reply to",
    "email bounced": "bounced on",
};

/** The structured trigger type for a node, mapping old text labels. */
export function triggerTypeOf(config: Config) {
    const type = text(config.triggerType);
    if (type) return type;
    const label = text(config.condition).toLowerCase();
    if (label === "new contact added") return "customer_created";
    if (label === "email received" || label === "reply received") return "email_replied";
    if (/^renewal (in|within) \d+ days?$/.test(label)) return "renewal_upcoming";
    return label ? "custom_event" : "";
}

export function describeStep(node: StepNode, titleOf: (id: string) => string | null): StepCopy {
    const config = node.config ?? {};

    if (node.type === "trigger") {
        const type = triggerTypeOf(config);
        const base = TRIGGER_COPY[type] ?? TRIGGER_COPY.custom_event;
        let { subtitle, description } = base;
        if (type === "tag_added" && text(config.triggerTag)) {
            subtitle = `Tag “${text(config.triggerTag)}” added`;
            description = `Starts when a contact is tagged “${text(config.triggerTag)}”.`;
        }
        if (type === "renewal_upcoming") {
            const days = Number(config.triggerDaysBefore) || Number(text(config.condition).match(/\d+/)?.[0]) || 14;
            subtitle = `${plural(days, "day")} before renewal`;
            description = `Starts ${plural(days, "day")} before a contact's renewal date.`;
        }
        if (type === "custom_event") {
            const name = text(config.triggerEventName) || text(config.condition) || "your event";
            subtitle = `Event: ${name}`;
            description = `Starts when “${name}” is sent for a contact from your app or Zapier.`;
        }
        return { pill: "Trigger", title: node.title || subtitle, subtitle, description, app: type === "custom_event" ? "API / Zapier" : null };
    }

    if (node.type === "email") {
        const subject = text(config.subject);
        const body = text(config.body).replace(/\s+/g, " ");
        return {
            pill: "Action",
            title: node.title || "Send email",
            subtitle: subject ? `“${subject}”` : "No subject yet",
            description: body
                ? `Emails the contact: ${body.length > 110 ? `${body.slice(0, 110)}…` : body}`
                : "Emails the contact as soon as they reach this step.",
            app: "Resend",
        };
    }

    if (node.type === "delay") {
        const value = Number(config.delayValue) || 1;
        const unit = text(config.delayUnit) || "days";
        return {
            pill: "Delay",
            title: `Wait ${plural(value, unit)}`,
            subtitle: "Pause",
            description: `Waits ${plural(value, unit)}, then continues to the next step.`,
            app: null,
        };
    }

    if (node.type === "condition") {
        const verb = CONDITION_COPY[text(config.condition).toLowerCase()];
        const source = text(config.sourceEmailNodeId);
        const emailTitle = source ? titleOf(source) : null;
        return {
            pill: "Condition",
            title: node.title || "If / else",
            subtitle: "Yes / No",
            description: verb
                ? `Checks whether the contact ${verb} ${emailTitle ? `“${emailTitle}”` : "the chosen email"}, then follows the Yes or No path.`
                : "Checks a rule, then follows the Yes or No path.",
            app: null,
        };
    }

    if (isTerminalAutomationAction(config.actionType)) {
        return {
            pill: "Action",
            title: node.title || "End workflow",
            subtitle: "Stops here",
            description: "Ends the workflow for this contact. No later steps run.",
            app: null,
        };
    }
    const tag = text(config.actionValue);
    return {
        pill: "Action",
        title: node.title || "Add a tag",
        subtitle: tag ? `Tag: ${tag}` : "No tag chosen",
        description: tag
            ? `Adds the tag “${tag}” to the contact, which can start other workflows.`
            : "Adds a tag to the contact.",
        app: null,
    };
}
