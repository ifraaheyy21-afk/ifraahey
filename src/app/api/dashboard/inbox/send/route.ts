import { NextResponse } from "next/server";

import { requireWorkspace } from "../../../../../lib/auth/requireWorkspace";
import { loadInboxThreads } from "../../../../../lib/inbox-store";
import {
    InboxSendError,
    parseSendForm,
    sendInboxEmail,
    sentRecordToMessage,
} from "../../../../../lib/inbox-send";
import {
    findPendingRfcMessages,
    prismaInboxSentStore,
    saveRfcMessageId,
} from "../../../../../lib/inbox-sent-store";
import { prisma } from "../../../../../lib/prisma";
import { getWorkspaceResendClient } from "../../../../../lib/resendIntegration";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
    const auth = await requireWorkspace(request);
    if (auth instanceof NextResponse) return auth;
    const { workspaceId } = auth;

    try {
        let form: FormData;
        try {
            form = await request.formData();
        } catch {
            throw new InboxSendError("Send the email as a form with a message body.");
        }

        const input = await parseSendForm(form);
        const record = await sendInboxEmail(
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
