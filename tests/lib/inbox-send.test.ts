import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { InboxPayload, InboxThread } from "../../src/lib/inbox-data";
import {
    InboxSendError,
    MAX_ATTACHMENT_BYTES,
    inboxIdempotencyKey,
    mergeSentMessages,
    parseSendForm,
    sanitiseEmailHtml,
    sendInboxEmail,
    type InboxSendDeps,
    type InboxSendInput,
    type InboxSentCreate,
    type InboxSentRecord,
} from "../../src/lib/inbox-send";

const WORKSPACE = "ws_1";

function thread(overrides: Partial<InboxThread> = {}): InboxThread {
    return {
        id: "thread_1",
        customerId: "customer_1",
        customerName: "Sofia Reyes",
        customerEmail: "sofia@example.com",
        customerCompany: "Altitude",
        subject: "Dashboard mismatch",
        preview: "The totals differ",
        folder: "inbox",
        labels: [],
        unread: false,
        starred: false,
        archived: false,
        lastMessageAt: "2026-10-17T09:00:00.000Z",
        messages: [{
            id: "m1",
            direction: "inbound",
            fromName: "Sofia Reyes",
            fromEmail: "sofia@example.com",
            toName: "Team",
            toEmail: "team@cobrai.test",
            sentAt: "2026-10-17T09:00:00.000Z",
            status: "received",
            html: null,
            plainText: "The totals differ",
            providerMessageId: "<abc123@mail.example.com>",
        }],
        ...overrides,
    };
}

function memoryStore() {
    const rows: InboxSentRecord[] = [];
    let next = 1;
    return {
        rows,
        store: {
            async findBySendKey(workspaceId: string, sendKey: string) {
                return rows.find((r) => r.workspaceId === workspaceId && r.sendKey === sendKey) ?? null;
            },
            async create(data: InboxSentCreate) {
                if (rows.some((r) => r.workspaceId === data.workspaceId && r.sendKey === data.sendKey)) {
                    throw new Error("unique");
                }
                const row: InboxSentRecord = {
                    ...data, id: `row_${next++}`, status: "sending", failureReason: null,
                    providerMessageId: null, sentAt: null, createdAt: new Date("2026-10-17T10:00:00.000Z"),
                };
                rows.push(row);
                return row;
            },
            async retry(id: string, data: InboxSentCreate) {
                const row = rows.find((r) => r.id === id && r.status === "failed");
                if (!row) throw new Error("claimed");
                Object.assign(row, data, { status: "sending", failureReason: null });
                return row;
            },
            async markSent(id: string, providerMessageId: string) {
                const row = rows.find((r) => r.id === id)!;
                Object.assign(row, { status: "sent", providerMessageId, sentAt: new Date("2026-10-17T10:00:01.000Z") });
                return row;
            },
            async markFailed(id: string, reason: string) {
                Object.assign(rows.find((r) => r.id === id)!, { status: "failed", failureReason: reason });
            },
        },
    };
}

type SendCall = { payload: Record<string, unknown>; options: { idempotencyKey: string } };

function setup(options: {
    result?: () => Promise<{ data?: { id?: string } | null; error?: { message?: string } | null }>;
    metadata?: unknown;
    suppressed?: boolean;
    clientError?: Error;
} = {}) {
    const calls: SendCall[] = [];
    const memory = memoryStore();
    const deps: InboxSendDeps = {
        workspaceId: WORKSPACE,
        store: memory.store,
        loadThreads: async () => [thread()],
        isSuppressed: async () => options.suppressed ?? false,
        getClient: async () => {
            if (options.clientError) throw options.clientError;
            return {
                metadata: options.metadata ?? { senderEmail: "team@cobrai.test", senderName: "Cobrai" },
                resend: {
                    emails: {
                        async send(payload, sendOptions) {
                            calls.push({ payload, options: sendOptions });
                            return options.result ? options.result() : { data: { id: "re_123" }, error: null };
                        },
                    },
                },
            };
        },
    };
    return { deps, calls, rows: memory.rows };
}

function input(overrides: Partial<InboxSendInput> = {}): InboxSendInput {
    return {
        sendKey: "draft_key_0001",
        threadId: "thread_1",
        toEmail: "",
        toName: null,
        subject: "",
        html: "<p>Thanks, looking into it.</p>",
        attachment: null,
        ...overrides,
    };
}

