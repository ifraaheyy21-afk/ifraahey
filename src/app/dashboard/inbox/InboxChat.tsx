"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
    Archive,
    ArrowUp,
    Check,
    Image as ImageIcon,
    Link2,
    MailOpen,
    MessageSquareText,
    MoreHorizontal,
    Paperclip,
    Phone,
    RotateCcw,
    Search,
    Smile,
    Star,
    Tag,
    Trash2,
    X,
    FileText,
} from "lucide-react";

import type { InboxMessage, InboxThread } from "../../../lib/inbox-data";
import { CHANNEL_META, channelOf } from "./channels";
import styles from "./inbox-page.module.css";

type Props = {
    thread: InboxThread;
    avatarStyle: (name: string) => CSSProperties;
    initials: (name: string) => string;
    draft: string;
    setDraft: (value: string) => void;
    onSend: (text: string, attachment: File | null) => void;
    onToggleStar: () => void;
    onMarkUnread: () => void;
    onArchive: () => void;
    onRestore: () => void;
    onDelete: () => void;
    onSetLabels: (labels: string[]) => void;
};

const EMOJIS = ["😊", "🙏", "👍", "🙌", "🎉", "👋", "😄", "🤝", "✅", "❤️", "🔥", "👀", "💡", "📌", "⏰", "📎", "😅", "🤔", "👌", "✨"];

const DEFAULT_QUICK_REPLIES = [
    "Thanks for reaching out! I'll look into this and get back to you shortly.",
    "Could you share a screenshot so I can take a closer look?",
    "Happy to help. What time works for a quick call?",
    "That's sorted now. Let me know if anything else comes up!",
];

const TAG_SUGGESTIONS = ["Lead", "Billing", "Support", "Urgent", "Partnership"];
const QUICK_REPLIES_KEY = "inbox-quick-replies";

