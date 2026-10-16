import type { WorkflowNode } from "./types";

// Who may enter a workflow: the trigger node's config.audience, as edited in
// the builder's "Who enters this workflow?" panel.

type AudienceRule = { field?: unknown; operator?: unknown; value?: unknown };

export type Audience = {
    mode: "all" | "conditions" | "specific";
    matchMode: "all" | "any";
    rules: AudienceRule[];
    accountIds: string[];
    allowReentry: boolean;
};

export function readAudience(node: WorkflowNode): Audience {
    const raw = node.config?.audience;
    const value = raw && typeof raw === "object" && !Array.isArray(raw)
        ? raw as Record<string, unknown>
        : {};

    return {
        mode: value.mode === "conditions" || value.mode === "specific" ? value.mode : "all",
        matchMode: value.matchMode === "any" ? "any" : "all",
        rules: Array.isArray(value.rules) ? value.rules as AudienceRule[] : [],
        accountIds: Array.isArray(value.accountIds)
            ? value.accountIds.filter((id): id is string => typeof id === "string")
            : [],
        allowReentry: value.allowReentry === true,
    };
}

function readPath(source: unknown, path: string): unknown {
    return path.split(".").filter(Boolean).reduce<unknown>((value, key) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
        return (value as Record<string, unknown>)[key];
    }, source);
}

// Rule values come from text inputs in the builder, so compare the way a
// person would read the customer table: case-insensitive text, and numbers
// parsed from values like "42.5%".
export function ruleMatches(record: unknown, rule: AudienceRule) {
    const field = typeof rule.field === "string" ? rule.field : "";
    if (!field) return false;

    const actual = readPath(record, field);
    const expected = rule.value;
    const actualText = String(actual ?? "").trim().toLowerCase();
    const expectedText = String(expected ?? "").trim().toLowerCase();

    switch (rule.operator) {
        case "equals": return actualText === expectedText;
        case "not_equals": return actualText !== expectedText;
        case "contains": return actualText.includes(expectedText);
        case "not_contains": return !actualText.includes(expectedText);
        case "is_true": return actual === true || actualText === "true";
        case "is_false": return actual === false || actualText === "false";
        case "greater_than":
        case "less_than": {
            const left = Number.parseFloat(String(actual ?? ""));
            const right = Number.parseFloat(String(expected ?? ""));
            if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
            return rule.operator === "greater_than" ? left > right : left < right;
        }
        default: return false;
    }
}

export function inAudience(audience: Audience, customerId: string, record: unknown) {
    if (audience.mode === "specific") return audience.accountIds.includes(customerId);
    if (audience.mode === "conditions") {
        if (audience.rules.length === 0) return false;
        const results = audience.rules.map((rule) => ruleMatches(record, rule));
        return audience.matchMode === "any" ? results.some(Boolean) : results.every(Boolean);
    }
    return true;
}
