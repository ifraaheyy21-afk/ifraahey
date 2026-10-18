import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { InboxThread } from "../../src/lib/inbox-data";
import {
    draftHasContent,
    draftToThread,
    parseDraftInput,
    withDraftThreads,
    type InboxDraftRecord,
} from "../../src/lib/inbox-drafts";
import { threadInFolder } from "../../src/lib/inbox-folders";

function draft(overrides: Partial<InboxDraftRecord> = {}): InboxDraftRecord {
    return {
        id: "d1",
        workspaceId: "ws_1",
        threadId: null,
        toEmail: "dan@example.com",
        toName: "Dan",
        subject: "Plan",
        html: "<p>Half written</p>",
        updatedAt: new Date("2026-10-18T12:00:00.000Z"),
        ...overrides,
    };
}

const conversation: InboxThread = {
    id: "ism_1",
    customerId: null,
    customerName: "Sofia Reyes",
    customerEmail: "sofia@example.com",
    customerCompany: "Altitude",
    subject: "Dashboard mismatch",
    preview: "",
    folder: "inbox",
    labels: [],
    unread: false,
    starred: false,
    archived: false,
    lastMessageAt: "2026-10-18T10:00:00.000Z",
    messages: [],
};

describe("parseDraftInput", () => {
    test("keeps a new email's recipient and strips script", () => {
        const input = parseDraftInput({ to: " Dan@Example.com ", toName: "Dan", subject: "Plan", html: '<p onclick="x()">Hi<script>1</script></p>' });
        assert.deepEqual(input, { draftId: null, threadId: null, toEmail: "dan@example.com", toName: "Dan", subject: "Plan", html: "<p>Hi</p>" });
    });

    test("ignores a recipient on a reply draft; the thread decides who it goes to", () => {
        const input = parseDraftInput({ threadId: "ism_1", to: "other@example.com", html: "<p>Hi</p>" });
        assert.equal(input.toEmail, null);
        assert.equal(input.threadId, "ism_1");
    });

    test("rejects bad input with clear messages", () => {
        assert.throws(() => parseDraftInput(null), { message: "Send the draft as a JSON object." });
        assert.throws(() => parseDraftInput({ to: "not-an-email" }), { message: "The recipient email address is not valid." });
        assert.throws(() => parseDraftInput({ draftId: "../x" }), { message: "That draft id is not valid." });
        assert.throws(() => parseDraftInput({ subject: "x".repeat(501) }), { message: "Keep the subject under 500 characters." });
    });
});

test("draftHasContent ignores empty editor markup", () => {
    assert.equal(draftHasContent({ subject: "", html: "<p><br></p>", toEmail: null, threadId: "ism_1" }), false);
    assert.equal(draftHasContent({ subject: "Hi", html: "", toEmail: null, threadId: "ism_1" }), true);
    assert.equal(draftHasContent({ subject: "", html: "", toEmail: "dan@example.com", threadId: null }), true);
});

describe("drafts in the thread list", () => {
    test("a new-email draft shows in Drafts with its own recipient", () => {
        const thread = draftToThread(draft());
        assert.equal(thread.id, "draft_d1");
        assert.equal(thread.folder, "drafts");
        assert.equal(thread.customerEmail, "dan@example.com");
        assert.equal(thread.preview, "Half written");
        assert.equal(thread.draft?.id, "d1");
        assert.ok(threadInFolder(thread, "drafts"));
        assert.equal(threadInFolder(thread, "inbox"), false);
    });

    test("a reply draft borrows its conversation's recipient and subject", () => {
        const [, thread] = withDraftThreads([conversation], [draft({ threadId: "ism_1", toEmail: null, toName: null, subject: "" })]);
        assert.equal(thread.customerEmail, "sofia@example.com");
        assert.equal(thread.subject, "Re: Dashboard mismatch");
        assert.equal(thread.draft?.threadId, "ism_1");
    });

    test("drops a reply draft whose conversation no longer exists", () => {
        assert.equal(withDraftThreads([conversation], [draft({ threadId: "ism_gone" })]).length, 1);
    });
});