const dayLabel = (value: string) => {
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const short = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date);
    if (date.toDateString() === today.toDateString()) return `Today, ${short}`;
    if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${short}`;
    return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(date);
};

const timeLabel = (value: string) =>
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));

/** Wraps search matches in <mark>. */
function highlight(text: string, query: string): ReactNode {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? <mark key={index} className={styles.searchHit}>{part}</mark> : <Fragment key={index}>{part}</Fragment>);
}

function readQuickReplies() {
    try {
        const stored = JSON.parse(window.localStorage.getItem(QUICK_REPLIES_KEY) ?? "null");
        return Array.isArray(stored) && stored.every((item) => typeof item === "string") ? (stored as string[]) : DEFAULT_QUICK_REPLIES;
    } catch {
        return DEFAULT_QUICK_REPLIES;
    }
}

type Popover = "menu" | "emoji" | "quick" | "tag" | null;

/** A conversation from a messaging channel: header actions, bubbles and a chat composer. */
export default function InboxChat(props: Props) {
    const { thread, avatarStyle, initials, draft, setDraft, onSend, onToggleStar, onMarkUnread, onArchive, onRestore, onDelete, onSetLabels } = props;
    const movedAway = thread.folder === "archived" || thread.folder === "deleted";
    const [popover, setPopover] = useState<Popover>(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [attachment, setAttachment] = useState<File | null>(null);
    const [quickReplies, setQuickReplies] = useState<string[]>(DEFAULT_QUICK_REPLIES);
    const [tagInput, setTagInput] = useState("");
    const [linkCopied, setLinkCopied] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const imageRef = useRef<HTMLInputElement | null>(null);
    const channel = CHANNEL_META[channelOf(thread)];
    const phone = thread.customerHandle?.startsWith("+") ? thread.customerHandle : null;
    const trimmedQuery = query.trim();

    const matches = useMemo(
        () => (trimmedQuery ? thread.messages.filter((message) => message.plainText.toLowerCase().includes(trimmedQuery.toLowerCase())) : []),
        [thread.messages, trimmedQuery],
    );

    // Open at the newest message, and follow new ones.
    useEffect(() => {
        const scroller = scrollRef.current;
        if (scroller && !trimmedQuery) scroller.scrollTop = scroller.scrollHeight;
    }, [thread.id, thread.messages.length, trimmedQuery]);

    // Jump to the first search match.
    useEffect(() => {
        if (!matches.length) return;
        document.getElementById(`chat-message-${matches[0].id}`)?.scrollIntoView({ block: "center" });
    }, [matches]);

    const openPopover = (next: Popover) => {
        if (next === "quick") setQuickReplies(readQuickReplies());
        setPopover((current) => (current === next ? null : next));
    };

    /** Inserts text at the caret in the message box. */
    const insertText = (text: string) => {
        const input = inputRef.current;
        const start = input?.selectionStart ?? draft.length;
        const end = input?.selectionEnd ?? draft.length;
        const next = `${draft.slice(0, start)}${text}${draft.slice(end)}`;
        setDraft(next);
        requestAnimationFrame(() => {
            input?.focus();
            input?.setSelectionRange(start + text.length, start + text.length);
        });
    };

    const saveQuickReply = () => {
        const text = draft.trim();
        if (!text) return;
        const next = [text, ...quickReplies.filter((item) => item !== text)].slice(0, 12);
        setQuickReplies(next);
        try {
            window.localStorage.setItem(QUICK_REPLIES_KEY, JSON.stringify(next));
        } catch {
            // Quick replies still work for this session.
        }
    };

    const addTag = (value: string) => {
        const tag = value.trim();
        if (!tag || thread.labels.some((item) => item.toLowerCase() === tag.toLowerCase())) return;
        onSetLabels([...thread.labels, tag]);
        setTagInput("");
    };

    const copyLink = async () => {
        const url = `${window.location.origin}/dashboard/inbox?channel=${channelOf(thread)}&thread=${encodeURIComponent(thread.id)}`;
        await navigator.clipboard?.writeText(url);
        setLinkCopied(true);
        window.setTimeout(() => setLinkCopied(false), 1400);
    };

    const send = () => {
        const text = draft.trim();
        if (!text && !attachment) return;
        onSend(text, attachment);
        setDraft("");
        setAttachment(null);
        setPopover(null);
    };

    return (
        <div className={styles.chat}>
            {/* ---- Header ---- */}
            <header className={styles.chatHeader}>
                <span className={styles.avatarSmall} style={avatarStyle(thread.customerName)}>{initials(thread.customerName)}</span>
                <span className={styles.chatTitle}>
                    <span className={styles.senderName}>{thread.customerName}</span>
                    <span className={styles.chatSubline}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {channel.logo && <img src={channel.logo} alt="" width={11} height={11} />}
                        {thread.customerHandle ?? channel.label}
                    </span>
                </span>
                {thread.labels.length > 0 && (
                    <span className={styles.chatLabels}>
                        {thread.labels.slice(0, 3).map((label) => <span key={label} className={styles.labelChip}>{label}</span>)}
                    </span>
                )}
                <span className={styles.spacer} />

                {phone && (
                    <a className={styles.iconButton} href={`tel:${phone.replace(/\s+/g, "")}`} aria-label={`Call ${phone}`} title={`Call ${phone}`}>
                        <Phone size={15} />
                    </a>
                )}
                <button type="button" className={styles.iconButton} aria-label="Copy link to this conversation" title={linkCopied ? "Link copied" : "Copy link"} onClick={() => void copyLink()}>
                    {linkCopied ? <Check size={15} /> : <Link2 size={15} />}
                </button>
                <button
                    type="button"
                    className={searchOpen ? styles.iconButtonOn : styles.iconButton}
                    aria-label="Search this conversation"
                    aria-pressed={searchOpen}
                    title="Search"
                    onClick={() => {
                        setSearchOpen((open) => !open);
                        setQuery("");
                    }}
                >
                    <Search size={15} />
                </button>
                <div className={styles.moreWrap}>
                    <button type="button" className={styles.iconButton} aria-label="More actions" aria-haspopup="menu" aria-expanded={popover === "menu"} onClick={() => openPopover("menu")}>
                        <MoreHorizontal size={16} />
                    </button>
                    {popover === "menu" && (
                        <div className={styles.chatMenu} role="menu">
                            <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { setPopover(null); onToggleStar(); }}>
                                <Star size={14} className={thread.starred ? styles.starIcon : undefined} />
                                {thread.starred ? "Unstar" : "Star"}
                            </button>
                            <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { setPopover(null); onMarkUnread(); }}>
                                <MailOpen size={14} />
                                Mark unread
                            </button>
                            {movedAway ? (
                                <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { setPopover(null); onRestore(); }}>
                                    <RotateCcw size={14} />
                                    Move to inbox
                                </button>
                            ) : (
                                <>
                                    <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { setPopover(null); onArchive(); }}>
                                        <Archive size={14} />
                                        Archive
                                    </button>
                                    <div className={styles.menuDivider} />
                                    <button type="button" role="menuitem" className={styles.menuItemDanger} onClick={() => { setPopover(null); onDelete(); }}>
                                        <Trash2 size={14} />
                                        Delete
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </header>

            {searchOpen && (
                <div className={styles.chatSearch}>
                    <Search size={13} aria-hidden="true" />
                    <input
                        autoFocus
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => event.key === "Escape" && setSearchOpen(false)}
                        placeholder="Search this conversation"
                        aria-label="Search this conversation"
                    />
                    {trimmedQuery && <small>{matches.length} {matches.length === 1 ? "match" : "matches"}</small>}
                    <button type="button" className={styles.iconButton} aria-label="Close search" onClick={() => { setSearchOpen(false); setQuery(""); }}>
                        <X size={13} />
                    </button>
                </div>
            )}

            {/* ---- Messages ---- */}
            <div className={styles.chatScroll} ref={scrollRef}>
                {thread.messages.map((message, index) => {
                    const previous: InboxMessage | null = thread.messages[index - 1] ?? null;
                    const newDay = !previous || new Date(previous.sentAt).toDateString() !== new Date(message.sentAt).toDateString();
                    // Messages from the same side within a few minutes are grouped.
                    const grouped = Boolean(
                        previous &&
                        !newDay &&
                        previous.direction === message.direction &&
                        new Date(message.sentAt).getTime() - new Date(previous.sentAt).getTime() < 5 * 60 * 1000,
                    );
                    const outbound = message.direction === "outbound";

                    return (
                        <div key={message.id} id={`chat-message-${message.id}`}>
                            {newDay && <div className={styles.dayChip}><span>{dayLabel(message.sentAt)}</span></div>}
                            <div className={outbound ? styles.bubbleRowOut : styles.bubbleRowIn}>
                                {!outbound && (
                                    <span className={grouped ? styles.avatarSpacer : styles.avatarSmall} style={grouped ? undefined : avatarStyle(thread.customerName)}>
                                        {grouped ? null : initials(thread.customerName)}
                                    </span>
                                )}
                                <div className={styles.bubbleStack}>
                                    {!grouped && (
                                        <span className={styles.bubbleMeta}>
                                            {outbound ? "You" : thread.customerName} · {timeLabel(message.sentAt)}
                                        </span>
                                    )}
                                    {message.attachments?.map((file) =>
                                        file.url && file.mimeType.startsWith("image/") ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img key={file.id} className={styles.bubbleImage} src={file.url} alt={file.fileName} />
                                        ) : (
                                            <a key={file.id} className={styles.bubbleFile} href={file.url} target="_blank" rel="noreferrer">
                                                <FileText size={14} aria-hidden="true" />
                                                <span>{file.fileName}</span>
                                                <small>{file.sizeLabel}</small>
                                            </a>
                                        ))}
                                    {message.plainText && (
                                        <p className={outbound ? styles.bubbleOut : styles.bubbleIn}>{highlight(message.plainText, trimmedQuery)}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ---- Composer ---- */}
            <div className={styles.chatComposer}>
                {attachment && (
                    <div className={styles.draftAttachment}>
                        {attachment.type.startsWith("image/") ? <ImageIcon size={13} /> : <Paperclip size={13} />}
                        <span>{attachment.name}</span>
                        <button type="button" aria-label="Remove attachment" onClick={() => setAttachment(null)}>
                            <X size={12} />
                        </button>
                    </div>
                )}

                <textarea
                    ref={inputRef}
                    className={styles.chatInput}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            send();
                        }
                    }}
                    rows={1}
                    placeholder={`Message ${thread.customerName} on ${channel.label}…`}
                    aria-label={`Message on ${channel.label}`}
                />

                <div className={styles.chatTools}>
                    <div className={styles.moreWrap}>
                        <button type="button" className={styles.formatButton} aria-label="Emoji" title="Emoji" aria-expanded={popover === "emoji"} onClick={() => openPopover("emoji")}>
                            <Smile size={15} />
                        </button>
                        {popover === "emoji" && (
                            <div className={styles.emojiPicker} role="dialog" aria-label="Emoji">
                                {EMOJIS.map((emoji) => (
                                    <button key={emoji} type="button" onClick={() => insertText(emoji)} aria-label={`Insert ${emoji}`}>{emoji}</button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className={styles.moreWrap}>
                        <button type="button" className={styles.formatButton} aria-label="Quick replies" title="Quick replies" aria-expanded={popover === "quick"} onClick={() => openPopover("quick")}>
                            <MessageSquareText size={15} />
                        </button>
                        {popover === "quick" && (
                            <div className={styles.toolPopover} role="dialog" aria-label="Quick replies">
                                <div className={styles.menuLabel}>Quick replies</div>
                                <div className={styles.subList}>
                                    {quickReplies.map((reply) => (
                                        <button key={reply} type="button" className={styles.quickReply} onClick={() => { insertText(reply); setPopover(null); }}>
                                            {reply}
                                        </button>
                                    ))}
                                </div>
                                <button type="button" className={styles.menuLink} disabled={!draft.trim()} onClick={saveQuickReply}>
                                    Save current message as a quick reply
                                </button>
                            </div>
                        )}
                    </div>

                    <div className={styles.moreWrap}>
                        <button type="button" className={styles.formatButton} aria-label="Tags" title="Tag this conversation" aria-expanded={popover === "tag"} onClick={() => openPopover("tag")}>
                            <Tag size={15} />
                        </button>
                        {popover === "tag" && (
                            <div className={styles.toolPopover} role="dialog" aria-label="Tags">
                                <div className={styles.menuLabel}>Tags</div>
                                <div className={styles.tagList}>
                                    {thread.labels.length === 0 && <span className={styles.menuEmpty}>No tags yet</span>}
                                    {thread.labels.map((label) => (
                                        <span key={label} className={styles.labelChip}>
                                            {label}
                                            <button type="button" aria-label={`Remove ${label}`} onClick={() => onSetLabels(thread.labels.filter((item) => item !== label))}>
                                                <X size={10} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <input
                                    className={styles.tagInput}
                                    value={tagInput}
                                    onChange={(event) => setTagInput(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.preventDefault();
                                            addTag(tagInput);
                                        }
                                    }}
                                    placeholder="Add a tag and press Enter"
                                    autoFocus
                                />
                                <div className={styles.tagList}>
                                    {TAG_SUGGESTIONS.filter((tag) => !thread.labels.includes(tag)).map((tag) => (
                                        <button key={tag} type="button" className={styles.tagSuggestion} onClick={() => addTag(tag)}>+ {tag}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <button type="button" className={styles.formatButton} aria-label="Attach a file" title="Attach file" onClick={() => fileRef.current?.click()}>
                        <Paperclip size={15} />
                    </button>
                    <button type="button" className={styles.formatButton} aria-label="Send an image" title="Image" onClick={() => imageRef.current?.click()}>
                        <ImageIcon size={15} />
                    </button>
                    <button
                        type="button"
                        className={styles.formatButton}
                        aria-label="Insert link"
                        title="Link"
                        onClick={() => {
                            const url = window.prompt("Paste the link");
                            if (url?.trim()) insertText(url.trim());
                        }}
                    >
                        <Link2 size={15} />
                    </button>

                    <span className={styles.spacer} />
                    <button type="button" className={styles.sendRound} disabled={!draft.trim() && !attachment} onClick={send} aria-label="Send message">
                        <ArrowUp size={15} />
                    </button>
                </div>

                <input ref={fileRef} type="file" hidden onChange={(event) => { setAttachment(event.target.files?.[0] ?? null); event.target.value = ""; }} />
                <input ref={imageRef} type="file" accept="image/*" hidden onChange={(event) => { setAttachment(event.target.files?.[0] ?? null); event.target.value = ""; }} />

                <p className={styles.chatNote}>
                    {channel.label} isn&apos;t connected yet, so messages you send here stay in this demo conversation.
                </p>
            </div>
        </div>
    );
}
