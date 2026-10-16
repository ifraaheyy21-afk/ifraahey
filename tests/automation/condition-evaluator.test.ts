import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { evaluateCondition } from "../../src/lib/automation/condition-evaluator";
import { node } from "./helpers";

const emailCondition = (condition: string) =>
    node("check", "condition", { condition, sourceEmailNodeId: "welcome" });

const withEvents = (statuses: string[]) => ({
    automationEmailEventsByNode: { welcome: statuses.map((status) => ({ status })) },
});

describe("email conditions", () => {
    test("opened / clicked / bounced read the referenced email's events", () => {
        assert.equal(evaluateCondition(emailCondition("Email was opened"), withEvents(["sent", "opened"])), true);
        assert.equal(evaluateCondition(emailCondition("Email was opened"), withEvents(["sent"])), false);
        assert.equal(evaluateCondition(emailCondition("Email was clicked"), withEvents(["clicked"])), true);
        assert.equal(evaluateCondition(emailCondition("Email bounced"), withEvents(["bounced"])), true);
    });

    test("events from other emails do not count", () => {
        const context = { automationEmailEventsByNode: { other: [{ status: "opened" }] } };
        assert.equal(evaluateCondition(emailCondition("Email was opened"), context), false);
    });

    test("did-not-reply needs evidence the email exists", () => {
        assert.equal(evaluateCondition(emailCondition("Recipient did not reply"), withEvents([])), false);
        assert.equal(evaluateCondition(emailCondition("Recipient did not reply"), withEvents(["sent"])), true);
        assert.equal(evaluateCondition(emailCondition("Recipient did not reply"), withEvents(["sent", "replied"])), false);
    });

    test("an email condition without its source email is an error", () => {
        assert.throws(() => evaluateCondition(node("check", "condition", { condition: "Email was opened" }), {}));
    });

    test("free-text conditions without rules are an error, not a silent false", () => {
        assert.throws(() => evaluateCondition(node("check", "condition", { condition: "Product usage above 50" }), {}));
    });
});

describe("structured rules", () => {
    const context = { customer: { plan: "Pro", mrr: 120, unsubscribedAt: null } };

    test("all rules must match by default", () => {
        const check = node("check", "condition", {
            conditionRules: [
                { field: "customer.plan", operator: "equals", value: "Pro" },
                { field: "customer.mrr", operator: "greater_than", value: 100 },
            ],
        });
        assert.equal(evaluateCondition(check, context), true);
    });

    test("match any", () => {
        const check = node("check", "condition", {
            conditionMatch: "any",
            conditionRules: [
                { field: "customer.plan", operator: "equals", value: "Free" },
                { field: "customer.mrr", operator: "greater_than_or_equal", value: 120 },
            ],
        });
        assert.equal(evaluateCondition(check, context), true);
    });

    test("missing fields do not match comparisons", () => {
        const check = node("check", "condition", {
            conditionRules: [{ field: "customer.seats", operator: "greater_than", value: 1 }],
        });
        assert.equal(evaluateCondition(check, context), false);
    });
});
