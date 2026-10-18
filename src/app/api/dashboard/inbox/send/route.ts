import { NextResponse } from "next/server";

import { requireWorkspace } from "../../../../../lib/auth/requireWorkspace";
import { buildInboxPayload } from "../../../../../lib/inbox-data";
import {
    InboxSendError,
    parseSendForm,
    sendInboxEmail,
    sentRecordToMessage,
} from "../../../../../lib/inbox-send";
import { prismaInboxSentStore } from "../../../../../lib/inbox-sent-store";
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
                loadThreads: async (id) => buildInboxPayload(id).threads,
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
                sentThreadId: `sent_thread_${record.id}`,
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
