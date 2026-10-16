import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import crypto from "crypto";

export const runtime = "nodejs";

function getSecret() {
    return process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || "";
}

function createToken(workspaceId: string, customerId: string, email: string) {
    return crypto
        .createHmac("sha256", getSecret())
        .update(`${workspaceId}:${customerId}:${email.toLowerCase()}`)
        .digest("hex");
}

function htmlResponse(title: string, message: string) {
    return new NextResponse(
        `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
</head>
<body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:40px;color:#111827;">
  <main style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:28px;box-shadow:0 16px 40px rgba(15,23,42,.08);">
    <h1 style="font-size:22px;margin:0 0 10px;">${title}</h1>
    <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:0;">${message}</p>
  </main>
</body>
</html>`,
        {
            status: 200,
            headers: { "Content-Type": "text/html" },
        }
    );
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);

        const workspaceId = searchParams.get("workspaceId");
        const customerId = searchParams.get("customerId");
        const email = searchParams.get("email");
        const token = searchParams.get("token");

        if (!workspaceId || !customerId || !email || !token) {
            return htmlResponse("Invalid unsubscribe link", "This unsubscribe link is missing required information.");
        }

        const expectedToken = createToken(workspaceId, customerId, email);

        if (token !== expectedToken) {
            return htmlResponse("Invalid unsubscribe link", "This unsubscribe link could not be verified.");
        }

        const customer = await prisma.customer.findFirst({
            where: {
                id: customerId,
                workspaceId,
                email: {
                    equals: email,
                    mode: "insensitive",
                },
            },
        });

        if (!customer) {
            return htmlResponse("Already unsubscribed", "This email is no longer active in this workspace.");
        }

        await prisma.$transaction([
            prisma.customer.update({
                where: { id: customer.id },
                data: { unsubscribedAt: new Date() },
            }),

            prisma.suppression.upsert({
                where: {
                    workspaceId_email: {
                        workspaceId,
                        email: email.toLowerCase(),
                    },
                },
                update: {
                    reason: "Unsubscribed",
                },
                create: {
                    workspaceId,
                    email: email.toLowerCase(),
                    reason: "Unsubscribed",
                },
            }),

            prisma.emailEvent.create({
                data: {
                    workspaceId,
                    customerId: customer.id,
                    emailType: "unsubscribe",
                    subject: "Customer unsubscribed",
                    status: "unsubscribed",
                    reason: "Customer clicked unsubscribe link",
                },
            }),
        ]);

        return htmlResponse(
            "You have been unsubscribed",
            "You will no longer receive these emails."
        );
    } catch (error) {
        console.error("Unsubscribe error:", error);
        return htmlResponse("Something went wrong", "We could not process this unsubscribe request.");
    }
}