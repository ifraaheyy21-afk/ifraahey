import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { friendlyResendError, isFreeEmailDomain, INVALID_KEY_MESSAGE } from "../../src/lib/resend-errors";

describe("isFreeEmailDomain", () => {
    test("flags free mailbox providers in any case", () => {
        assert.equal(isFreeEmailDomain("someone@gmail.com"), true);
        assert.equal(isFreeEmailDomain(" Someone@Outlook.COM "), true);
        assert.equal(isFreeEmailDomain("me@icloud.com"), true);
    });

    test("allows company domains", () => {
        assert.equal(isFreeEmailDomain("hello@cobrai.app"), false);
        assert.equal(isFreeEmailDomain("team@mail.gmail-tools.com"), false);
    });
});

describe("friendlyResendError", () => {
    test("explains an invalid key differently when connecting and sending", () => {
        const error = { name: "validation_error", message: "API key is invalid", statusCode: 400 };
        assert.equal(friendlyResendError(error, "connect"), INVALID_KEY_MESSAGE);
        assert.match(friendlyResendError(error), /saved API key/);
    });

    test("names an unverified sender domain", () => {
        const message = friendlyResendError({
            name: "validation_error",
            message: "The gmail.com domain is not verified. Please, add and verify your domain on https://resend.com/domains",
        });
        assert.match(message, /gmail\.com isn't verified/);
    });

    test("explains the resend.dev test sender limit", () => {
        assert.match(
            friendlyResendError({ message: "You can only send testing emails to your own email address (me@x.com)." }),
            /resend\.dev/,
        );
    });

    test("keeps unknown messages as they are", () => {
        assert.equal(friendlyResendError({ message: "Something new" }), "Something new");
        assert.equal(friendlyResendError(null), "Resend could not process this request.");
    });
});
