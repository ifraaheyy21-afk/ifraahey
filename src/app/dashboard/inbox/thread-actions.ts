import type { InboxPayload, InboxThread } from "../../../lib/inbox-data";
import type { MovableFolder } from "../../../lib/inbox-folders";

/** A change to one thread, as sent to PATCH /api/dashboard/inbox/threads/:id. */
export type ThreadAction = {
    starred?: boolean;
    read?: boolean;
    /** "archived" or "deleted" moves the thread; null brings it back. */
    folder?: MovableFolder | null;
    labels?: string[];
};

const DEMO_STATE_KEY = "inbox-demo-thread-state";

/** Where a restored thread goes: the inbox when the customer wrote, else Sent. */
function restoredFolder(thread: InboxThread) {
    return thread.messages.some((message) => message.direction === "inbound") ? "inbox" : "sent";
}

export function applyThreadAction(thread: InboxThread, action: ThreadAction): InboxThread {
    const next = { ...thread };
    if (action.starred !== undefined) next.starred = action.starred;
    if (action.read !== undefined) next.unread = !action.read;
    if (action.labels !== undefined) next.labels = [...action.labels];
    if (action.folder !== undefined) {
        next.folder = action.folder ?? restoredFolder(thread);
        next.archived = action.folder === "archived";
    }
    return next;
}

function readDemoState(): Record<string, ThreadAction> {
    try {
        const raw = window.localStorage.getItem(DEMO_STATE_KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : null;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, ThreadAction>) : {};
    } catch {
        return {};
    }
}

/** Sample threads have no server record, so their changes live in this browser. */
export function saveDemoThreadAction(threadId: string, action: ThreadAction) {
    try {
        const state = readDemoState();
        state[threadId] = { ...state[threadId], ...action };
        window.localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(state));
    } catch {
        // The change still applies until the page reloads.
    }
}

export function applyDemoThreadState(payload: InboxPayload): InboxPayload {
    const state = readDemoState();
    if (Object.keys(state).length === 0) return payload;
    return {
        ...payload,
        threads: payload.threads.map((thread) =>
            thread.demo && state[thread.id] ? applyThreadAction(thread, state[thread.id]) : thread,
        ),
    };
}
