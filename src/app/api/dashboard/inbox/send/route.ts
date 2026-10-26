import { NextResponse } from "next/server";

import { requireWorkspace } from "../../../../../lib/auth/requireWorkspace";
import { limitInboxSend } from "../../../../../lib/rateLimit";
import { loadInboxThreads } from "../../../../../lib/inbox-store";
import {
    InboxSendError,
    parseSendForm,
    sendInboxEmail,
    sentAttachments,
    sentRecordToMessage,
    withStoragePaths,
    type InboxSentRecord,
} from "../../../../../lib/inbox-send";
import {
    findPendingRfcMessages,
    prismaInboxSentStore,
    saveRfcMessageId,
} from "../../../../../lib/inbox-sent-store";
import { deleteDraftsAfterSend } from "../../../../../lib/inbox-draft-store";
import { prisma } from "../../../../../lib/prisma";
import { getWorkspaceResendClient } from "../../../../../lib/resendIntegration";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
    const auth = await requireWorkspace(request);
    if (auth instanceof NextResponse) return auth;
    const { workspaceId } = auth;
    const limited = await limitInboxSend(workspaceId);
    if (limited) return limited;

    try {
        let form: FormData;
        try {
            form = await request.formData();
        } catch {
            throw new InboxSendError("Send the email as a form with a message body.");
        }

        const input = await parseSendForm(form);
        let record = await sendInboxEmail(
            {
                workspaceId,
                store: prismaInboxSentStore,
                getClient: getWorkspaceResendClient,
                loadThreads: loadInboxThreads,
                findPendingRfcMessages,
                saveRfcMessageId,
                isSuppressed: async (id, email) => Boolean(
                    await prisma.suppression.findUnique({
                        where: { workspaceId_email: { workspaceId: id, email } },
                        select: { id: true },
                    }),
                ),
            },
            input,
        );

        // Keep the files so they can be opened from the thread later. Best
        // effort: the email has already gone.
        record = await keepSentFiles(workspaceId, record, input.attachments);

        // The email is out; a leftover draft would only confuse. Best effort.
        const draftId = typeof form.get("draftId") === "string" ? String(form.get("draftId")).slice(0, 100) : "";
        await deleteDraftsAfterSend(workspaceId, draftId || null, record.threadId).catch((error) => {
            console.error("Failed to remove the sent draft", error instanceof Error ? error.message : error);
        });

        return NextResponse.json(
            {
                threadId: record.threadId,
                // A new email from Compose is its own thread (see inbox-threads.ts).
                sentThreadId: record.threadId ?? `ism_${record.id}`,
                message: sentRecordToMessage(record),
            },
            { status: 200, headers: noStore },
        );
    } catch (error) {
        if (error instanceof InboxSendError) {
            return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
        }
        console.error("Inbox send failed", { workspaceId, errorType: error instanceof Error ? error.name : "unknown" });
        return NextResponse.json(
            { error: "The email could not be sent. Try again in a moment." },
            { status: 500, headers: noStore },
        );
    }
}

async function keepSentFiles(
    workspaceId: string,
    record: InboxSentRecord,
    files: Parameters<typeof import("../../../../../lib/inbox-attachment-store").storeSentAttachments>[2],
): Promise<InboxSentRecord> {
    const meta = sentAttachments(record);
    if (files.length === 0 || meta.length !== files.length || meta.every((item) => item.storagePath)) return record;
    try {
        // Loaded here so a missing Supabase setting can't break sending itself.
        const { storeSentAttachments } = await import("../../../../../lib/inbox-attachment-store");
        const paths = await storeSentAttachments(workspaceId, record.id, files);
        if (!paths.some(Boolean)) return record;
        const attachments = withStoragePaths(meta, paths);
        await prisma.inboxSentMessage.updateMany({ where: { id: record.id, workspaceId }, data: { attachments } });
        return { ...record, attachments };
    } catch (error) {
        console.error("Failed to keep sent attachments", error instanceof Error ? error.message : error);
        return record;
    }
}
