// Order and group the inbox list. Shared by the inbox page and its tests.
import type { InboxThread } from "./inbox-data";

export type InboxSortOrder = "newest" | "oldest" | "unread" | "sender";

export const INBOX_SORT_OPTIONS: Array<{ value: InboxSortOrder; label: string; short: string }> = [
    { value: "newest", label: "Newest first", short: "Newest" },
    { value: "oldest", label: "Oldest first", short: "Oldest" },
    { value: "unread", label: "Unread first", short: "Unread first" },
    { value: "sender", label: "Sender A–Z", short: "Sender" },
];

export function isInboxSortOrder(value: unknown): value is InboxSortOrder {
    return INBOX_SORT_OPTIONS.some((option) => option.value === value);
}

function time(thread: InboxThread) {
    const value = new Date(thread.lastMessageAt).getTime();
    return Number.isFinite(value) ? value : 0;
}

/** A new array in the chosen order; ties fall back to newest first. */
export function sortThreads(threads: InboxThread[], order: InboxSortOrder): InboxThread[] {
    const newest = (a: InboxThread, b: InboxThread) => time(b) - time(a);
    return [...threads].sort((a, b) => {
        if (order === "oldest") return time(a) - time(b);
        if (order === "unread") return Number(b.unread) - Number(a.unread) || newest(a, b);
        if (order === "sender") {
            return a.customerName.localeCompare(b.customerName, undefined, { sensitivity: "base" }) || newest(a, b);
        }
        return newest(a, b);
    });
}

export type InboxListGroup = { label: string; threads: InboxThread[] };

function dayLabel(thread: InboxThread, now: Date) {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const day = 24 * 60 * 60 * 1000;
    const value = time(thread);
    if (!value) return "Earlier";
    if (value >= startOfToday.getTime()) return "Today";
    if (value >= startOfToday.getTime() - day) return "Yesterday";
    if (value >= startOfToday.getTime() - 6 * day) return "This week";
    return "Earlier";
}

function groupBy(threads: InboxThread[], labelFor: (thread: InboxThread) => string): InboxListGroup[] {
    const groups: InboxListGroup[] = [];
    for (const thread of threads) {
        const label = labelFor(thread);
        const group = groups.find((item) => item.label === label);
        if (group) group.threads.push(thread);
        else groups.push({ label, threads: [thread] });
    }
    return groups;
}

/**
 * Headings for an already-sorted list: by day for date orders, New / Earlier
 * for unread first, and one list for sender order. Starred emails sit in
 * their own group at the top when `starredFirst` is set.
 */
export function groupThreadsForList(
    sorted: InboxThread[],
    order: InboxSortOrder,
    starredFirst: boolean,
    now = new Date(),
): InboxListGroup[] {
    const starred = starredFirst ? sorted.filter((thread) => thread.starred) : [];
    const rest = starredFirst ? sorted.filter((thread) => !thread.starred) : sorted;
    const groups = order === "unread"
        ? groupBy(rest, (thread) => (thread.unread ? "New" : "Already read"))
        : order === "sender"
            ? (rest.length ? [{ label: "By sender", threads: rest }] : [])
            : groupBy(rest, (thread) => dayLabel(thread, now));
    return starred.length ? [{ label: "Starred", threads: starred }, ...groups] : groups;
}
