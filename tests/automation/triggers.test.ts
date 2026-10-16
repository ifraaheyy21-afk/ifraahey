import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveTrigger, triggerIssues, triggerMatches } from "../../src/lib/automation/triggers";
import { node } from "./helpers";

const trigger = (config: Record<string, unknown>) => node("t", "trigger", config, "Trigger");

describe("resolveTrigger", () => {
    test("maps labels saved before structured triggers existed", () => {
        assert.deepEqual(resolveTrigger(trigger({ condition: "New contact added" })), { type: "customer_created" });
        assert.deepEqual(resolveTrigger(trigger({ condition: "Email received" })), { type: "email_replied" });
        assert.deepEqual(resolveTrigger(trigger({ condition: "Reply received" })), { type: "email_replied" });
        assert.deepEqual(resolveTrigger(trigger({ condition: "Renewal in 14 days" })), { type: "renewal_upcoming", daysBefore: 14 });
        assert.deepEqual(resolveTrigger(trigger({ condition: "Payment failed" })), { type: "custom_event", eventName: "payment_failed" });
        assert.deepEqual(resolveTrigger(trigger({ condition: "Trial started" })), { type: "custom_event", eventName: "trial_started" });
    });

    test("a structured triggerType wins over the label", () => {
        assert.deepEqual(
            resolveTrigger(trigger({ condition: "New contact added", triggerType: "email_opened" })),
            { type: "email_opened" },
        );
    });

    test("normalizes parameters", () => {
        assert.deepEqual(resolveTrigger(trigger({ triggerType: "tag_added", triggerTag: "  At  Risk " })), { type: "tag_added", tag: "at risk" });
        assert.deepEqual(
            resolveTrigger(trigger({ triggerType: "custom_event", triggerEventName: "Subscription Cancelled" })),
            { type: "custom_event", eventName: "subscription_cancelled" },
        );
    });

    test("rejects triggers that could never fire", () => {
        assert.equal(resolveTrigger(trigger({ condition: "" })), null);
        assert.equal(resolveTrigger(trigger({ triggerType: "tag_added", triggerTag: "" })), null);
        assert.equal(resolveTrigger(trigger({ triggerType: "renewal_upcoming", triggerDaysBefore: 0 })), null);
        assert.equal(resolveTrigger(trigger({ triggerType: "renewal_upcoming", triggerDaysBefore: 1.5 })), null);
        assert.equal(resolveTrigger(trigger({ triggerType: "nonsense" })), null);
        assert.equal(resolveTrigger(node("e", "email", { triggerType: "email_opened" })), null);
    });
});

describe("triggerIssues", () => {
    test("explains what is missing", () => {
        assert.equal(triggerIssues(trigger({ triggerType: "tag_added" }), "T").length, 1);
        assert.equal(triggerIssues(trigger({ triggerType: "custom_event", triggerEventName: "!!" }), "T").length, 1);
        assert.equal(triggerIssues(trigger({ triggerType: "renewal_upcoming", triggerDaysBefore: 400 }), "T").length, 1);
        assert.equal(triggerIssues(trigger({ triggerType: "bogus" }), "T").length, 1);
        assert.equal(triggerIssues(trigger({}), "T").length, 1);
    });

    test("accepts valid triggers, including legacy labels", () => {
        assert.deepEqual(triggerIssues(trigger({ condition: "Payment failed" }), "T"), []);
        assert.deepEqual(triggerIssues(trigger({ triggerType: "email_clicked" }), "T"), []);
        assert.deepEqual(triggerIssues(trigger({ triggerType: "renewal_upcoming", triggerDaysBefore: 30 }), "T"), []);
    });
});

describe("triggerMatches", () => {
    test("matches only the same event type", () => {
        assert.ok(triggerMatches({ type: "email_opened" }, { type: "email_opened" }));
        assert.ok(!triggerMatches({ type: "email_opened" }, { type: "email_clicked" }));
    });

    test("compares tags and event names in normalized form", () => {
        assert.ok(triggerMatches({ type: "tag_added", tag: "vip" }, { type: "tag_added", tag: " VIP " }));
        assert.ok(!triggerMatches({ type: "tag_added", tag: "vip" }, { type: "tag_added", tag: "trial" }));
        assert.ok(triggerMatches({ type: "custom_event", eventName: "payment_failed" }, { type: "custom_event", eventName: "Payment Failed" }));
        assert.ok(!triggerMatches({ type: "custom_event", eventName: "payment_failed" }, { type: "custom_event", eventName: "trial_started" }));
    });
});
