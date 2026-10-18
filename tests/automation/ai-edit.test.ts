import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
    applyAiOperations,
    definitionFromIndexed,
    parseAiOperation,
    validateOperations,
    type AiOperation,
    type AvailableStep,
} from "../../src/lib/automation/ai-edit";
import { connectionBranch } from "../../src/lib/automation/branches";
import { validateWorkflowDefinition } from "../../src/lib/automation/validation";
import { createNode, NODE_LIBRARY } from "../../src/lib/automation/node-library";
import { edge, node, welcomeEmail, workflow } from "./helpers";

const available: AvailableStep[] = NODE_LIBRARY.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    description: item.description,
    actionType: item.defaults?.config?.actionType,
}));

const factory = {
    createNode: (stepId: string, index: number) => {
        const definition = NODE_LIBRARY.find((item) => item.id === stepId);
        return definition ? createNode(definition.type, index, definition.id) : null;
    },
};

function op(fields: Partial<AiOperation> & Pick<AiOperation, "action">): AiOperation {
    return {
        operationId: null, targetIndex: null, afterIndex: null, parentIndex: null, parentOperationId: null,
        branch: null, stepId: null, integrationStepId: null, actionValue: null, condition: null,
        sourceEmailIndex: null, sourceEmailOperationId: null, delayValue: null, delayUnit: null,
        title: null, subject: null, body: null, triggerValue: null,
        ...fields,
    };
}

function chain() {
    return workflow(
        [
            node("trigger", "trigger", { triggerType: "customer_created" }),
            node("welcome", "email", welcomeEmail, "Welcome"),
            node("wait", "delay", { delayValue: 2, delayUnit: "days" }, "Wait 2 days"),
            node("followup", "email", { subject: "Checking in", body: "Hi {{first_name}}" }, "Follow-up"),
        ],
        [edge("trigger", "welcome"), edge("welcome", "wait"), edge("wait", "followup")],
    );
}

const nextOf = (definition: { connections: { from: string; to: string }[] }, id: string) =>
    definition.connections.filter((connection) => connection.from === id).map((connection) => connection.to);

describe("parseAiOperation", () => {
    test("accepts older responses without the newer fields", () => {
        const parsed = parseAiOperation({ action: "remove", targetIndex: 2 });
        assert.equal(parsed?.targetIndex, 2);
        assert.equal(parsed?.subject, null);
    });

    test("rejects a field with the wrong type", () => {
        assert.equal(parseAiOperation({ action: "add", subject: 5 }), null);
        assert.equal(parseAiOperation({ action: "rename" }), null);
    });
});

