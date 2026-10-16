import { prisma } from "./prisma";

export const DEMO_WORKSPACE_ID = "demo-workspace";

export async function getOrCreateWorkspaceFromRequest(req: Request) {
    const userEmail = req.headers.get("x-user-email");

    if (!userEmail) {
        return prisma.workspace.upsert({
            where: { id: DEMO_WORKSPACE_ID },
            update: {},
            create: {
                id: DEMO_WORKSPACE_ID,
                name: "Demo Workspace",
                userEmail: "demo@example.com",
            },
        });
    }

    return prisma.workspace.upsert({
        where: { userEmail },
        update: {},
        create: {
            userEmail,
            name: `${userEmail.split("@")[0]}'s Workspace`,
        },
    });
}