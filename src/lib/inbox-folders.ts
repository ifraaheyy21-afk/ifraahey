// Folder rules shared by the inbox API and the inbox page.
import type { InboxFolder, InboxThread } from "./inbox-data";

/** Folders a user can move a thread into; the rest follow from its messages. */
export const MOVABLE_FOLDERS = ["archived", "deleted"] as const;
export type MovableFolder = (typeof MOVABLE_FOLDERS)[number];

/**
 * Whether a thread belongs in a folder. Starred (shown as "Pinned") and Sent overlap the others,
 * and Inbox is the all-mail view: it also lists conversations you started.
 */
export function threadInFolder(thread: InboxThread, folder: InboxFolder) {
    if (folder === "inbox") {
        return thread.folder === "inbox" || thread.folder === "sent";
    }
    if (folder === "starred") {
        return thread.folder === "starred" || (thread.starred && thread.folder !== "deleted");
    }
    if (folder === "sent" && thread.folder !== "deleted" && thread.folder !== "archived") {
        return thread.folder === "sent" || thread.messages.some(
            (message) => message.direction === "outbound" && message.status !== "scheduled" && message.status !== "failed",
        );
    }
    return thread.folder === folder;
}
