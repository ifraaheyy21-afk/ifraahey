import { MOVABLE_FOLDERS, type MovableFolder } from "./inbox-folders";

const MAX_LABELS = 20;
const MAX_LABEL_LENGTH = 40;

/** The most threads one bulk request may change. */
export const MAX_BULK_THREADS = 100;

/** A change to one or more threads: pin, read/unread, move, or tag. */
export type ThreadUpdate = {
    /** Stored as "starred"; the inbox shows it as pinned. */
    starred?: boolean;
    read?: boolean;
    /** "archived" or "deleted" moves the thread; null restores it. */
    folder?: MovableFolder | null;
    labels?: string[];
};

/** Validate a JSON update. Returns the update, or an error message. */
export function parseThreadUpdate(body: unknown): ThreadUpdate | string {
    if (!body || typeof body !== "object" || Array.isArray(body)) return "Send a JSON object.";
    const input = body as Record<string, unknown>;
    const update: ThreadUpdate = {};
    if ("starred" in input) {
        if (typeof input.starred !== "boolean") return "starred must be true or false.";
        update.starred = input.starred;
    }
    if ("read" in input) {
        if (typeof input.read !== "boolean") return "read must be true or false.";
        update.read = input.read;
    }
    if ("folder" in input) {
        if (input.folder !== null && !MOVABLE_FOLDERS.includes(input.folder as MovableFolder)) {
            return "folder must be archived, deleted or null.";
        }
        update.folder = input.folder as MovableFolder | null;
    }
    if ("labels" in input) {
        if (!Array.isArray(input.labels) || input.labels.some((label) => typeof label !== "string")) {
            return "labels must be a list of text.";
        }
        const labels = [...new Set((input.labels as string[]).map((label) => label.trim()).filter(Boolean))];
        if (labels.length > MAX_LABELS || labels.some((label) => label.length > MAX_LABEL_LENGTH)) {
            return `Use up to ${MAX_LABELS} tags of ${MAX_LABEL_LENGTH} characters or fewer.`;
        }
        update.labels = labels;
    }
    if (Object.keys(update).length === 0) return "Nothing to update.";
    return update;
}

/** Validate a bulk body: { threadIds: string[], ...update }. */
export function parseBulkThreadUpdate(body: unknown): { threadIds: string[]; update: ThreadUpdate } | string {
    if (!body || typeof body !== "object" || Array.isArray(body)) return "Send a JSON object.";
    const { threadIds, ...rest } = body as Record<string, unknown>;
    if (!Array.isArray(threadIds) || threadIds.length === 0 || threadIds.some((id) => typeof id !== "string")) {
        return "threadIds must be a list of conversation ids.";
    }
    const ids = [...new Set(threadIds as string[])];
    if (ids.length > MAX_BULK_THREADS) return `Change up to ${MAX_BULK_THREADS} conversations at a time.`;
    const update = parseThreadUpdate(rest);
    if (typeof update === "string") return update;
    return { threadIds: ids, update };
}
