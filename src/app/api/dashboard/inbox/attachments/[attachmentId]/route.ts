import { NextResponse } from "next/server";

import { requireWorkspace } from "../../../../../../lib/auth/requireWorkspace";
import { prisma } from "../../../../../../lib/prisma";
import { getWorkspaceResendClient } from "../../../../../../lib/resendIntegration";
import { sentAttachments, type InboxSentRecord } from "../../../../../../lib/inbox-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

// Inbox attachment ids look like "rcv_<received message id>_att_<index>"
// (see receivedAttachments in inbox-threads.ts) for files sent to you, and
// "snt_<sent message id>_att_<index>" (sentRecordToMessage) for files you sent.
const ATTACHMENT_ID = /^rcv_([A-Za-z0-9-]{1,64})_att_(\d{1,2})$/;
const SENT_ATTACHMENT_ID = /^snt_([A-Za-z0-9_-]{1,64})_att_(\d{1,2})$/;

function fail(message: string, status: number) {
    return NextResponse.json({ error: message }, { status, headers: noStore });
}

function storedAttachment(value: unknown, index: number) {
    if (!Array.isArray(value)) return null;
    const item = value[index];
    if (!item || typeof item !== "object") return null;
    const entry = item as Record<string, unknown>;
    return typeof entry.id === "string" && entry.id
        ? {
            id: entry.id,
            fileName: typeof entry.fileName === "string" && entry.fileName ? entry.fileName : "attachment",
            mimeType: typeof entry.mimeType === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(entry.mimeType)
                ? entry.mimeType : "application/octet-stream",
        }
        : null;
}

function contentDisposition(fileName: string) {
    const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Download a file that came with a received email. Resend keeps the file;
 * this asks it for a short-lived link and streams the file back, so the
 * browser saves it under its real name.
 */
export async function GET(request: Request, context: { params: Promise<{ attachmentId: string }> }) {
    const auth = await requireWorkspace(request);
    if (auth instanceof NextResponse) return auth;

    const { attachmentId } = await context.params;
    const sentMatch = attachmentId.match(SENT_ATTACHMENT_ID);
    if (sentMatch) return sentAttachment(auth.workspaceId, sentMatch[1], Number(sentMatch[2]));
    const match = attachmentId.match(ATTACHMENT_ID);
    if (!match) return fail("That attachment can't be downloaded.", 404);

    const message = await prisma.inboxReceivedMessage.findFirst({
        where: { id: match[1], workspaceId: auth.workspaceId },
        select: { providerEmailId: true, attachments: true },
    });
    const attachment = message ? storedAttachment(message.attachments, Number(match[2])) : null;
    if (!message || !attachment) return fail("That attachment could not be found.", 404);

    let client: Awaited<ReturnType<typeof getWorkspaceResendClient>>;
    try {
        client = await getWorkspaceResendClient(auth.workspaceId);
    } catch {
        return fail("Connect Resend to download attachments.", 409);
    }

    try {
        const { data, error } = await client.resend.emails.receiving.attachments.get({
            emailId: message.providerEmailId,
            id: attachment.id,
        });
        if (error || !data?.download_url) {
            const status = (error as { statusCode?: number } | null)?.statusCode;
            if (status === 401 || status === 403) {
                return fail("Your Resend key can only send email. Use a full-access key to download attachments.", 403);
            }
            if (status === 404) return fail("Resend no longer has this attachment.", 404);
            return fail("The attachment could not be downloaded. Try again.", 502);
        }
        if (!data.download_url.startsWith("https://")) {
            return fail("The attachment could not be downloaded. Try again.", 502);
        }

        const upstream = await fetch(data.download_url);
        if (!upstream.ok || !upstream.body) {
            return fail("The attachment could not be downloaded. Try again.", 502);
        }

        const headers = new Headers({
            ...noStore,
            "Content-Type": attachment.mimeType,
            "Content-Disposition": contentDisposition(attachment.fileName),
            "X-Content-Type-Options": "nosniff",
        });
        const length = upstream.headers.get("content-length");
        if (length) headers.set("Content-Length", length);
        return new Response(upstream.body, { status: 200, headers });
    } catch (error) {
        console.error("Inbox attachment download failed", error instanceof Error ? error.message : error);
        return fail("The attachment could not be downloaded. Try again.", 502);
    }
}

/** A file you sent, read back from the private attachment bucket. */
async function sentAttachment(workspaceId: string, sentMessageId: string, index: number) {
    const message = await prisma.inboxSentMessage.findFirst({
        where: { id: sentMessageId, workspaceId },
        select: { attachments: true },
    });
    const file = message ? sentAttachments({ attachments: message.attachments } as InboxSentRecord)[index] : undefined;
    // Only the name was kept for this file, or the path points outside the workspace.
    if (!file?.storagePath || !file.storagePath.startsWith(`${workspaceId}/`)) {
        return fail("This file wasn't kept, so only its name is shown.", 404);
    }
    try {
        const { readStoredAttachment } = await import("../../../../../../lib/inbox-attachment-store");
        const blob = await readStoredAttachment(file.storagePath);
        if (!blob) return fail("This file is no longer stored.", 404);
        return new Response(blob.stream(), {
            status: 200,
            headers: {
                ...noStore,
                "Content-Type": /^[\w.+-]+\/[\w.+-]+$/.test(file.mimeType) ? file.mimeType : "application/octet-stream",
                "Content-Disposition": contentDisposition(file.fileName),
                "Content-Length": String(blob.size),
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        console.error("Inbox sent attachment read failed", error instanceof Error ? error.message : error);
        return fail("The attachment could not be opened. Try again.", 502);
    }
}
