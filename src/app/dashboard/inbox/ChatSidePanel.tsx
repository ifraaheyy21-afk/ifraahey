"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
    ArrowUp,
    Check,
    ChevronDown,
    Copy,
    FileText,
    Loader2,
    Mail,
    PanelRightClose,
    Pencil,
    Plus,
    Sparkles,
    Trash2,
    UserRound,
} from "lucide-react";

import type { InboxThread } from "../../../lib/inbox-data";
import { CHANNEL_META, channelOf } from "./channels";
import styles from "./inbox-page.module.css";

/** Profile edits for one conversation, kept in this browser. */
export type ContactEdits = {
    customerName?: string;
    customerTitle?: string;
    customerCompany?: string;
    customerEmail?: string;
    customerHandle?: string;
    customerLocation?: string;
    customerTimeZone?: string;
    customerLanguages?: string[];
    properties?: Array<{ id: string; label: string; value: string }>;
};

type Tab = "profile" | "ai";

type Props = {
    thread: InboxThread;
    edits: ContactEdits;
    onEdit: (patch: ContactEdits) => void;
    tab: Tab;
    onTab: (tab: Tab) => void;
    onFold: () => void;
    avatarStyle: (name: string) => CSSProperties;
    initials: (name: string) => string;
    onEmail: () => void;
    draft: string;
    onInsertDraft: (text: string) => void;
    workspaceId: string;
};

const TIME_ZONES = [
    "Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Amsterdam",
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "America/Sao_Paulo",
    "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Africa/Lagos", "Africa/Nairobi",
];

const shortDate = (value: string | undefined) =>
    value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "—";

/** "14:32 BST" in the contact's time zone, refreshed every minute. */
function useLocalTime(timeZone: string | undefined) {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        if (!timeZone) return;
        const timer = window.setInterval(() => setNow(new Date()), 60_000);
        return () => window.clearInterval(timer);
    }, [timeZone]);
    if (!timeZone) return null;
    try {
        return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone, timeZoneName: "short" }).format(now);
    } catch {
        return null;
    }
}

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <section className={styles.contactSection}>
            <button type="button" className={styles.contactSectionHead} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
                {title}
                <ChevronDown size={14} className={open ? undefined : styles.chevronClosed} aria-hidden="true" />
            </button>
            {open && <div className={styles.contactSectionBody}>{children}</div>}
        </section>
    );
}

