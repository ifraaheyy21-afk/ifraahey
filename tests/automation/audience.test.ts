import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { inAudience, readAudience } from "../../src/lib/automation/audience";
import { node } from "./helpers";

const audience = (value: unknown) => readAudience(node("t", "trigger", { audience: value }));

// Same shape the customers API returns (src/lib/customerAnalytics.ts).
const customer = {
    status: "Active",
    plan: "Pro",
    mrr: 120,
    openRate: "42.5%",
    analytics: { replied: 0 },
};

describe("workflow audience", () => {
    test("defaults to everyone, without re-entry", () => {
        const value = audience(undefined);
        assert.equal(value.mode, "all");
        assert.equal(value.allowReentry, false);
        assert.ok(inAudience(value, "c1", customer));
    });

    test("specific accounts", () => {
        assert.ok(inAudience(audience({ mode: "specific", accountIds: ["c1"] }), "c1", customer));
        assert.ok(!inAudience(audience({ mode: "specific", accountIds: ["c2"] }), "c1", customer));
    });

    test("conditions compare text case-insensitively and parse percentages", () => {
        const rules = [
            { field: "plan", operator: "equals", value: "pro" },
            { field: "openRate", operator: "greater_than", value: "40" },
        ];
        assert.ok(inAudience(audience({ mode: "conditions", rules }), "c1", customer));
    });

    test("match all vs match any", () => {
        const rules = [
            { field: "plan", operator: "equals", value: "pro" },
            { field: "mrr", operator: "less_than", value: "100" },
        ];
        assert.ok(!inAudience(audience({ mode: "conditions", rules }), "c1", customer));
        assert.ok(inAudience(audience({ mode: "conditions", matchMode: "any", rules }), "c1", customer));
    });

    test("reads nested fields", () => {
        const rules = [{ field: "analytics.replied", operator: "less_than", value: "1" }];
        assert.ok(inAudience(audience({ mode: "conditions", rules }), "c1", customer));
    });

    test("conditions mode with no rules enrolls nobody", () => {
        assert.ok(!inAudience(audience({ mode: "conditions", rules: [] }), "c1", customer));
    });

    test("unknown operators never match", () => {
        const rules = [{ field: "plan", operator: "sounds_like", value: "pro" }];
        assert.ok(!inAudience(audience({ mode: "conditions", rules }), "c1", customer));
    });
});
