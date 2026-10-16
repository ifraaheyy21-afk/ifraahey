// Give a real account's workspace a normal id if it was created with the
// reserved id "demo-workspace". The UI and several API routes treat that id
// as demo mode and show sample data instead of the account's real data.
//
// Every foreign key to Workspace.id is ON UPDATE CASCADE, so one UPDATE moves
// all related rows (automations, runs, customers, integrations, ...).
//
// Dry run:  node --env-file=.env --env-file=.env.local --import ./scripts/register-ts.mjs scripts/rename-demo-workspace.ts
// Apply:    ...same command... --apply
import { randomUUID } from "node:crypto";

import { prisma } from "../src/lib/prisma";

const DEMO_ID = "demo-workspace";
const apply = process.argv.includes("--apply");

async function main() {
    const workspace = await prisma.workspace.findUnique({
        where: { id: DEMO_ID },
        select: {
            userEmail: true,
            _count: { select: { automationWorkflows: true, customers: true, integrations: true, scheduledEmails: true } },
        },
    });

    if (!workspace) {
        console.log(`No workspace uses the id "${DEMO_ID}". Nothing to do.`);
        return;
    }

    if (!workspace.userEmail || workspace.userEmail === "demo@example.com") {
        console.log(`"${DEMO_ID}" is not linked to a real account. Leaving it alone.`);
        return;
    }

    const newId = randomUUID();
    console.log(`Workspace "${DEMO_ID}" belongs to a real account and holds:`, workspace._count);

    if (!apply) {
        console.log(`Would rename it to "${newId}". Rerun with --apply to do it.`);
        return;
    }

    const updated = await prisma.$executeRaw`UPDATE "Workspace" SET "id" = ${newId} WHERE "id" = ${DEMO_ID}`;
    console.log(updated === 1
        ? `Renamed to "${newId}". Reload the app; it picks up the new id automatically.`
        : "No row was updated; it may have been renamed already.");
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
