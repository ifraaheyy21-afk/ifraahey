// Encrypt integration tokens that were stored before encryption at rest.
//
// Dry run (reports only):
//   node --env-file=.env --env-file=.env.local --import ./scripts/register-ts.mjs scripts/encrypt-integration-tokens.ts
// Write changes:
//   ...same command... --apply
//
// Safe to run more than once: encrypted values are skipped, and each update
// only applies if the row still holds the plaintext it read.
import { prisma } from "../src/lib/prisma";
import {
    isEncryptedIntegrationSecret,
    sealToken,
} from "../src/lib/integrationEncryption";

const apply = process.argv.includes("--apply");

// Resend credentials have always been encrypted, and its webhookUrl is a
// public endpoint, so only OAuth providers are migrated.
const FIELDS = ["accessToken", "refreshToken", "webhookUrl"] as const;
type Field = (typeof FIELDS)[number];

async function main() {
    const rows = await prisma.workspaceIntegration.findMany({
        where: { provider: { not: "resend" } },
        select: { id: true, provider: true, accessToken: true, refreshToken: true, webhookUrl: true },
    });

    let pending = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
        const plaintext = FIELDS.filter((field) => {
            const value = row[field];
            return Boolean(value) && !isEncryptedIntegrationSecret(value!);
        });
        if (plaintext.length === 0) continue;

        pending += 1;
        console.log(`${apply ? "Encrypting" : "Would encrypt"} ${row.provider} ${row.id}: ${plaintext.join(", ")}`);
        if (!apply) continue;

        const where: Record<string, unknown> = { id: row.id };
        const data: Partial<Record<Field, string | null>> = {};
        for (const field of plaintext) {
            where[field] = row[field];
            data[field] = sealToken(row[field]);
        }

        const result = await prisma.workspaceIntegration.updateMany({ where, data });
        if (result.count === 1) updated += 1;
        else skipped += 1; // Reconnected or changed meanwhile; rerun to pick it up.
    }

    console.log(
        apply
            ? `Done: ${updated} encrypted, ${skipped} changed during the run (rerun to retry).`
            : `${pending} integration(s) have plaintext tokens. Rerun with --apply to encrypt them.`,
    );
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