/** A value you can click to edit; empty values show "+ Set a value". */
function EditableField({
    label,
    value,
    onSave,
    copyable = false,
    href,
}: {
    label: string;
    value: string;
    onSave: (value: string) => void;
    copyable?: boolean;
    href?: string;
}) {
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(value);
    const [copied, setCopied] = useState(false);

    const save = () => {
        setEditing(false);
        if (text.trim() !== value) onSave(text.trim());
    };

    return (
        <div className={styles.editField}>
            <span className={styles.editLabel}>{label}</span>
            {editing ? (
                <input
                    className={styles.editInput}
                    value={text}
                    autoFocus
                    onChange={(event) => setText(event.target.value)}
                    onBlur={save}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") save();
                        if (event.key === "Escape") {
                            setText(value);
                            setEditing(false);
                        }
                    }}
                    aria-label={label}
                />
            ) : value ? (
                <span className={styles.editValueRow}>
                    {href ? <a className={styles.editValue} href={href}>{value}</a> : <span className={styles.editValue}>{value}</span>}
                    {copyable && (
                        <button
                            type="button"
                            className={styles.editIcon}
                            aria-label={`Copy ${label}`}
                            title="Copy"
                            onClick={async () => {
                                await navigator.clipboard?.writeText(value);
                                setCopied(true);
                                window.setTimeout(() => setCopied(false), 1300);
                            }}
                        >
                            {copied ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                    )}
                    <button type="button" className={styles.editIcon} aria-label={`Edit ${label}`} title="Edit" onClick={() => { setText(value); setEditing(true); }}>
                        <Pencil size={12} />
                    </button>
                </span>
            ) : (
                <button type="button" className={styles.setValue} onClick={() => { setText(""); setEditing(true); }}>
                    + Set a value
                </button>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Profile tab
// ---------------------------------------------------------------------------

function ProfileTab({ thread, edits, onEdit, avatarStyle, initials, onEmail }: Omit<Props, "tab" | "onTab" | "onFold" | "draft" | "onInsertDraft" | "workspaceId">) {
    const channel = CHANNEL_META[channelOf(thread)];
    const localTime = useLocalTime(thread.customerTimeZone);
    const subtitle = [thread.customerTitle, thread.customerCompany].filter(Boolean).join(" at ");
    const properties = edits.properties ?? [];
    const files = thread.messages.flatMap((message) => message.attachments ?? []);
    const handleLabel = thread.customerHandle?.startsWith("@") ? `${channel.label} handle` : "Phone";

    return (
        <>
            <div className={styles.contactTop}>
                <span className={styles.contactAvatar} style={avatarStyle(thread.customerName)}>{initials(thread.customerName)}</span>
                <span className={styles.contactHeading}>
                    <span className={styles.contactName}>{thread.customerName}</span>
                    {subtitle && <span className={styles.contactSub}>{subtitle}</span>}
                </span>
            </div>

            <div className={styles.contactActions}>
                {thread.customerEmail && (
                    <button type="button" onClick={onEmail}>
                        <Mail size={15} />
                        Email
                    </button>
                )}
                {thread.customerId ? (
                    <Link href={`/dashboard/customers/${thread.customerId}`}>
                        <UserRound size={15} />
                        Profile
                    </Link>
                ) : (
                    <Link href="/dashboard/customers">
                        <UserRound size={15} />
                        Customers
                    </Link>
                )}
            </div>

            <Section title="About">
                <EditableField label="Full name" value={thread.customerName} onSave={(value) => value && onEdit({ customerName: value })} />
                <EditableField label="Job title" value={thread.customerTitle ?? ""} onSave={(value) => onEdit({ customerTitle: value })} />
                <EditableField label="Company" value={thread.customerCompany ?? ""} onSave={(value) => onEdit({ customerCompany: value })} />
                <EditableField
                    label="Languages"
                    value={(thread.customerLanguages ?? []).join(", ")}
                    onSave={(value) => onEdit({ customerLanguages: value.split(",").map((item) => item.trim()).filter(Boolean) })}
                />
            </Section>

            <Section title="Contact">
                <EditableField
                    label="Email"
                    value={thread.customerEmail}
                    href={thread.customerEmail ? `mailto:${thread.customerEmail}` : undefined}
                    copyable
                    onSave={(value) => onEdit({ customerEmail: value })}
                />
                <EditableField label={handleLabel} value={thread.customerHandle ?? ""} copyable onSave={(value) => onEdit({ customerHandle: value })} />
            </Section>

            <Section title="Address">
                <EditableField label="Location" value={thread.customerLocation ?? ""} onSave={(value) => onEdit({ customerLocation: value })} />
                <div className={styles.editField}>
                    <span className={styles.editLabel}>Time zone</span>
                    <select
                        className={styles.editSelect}
                        value={thread.customerTimeZone ?? ""}
                        onChange={(event) => onEdit({ customerTimeZone: event.target.value || undefined })}
                        aria-label="Time zone"
                    >
                        <option value="">Not set</option>
                        {[...new Set([thread.customerTimeZone, ...TIME_ZONES].filter(Boolean) as string[])].map((zone) => (
                            <option key={zone} value={zone}>{zone.replace("_", " ")}</option>
                        ))}
                    </select>
                </div>
                {localTime && (
                    <div className={styles.editField}>
                        <span className={styles.editLabel}>Local time</span>
                        <span className={styles.editValue}>{localTime}</span>
                    </div>
                )}
            </Section>

            <Section title="Other details">
                {properties.map((property) => (
                    <div key={property.id} className={styles.propertyRow}>
                        <EditableField
                            label={property.label}
                            value={property.value}
                            onSave={(value) => onEdit({ properties: properties.map((item) => (item.id === property.id ? { ...item, value } : item)) })}
                        />
                        <button
                            type="button"
                            className={styles.editIcon}
                            aria-label={`Remove ${property.label}`}
                            title="Remove"
                            onClick={() => onEdit({ properties: properties.filter((item) => item.id !== property.id) })}
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    className={styles.addProperty}
                    onClick={() => {
                        const label = window.prompt("Property name (for example Plan, Postal code or Account owner)")?.trim();
                        if (label) onEdit({ properties: [...properties, { id: crypto.randomUUID(), label, value: "" }] });
                    }}
                >
                    <Plus size={13} aria-hidden="true" />
                    Add a property
                </button>
            </Section>

            {files.length > 0 && (
                <Section title="Shared files">
                    {files.map((file) => (
                        <a key={file.id} className={styles.sharedFile} href={file.url} target="_blank" rel="noreferrer">
                            <FileText size={14} aria-hidden="true" />
                            <span>{file.fileName}</span>
                            <small>{file.sizeLabel}</small>
                        </a>
                    ))}
                </Section>
            )}

            <Section title="Conversation" defaultOpen={false}>
                <div className={styles.editField}>
                    <span className={styles.editLabel}>Channel</span>
                    <span className={styles.contactChannel}>
                        {channel.logo
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={channel.logo} alt="" width={13} height={13} />
                            : <Mail size={13} aria-hidden="true" />}
                        {channel.label}
                    </span>
                </div>
                <div className={styles.editField}>
                    <span className={styles.editLabel}>First interaction</span>
                    <span className={styles.editValue}>{shortDate(thread.messages[0]?.sentAt)}</span>
                </div>
                <div className={styles.editField}>
                    <span className={styles.editLabel}>Messages</span>
                    <span className={styles.editValue}>{thread.messages.length}</span>
                </div>
            </Section>

            <p className={styles.profileNote}>Profile edits are saved in this browser until this contact is linked to a customer record.</p>
        </>
    );
}

// ---------------------------------------------------------------------------
// AI tab
// ---------------------------------------------------------------------------

type Turn = { role: "user" | "assistant"; text: string; draft?: string | null };

const QUICK_ACTIONS = [
    { label: "Summarise", prompt: "Summarise this conversation in a few short lines and say what they need from us." },
    { label: "Draft a reply", prompt: "Draft a reply to their latest message." },
    { label: "Next step", prompt: "What should I do next with this customer?" },
    { label: "Improve my message", prompt: "Improve my current message: clearer, friendlier and shorter." },
];

function AssistantTab({ thread, draft, onInsertDraft, workspaceId }: { thread: InboxThread; draft: string; onInsertDraft: (text: string) => void; workspaceId: string }) {
    const [turns, setTurns] = useState<Turn[]>([]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const endRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: "end" });
    }, [turns.length, busy]);

    const ask = async (prompt: string) => {
        const text = prompt.trim();
        if (!text || busy) return;
        const history = turns.map((turn) => ({ role: turn.role, text: turn.draft ? `${turn.text}\n\n${turn.draft}` : turn.text }));
        setTurns((current) => [...current, { role: "user", text }]);
        setInput("");
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/dashboard/inbox/ai-assist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workspaceId, prompt: text, thread, history, draft }),
            });
            const result = (await response.json()) as { answer?: string; draft?: string | null; error?: string };
            if (!response.ok) throw new Error(result.error || "The assistant could not answer right now.");
            setTurns((current) => [...current, { role: "assistant", text: result.answer ?? "", draft: result.draft ?? null }]);
        } catch (assistError) {
            setError(assistError instanceof Error ? assistError.message : "The assistant could not answer right now.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={styles.assistant}>
            <div className={styles.assistantScroll}>
                {turns.length === 0 && (
                    <div className={styles.assistantEmpty}>
                        <span className={styles.assistantMark}><Sparkles size={15} /></span>
                        <p>Ask about this conversation, or let AI write your next message.</p>
                    </div>
                )}
                {turns.map((turn, index) => (
                    <div key={index} className={turn.role === "user" ? styles.assistantUser : styles.assistantReply}>
                        {turn.text && <p>{turn.text}</p>}
                        {turn.draft && (
                            <div className={styles.assistantDraft}>
                                <p>{turn.draft}</p>
                                <button type="button" className={styles.primaryButton} onClick={() => onInsertDraft(turn.draft!)}>
                                    <ArrowUp size={13} />
                                    Use in message
                                </button>
                            </div>
                        )}
                    </div>
                ))}
                {busy && (
                    <div className={styles.assistantReply}>
                        <p className={styles.assistantThinking}><Loader2 size={13} className={styles.spinning} /> Thinking…</p>
                    </div>
                )}
                {error && <p className={styles.aiError}>{error}</p>}
                <div ref={endRef} />
            </div>

            <div className={styles.assistantActions}>
                {QUICK_ACTIONS.filter((action) => action.label !== "Improve my message" || draft.trim()).map((action) => (
                    <button key={action.label} type="button" className={styles.assistantChip} disabled={busy} onClick={() => void ask(action.prompt)}>
                        {action.label}
                    </button>
                ))}
            </div>

            <div className={styles.assistantInputRow}>
                <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            void ask(input);
                        }
                    }}
                    rows={1}
                    placeholder="Ask AI about this chat…"
                    aria-label="Ask AI about this chat"
                />
                <button type="button" className={styles.aiGo} disabled={!input.trim() || busy} onClick={() => void ask(input)} aria-label="Ask">
                    {busy ? <Loader2 size={13} className={styles.spinning} /> : <ArrowUp size={13} />}
                </button>
            </div>
        </div>
    );
}

