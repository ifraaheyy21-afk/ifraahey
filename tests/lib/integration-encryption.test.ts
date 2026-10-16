import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import {
    isEncryptedIntegrationSecret,
    openToken,
    sealToken,
} from "../../src/lib/integrationEncryption";

before(() => {
    process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

describe("OAuth token encryption", () => {
    test("round-trips and never stores the plaintext", () => {
        const sealed = sealToken("xoxb-secret-token");
        assert.ok(sealed && isEncryptedIntegrationSecret(sealed));
        assert.ok(!sealed.includes("xoxb-secret-token"));
        assert.equal(openToken(sealed), "xoxb-secret-token");
    });

    test("uses a fresh IV each time", () => {
        assert.notEqual(sealToken("same"), sealToken("same"));
    });

    test("passes legacy plaintext rows through unchanged", () => {
        assert.equal(openToken("ya29.legacy-plain-token"), "ya29.legacy-plain-token");
    });

    test("treats empty values as absent", () => {
        assert.equal(sealToken(""), null);
        assert.equal(sealToken(null), null);
        assert.equal(openToken(null), null);
    });

    test("detects tampering", () => {
        const sealed = sealToken("secret")!;
        const parts = sealed.split(".");
        parts[3] = Buffer.from("tampered").toString("base64url");
        assert.throws(() => openToken(parts.join(".")));
    });
});
