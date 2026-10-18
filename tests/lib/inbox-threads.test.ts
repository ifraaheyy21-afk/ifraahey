import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { InboxThread } from "../../src/lib/inbox-data";
import { threadInFolder } from "../../src/lib/inbox-folders";
import {
    buildInboxThreads,
    buildPayload,
    type BuildInboxInput,
    type ReceivedEmailRecord,
    type ScheduledEmailRecord,
    type SentEmailRecord,
} from "../../src/lib/inbox-threads";
import { escapeHtml, safeLinkUrl, sanitiseEmailHtml } from "../../src/lib/email-html";

const WORKSPACE = "ws_1";

function scheduled(overrides: Partial<ScheduledEmailRecord> = {}): ScheduledEmailRecord {
    return {
        id: "e1", customerId: "c1", customerName: "Sofia", customerEmail: "sofia@example.com",
        customerCompany: "Acme", subject: "Welcome", html: "<p>Hello Sofia</p>", plainText: null,
        scheduledFor: new Date("2026-10-01T09:00:00Z"), sentAt: new Date("2026-10-01T09:00:00Z"),
        status: "delivered", failureReason: null, providerRfcMessageId: "<e1@resend.dev>",
        deliveredAt: new Date("2026-10-01T09:00:05Z"), openedAt: null, clickedAt: null,
        fromEmail: "team@cobrai.test", fromName: "Cobrai", createdAt: new Date("2026-10-01T08:00:00Z"),
        ...overrides,
    };
}

function received(overrides: Partial<ReceivedEmailRecord> = {}): ReceivedEmailRecord {
    return {
        id: "r1", threadId: "se_e1", fromEmail: "sofia@example.com", fromName: "Sofia",
        toEmail: "team@cobrai.test", subject: "Re: Welcome", html: null, plainText: "Thanks!",
        rfcMessageId: "<r1@mail.example.com>", attachments: [{ fileName: "plan.pdf", mimeType: "application/pdf", size: 2048 }],
        authenticationFailed: false, receivedAt: new Date("2026-10-02T10:00:00Z"),
        ...overrides,
    };
}

function sent(overrides: Partial<SentEmailRecord> = {}): SentEmailRecord {
    return {
        id: "s1", workspaceId: WORKSPACE, sendKey: "key_12345", threadId: "se_e1", toEmail: "sofia@example.com",
        toName: "Sofia", fromEmail: "team@cobrai.test", fromName: "Cobrai", subject: "Re: Welcome",
        html: "<p>Glad to help</p>", plainText: "Glad to help", inReplyTo: "<r1@mail.example.com>",
        attachmentName: null, attachmentMimeType: null, attachmentSize: null, status: "sent",
        failureReason: null, providerMessageId: "res_1", providerRfcMessageId: "<s1@resend.dev>",
        sentAt: new Date("2026-10-02T11:00:00Z"), createdAt: new Date("2026-10-02T11:00:00Z"),
        ...overrides,
    };
}

function build(overrides: Partial<BuildInboxInput> = {}) {
    return buildInboxThreads({ workspaceId: WORKSPACE, scheduled: [], sent: [], received: [], states: [], ...overrides });
}

