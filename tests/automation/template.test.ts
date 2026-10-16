import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { plainTextToHtml, renderTemplate } from "../../src/lib/automation/template";

describe("email templates", () => {
    test("fills variables, including nested trigger data", () => {
        const context = { first_name: "Ada", trigger: { amount: "£49" } };
        assert.equal(renderTemplate("Hi {{first_name}}, {{ trigger.amount }} failed", context), "Hi Ada, £49 failed");
    });

    test("leaves unknown variables visible instead of blanking them", () => {
        assert.equal(renderTemplate("Hi {{missing}}", {}), "Hi {{missing}}");
    });

    test("escapes HTML so customer data cannot inject markup", () => {
        assert.equal(plainTextToHtml('<b>"x"</b>\nline'), "<p>&lt;b&gt;&quot;x&quot;&lt;/b&gt;<br />line</p>");
    });
});
