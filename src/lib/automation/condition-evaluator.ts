import type {
    AutomationEmailEvent,
    ConditionOperator,
    ConditionRule,
    ExecutionContext,
    WorkflowNode,
} from "./types";

function readPath(
    source: unknown,
    path: string,
): unknown {
    if (!path.trim()) {
        return undefined;
    }

    return path
        .split(".")
        .filter(Boolean)
        .reduce<unknown>((value, key) => {
            if (
                !value ||
                typeof value !== "object" ||
                Array.isArray(value)
            ) {
                return undefined;
            }

            return (
                value as Record<string, unknown>
            )[key];
        }, source);
}

function compare(
    actual: unknown,
    operator: ConditionOperator,
    expected: unknown,
) {
    if (operator === "exists") {
        return actual !== null && actual !== undefined;
    }

    if (operator === "not_exists") {
        return actual === null || actual === undefined;
    }

    if (operator === "is_true") {
        return actual === true;
    }

    if (operator === "is_false") {
        return actual === false;
    }

    if (
        operator === "greater_than" ||
        operator === "greater_than_or_equal" ||
        operator === "less_than" ||
        operator === "less_than_or_equal"
    ) {
        const left = Number(actual);
        const right = Number(expected);

        if (
            !Number.isFinite(left) ||
            !Number.isFinite(right)
        ) {
            return false;
        }

        if (operator === "greater_than") {
            return left > right;
        }

        if (operator === "greater_than_or_equal") {
            return left >= right;
        }

        if (operator === "less_than") {
            return left < right;
        }

        return left <= right;
    }

    if (
        operator === "contains" ||
        operator === "not_contains"
    ) {
        const left = String(actual ?? "").toLowerCase();
        const right = String(expected ?? "").toLowerCase();
        const result = left.includes(right);

        return operator === "contains"
            ? result
            : !result;
    }

    if (operator === "equals") {
        return actual === expected;
    }

    if (operator === "not_equals") {
        return actual !== expected;
    }

    return false;
}

function evaluateRule(
    context: ExecutionContext,
    rule: ConditionRule,
) {
    return compare(
        readPath(context, rule.field),
        rule.operator,
        rule.value,
    );
}

function recordEvents(
    value: unknown,
): AutomationEmailEvent[] {
    return Array.isArray(value)
        ? value.filter(
            (
                event,
            ): event is AutomationEmailEvent =>
                Boolean(event) &&
                typeof event === "object" &&
                !Array.isArray(event),
        )
        : [];
}

function emailEventsForExactNode(
    node: WorkflowNode,
    context: ExecutionContext,
) {
    const sourceEmailNodeId =
        typeof node.config.sourceEmailNodeId === "string"
            ? node.config.sourceEmailNodeId.trim()
            : "";

    if (!sourceEmailNodeId) {
        throw new Error(
            `${node.title || "Email condition"} must reference the exact email step it evaluates.`,
        );
    }

    const grouped = context.automationEmailEventsByNode;

    if (
        grouped &&
        typeof grouped === "object" &&
        !Array.isArray(grouped)
    ) {
        return recordEvents(grouped[sourceEmailNodeId]);
    }

    // Backwards-compatible exact fallback for persisted contexts created
    // before automationEmailEventsByNode was introduced. This still requires
    // the explicit source node id and never falls back to another email node.
    return recordEvents(context.automationEmailEvents).filter(
        (event) => {
            if (
                typeof event.automationNodeId === "string" &&
                event.automationNodeId.trim()
            ) {
                return (
                    event.automationNodeId.trim() ===
                    sourceEmailNodeId
                );
            }

            const emailType =
                typeof event.emailType === "string"
                    ? event.emailType
                    : "";

            return emailType.endsWith(
                `:${sourceEmailNodeId}`,
            );
        },
    );
}

function normalizedStatuses(
    events: AutomationEmailEvent[],
) {
    return new Set(
        events
            .map((event) =>
                String(event.status ?? "")
                    .trim()
                    .toLowerCase(),
            )
            .filter(Boolean),
    );
}

function isLegacyEmailCondition(
    condition: string,
) {
    return (
        condition === "email was opened" ||
        condition === "email was clicked" ||
        condition === "recipient replied" ||
        condition === "recipient did not reply" ||
        condition === "email bounced"
    );
}

function evaluateLegacyEmailCondition(
    node: WorkflowNode,
    context: ExecutionContext,
) {
    const condition =
        node.config.condition?.trim().toLowerCase() ?? "";

    if (!isLegacyEmailCondition(condition)) {
        throw new Error(
            `Condition "${node.config.condition ?? node.title}" needs structured conditionRules before it can run.`,
        );
    }

    const events = emailEventsForExactNode(
        node,
        context,
    );
    const statuses = normalizedStatuses(events);

    if (condition === "email was opened") {
        return (
            statuses.has("open") ||
            statuses.has("opened")
        );
    }

    if (condition === "email was clicked") {
        return (
            statuses.has("click") ||
            statuses.has("clicked")
        );
    }

    if (condition === "recipient replied") {
        return (
            statuses.has("reply") ||
            statuses.has("replied")
        );
    }

    if (condition === "email bounced") {
        return (
            statuses.has("bounce") ||
            statuses.has("bounced")
        );
    }

    if (condition === "recipient did not reply") {
        // Zero events means there is no evidence that this workflow email
        // was ever scheduled/sent, so "did not reply" must not evaluate true.
        if (events.length === 0) {
            return false;
        }

        return !(
            statuses.has("reply") ||
            statuses.has("replied")
        );
    }

    return false;
}

export function evaluateCondition(
    node: WorkflowNode,
    context: ExecutionContext,
) {
    const rules = Array.isArray(
        node.config.conditionRules,
    )
        ? node.config.conditionRules
        : [];

    if (rules.length === 0) {
        return evaluateLegacyEmailCondition(
            node,
            context,
        );
    }

    const results = rules.map((rule) =>
        evaluateRule(context, rule),
    );

    return node.config.conditionMatch === "any"
        ? results.some(Boolean)
        : results.every(Boolean);
}