describe("applyAiOperations", () => {
    test("builds a complete workflow from scratch with written emails", () => {
        const operations = [
            op({ action: "add", operationId: "t", stepId: "trigger-tag-added", triggerValue: "trial" }),
            op({ action: "add", operationId: "e1", parentOperationId: "t", stepId: "email-send", title: "Welcome email", subject: "Welcome aboard", body: "Hi {{first_name}},\n\nGlad you're here.\n\n{{sender_name}}" }),
            op({ action: "add", operationId: "w", parentOperationId: "e1", stepId: "delay", delayValue: 3, delayUnit: "days" }),
            op({ action: "add", operationId: "c", parentOperationId: "w", stepId: "condition", condition: "Recipient replied", sourceEmailOperationId: "e1" }),
            op({ action: "add", operationId: "yes", parentOperationId: "c", branch: "YES", stepId: "action-stop" }),
            op({ action: "add", operationId: "no", parentOperationId: "c", branch: "NO", stepId: "action-add-tag", actionValue: "needs-nudge" }),
        ];
        const empty = workflow([], []);
        assert.deepEqual(validateOperations({ operations, definition: empty, availableSteps: available }), []);

        const { definition, errors, addedIdByOperationId } = applyAiOperations(empty, operations, factory);
        assert.deepEqual(errors, []);
        assert.deepEqual(validateWorkflowDefinition(definition), []);

        const email = definition.nodes.find((item) => item.type === "email")!;
        assert.equal(email.title, "Welcome email");
        assert.equal(email.config.subject, "Welcome aboard");
        assert.equal(definition.nodes.find((item) => item.type === "trigger")!.config.triggerTag, "trial");
        assert.equal(definition.nodes.find((item) => item.type === "delay")!.title, "Wait 3 days");

        const condition = definition.nodes.find((item) => item.type === "condition")!;
        assert.equal(condition.config.sourceEmailNodeId, addedIdByOperationId.get("e1"));
        const branches = definition.connections.filter((item) => item.from === condition.id).map(connectionBranch).sort();
        assert.deepEqual(branches, ["NO", "YES"]);
    });

    test("inserts a step between a parent and its existing next step", () => {
        const operations = [op({ action: "add", operationId: "tag", parentIndex: 1, stepId: "action-add-tag", actionValue: "welcomed" })];
        const { definition, errors, addedIdByOperationId } = applyAiOperations(chain(), operations, factory);
        assert.deepEqual(errors, []);
        const tagId = addedIdByOperationId.get("tag")!;
        assert.deepEqual(nextOf(definition, "welcome"), [tagId]);
        assert.deepEqual(nextOf(definition, tagId), ["wait"]);
        assert.deepEqual(validateWorkflowDefinition(definition), []);
    });

    test("reconnects the chain when a middle step is removed", () => {
        const { definition } = applyAiOperations(chain(), [op({ action: "remove", targetIndex: 2 })], factory);
        assert.deepEqual(nextOf(definition, "welcome"), ["followup"]);
        assert.ok(!definition.nodes.some((item) => item.id === "wait"));
    });

    test("updates email copy and delay timing in place", () => {
        const operations = [
            op({ action: "update", targetIndex: 1, subject: "A warmer welcome" }),
            op({ action: "update", targetIndex: 2, delayValue: 4 }),
        ];
        const { definition } = applyAiOperations(chain(), operations, factory);
        assert.equal(definition.nodes[1].config.subject, "A warmer welcome");
        assert.equal(definition.nodes[1].config.body, welcomeEmail.body);
        assert.equal(definition.nodes[2].title, "Wait 4 days");
    });

    test("refuses to put End workflow in front of later steps", () => {
        const operations = [op({ action: "add", operationId: "stop", parentIndex: 1, stepId: "action-stop" })];
        const { errors } = applyAiOperations(chain(), operations, factory);
        assert.equal(errors.length, 1);
    });
});

describe("validateOperations", () => {
    test("rejects a second step on a condition branch that is already used", () => {
        const definition = workflow(
            [
                node("trigger", "trigger", { triggerType: "customer_created" }),
                node("welcome", "email", welcomeEmail),
                node("wait", "delay", { delayValue: 2, delayUnit: "days" }),
                node("replied", "condition", { condition: "Recipient replied", sourceEmailNodeId: "welcome" }),
                node("stop", "action", { actionType: "stop_sequence" }),
            ],
            [edge("trigger", "welcome"), edge("welcome", "wait"), edge("wait", "replied"), { id: "edge-yes-1", from: "replied", to: "stop" }],
        );
        const operations = [op({ action: "add", operationId: "x", parentIndex: 3, branch: "YES", stepId: "action-add-tag", actionValue: "hot" })];
        assert.ok(validateOperations({ operations, definition, availableSteps: available }).some((error) => /already has a YES branch/.test(error)));
    });

    test("rejects conditions the engine cannot run", () => {
        const operations = [op({ action: "add", operationId: "c", parentIndex: 0, stepId: "condition", condition: "Customer is VIP" })];
        assert.ok(validateOperations({ operations, definition: chain(), availableSteps: available }).some((error) => /not supported/.test(error)));
    });
});

describe("definitionFromIndexed", () => {
    test("turns the builder's index-based graph into labelled connections", () => {
        const definition = definitionFromIndexed(
            [
                { index: 1, id: "b", type: "email", title: "B", description: "", config: {} },
                { index: 0, id: "a", type: "condition", title: "A", description: "", config: {} },
            ],
            [{ fromIndex: 0, toIndex: 1, branch: "NO" }],
        );
        assert.deepEqual(definition.nodes.map((item) => item.id), ["a", "b"]);
        assert.equal(connectionBranch(definition.connections[0]), "NO");
    });
});
