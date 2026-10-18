"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import type { InboxMessage } from "../../../lib/inbox-data";
import EmailFrame from "./EmailFrame";
import styles from "./inbox-page.module.css";

type Props = {
    /** Every message before the latest one, oldest first. */
    messages: InboxMessage[];
    avatar: (name: string) => ReactNode;
    formatDate: (value: string) => string;
};

function snippet(text: string) {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > 110 ? `${flat.slice(0, 107)}…` : flat;
}

export function MessageBody({ message }: { message: InboxMessage }) {
    return (
        <>
            {message.authenticationFailed && (
                <p className={styles.authWarning} role="note">
                    This sender could not be verified, so the email may not be from who it says. Check before you act on it.
                </p>
            )}
            {message.html ? <EmailFrame html={message.html} /> : <p className={styles.plainBody}>{message.plainText}</p>}
        </>
    );
}

/** Earlier messages in an email thread, folded to one line each until opened. */
export default function ThreadHistory({ messages, avatar, formatDate }: Props) {
    const [open, setOpen] = useState<string[]>([]);
    const [showAll, setShowAll] = useState(false);
    if (messages.length === 0) return null;

    // Long threads show the first and the last two; the rest fold into one row.
    const hidden = !showAll && messages.length > 4 ? messages.slice(1, -2) : [];
    const visible = hidden.length ? [messages[0], ...messages.slice(-2)] : messages;
    const toggle = (id: string) =>
        setOpen((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

    return (
        <div className={styles.history}>
            {visible.map((message, index) => {
                const expanded = open.includes(message.id);
                return (
                    <div key={message.id}>
                        {hidden.length > 0 && index === 1 && (
                            <button type="button" className={styles.historyMore} onClick={() => setShowAll(true)}>
                                {hidden.length} earlier {hidden.length === 1 ? "message" : "messages"}
                            </button>
                        )}
                        <article className={expanded ? styles.historyItemOpen : styles.historyItem}>
                            <button
                                type="button"
                                className={styles.historyRow}
                                aria-expanded={expanded}
                                onClick={() => toggle(message.id)}
                            >
                                {avatar(message.fromName)}
                                <span className={styles.historyName}>{message.fromName}</span>
                                {!expanded && <span className={styles.historySnippet}>{snippet(message.plainText)}</span>}
                                <time>{formatDate(message.sentAt)}</time>
                                <ChevronDown size={14} className={expanded ? styles.historyChevronOpen : styles.historyChevron} aria-hidden="true" />
                            </button>
                            {expanded && (
                                <div className={styles.historyBody}>
                                    <MessageBody message={message} />
                                </div>
                            )}
                        </article>
                    </div>
                );
            })}
        </div>
    );
}
