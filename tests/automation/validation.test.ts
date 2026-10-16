import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { validateWorkflowDefinition } from "../../src/lib/automation/validation";
import { edge, node, welcomeEmail, workflow } from "./helpers";

function onboarding() {
    return workflow(
        [
            node("trigger", "trigger", { triggerType: "customer_created", condition: "New contact added" }),
            node("welcome", "email", welcomeEmail),
            node("wait", "delay", { delayValue: 2, delayUnit: "days" }),
            node("opened", "condition", { condition: "Email was opened", sourceEmailNodeId: "welcome" }),
            node("followup", "email", { subject: "Did you see this?", body: "Hi {{first_name}}" }),
            node("tag", "action", { actionType: "add_contact_tag", actionValue: "engaged" }),
        ],
        [
            edge("trigger", "welcome"),
            edge("welcome", "wait"),
            edge("wait", "opened"),
            edge("opened", "tag", "Yes"),
            edge("opened", "followup", "No"),
        ],
    );
}

const hasIssue = (issues: string[], pattern: RegExp) => issues.some((issue) => pattern.test(issue));

describe("validateWorkflowDefinition", () => {
    test("accepts a complete branching workflow", () => {
        assert.deepEqual(validateWorkflowDefinition(onboarding()), []);
    });

    test("requires exactly one trigger", () => {
        const definition = onboarding();
        definition.nodes = definition.nodes.filter((item) => item.id !== "trigger");
        definition.connections = definition.connections.filter((item) => item.from !== "trigger");
        assert.ok(hasIssue(validateWorkflowDefinition(definition), /exactly one trigger/));
    });

    test("rejects a trigger that can never fire", () => {
        const definition = onboarding();
        definition.nodes[0] = node("trigger", "trigger", { triggerType: "tag_added", triggerTag: "" }, "Tag trigger");
        assert.ok(hasIssue(validateWorkflowDefinition(definition), /needs the tag/));
    });

    test("rejects an email without content", () => {
        const definition = onboarding();
        definition.nodes[1] = node("welcome", "email", { subject: "", body: "" }, "Welcome");
        const issues = validateWorkflowDefinition(definition);
        assert.ok(hasIssue(issues, /needs a subject/));
        assert.ok(hasIssue(issues, /needs a message/));
    });

    test("rejects a non-positive delay", () => {
        const definition = onboarding();
        definition.nodes[2] = node("wait", "delay", { delayValue: 0, delayUnit: "days" }, "Wait");
        assert.ok(hasIssue(validateWorkflowDefinition(definition), /positive wait value/));
    });

    test("rejects steps the trigger cannot reach", () => {
        const definition = onboarding();
        definition.nodes.push(node("orphan", "email", welcomeEmail, "Orphan"));
        assert.ok(hasIssue(validateWorkflowDefinition(definition), /not reachable/));
    });

    test("rejects connections to missing steps", () => {
        const definition = onboarding();
        definition.connections.push(edge("tag", "ghost"));
        assert.ok(validateWorkflowDefinition(definition).length > 0);
    });

    test("rejects an email condition that does not name its email", () => {
        const definition = onboarding();
        definition.nodes[3] = node("opened", "condition", { condition: "Email was opened" }, "Opened?");
        assert.ok(validateWorkflowDefinition(definition).length > 0);
    });
});
