import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { InboxThread } from "../../src/lib/inbox-data";
import {
    InboxSendError,
    MAX_ATTACHMENT_BYTES,
    inboxIdempotencyKey,
    parseSendForm,
    sanitiseEmailHtml,
    sendInboxEmail,
    sentRecordToMessage,
    withStoragePaths,
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
        attachments: [],
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
        assert.equal(parsed.attachments[0]?.fileName, "notes.txt");
        assert.equal(parsed.attachments[0]?.content.toString(), "hello");
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
            attachments: [{ fileName: "a.txt", mimeType: "text/plain", size: 2, content: Buffer.from("hi") }],
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

test("sanitiseEmailHtml keeps ordinary formatting", () => {
    const html = '<p><strong>Hi</strong><br><a href="https://cobrai.test">link</a></p>';
    assert.equal(sanitiseEmailHtml(html), html);
});

describe("RFC Message-ID lookup", () => {
    // Adds Resend's emails.get and the two optional store hooks to setup().
    function withLookup(lookup: (id: string) => Promise<{ data?: { message_id?: string } | null; error?: unknown }>) {
        const base = setup();
        const saved: Array<[string, string]> = [];
        const pendingAsked: string[][] = [];
        const getClient = base.deps.getClient;
        base.deps.getClient = async (id) => {
            const client = await getClient(id);
            client.resend.emails.get = lookup;
            return client;
        };
        base.deps.findPendingRfcMessages = async (_workspaceId, messageIds) => {
            pendingAsked.push(messageIds);
            return messageIds.filter((id) => id === "sent_earlier").map((messageId) => ({ messageId, providerMessageId: "re_earlier" }));
        };
        base.deps.saveRfcMessageId = async (_workspaceId, messageId, rfc) => {
            saved.push([messageId, rfc]);
        };
        return { ...base, saved, pendingAsked };
    }

    const earlierReply = {
        id: "sent_earlier",
        direction: "outbound" as const,
        fromName: "Cobrai",
        fromEmail: "team@cobrai.test",
        toName: "Sofia Reyes",
        toEmail: "sofia@example.com",
        sentAt: "2026-10-17T09:30:00.000Z",
        status: "sent" as const,
        html: null,
        plainText: "On it",
    };

    test("stores the new email's Message-ID right after sending", async () => {
        const { deps, saved } = withLookup(async (id) => ({ data: { message_id: `<${id}@resend.dev>` } }));
        const record = await sendInboxEmail(deps, input());
        assert.deepEqual(saved, [[`sent_${record.id}`, "<re_123@resend.dev>"]]);
        assert.equal(record.providerRfcMessageId, "<re_123@resend.dev>");
    });

    test("a reply fetches a missing Message-ID so it threads under our earlier message", async () => {
        const { deps, calls, saved, pendingAsked } = withLookup(async (id) => ({ data: { message_id: `<${id}@resend.dev>` } }));
        deps.loadThreads = async () => [thread({ messages: [...thread().messages, earlierReply] })];

        await sendInboxEmail(deps, input());

        assert.deepEqual(pendingAsked, [["sent_earlier"]]);
        assert.deepEqual(saved[0], ["sent_earlier", "<re_earlier@resend.dev>"]);
        assert.deepEqual(calls[0].payload.headers, {
            "X-Workspace-ID": WORKSPACE,
            "In-Reply-To": "<re_earlier@resend.dev>",
            References: "<abc123@mail.example.com> <re_earlier@resend.dev>",
        });
    });

    test("a failed lookup never blocks the send", async () => {
        const { deps, calls, saved } = withLookup(async () => {
            throw new Error("network");
        });
        deps.loadThreads = async () => [thread({ messages: [...thread().messages, earlierReply] })];

        const record = await sendInboxEmail(deps, input());
        assert.equal(record.status, "sent");
        assert.equal(saved.length, 0);
        // Falls back to the customer's message, which already had an id.
        assert.equal(calls[0].payload.headers?.["In-Reply-To" as never], "<abc123@mail.example.com>");
    });

    test("ignores a Message-ID that isn't a real address-style id", async () => {
        const { deps, saved } = withLookup(async () => ({ data: { message_id: "not-an-id" } }));
        await sendInboxEmail(deps, input());
        assert.equal(saved.length, 0);
    });
});

test("a sending-only Resend key stops further Message-ID lookups", async () => {
    let lookups = 0;
    const memory = memoryStore();
    const earlier = (id: string) => ({
        id, direction: "outbound" as const, fromName: "Cobrai", fromEmail: "team@cobrai.test",
        toName: "Sofia", toEmail: "sofia@example.com", sentAt: "2026-10-17T09:30:00.000Z",
        status: "sent" as const, html: null, plainText: "x",
    });
    const record = await sendInboxEmail({
        workspaceId: WORKSPACE,
        store: memory.store,
        loadThreads: async () => [thread({ messages: [...thread().messages, earlier("sent_a"), earlier("sent_b")] })],
        isSuppressed: async () => false,
        findPendingRfcMessages: async (_ws, ids) => ids.map((messageId) => ({ messageId, providerMessageId: `re_${messageId}` })),
        saveRfcMessageId: async () => assert.fail("nothing should be saved"),
        getClient: async () => ({
            metadata: { senderEmail: "team@cobrai.test" },
            resend: {
                emails: {
                    send: async () => ({ data: { id: "re_new" }, error: null }),
                    get: async () => {
                        lookups += 1;
                        return { data: null, error: { name: "restricted_api_key", message: "This API key is restricted to only send emails" } };
                    },
                },
            },
        }),
    }, input());
    assert.equal(record.status, "sent");
    // One failed lookup for the thread, one after sending; not one per message.
    assert.equal(lookups, 2);
});

describe("several attachments", () => {
    function filesForm(files: File[]) {
        const data = new FormData();
        data.set("sendKey", "draft_key_0001");
        data.set("threadId", "thread_1");
        data.set("html", "<p>Files attached</p>");
        for (const file of files) data.append("attachment", file);
        return data;
    }

    test("reads every attached file", async () => {
        const parsed = await parseSendForm(filesForm([
            new File(["a"], "a.txt", { type: "text/plain" }),
            new File(["bb"], "b.pdf", { type: "application/pdf" }),
        ]));
        assert.deepEqual(parsed.attachments.map((file) => [file.fileName, file.size]), [["a.txt", 1], ["b.pdf", 2]]);
    });

    test("rejects more than five files", async () => {
        const files = Array.from({ length: 6 }, (_, i) => new File(["x"], `f${i}.txt`));
        await assert.rejects(parseSendForm(filesForm(files)), { status: 413, message: "Attach up to 5 files per email." });
    });

    test("rejects files that add up to more than 20 MB", async () => {
        const nineMb = () => new File([new Uint8Array(9 * 1024 * 1024)], "big.bin");
        await assert.rejects(parseSendForm(filesForm([nineMb(), nineMb(), nineMb()])), {
            status: 413, message: "Attachments can add up to 20 MB per email.",
        });
    });

    test("sends every file and lists them all on the sent message", async () => {
        const { deps, calls } = setup();
        const record = await sendInboxEmail(deps, input({
            attachments: [
                { fileName: "a.txt", mimeType: "text/plain", size: 1, content: Buffer.from("a") },
                { fileName: "b.pdf", mimeType: "application/pdf", size: 2048, content: Buffer.from("bb") },
            ],
        }));
        assert.equal((calls[0].payload.attachments as unknown[]).length, 2);
        assert.deepEqual(record.attachments, [
            { fileName: "a.txt", mimeType: "text/plain", size: 1 },
            { fileName: "b.pdf", mimeType: "application/pdf", size: 2048 },
        ]);
        assert.deepEqual(sentRecordToMessage(record).attachments?.map((file) => [file.fileName, file.sizeLabel]), [
            ["a.txt", "1 B"],
            ["b.pdf", "2 KB"],
        ]);
    });

    test("older rows with one stored file still show it", () => {
        const message = sentRecordToMessage({
            id: "old", workspaceId: WORKSPACE, sendKey: "k", threadId: null, toEmail: "a@b.co", toName: null,
            fromEmail: "t@c.co", fromName: null, subject: "s", html: "", plainText: "", inReplyTo: null,
            attachmentName: "report.pdf", attachmentMimeType: "application/pdf", attachmentSize: 4096,
            status: "sent", failureReason: null, providerMessageId: "re_1", sentAt: new Date(), createdAt: new Date(),
        });
        assert.deepEqual(message.attachments?.map((file) => file.fileName), ["report.pdf"]);
    });
});

describe("kept sent files", () => {
    const base = {
        id: "s1", workspaceId: WORKSPACE, sendKey: "k", threadId: null, toEmail: "a@b.co", toName: null,
        fromEmail: "t@c.co", fromName: null, subject: "s", html: "", plainText: "", inReplyTo: null,
        attachmentName: "a.txt", attachmentMimeType: "text/plain", attachmentSize: 1,
        status: "sent", failureReason: null, providerMessageId: "re_1", sentAt: new Date(), createdAt: new Date(),
    };

    test("withStoragePaths records only the files that were saved", () => {
        const meta = [
            { fileName: "a.txt", mimeType: "text/plain", size: 1 },
            { fileName: "b.png", mimeType: "image/png", size: 2 },
        ];
        assert.deepEqual(withStoragePaths(meta, ["ws_1/s1/0-a.txt", null]), [
            { fileName: "a.txt", mimeType: "text/plain", size: 1, storagePath: "ws_1/s1/0-a.txt" },
            { fileName: "b.png", mimeType: "image/png", size: 2 },
        ]);
    });

    test("kept files are marked so the inbox can open them; the path stays on the server", () => {
        const message = sentRecordToMessage({
            ...base,
            attachments: [
                { fileName: "a.txt", mimeType: "text/plain", size: 1, storagePath: "ws_1/s1/0-a.txt" },
                { fileName: "b.png", mimeType: "image/png", size: 2 },
            ],
        });
        assert.deepEqual(message.attachments, [
            { id: "snt_s1_att_0", fileName: "a.txt", mimeType: "text/plain", sizeLabel: "1 B", stored: true },
            { id: "snt_s1_att_1", fileName: "b.png", mimeType: "image/png", sizeLabel: "2 B" },
        ]);
        assert.equal(JSON.stringify(message).includes("storagePath"), false);
    });
});
