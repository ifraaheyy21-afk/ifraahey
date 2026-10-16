import type { WorkflowNode } from "./types";

/**
 * What starts a workflow. Stored on the trigger node as `config.triggerType`
 * (plus the parameter fields below). Workflows saved before structured
 * triggers existed only have a text `config.condition`; resolveTrigger maps
 * those labels so they keep working.
 */
export type TriggerType =
    | "customer_created"
    | "tag_added"
    | "email_opened"
    | "email_clicked"
    | "email_replied"
    | "email_bounced"
    | "renewal_upcoming"
    | "custom_event";

export type TriggerSpec =
    | { type: "customer_created" | "email_opened" | "email_clicked" | "email_replied" | "email_bounced" }
    | { type: "tag_added"; tag: string }
    | { type: "renewal_upcoming"; daysBefore: number }
    | { type: "custom_event"; eventName: string };

/** An event that happened to one customer. */
export type AutomationEvent =
    | { type: "customer_created" | "email_opened" | "email_clicked" | "email_replied" | "email_bounced" }
    | { type: "tag_added"; tag: string }
    | { type: "renewal_upcoming"; renewalDate: Date }
    | { type: "custom_event"; eventName: string };

export const TRIGGER_TYPES: TriggerType[] = [
    "customer_created",
    "tag_added",
    "email_opened",
    "email_clicked",
    "email_replied",
    "email_bounced",
    "renewal_upcoming",
    "custom_event",
];

export const MAX_RENEWAL_DAYS_BEFORE = 365;

/** "Payment failed" -> "payment_failed". Event names are matched in this form. */
export function normalizeEventName(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80);
}

export function normalizeTag(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function fromLegacyLabel(label: string): TriggerSpec | null {
    const value = label.trim().toLowerCase();
    if (!value) return null;

    if (value === "new contact added" || value === "new customer added") {
        return { type: "customer_created" };
    }
    if (value === "email received" || value === "reply received" || value === "recipient replied") {
        return { type: "email_replied" };
    }
    if (value === "email opened") return { type: "email_opened" };
    if (value === "email clicked") return { type: "email_clicked" };
    if (value === "email bounced") return { type: "email_bounced" };

    const renewal = value.match(/^renewal (?:in|within) (\d{1,3}) days?$/);
    if (renewal) {
        const daysBefore = Number(renewal[1]);
        if (daysBefore >= 1 && daysBefore <= MAX_RENEWAL_DAYS_BEFORE) {
            return { type: "renewal_upcoming", daysBefore };
        }
    }

    // Anything else ("Payment failed", "Trial started", ...) is a named event
    // that an integration or the events API delivers.
    const eventName = normalizeEventName(label);
    return eventName ? { type: "custom_event", eventName } : null;
}

/** The trigger a node describes, or null if it is not a usable trigger. */
export function resolveTrigger(node: WorkflowNode): TriggerSpec | null {
    if (node.type !== "trigger") return null;

    const config = node.config ?? {};
    const type = text(config.triggerType) as TriggerType;

    if (!type) return fromLegacyLabel(text(config.condition));

    if (type === "tag_added") {
        const tag = normalizeTag(text(config.triggerTag));
        return tag ? { type, tag } : null;
    }

    if (type === "renewal_upcoming") {
        const daysBefore = Number(config.triggerDaysBefore);
        return Number.isInteger(daysBefore) && daysBefore >= 1 && daysBefore <= MAX_RENEWAL_DAYS_BEFORE
            ? { type, daysBefore }
            : null;
    }

    if (type === "custom_event") {
        const eventName = normalizeEventName(text(config.triggerEventName));
        return eventName ? { type, eventName } : null;
    }

    return TRIGGER_TYPES.includes(type) ? { type } as TriggerSpec : null;
}

/** Problems that stop a trigger node from ever firing, for validation. */
export function triggerIssues(node: WorkflowNode, name: string): string[] {
    const type = text(node.config?.triggerType);

    if (type && !TRIGGER_TYPES.includes(type as TriggerType)) {
        return [`${name} has an unknown trigger type.`];
    }
    if (type === "tag_added" && !text(node.config.triggerTag)) {
        return [`${name} needs the tag that starts the workflow.`];
    }
    if (type === "custom_event" && !normalizeEventName(text(node.config.triggerEventName))) {
        return [`${name} needs an event name.`];
    }
    if (type === "renewal_upcoming") {
        const days = Number(node.config.triggerDaysBefore);
        if (!Number.isInteger(days) || days < 1 || days > MAX_RENEWAL_DAYS_BEFORE) {
            return [`${name} needs a number of days before renewal between 1 and ${MAX_RENEWAL_DAYS_BEFORE}.`];
        }
    }
    if (!type && !resolveTrigger(node)) {
        return [`${name} needs a trigger.`];
    }
    return [];
}

/** Whether an event should start a workflow with this trigger. */
export function triggerMatches(trigger: TriggerSpec, event: AutomationEvent) {
    if (trigger.type !== event.type) return false;

    if (trigger.type === "tag_added" && event.type === "tag_added") {
        return trigger.tag === normalizeTag(event.tag);
    }
    if (trigger.type === "custom_event" && event.type === "custom_event") {
        return trigger.eventName === normalizeEventName(event.eventName);
    }
    // Renewal windows are matched by the scheduled scan, per workflow.
    return true;
}
