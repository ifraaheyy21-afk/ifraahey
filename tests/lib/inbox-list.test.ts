import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { InboxThread } from "../../src/lib/inbox-data";
import { groupThreadsForList, sortThreads } from "../../src/lib/inbox-list";

function thread(id: string, name: string, at: string, overrides: Partial<InboxThread> = {}): InboxThread {
    return {
        id, customerId: null, customerName: name, customerEmail: `${id}@example.com`, customerCompany: null,
        subject: id, preview: "", folder: "inbox", labels: [], unread: false, starred: false, archived: false,
        lastMessageAt: at, messages: [], ...overrides,
    };
}

const now = new Date("2026-10-26T15:00:00");
const threads = [
    thread("a", "Zoe", "2026-10-26T09:00:00"),
    thread("b", "adam", "2026-10-20T09:00:00", { unread: true }),
    thread("c", "Mia", "2026-10-25T09:00:00"),
    thread("d", "Ben", "2026-10-26T12:00:00", { unread: true, starred: true }),
];

describe("sortThreads", () => {
    test("newest, oldest, unread first and sender A–Z", () => {
        assert.deepEqual(sortThreads(threads, "newest").map((t) => t.id), ["d", "a", "c", "b"]);
        assert.deepEqual(sortThreads(threads, "oldest").map((t) => t.id), ["b", "c", "a", "d"]);
        assert.deepEqual(sortThreads(threads, "unread").map((t) => t.id), ["d", "b", "a", "c"]);
        assert.deepEqual(sortThreads(threads, "sender").map((t) => t.id), ["b", "d", "c", "a"]);
    });

    test("does not change the list it is given", () => {
        const copy = [...threads];
        sortThreads(threads, "oldest");
        assert.deepEqual(threads, copy);
    });
});

describe("groupThreadsForList", () => {
    const labels = (order: Parameters<typeof sortThreads>[1]) =>
        groupThreadsForList(sortThreads(threads, order), order, now)
            .map((group) => `${group.label}:${group.threads.map((t) => t.id).join("")}`);

    test("groups by day; starred emails stay in date order", () => {
        assert.deepEqual(labels("newest"), ["Today:da", "Yesterday:c", "This week:b"]);
        assert.deepEqual(labels("oldest"), ["This week:b", "Yesterday:c", "Today:ad"]);
    });

    test("unread first splits New from Already read", () => {
        assert.deepEqual(labels("unread"), ["New:db", "Already read:ac"]);
    });

    test("sender order is one list", () => {
        assert.deepEqual(labels("sender"), ["By sender:bdca"]);
    });
});