/** Right-hand column beside a chat: the customer's profile and an AI assistant, foldable. */
export default function ChatSidePanel(props: Props) {
    const { thread, tab, onTab, onFold, draft, onInsertDraft, workspaceId } = props;

    return (
        <aside className={styles.contactPanel} aria-label="Customer and AI">
            <div className={styles.sideTabs} role="tablist">
                <button type="button" role="tab" aria-selected={tab === "profile"} className={tab === "profile" ? styles.sideTabActive : styles.sideTab} onClick={() => onTab("profile")}>
                    <UserRound size={13} aria-hidden="true" />
                    Profile
                </button>
                <button type="button" role="tab" aria-selected={tab === "ai"} className={tab === "ai" ? styles.sideTabActive : styles.sideTab} onClick={() => onTab("ai")}>
                    <Sparkles size={13} aria-hidden="true" />
                    AI
                </button>
                <span className={styles.spacer} />
                <button type="button" className={styles.iconButton} aria-label="Fold panel" title="Fold panel" onClick={onFold}>
                    <PanelRightClose size={15} />
                </button>
            </div>

            {tab === "profile" ? (
                <div className={styles.sideScroll}>
                    <ProfileTab {...props} />
                </div>
            ) : (
                <AssistantTab key={thread.id} thread={thread} draft={draft} onInsertDraft={onInsertDraft} workspaceId={workspaceId} />
            )}
        </aside>
    );
}