function form(fields: Record<string, string | Blob>) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
}

describe("parseSendForm", () => {
    test("rejects an empty body", async () => {
        await assert.rejects(
            parseSendForm(form({ sendKey: "draft_key_0001", threadId: "thread_1", html: "<p><br></p>" })),
            { message: "Write a message before sending." },
        );
    });

    test("rejects a missing recipient", async () => {
        await assert.rejects(
            parseSendForm(form({ sendKey: "draft_key_0001", subject: "Hi", html: "<p>Hello</p>" })),
            { message: "Choose a recipient before sending." },
        );
    });

    test("rejects an invalid recipient address", async () => {
        await assert.rejects(
            parseSendForm(form({ sendKey: "draft_key_0001", to: "not-an-email", html: "<p>Hello</p>" })),
            { message: "The recipient email address is not valid." },
        );
    });

    test("rejects an oversized attachment with 413", async () => {
        const big = new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], "big.pdf", { type: "application/pdf" });
        await assert.rejects(
            parseSendForm(form({ sendKey: "draft_key_0001", threadId: "thread_1", html: "<p>Hi</p>", attachment: big })),
            (error: unknown) => error instanceof InboxSendError && error.status === 413 &&
                error.message === "Attachments must be 10 MB or smaller.",
        );
    });

    test("reads a compose email with one attachment", async () => {
        const file = new File(["hello"], "notes.txt", { type: "text/plain" });
        const parsed = await parseSendForm(form({
            sendKey: "draft_key_0001", to: " Dan@Example.com ", toName: "Dan",
            subject: "Report", html: "<p>See attached</p>", attachment: file,
        }));
        assert.equal(parsed.toEmail, "dan@example.com");
        assert.equal(parsed.threadId, null);
        assert.equal(parsed.attachment?.fileName, "notes.txt");
        assert.equal(parsed.attachment?.content.toString(), "hello");
    });
});

describe("sendInboxEmail", () => {
    test("replies to the thread's customer with reply headers and an idempotency key", async () => {
        const { deps, calls, rows } = setup();
        const record = await sendInboxEmail(deps, input({ toEmail: "attacker@evil.test" }));

        assert.equal(calls.length, 1);
        const [{ payload, options }] = calls;
        assert.equal(payload.to, "sofia@example.com");
        assert.equal(payload.from, "Cobrai <team@cobrai.test>");
        assert.equal(payload.subject, "Re: Dashboard mismatch");
        assert.deepEqual(payload.headers, {
            "X-Workspace-ID": WORKSPACE,
            "In-Reply-To": "<abc123@mail.example.com>",
            References: "<abc123@mail.example.com>",
        });
        assert.equal(options.idempotencyKey, inboxIdempotencyKey(WORKSPACE, "draft_key_0001"));
        assert.equal(record.status, "sent");
        assert.equal(record.providerMessageId, "re_123");
        assert.equal(rows[0].threadId, "thread_1");
    });

    test("omits reply headers when the thread has no provider message id", async () => {
        const { deps, calls } = setup();
        deps.loadThreads = async () => [thread({ messages: thread().messages.map((m) => ({ ...m, providerMessageId: undefined })) })];
        await sendInboxEmail(deps, input());
        assert.deepEqual(calls[0].payload.headers, { "X-Workspace-ID": WORKSPACE });
    });

    test("sends a new email with an attachment", async () => {
        const { deps, calls } = setup();
        await sendInboxEmail(deps, input({
            threadId: null, toEmail: "dan@example.com", toName: "Dan", subject: "Report",
            attachment: { fileName: "a.txt", mimeType: "text/plain", size: 2, content: Buffer.from("hi") },
        }));
        assert.equal(calls[0].payload.to, "dan@example.com");
        assert.deepEqual(calls[0].payload.attachments, [{ filename: "a.txt", content: Buffer.from("hi"), contentType: "text/plain" }]);
    });

    test("requires a subject for a new email", async () => {
        const { deps, calls } = setup();
        await assert.rejects(
            sendInboxEmail(deps, input({ threadId: null, toEmail: "dan@example.com" })),
            { message: "Add a subject before sending." },
        );
        assert.equal(calls.length, 0);
    });

    test("rejects an unknown thread", async () => {
        const { deps } = setup();
        await assert.rejects(sendInboxEmail(deps, input({ threadId: "thread_other" })), { status: 404 });
    });

    test("does not send to a suppressed recipient", async () => {
        const { deps, calls } = setup({ suppressed: true });
        await assert.rejects(sendInboxEmail(deps, input()), { status: 409 });
        assert.equal(calls.length, 0);
    });

    test("reports a missing Resend connection", async () => {
        const { deps } = setup({ clientError: new Error("Resend is not connected for this workspace.") });
        await assert.rejects(sendInboxEmail(deps, input()), {
            status: 409, message: "Resend is not connected for this workspace.",
        });
    });

    test("records a provider error and lets the same draft retry with the same key", async () => {
        let fail = true;
        const { deps, calls, rows } = setup({
            result: async () => fail ? { data: null, error: { message: "Domain not verified" } } : { data: { id: "re_9" }, error: null },
        });
        await assert.rejects(sendInboxEmail(deps, input()), { status: 502, message: "Domain not verified" });
        assert.equal(rows[0].status, "failed");

        fail = false;
        const record = await sendInboxEmail(deps, input());
        assert.equal(record.status, "sent");
        assert.equal(rows.length, 1);
        assert.equal(calls[0].options.idempotencyKey, calls[1].options.idempotencyKey);
    });

    test("returns the recorded email instead of sending a draft twice", async () => {
        const { deps, calls } = setup();
        await sendInboxEmail(deps, input());
        const again = await sendInboxEmail(deps, input());
        assert.equal(calls.length, 1);
        assert.equal(again.providerMessageId, "re_123");
    });

    test("strips script from the stored and sent HTML", async () => {
        const { deps, calls } = setup();
        await sendInboxEmail(deps, input({ html: '<p onclick="x()">Hi<script>alert(1)</script> <a href="javascript:x()">l</a></p>' }));
        assert.equal(calls[0].payload.html, "<p>Hi <a>l</a></p>");
        assert.equal(calls[0].payload.text, "Hi l");
    });
});

