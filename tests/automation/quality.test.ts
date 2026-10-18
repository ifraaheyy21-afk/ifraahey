import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { emailConditionTimingIssues, emailPlaceholderIssues, reviewWorkflowQuality } from "../../src/lib/automation/quality";
import { validateWorkflowDefinition } from "../../src/lib/automation/validation";
import { edge, node, welcomeEmail, workflow } from "./helpers";

function replyCheck({ withWait }: { withWait: boolean }) {
    const nodes = [
        node("trigger", "trigger", { triggerType: "customer_created" }),
        node("welcome", "email", welcomeEmail, "Welcome"),
        ...(withWait ? [node("wait", "delay", { delayValue: 2, delayUnit: "days" })] : []),
        node("replied", "condition", { condition: "Recipient replied", sourceEmailNodeId: "welcome" }, "Replied?"),
        node("stop", "action", { actionType: "stop_sequence" }),
        node("tag", "action", { actionType: "add_contact_tag", actionValue: "quiet" }),
    ];
    const connections = [
        edge("trigger", "welcome"),
        ...(withWait ? [edge("welcome", "wait"), edge("wait", "replied")] : [edge("welcome", "replied")]),
        edge("replied", "stop", "Yes"),
        edge("replied", "tag", "No"),
    ];
    return workflow(nodes, connections);
}

describe("email condition timing", () => {
    test("flags a reply check straight after the email", () => {
        const issues = emailConditionTimingIssues(replyCheck({ withWait: false }));
        assert.equal(issues.length, 1);
        assert.match(issues[0], /straight after it is sent/);
        assert.ok(validateWorkflowDefinition(replyCheck({ withWait: false })).some((issue) => /Add a wait/.test(issue)));
    });

    test("accepts a reply check after a wait", () => {
        assert.deepEqual(emailConditionTimingIssues(replyCheck({ withWait: true })), []);
        assert.deepEqual(validateWorkflowDefinition(replyCheck({ withWait: true })), []);
    });
});

describe("branches stored only in the connection id", () => {
    test("validate like labelled branches", () => {
        const definition = replyCheck({ withWait: true });
        definition.connections = definition.connections.map((connection) =>
            connection.label
                ? { id: `edge-${connection.label.toLowerCase()}-x`, from: connection.from, to: connection.to }
                : connection);
        assert.deepEqual(validateWorkflowDefinition(definition), []);
    });
});

describe("placeholder emails", () => {
    test("block publishing", () => {
        const definition = replyCheck({ withWait: true });
        definition.nodes[1] = node("welcome", "email", { subject: "Hi", body: "Hi {{first_name}},\n\nWrite your email here." }, "Welcome");
        assert.equal(emailPlaceholderIssues(definition).length, 1);
        assert.ok(validateWorkflowDefinition(definition).some((issue) => /placeholder/.test(issue)));
    });
});

describe("reviewWorkflowQuality", () => {
    test("suggests a wait between back-to-back emails", () => {
        const definition = workflow(
            [
                node("trigger", "trigger", { triggerType: "customer_created" }),
                node("a", "email", welcomeEmail, "First"),
                node("b", "email", welcomeEmail, "Second"),
            ],
            [edge("trigger", "a"), edge("a", "b")],
        );
        assert.ok(reviewWorkflowQuality(definition).some((item) => /go out at the same moment/.test(item)));
    });

    test("has nothing to say about a well-built workflow", () => {
        assert.deepEqual(reviewWorkflowQuality(replyCheck({ withWait: true })), []);
    });
});
