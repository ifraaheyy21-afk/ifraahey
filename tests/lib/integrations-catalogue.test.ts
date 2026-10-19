import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { CATEGORIES, INTEGRATIONS } from "../../src/lib/integrations-catalogue";

const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
const enumBody = /enum IntegrationProvider \{([^}]*)\}/.exec(schema)?.[1] ?? "";
const PROVIDERS = new Set(enumBody.split(/\s+/).filter(Boolean));

describe("integrations catalogue", () => {
    test("lists every database provider exactly once", () => {
        assert.ok(PROVIDERS.size > 0);
        for (const provider of PROVIDERS) {
            const matches = INTEGRATIONS.filter((item) => item.provider === provider);
            assert.equal(matches.length, 1, provider);
        }
    });

    test("only offers connect for tools the database can store", () => {
        for (const item of INTEGRATIONS) {
            if (item.provider) {
                assert.ok(PROVIDERS.has(item.provider), `${item.id} has an unknown provider`);
                assert.equal(item.id, item.provider);
            }
            if (item.connect || item.manage) {
                assert.ok(item.provider, `${item.id} can connect without a provider`);
            }
        }
    });

    test("ids are unique and every category is known", () => {
        const ids = INTEGRATIONS.map((item) => item.id);
        assert.equal(new Set(ids).size, ids.length);

        const categories = new Set(CATEGORIES.map((entry) => entry.id));
        for (const item of INTEGRATIONS) assert.ok(categories.has(item.category), item.id);
    });
});