describe("mergeSentMessages", () => {
    test("adds a reply to its thread and a copy to the Sent folder", async () => {
        const { deps, rows } = setup();
        await sendInboxEmail(deps, input());
        const payload: InboxPayload = {
            workspaceId: WORKSPACE,
            folders: [{ folder: "inbox", count: 1 }, { folder: "sent", count: 0 }],
            threads: [thread()],
        };

        const merged = mergeSentMessages(payload, rows);
        const inboxThread = merged.threads.find((t) => t.id === "thread_1")!;
        assert.equal(inboxThread.messages.length, 2);
        assert.equal(inboxThread.messages[1].direction, "outbound");
        assert.equal(inboxThread.preview, "Thanks, looking into it.");
        assert.equal(inboxThread.lastMessageAt, "2026-10-17T10:00:01.000Z");

        const sent = merged.threads.filter((t) => t.folder === "sent");
        assert.equal(sent.length, 1);
        assert.equal(sent[0].customerEmail, "sofia@example.com");
        assert.deepEqual(merged.folders, [{ folder: "inbox", count: 1 }, { folder: "sent", count: 1 }]);
        // The input payload is not mutated.
        assert.equal(payload.threads[0].messages.length, 1);
    });

    test("ignores sends that did not go out", () => {
        const payload: InboxPayload = { workspaceId: WORKSPACE, folders: [], threads: [thread()] };
        const failed = {
            id: "x", workspaceId: WORKSPACE, sendKey: "k", threadId: "thread_1", toEmail: "a@b.co", toName: null,
            fromEmail: "t@c.co", fromName: null, subject: "s", html: "", plainText: "", inReplyTo: null,
            attachmentName: null, attachmentMimeType: null, attachmentSize: null, status: "failed",
            failureReason: "x", providerMessageId: null, sentAt: null, createdAt: new Date(),
        };
        assert.equal(mergeSentMessages(payload, [failed]), payload);
    });
});

test("sanitiseEmailHtml keeps ordinary formatting", () => {
    const html = '<p><strong>Hi</strong><br><a href="https://cobrai.test">link</a></p>';
    assert.equal(sanitiseEmailHtml(html), html);
});