describe("buildInboxThreads", () => {
    test("a sent email with no reply sits in Sent", () => {
        const [thread] = build({ scheduled: [scheduled()] });
        assert.equal(thread.id, "se_e1");
        assert.equal(thread.folder, "sent");
        assert.equal(thread.unread, false);
        assert.equal(thread.messages[0].status, "delivered");
        assert.equal(thread.messages[0].providerMessageId, "<e1@resend.dev>");
        assert.equal(thread.preview, "Hello Sofia");
    });

    test("a reply moves the thread to the inbox, unread, with the whole conversation in order", () => {
        const [thread] = build({ scheduled: [scheduled()], received: [received()], sent: [sent()] });
        assert.equal(thread.folder, "inbox");
        assert.equal(thread.unread, true);
        assert.deepEqual(thread.messages.map((m) => m.direction), ["outbound", "inbound", "outbound"]);
        assert.equal(thread.messages[1].attachments?.[0].fileName, "plan.pdf");
        assert.equal(thread.messages[1].attachments?.[0].sizeLabel, "2 KB");
        assert.equal(thread.messages[2].providerMessageId, "<s1@resend.dev>");
        assert.equal(thread.lastMessageAt, "2026-10-02T11:00:00.000Z");
        assert.equal(thread.preview, "Glad to help");
        // It also shows in Sent, because you wrote in it.
        assert.ok(threadInFolder(thread, "sent"));
    });

    test("scheduled and failed emails land in their own folders", () => {
        const threads = build({
            scheduled: [
                scheduled({ id: "a", status: "scheduled", sentAt: null, deliveredAt: null }),
                scheduled({ id: "b", status: "bounced" }),
            ],
        });
        assert.equal(threads.find((t) => t.id === "se_a")?.folder, "scheduled");
        assert.equal(threads.find((t) => t.id === "se_b")?.folder, "failed");
        assert.equal(threads.find((t) => t.id === "se_b")?.messages[0].status, "failed");
    });

    test("a new email from Compose gets its own thread", () => {
        const [thread] = build({ sent: [sent({ id: "s9", threadId: null })] });
        assert.equal(thread.id, "ism_s9");
        assert.equal(thread.customerEmail, "sofia@example.com");
        assert.equal(thread.folder, "sent");
        // Inbox lists all mail, so the new conversation shows there too.
        assert.ok(threadInFolder(thread, "inbox"));
        assert.ok(threadInFolder(thread, "sent"));
    });

    test("saved state stars, archives and tags a thread", () => {
        const [thread] = build({
            scheduled: [scheduled()],
            received: [received()],
            states: [{ threadId: "se_e1", starred: true, lastReadAt: null, markedUnread: false, folder: "archived", labels: ["VIP"] }],
        });
        assert.equal(thread.starred, true);
        assert.equal(thread.folder, "archived");
        assert.equal(thread.archived, true);
        assert.deepEqual(thread.labels, ["VIP"]);
        assert.equal(threadInFolder(thread, "inbox"), false);
        assert.equal(threadInFolder(thread, "starred"), true);
    });

    test("reading clears unread until a newer reply arrives", () => {
        const state = { threadId: "se_e1", starred: false, markedUnread: false, folder: null, labels: [] };
        const read = build({
            scheduled: [scheduled()], received: [received()],
            states: [{ ...state, lastReadAt: new Date("2026-10-02T10:30:00Z") }],
        })[0];
        assert.equal(read.unread, false);

        const newer = build({
            scheduled: [scheduled()],
            received: [received(), received({ id: "r2", receivedAt: new Date("2026-10-03T08:00:00Z") })],
            states: [{ ...state, lastReadAt: new Date("2026-10-02T10:30:00Z") }],
        })[0];
        assert.equal(newer.unread, true);

        const marked = build({
            scheduled: [scheduled()], received: [received()],
            states: [{ ...state, lastReadAt: new Date("2026-10-02T10:30:00Z"), markedUnread: true }],
        })[0];
        assert.equal(marked.unread, true);
    });

    test("restoring a deleted thread puts it back in its natural folder", () => {
        const [thread] = build({
            scheduled: [scheduled()], received: [received()],
            states: [{ threadId: "se_e1", starred: false, lastReadAt: null, markedUnread: false, folder: null, labels: [] }],
        });
        assert.equal(thread.folder, "inbox");
    });

    test("sample threads are flagged and never pick up stored replies", () => {
        const demo: InboxThread = {
            id: "se_e1", customerId: null, customerName: "Demo", customerEmail: "demo@example.com", customerCompany: null,
            subject: "Hi", preview: "Hi", folder: "inbox", labels: [], unread: false, starred: false, archived: false,
            lastMessageAt: "2026-09-01T00:00:00.000Z",
            messages: [{
                id: "m", direction: "inbound", fromName: "Demo", fromEmail: "demo@example.com", toName: "", toEmail: "",
                sentAt: "2026-09-01T00:00:00.000Z", status: "received", html: null, plainText: "Hi",
            }],
        };
        const [thread] = build({ demoThreads: [{ ...demo, id: "demo_1" }], received: [received({ threadId: "demo_1" })] });
        assert.equal(thread.demo, true);
        assert.equal(thread.messages.length, 1);
    });

    test("folder counts include Starred and Sent overlaps", () => {
        const payload = buildPayload(WORKSPACE, build({
            scheduled: [scheduled(), scheduled({ id: "e2" })],
            received: [received()],
            states: [{ threadId: "se_e2", starred: true, lastReadAt: null, markedUnread: false, folder: null, labels: [] }],
        }));
        const count = (folder: string) => payload.folders.find((item) => item.folder === folder)?.count;
        // Inbox is all mail: the reply thread plus the one only sent so far.
        assert.equal(count("inbox"), 2);
        assert.equal(count("sent"), 2);
        assert.equal(count("starred"), 1);
    });
});

describe("email HTML safety", () => {
    test("removes scripts, handlers and script links", () => {
        assert.equal(sanitiseEmailHtml('<p onclick="x()">Hi<script>alert(1)</script></p>'), "<p>Hi</p>");
        assert.equal(sanitiseEmailHtml('<a href="javascript:alert(1)">x</a>'), '<a href="#">x</a>');
        assert.equal(sanitiseEmailHtml('<img src=x onerror=alert(1)>'), "<img src=x>");
        assert.equal(sanitiseEmailHtml('<iframe src="https://x"></iframe><b>ok</b>'), "<b>ok</b>");
        assert.equal(sanitiseEmailHtml('<meta http-equiv="refresh" content="0">ok'), "ok");
    });

    test("keeps ordinary email formatting", () => {
        const html = '<table><tr><td style="color:#333"><a href="https://a.co">Link</a></td></tr></table>';
        assert.equal(sanitiseEmailHtml(html), html);
    });

    test("only allows web and mail links", () => {
        assert.equal(safeLinkUrl("example.com"), "https://example.com/");
        assert.equal(safeLinkUrl("a@b.com"), "mailto:a@b.com");
        assert.equal(safeLinkUrl("javascript:alert(1)"), null);
        assert.equal(safeLinkUrl("data:text/html,x"), null);
        assert.equal(escapeHtml('"><b>'), "&quot;&gt;&lt;b&gt;");
    });
});
