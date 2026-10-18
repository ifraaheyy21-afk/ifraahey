import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { limitInboxSend } from "../../src/lib/rateLimit";

// An in-memory stand-in for the Postgres counter.
function memoryCounter() {
    const counts = new Map<string, number>();
    const keys: string[] = [];
    return {
        keys,
        counter: async (key: string, limit: number) => {
            keys.push(key);
            const count = (counts.get(key) ?? 0) + 1;
            counts.set(key, count);
            return { allowed: count <= limit, retryAfterSeconds: 42 };
        },
    };
}

describe("limitInboxSend", () => {
    test("allows sends under the per-minute limit, then answers 429", async () => {
        const { counter, keys } = memoryCounter();
        for (let i = 0; i < 10; i++) {
            assert.equal(await limitInboxSend("ws_1", counter), null);
        }
        const blocked = await limitInboxSend("ws_1", counter);
        assert.equal(blocked?.status, 429);
        assert.equal(blocked?.headers.get("Retry-After"), "42");
        assert.deepEqual(await blocked?.json(), {
            error: "You've reached the sending limit (10 emails per minute). Try again in a minute.",
            code: "RATE_LIMITED",
        });
        assert.ok(keys.includes("inbox-send:minute:ws_1"));
        assert.ok(keys.includes("inbox-send:day:ws_1"));
    });

    test("counts each workspace separately", async () => {
        const { counter } = memoryCounter();
        for (let i = 0; i < 10; i++) await limitInboxSend("ws_1", counter);
        assert.equal(await limitInboxSend("ws_2", counter), null);
    });

    test("lets the send through if the counter is unavailable", async () => {
        const failing = async () => {
            throw new Error("database down");
        };
        assert.equal(await limitInboxSend("ws_1", failing), null);
    });
});
