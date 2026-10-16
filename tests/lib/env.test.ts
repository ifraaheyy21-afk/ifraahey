import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import { checkEnvironment } from "../../src/lib/env";

const REQUIRED = {
    DATABASE_URL: "postgres://user:pass@localhost:5432/db",
    FIREBASE_PROJECT_ID: "project",
    FIREBASE_CLIENT_EMAIL: "svc@project.iam.gserviceaccount.com",
    FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
    INTEGRATION_ENCRYPTION_KEY: "a".repeat(64),
    CRON_SECRET: "x".repeat(32),
    APP_URL: "https://app.example.com",
};

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
    saved = { ...process.env };
    for (const name of [...Object.keys(REQUIRED), "NEXT_PUBLIC_APP_URL"]) delete process.env[name];
});

afterEach(() => {
    process.env = saved;
});

function setNodeEnv(value: string) {
    (process.env as Record<string, string>).NODE_ENV = value;
}

describe("checkEnvironment", () => {
    test("passes with every required value", () => {
        Object.assign(process.env, REQUIRED);
        assert.deepEqual(checkEnvironment().errors, []);
    });

    test("lists each missing required value", () => {
        const { errors } = checkEnvironment();
        for (const name of ["DATABASE_URL", "INTEGRATION_ENCRYPTION_KEY", "CRON_SECRET", "APP_URL or NEXT_PUBLIC_APP_URL"]) {
            assert.ok(errors.some((error) => error.includes(name)), `expected an error for ${name}`);
        }
    });

    test("accepts NEXT_PUBLIC_APP_URL in place of APP_URL", () => {
        Object.assign(process.env, REQUIRED);
        delete process.env.APP_URL;
        process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
        assert.deepEqual(checkEnvironment().errors, []);
    });

    test("rejects a malformed encryption key and a short cron secret", () => {
        Object.assign(process.env, REQUIRED, { INTEGRATION_ENCRYPTION_KEY: "not-hex", CRON_SECRET: "short" });
        const { errors } = checkEnvironment();
        assert.ok(errors.some((error) => error.startsWith("INTEGRATION_ENCRYPTION_KEY")));
        assert.ok(errors.some((error) => error.startsWith("CRON_SECRET")));
    });

    test("requires https in production, except on localhost", () => {
        setNodeEnv("production");
        Object.assign(process.env, REQUIRED, { APP_URL: "http://app.example.com" });
        assert.ok(checkEnvironment().errors.some((error) => error.startsWith("APP_URL")));

        process.env.APP_URL = "http://localhost:3000";
        assert.deepEqual(checkEnvironment().errors, []);
    });

    test("missing optional integrations are warnings, not errors", () => {
        Object.assign(process.env, REQUIRED);
        delete process.env.SLACK_CLIENT_ID;
        const { errors, warnings } = checkEnvironment();
        assert.deepEqual(errors, []);
        assert.ok(warnings.some((warning) => warning.includes("SLACK_CLIENT_ID")));
    });
});
