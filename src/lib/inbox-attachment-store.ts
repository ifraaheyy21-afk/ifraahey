// Files sent from the inbox, kept in a private Supabase Storage bucket so
// they can be opened again later. Server only: uses the service-role key.
import { supabaseAdmin } from "./supabase";
import { MAX_ATTACHMENT_BYTES, type InboxSendAttachment } from "./inbox-send";

export const INBOX_ATTACHMENTS_BUCKET = "inbox-attachments";

let bucketReady: Promise<void> | null = null;

/** Create the private bucket the first time it's needed. */
function ensureBucket() {
    bucketReady ??= (async () => {
        const { data } = await supabaseAdmin.storage.getBucket(INBOX_ATTACHMENTS_BUCKET);
        if (data) return;
        const { error } = await supabaseAdmin.storage.createBucket(INBOX_ATTACHMENTS_BUCKET, {
            public: false,
            fileSizeLimit: MAX_ATTACHMENT_BYTES,
        });
        if (error && !/already exists/i.test(error.message)) throw error;
    })().catch((error: unknown) => {
        bucketReady = null;
        throw error;
    });
    return bucketReady;
}

/** Where a sent file lives: always under its workspace's folder. */
export function sentAttachmentPath(workspaceId: string, sentMessageId: string, index: number, fileName: string) {
    const safeName = fileName.replace(/[^\w.\- ]+/g, "_").slice(-120) || "file";
    return `${workspaceId}/${sentMessageId}/${index}-${safeName}`;
}

/**
 * Save the files of a sent email. Returns each file's path, or null where
 * saving failed; a failure never undoes the send.
 */
export async function storeSentAttachments(
    workspaceId: string,
    sentMessageId: string,
    files: InboxSendAttachment[],
): Promise<Array<string | null>> {
    if (files.length === 0) return [];
    try {
        await ensureBucket();
    } catch (error) {
        console.error("Inbox attachment bucket unavailable", error instanceof Error ? error.message : error);
        return files.map(() => null);
    }
    return Promise.all(files.map(async (file, index) => {
        const path = sentAttachmentPath(workspaceId, sentMessageId, index, file.fileName);
        const { error } = await supabaseAdmin.storage.from(INBOX_ATTACHMENTS_BUCKET).upload(path, file.content, {
            contentType: file.mimeType,
            upsert: true,
        });
        if (error) {
            console.error("Failed to store a sent attachment", error.message);
            return null;
        }
        return path;
    }));
}

/** Read a stored sent file, or null if it isn't there. */
export async function readStoredAttachment(path: string) {
    const { data, error } = await supabaseAdmin.storage.from(INBOX_ATTACHMENTS_BUCKET).download(path);
    return error || !data ? null : data;
}
