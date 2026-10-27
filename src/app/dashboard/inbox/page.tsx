"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    Archive,
    UserRound,
    Plus,
    CircleAlert,
    Pencil,
    GripVertical,
    SlidersHorizontal,
    ListChecks,
    Minimize2,
    Maximize2,
    Mail,
    ChevronLeft,
    ArrowUp,
    ArrowRight,
    Bold,
    Check,
    ChevronDown,
    ChevronRight,
    File,
    FileSpreadsheet,
    FileText,
    Film,
    Image,
    Inbox,
    ArrowDownLeft,
    Italic,
    Link as LinkIcon,
    Link2,
    List,
    ListOrdered,
    Loader2,
    MailCheck,
    MailOpen,
    MoreHorizontal,
    Music2,
    MousePointerClick,
    PanelBottom,
    PanelLeftClose,
    PanelLeftOpen,
    Paperclip,
    PenSquare,
    Redo2,
    Download,
    Forward,
    Reply,
    RotateCcw,
    Search,
    Signature,
    Send,
    Sparkles,
    Star,
    StarOff,
    Trash2,
    Underline,
    Undo2,
    X,
} from "lucide-react";
import {
    Fragment,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type DragEvent,
    type FormEvent,
    type MouseEvent as ReactMouseEvent,
} from "react";

import { CHAT_CHANNELS, isChatChannel, type InboxChannel } from "../../../lib/inbox-data";
import { threadInFolder } from "../../../lib/inbox-folders";
import { sortThreads } from "../../../lib/inbox-list";
import type {
    InboxFolder,
    InboxPayload,
    InboxThread,
} from "../../../lib/inbox-data";

import ChatSidePanel, { type ContactEdits } from "./ChatSidePanel";
import InboxChat from "./InboxChat";
import { escapeHtml, safeLinkUrl } from "../../../lib/email-html";
import ThreadHistory, { MessageBody } from "./ThreadHistory";
import SummaryCard from "./SummaryCard";
import SaveAccountPrompt from "./SaveAccountPrompt";
import { CHANNEL_META, channelOf, UPCOMING_CHANNELS } from "./channels";
import styles from "./inbox-page.module.css";
import {
    applyDemoThreadState,
    applyThreadAction,
    saveDemoThreadAction,
    type ThreadAction,
} from "./thread-actions";

type DateRange = "24h" | "7d" | "30d" | "60d" | "all";

type EmailSummary = {
    summary: string;
    intent: string;
    recommendedAction: string;
    sentiment: "Positive" | "Neutral" | "Concerned" | "Negative";
    urgency: "Low" | "Normal" | "High";
    keyDetails: string[];
};

type ComposeAccount = {
    id: string;
    name: string;
    email: string;
    company?: string;
};

type BuilderCtaStyle = {
    colour: string;
    textColour: string;
    variant: "primary" | "secondary" | "outline" | "text";
    size: "small" | "medium" | "large";
    radius: number;
    alignment: "left" | "center" | "right";
};

type BuilderSavedCta = BuilderCtaStyle & {
    id: string;
    name: string;
    text: string;
    link: string;
    isDefault: boolean;
};

type BuilderFooterSettings = {
    enabled: boolean;
    companyName: string;
    copyrightText: string;
    unsubscribeText: string;
    unsubscribeLink: string;
    preferencesText: string;
    preferencesLink: string;
    showCompanyName: boolean;
    showCopyright: boolean;
    showUnsubscribe: boolean;
    showPreferences: boolean;
    showDivider: boolean;
    separator: "|" | "·" | "—";
    alignment: "left" | "center" | "right";
    textColour: string;
    dividerColour: string;
    textSize: "11px" | "12px" | "13px";
};

type BuilderSavedEmail = {
    id: string;
    emailType: string;
    subject: string;
    html: string;
    plainText?: string | null;
    createdAt: string;
};

type BuilderSavedEmailMeta = {
    editableEmail?: {
        subject?: string;
        heading?: string;
        body?: string;
        ctaText?: string;
        ctaLink?: string;
    };
};

const dateRangeOptions: Array<{ value: DateRange; label: string; days: number | null }> = [
    { value: "all", label: "All time", days: null },
    { value: "24h", label: "Last 24 hours", days: 1 },
    { value: "7d", label: "Last 7 days", days: 7 },
    { value: "30d", label: "Last 30 days", days: 30 },
    { value: "60d", label: "Last 60 days", days: 60 },
];

/** Whether a thread's latest message falls inside the chosen date range. */
function inDateRange(thread: { lastMessageAt: string }, range: DateRange, now: number) {
    const days = dateRangeOptions.find((option) => option.value === range)?.days ?? null;
    if (days === null) return true;
    const time = new Date(thread.lastMessageAt).getTime();
    return !Number.isNaN(time) && time >= now - days * 24 * 60 * 60 * 1000;
}


const folderOptions: Array<{ value: InboxFolder; label: string }> = [
    { value: "inbox", label: "Inbox" },
    { value: "received", label: "Received" },
    { value: "starred", label: "Starred" },
    { value: "sent", label: "Sent" },
    { value: "drafts", label: "Drafts" },
    { value: "scheduled", label: "Scheduled" },
    { value: "deleted", label: "Deleted" },
    { value: "failed", label: "Failed" },
    { value: "archived", label: "Archived" },
];

const fallbackSavedCtas: BuilderSavedCta[] = [
    {
        id: "cta-view-dashboard",
        name: "View dashboard",
        text: "View dashboard",
        link: "{{dashboard_link}}",
        colour: "#1d9bf0",
        textColour: "#ffffff",
        variant: "primary",
        size: "medium",
        radius: 8,
        alignment: "center",
        isDefault: true,
    },
    {
        id: "cta-update-payment",
        name: "Update payment method",
        text: "Update payment method",
        link: "{{billing_link}}",
        colour: "#1d9bf0",
        textColour: "#ffffff",
        variant: "primary",
        size: "medium",
        radius: 8,
        alignment: "center",
        isDefault: false,
    },
    {
        id: "cta-book-call",
        name: "Book a call",
        text: "Book a call",
        link: "{{booking_link}}",
        colour: "#1d9bf0",
        textColour: "#ffffff",
        variant: "primary",
        size: "medium",
        radius: 8,
        alignment: "center",
        isDefault: false,
    },
];

const defaultFooterSettings: BuilderFooterSettings = {
    enabled: true,
    companyName: "Acme AI",
    copyrightText: "© 2026 Acme AI. All rights reserved.",
    unsubscribeText: "Unsubscribe",
    unsubscribeLink: "{{unsubscribe_link}}",
    preferencesText: "Update preferences",
    preferencesLink: "{{preferences_link}}",
    showCompanyName: false,
    showCopyright: true,
    showUnsubscribe: true,
    showPreferences: true,
    showDivider: true,
    separator: "|",
    alignment: "center",
    textColour: "#6b7280",
    dividerColour: "#e5e7eb",
    textSize: "12px",
};

function getSavedFooterSettings(): BuilderFooterSettings {
    if (typeof window === "undefined") return defaultFooterSettings;

    try {
        const stored = localStorage.getItem("email-agent-footer-settings");
        const parsed = stored ? JSON.parse(stored) : null;

        if (!parsed || typeof parsed !== "object") {
            return defaultFooterSettings;
        }

        return {
            ...defaultFooterSettings,
            ...parsed,
        } as BuilderFooterSettings;
    } catch {
        return defaultFooterSettings;
    }
}

function getSavedBuilderCtas(): BuilderSavedCta[] {
    if (typeof window === "undefined") return fallbackSavedCtas;

    try {
        const stored = localStorage.getItem("email-agent-saved-ctas");
        const parsed = stored ? JSON.parse(stored) : null;

        if (!Array.isArray(parsed) || parsed.length === 0) {
            return fallbackSavedCtas;
        }

        const validCtas = parsed.filter((cta): cta is BuilderSavedCta => {
            return Boolean(
                cta &&
                typeof cta.id === "string" &&
                typeof cta.name === "string" &&
                typeof cta.text === "string" &&
                typeof cta.link === "string",
            );
        });

        return validCtas.length > 0 ? validCtas : fallbackSavedCtas;
    } catch {
        return fallbackSavedCtas;
    }
}

/**
 * A saved button as email-safe HTML: one block that only holds the link.
 * Its controls (align, edit, remove) are drawn by the page on top of it,
 * so nothing but the button itself is ever sent.
 */
function buildSavedBuilderCtaHtml(cta: BuilderSavedCta) {
    const padding = cta.size === "small" ? "8px 14px" : cta.size === "large" ? "13px 22px" : "10px 18px";
    const fontSize = cta.size === "small" ? "12px" : cta.size === "large" ? "15px" : "14px";
    const isOutline = cta.variant === "outline";
    const isText = cta.variant === "text";
    const isSecondary = cta.variant === "secondary";
    const background = isOutline || isText ? "transparent" : isSecondary ? "#ffffff" : cta.colour;
    const border = isOutline || isSecondary ? `1px solid ${cta.colour}` : "0";
    const colour = isOutline || isText || isSecondary ? cta.colour : cta.textColour;
    const text = escapeReplyHtml(cta.text);
    const link = escapeReplyHtml(cta.link);

    return `<div data-cobrai-cta="${escapeReplyHtml(cta.id)}" contenteditable="false" draggable="true" style="margin:12px 0;text-align:${cta.alignment};"><a href="${link}" target="_blank" rel="noopener noreferrer" draggable="false" style="display:inline-block;padding:${isText ? "0" : padding};border:${border};border-radius:${Math.max(0, cta.radius)}px;background:${background};color:${colour};font-family:Inter,Arial,sans-serif;font-size:${fontSize};font-weight:500;line-height:1.3;text-decoration:${isText ? "underline" : "none"};">${text}</a></div>`;
}

/** The footer as one slim line under a thin divider. */
function buildReplyFooterHtml(settings: BuilderFooterSettings) {
    const linkStyle = "color:inherit;text-decoration:underline;";
    const links = [
        settings.showUnsubscribe && settings.unsubscribeText.trim()
            ? `<a href="${escapeReplyHtml(settings.unsubscribeLink || "{{unsubscribe_link}}")}" style="${linkStyle}">${escapeReplyHtml(settings.unsubscribeText.trim())}</a>`
            : "",
        settings.showPreferences && settings.preferencesText.trim()
            ? `<a href="${escapeReplyHtml(settings.preferencesLink || "{{preferences_link}}")}" style="${linkStyle}">${escapeReplyHtml(settings.preferencesText.trim())}</a>`
            : "",
    ].filter(Boolean).join(` ${settings.separator} `);

    const parts = [
        settings.showCompanyName && settings.companyName.trim() ? escapeReplyHtml(settings.companyName.trim()) : "",
        settings.showCopyright && settings.copyrightText.trim() ? escapeReplyHtml(settings.copyrightText.trim()) : "",
        links,
    ].filter(Boolean);

    const divider = settings.showDivider ? `border-top:1px solid ${settings.dividerColour};` : "";
    return `<div data-cobrai-footer="true" contenteditable="false" style="margin-top:18px;padding-top:10px;${divider}text-align:${settings.alignment};color:${settings.textColour};font-size:${settings.textSize};line-height:1.5;">${parts.join(" · ")}</div>`;
}

function escapeReplyHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function readBuilderSavedEmailMeta(html: string): BuilderSavedEmailMeta | null {
    const match = html.match(/<!--EMAIL_AGENT_META:([\s\S]*?)-->/);

    if (!match?.[1]) return null;

    try {
        return JSON.parse(decodeURIComponent(match[1])) as BuilderSavedEmailMeta;
    } catch {
        return null;
    }
}

function normaliseSavedEmailLink(value?: string) {
    const link = value?.trim() || "#";
    return /^javascript:/i.test(link) ? "#" : link;
}

function buildEditableSavedEmailHtml(email: BuilderSavedEmail) {
    const meta = readBuilderSavedEmailMeta(email.html);
    const editable = meta?.editableEmail;
    const heading = editable?.heading?.trim() || email.subject.trim();
    const body = editable?.body?.trim() || email.plainText?.trim() || "";
    const ctaText = editable?.ctaText?.trim() || "";
    const ctaLink = normaliseSavedEmailLink(editable?.ctaLink);
    const bodyHtml = body
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map(
            (paragraph) =>
                `<p style="margin:0 0 12px;line-height:1.7;">${escapeReplyHtml(paragraph).replaceAll("\n", "<br>")}</p>`,
        )
        .join("");

    return `
        <div
            data-cobrai-saved-email="${escapeReplyHtml(email.id)}"
            style="display:block;width:100%;margin:0;padding:0;"
        >
            ${heading
            ? `<h3 style="margin:0 0 12px;color:#1f2937;font-size:15px;line-height:1.45;font-weight:650;">${escapeReplyHtml(heading)}</h3>`
            : ""
        }
            <div style="margin:0;color:#374151;font-size:12px;line-height:1.7;">${bodyHtml}</div>
            ${ctaText
            ? `<p style="margin:14px 0 0;"><a href="${escapeReplyHtml(ctaLink)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;justify-content:center;padding:10px 16px;border-radius:8px;background:#1d9bf0;color:#ffffff;font-size:12px;font-weight:650;line-height:1.3;text-decoration:none;">${escapeReplyHtml(ctaText)}</a></p>`
            : ""
        }
        </div>
        <p><br></p>
    `;
}

// Received files that open in the preview window. SVG and HTML are left out
// on purpose: they can carry script.
const PREVIEWABLE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

/** Save a blob URL to the computer under a file name. */
function saveBlobUrl(url: string, fileName: string) {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
}

// Mirror the limits in src/lib/inbox-send.ts.
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function getStoredWorkspaceId() {
    if (typeof window === "undefined") return "demo-workspace";

    return localStorage.getItem("workspaceId") || "demo-workspace";
}

function getInitials(value: string) {
    return value
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
}

function formatListDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();

    if (isToday) {
        return date.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
    });
}

function formatFullDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function getLatestMessage(thread: InboxThread) {
    return thread.messages[thread.messages.length - 1] ?? null;
}

function getAttachmentIcon(mimeType: string, fileName = "") {
    const normalisedMimeType = mimeType.toLowerCase();
    const normalisedFileName = fileName.toLowerCase();

    if (
        normalisedMimeType.includes("text/uri-list") ||
        normalisedMimeType.includes("url") ||
        normalisedFileName.startsWith("http://") ||
        normalisedFileName.startsWith("https://")
    ) {
        return Link2;
    }

    if (normalisedMimeType.startsWith("image/")) {
        return Image;
    }

    if (
        normalisedMimeType.includes("spreadsheet") ||
        normalisedMimeType.includes("excel") ||
        normalisedFileName.endsWith(".csv") ||
        normalisedFileName.endsWith(".xls") ||
        normalisedFileName.endsWith(".xlsx")
    ) {
        return FileSpreadsheet;
    }

    if (normalisedMimeType.startsWith("video/")) {
        return Film;
    }

    if (normalisedMimeType.startsWith("audio/")) {
        return Music2;
    }

    if (
        normalisedMimeType.includes("pdf") ||
        normalisedMimeType.includes("word") ||
        normalisedMimeType.includes("document") ||
        normalisedFileName.endsWith(".pdf") ||
        normalisedFileName.endsWith(".doc") ||
        normalisedFileName.endsWith(".docx")
    ) {
        return FileText;
    }

    return File;
}

type ListFilter = "all" | "unread";

const CONTACT_EDITS_KEY = "inbox-contact-edits";

/** The channel's own logo (a mail icon for email). */
function ChannelLogo({ channel, size }: { channel: InboxChannel; size: number }) {
    const meta = CHANNEL_META[channel];
    // eslint-disable-next-line @next/next/no-img-element
    return meta.logo ? <img src={meta.logo} alt="" width={size} height={size} style={{ flex: "none" }} /> : <Mail size={size} aria-hidden="true" />;
}

/** "Re: …" without stacking prefixes, matching what the server sends. */
function replySubjectFor(subject: string) {
    const trimmed = subject.trim();
    return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

/** Folders whose emails you can reply to from the reading pane. */
function canReplyIn(folder: InboxFolder) {
    return folder === "inbox" || folder === "received";
}

/** Folders in the inbox sidebar: the whole inbox lives on this one page. */
const MAIN_FOLDERS: Array<{ folder: InboxFolder; label: string; icon: typeof Inbox }> = [
    { folder: "inbox", label: "Inbox", icon: Inbox },
    { folder: "received", label: "Received", icon: ArrowDownLeft },
    { folder: "starred", label: "Starred", icon: Star },
    { folder: "sent", label: "Sent", icon: Send },
    { folder: "drafts", label: "Drafts", icon: FileText },
    { folder: "deleted", label: "Trash", icon: Trash2 },
];

const OTHER_FOLDERS: Array<{ folder: InboxFolder; label: string; icon: typeof Inbox }> = [
    { folder: "archived", label: "Archived", icon: Archive },
    { folder: "failed", label: "Failed", icon: CircleAlert },
];


const AVATAR_TONES = [
    ["#eef2ff", "#4338ca"],
    ["#ecfdf3", "#027a48"],
    ["#fff4ed", "#b93815"],
    ["#fdf2fa", "#c11574"],
    ["#f0f9ff", "#026aa2"],
    ["#fefbe8", "#a15c07"],
];

/** A soft, stable colour per name so people are easy to tell apart. */
function avatarStyle(name: string) {
    let hash = 0;
    for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    const [background, color] = AVATAR_TONES[hash % AVATAR_TONES.length];
    return { background, color };
}

export default function InboxPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const requestedFolder = searchParams.get("folder");
    const initialFolder = folderOptions.some(
        (folder) => folder.value === requestedFolder,
    )
        ? (requestedFolder as InboxFolder)
        : "inbox";

    const [payload, setPayload] = useState<InboxPayload | null>(null);
    const [activeFolder, setActiveFolder] =
        useState<InboxFolder>(initialFolder);
    const [dateRange, setDateRange] = useState<DateRange>("all");
    const [dateMenuOpen, setDateMenuOpen] = useState(false);
    // Whether Resend is set up well enough to send and to receive replies.
    const [resendSetup, setResendSetup] = useState<"unknown" | "missing" | "sending_only" | "ready">("unknown");
    const [setupNoticeDismissed, setSetupNoticeDismissed] = useState(false);
    /* "Select" mode: every email shows a checkbox for bulk actions. */
    const [selectMode, setSelectMode] = useState(false);
    const [search, setSearch] = useState("");
    const [selectedThreadId, setSelectedThreadId] = useState(() => searchParams.get("thread") ?? "");
    const [composeOpen, setComposeOpen] = useState(false);
    const [composeAccounts, setComposeAccounts] = useState<ComposeAccount[]>([]);
    const [composeRecipient, setComposeRecipient] = useState<ComposeAccount | null>(null);
    const [composeAccountSearch, setComposeAccountSearch] = useState("");
    // Emails saved as accounts; null until the accounts list has loaded.
    const [savedAccountEmails, setSavedAccountEmails] = useState<Set<string> | null>(null);
    const [dismissedSavePrompts, setDismissedSavePrompts] = useState<Set<string>>(() => new Set());
    const [composeAccountPickerOpen, setComposeAccountPickerOpen] = useState(false);
    const [replySubject, setReplySubject] = useState("");
    const [replyBody, setReplyBody] = useState("");
    const [aiPanelOpen, setAiPanelOpen] = useState(false);
    const [aiPrompt, setAiPrompt] = useState("");
    const [aiReply, setAiReply] = useState("");
    const [loading, setLoading] = useState(true);
    const [generatingReply, setGeneratingReply] = useState(false);
    const [error, setError] = useState("");
    const [aiError, setAiError] = useState("");
    const [emailSummaries, setEmailSummaries] = useState<
        Record<string, EmailSummary>
    >({});
    const [summaryOpen, setSummaryOpen] = useState(false);
    const [summarising, setSummarising] = useState(false);
    const [summaryError, setSummaryError] = useState("");
    const [replyAttachments, setReplyAttachments] = useState<globalThis.File[]>([]);
    const [replyOptionsOpen, setReplyOptionsOpen] = useState(false);
    const [ctaPickerOpen, setCtaPickerOpen] = useState(false);
    const [savedEmailPickerOpen, setSavedEmailPickerOpen] = useState(false);
    const [savedEmailSearch, setSavedEmailSearch] = useState("");
    const [savedEmails, setSavedEmails] = useState<BuilderSavedEmail[]>([]);
    const [savedEmailsLoading, setSavedEmailsLoading] = useState(false);
    const [savedEmailsError, setSavedEmailsError] = useState("");
    const [savedReplyCtas, setSavedReplyCtas] =
        useState<BuilderSavedCta[]>(fallbackSavedCtas);
    const [footerSettings, setFooterSettings] =
        useState<BuilderFooterSettings>(defaultFooterSettings);
    const [replyFooterIncluded, setReplyFooterIncluded] = useState(false);
    // Which attached file is open in the preview, if any.
    const [previewAttachmentIndex, setPreviewAttachmentIndex] = useState<number | null>(null);
    const previewAttachment = previewAttachmentIndex === null ? null : replyAttachments[previewAttachmentIndex] ?? null;
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState("");
    // One key per unchanged draft, so clicking Send again after a failure
    // cannot deliver the same email twice.
    const sendKeyRef = useRef<{ signature: string; key: string } | null>(null);
    // The draft last saved for what's being written: "compose" or a thread id.
    const [savedDraft, setSavedDraft] = useState<{ target: string | null; id: string | null; signature: string }>(
        { target: null, id: null, signature: "" },
    );
    const [draftError, setDraftError] = useState("");
    // What was just sent or discarded, so autosave never brings it back.
    const sentDraftSignatureRef = useRef("");
    const replyRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const [listFilter, setListFilter] = useState<ListFilter>("all");
    /* Emails ticked in the list for a bulk action. */
    const [checkedIds, setCheckedIds] = useState<string[]>([]);
    const [closedSections, setClosedSections] = useState<string[]>([]);
    /* Folds the folder column to an icon strip, giving the email more room. */
    const [foldersFolded, setFoldersFolded] = useState(false);
    const [channelProviders, setChannelProviders] = useState<string[]>([]);
    const requestedChannel = searchParams.get("channel");
    const [activeChannel, setActiveChannel] = useState<InboxChannel>(
        requestedChannel && (["email", ...CHAT_CHANNELS] as string[]).includes(requestedChannel)
            ? (requestedChannel as InboxChannel)
            : "email",
    );
    const [chatDraft, setChatDraft] = useState("");
    const [sidePanel, setSidePanel] = useState<{ open: boolean; tab: "profile" | "ai" }>({ open: true, tab: "profile" });
    // Profile edits per conversation, kept in this browser until contacts
    // from messaging channels are linked to customer records.
    const [contactEdits, setContactEdits] = useState<Record<string, ContactEdits>>(() => {
        if (typeof window === "undefined") return {};
        try {
            const stored = JSON.parse(window.localStorage.getItem(CONTACT_EDITS_KEY) ?? "{}");
            return stored && typeof stored === "object" ? stored : {};
        } catch {
            return {};
        }
    });

    // Connected messaging apps, for the Channels section of the sidebar.
    useEffect(() => {
        let cancelled = false;
        void fetch("/api/integrations/status", { credentials: "include", cache: "no-store" })
            .then((response) => (response.ok ? response.json() : { integrations: [] }))
            .then((data: { integrations?: Array<{ provider?: string }> }) => {
                if (cancelled) return;
                const providers = (data.integrations ?? [])
                    .map((item) => (item.provider ?? "").toLowerCase())
                    .filter((provider) => provider in UPCOMING_CHANNELS);
                setChannelProviders([...new Set(providers.map((provider) => UPCOMING_CHANNELS[provider].label))]);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);
    const [replyExpanded, setReplyExpanded] = useState(false);
    // The button or footer selected inside the reply, and where its toolbar sits.
    const [activeBlock, setActiveBlock] = useState<{ kind: "cta" | "footer"; top: number; left: number; side: "right" | "left" } | null>(null);
    const [dropLineTop, setDropLineTop] = useState<number | null>(null);
    const activeBlockRef = useRef<HTMLElement | null>(null);
    const savedRangeRef = useRef<Range | null>(null);
    const draggedCtaRef = useRef<HTMLElement | null>(null);
    const dropBeforeRef = useRef<Element | null>(null);

    // Remember the caret inside the reply, so inserts land where you were typing.
    useEffect(() => {
        const rememberCaret = () => {
            const editor = replyRef.current;
            const selection = window.getSelection();
            if (!editor || !selection || selection.rangeCount === 0) return;
            const range = selection.getRangeAt(0);
            if (editor.contains(range.startContainer)) savedRangeRef.current = range.cloneRange();
        };
        document.addEventListener("selectionchange", rememberCaret);
        return () => document.removeEventListener("selectionchange", rememberCaret);
    }, []);

    // ⌘K / Ctrl+K jumps to search, as the hint in the header says.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                searchRef.current?.focus();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
    const attachmentInputRef = useRef<HTMLInputElement>(null);
    const dateFilterRef = useRef<HTMLDivElement>(null);
    const replyOptionsRef = useRef<HTMLDivElement>(null);
    const composeAccountPickerRef = useRef<HTMLDivElement>(null);

    // When the inbox was last loaded; the date filter counts back from here.
    const [loadedAt, setLoadedAt] = useState(() => Date.now());

    const loadInbox = useCallback(async ({ silent = false } = {}) => {
        try {
            if (!silent) setLoading(true);

            setError("");

            const response = await fetch("/api/dashboard/inbox", {
                method: "GET",
                cache: "no-store",
                credentials: "include",
            });

            const result = (await response.json()) as InboxPayload & {
                error?: string;
            };

            if (!response.ok) {
                throw new Error(result.error || "Failed to load the inbox.");
            }

            const withDemoState = applyDemoThreadState(result);
            setLoadedAt(Date.now());
            setPayload(withDemoState);
            return withDemoState;
        } catch (loadError) {
            // A background refresh that fails keeps the list you have; the
            // next one tries again.
            if (silent) return;
            setError(
                loadError instanceof Error
                    ? loadError.message
                    : "Failed to load the inbox.",
            );
        } finally {
            setLoading(false);
        }
    }, []);

    const loadResendSetup = useCallback(async () => {
        try {
            const response = await fetch("/api/integrations/resend/status", { cache: "no-store", credentials: "include" });
            if (!response.ok) return;
            const result = (await response.json()) as { connected?: boolean; integration?: { permission?: string | null } | null };
            if (!result.connected) setResendSetup("missing");
            else if (result.integration?.permission === "sending_access") setResendSetup("sending_only");
            else setResendSetup("ready");
        } catch {
            // Leave the notice hidden if the status can't be read.
        }
    }, []);

    const loadComposeAccounts = useCallback(async () => {
        const workspaceId = getStoredWorkspaceId();
        const endpoints = [
            `/api/email-agent/customers?workspaceId=${encodeURIComponent(workspaceId)}`,
            `/api/dashboard/customers?workspaceId=${encodeURIComponent(workspaceId)}`,
        ];

        for (const endpoint of endpoints) {
            try {
                const response = await fetch(endpoint, {
                    method: "GET",
                    cache: "no-store",
                });

                if (!response.ok) continue;

                const result = await response.json();
                const rawAccounts = Array.isArray(result)
                    ? result
                    : Array.isArray(result.customers)
                        ? result.customers
                        : Array.isArray(result.accounts)
                            ? result.accounts
                            : [];

                const nextAccounts = rawAccounts
                    .map((account: Record<string, unknown>, index: number) => {
                        const email =
                            typeof account.email === "string"
                                ? account.email.trim()
                                : "";
                        const name =
                            typeof account.name === "string"
                                ? account.name.trim()
                                : typeof account.contactName === "string"
                                    ? account.contactName.trim()
                                    : email;
                        const company =
                            typeof account.company === "string"
                                ? account.company.trim()
                                : typeof account.companyName === "string"
                                    ? account.companyName.trim()
                                    : "";

                        if (!email) return null;

                        return {
                            id:
                                typeof account.id === "string"
                                    ? account.id
                                    : `account-${index}-${email}`,
                            name: name || email,
                            email,
                            company: company || undefined,
                        } satisfies ComposeAccount;
                    })
                    .filter(
                        (account: ComposeAccount | null): account is ComposeAccount =>
                            Boolean(account),
                    );

                setSavedAccountEmails(new Set(
                    nextAccounts.map((account: ComposeAccount) => account.email.toLowerCase()),
                ));

                if (nextAccounts.length > 0) {
                    setComposeAccounts(nextAccounts);
                    return;
                }
            } catch {
                // The inbox-thread fallback below keeps Compose usable.
            }
        }
    }, []);

    const loadSavedEmails = useCallback(async () => {
        try {
            setSavedEmailsLoading(true);
            setSavedEmailsError("");

            const workspaceId = getStoredWorkspaceId();
            const response = await fetch(
                `/api/email-agent/generated?workspaceId=${encodeURIComponent(workspaceId)}`,
                {
                    method: "GET",
                    cache: "no-store",
                },
            );
            const result = (await response.json()) as {
                emails?: BuilderSavedEmail[];
                error?: string;
            };

            if (!response.ok) {
                throw new Error(result.error || "Failed to load saved emails.");
            }

            setSavedEmails(Array.isArray(result.emails) ? result.emails : []);
        } catch (loadError) {
            setSavedEmailsError(
                loadError instanceof Error
                    ? loadError.message
                    : "Failed to load saved emails.",
            );
        } finally {
            setSavedEmailsLoading(false);
        }
    }, []);

    // Load once on mount. The loaders set state, so start them just after the
    // effect returns instead of synchronously inside it.
    useEffect(() => {
        let active = true;
        void Promise.resolve().then(() => {
            if (!active) return;
            void loadInbox();
            void loadComposeAccounts();
            void loadSavedEmails();
            void loadResendSetup();
        });
        return () => {
            active = false;
        };
    }, [loadInbox, loadComposeAccounts, loadSavedEmails, loadResendSetup]);

    useEffect(() => {
        const loadBuilderPreferences = () => {
            setSavedReplyCtas(getSavedBuilderCtas());
            setFooterSettings(getSavedFooterSettings());
        };

        loadBuilderPreferences();
        window.addEventListener("storage", loadBuilderPreferences);

        return () =>
            window.removeEventListener("storage", loadBuilderPreferences);
    }, []);

    // Keep the list current without a reload: check every minute while the
    // tab is visible, and straight away when you come back to it.
    useEffect(() => {
        const REFRESH_MS = 60_000;
        let lastRefresh = Date.now();
        const refresh = () => {
            if (document.visibilityState !== "visible") return;
            if (Date.now() - lastRefresh < 15_000) return;
            lastRefresh = Date.now();
            void loadInbox({ silent: true });
        };
        const timer = window.setInterval(refresh, REFRESH_MS);
        document.addEventListener("visibilitychange", refresh);
        window.addEventListener("focus", refresh);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", refresh);
            window.removeEventListener("focus", refresh);
        };
    }, [loadInbox]);

    // Follow ?folder= when the URL changes (back/forward, links), adjusting
    // state during render rather than in an effect.
    const [syncedFolderParam, setSyncedFolderParam] = useState(requestedFolder);
    if (requestedFolder !== syncedFolderParam) {
        setSyncedFolderParam(requestedFolder);
        if (requestedFolder && folderOptions.some((folder) => folder.value === requestedFolder)) {
            setActiveFolder(requestedFolder as InboxFolder);
        }
    }

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (
                dateFilterRef.current &&
                !dateFilterRef.current.contains(event.target as Node)
            ) {
                setDateMenuOpen(false);
            }

            if (
                replyOptionsRef.current &&
                !replyOptionsRef.current.contains(event.target as Node)
            ) {
                setReplyOptionsOpen(false);
                setCtaPickerOpen(false);
                setSavedEmailPickerOpen(false);
            }

            if (
                composeAccountPickerRef.current &&
                !composeAccountPickerRef.current.contains(event.target as Node)
            ) {
                setComposeAccountPickerOpen(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setDateMenuOpen(false);
                setSelectMode(false);
                setCheckedIds([]);
                setReplyOptionsOpen(false);
                setCtaPickerOpen(false);
                setSavedEmailPickerOpen(false);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    const visibleThreads = useMemo(() => {
        const query = search.trim().toLowerCase();

        const filtered = (payload?.threads ?? []).filter((thread) => {
            if (channelOf(thread) !== activeChannel) return false;
            if (!threadInFolder(thread, activeFolder)) return false;
            if (!inDateRange(thread, dateRange, loadedAt)) return false;
            if (!query) return true;

            return [
                thread.customerName,
                thread.customerEmail,
                thread.customerCompany,
                thread.subject,
                thread.preview,
                ...thread.labels,
            ]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(query));
        });

        return sortThreads(filtered, "newest");
    }, [activeChannel, activeFolder, dateRange, loadedAt, payload, search]);

    // Keep a visible thread selected: fall back to the first one when the
    // selection leaves the list (folder change, search, delete).
    const fallbackThreadId = visibleThreads.some((thread) => thread.id === selectedThreadId)
        ? selectedThreadId
        : visibleThreads[0]?.id ?? "";
    if (fallbackThreadId !== selectedThreadId) {
        setSelectedThreadId(fallbackThreadId);
    }

    // A different thread starts with a clean reply box.
    const [composerThreadId, setComposerThreadId] = useState(selectedThreadId);
    if (composerThreadId !== selectedThreadId) {
        setComposerThreadId(selectedThreadId);
        setSavedDraft({ target: selectedThreadId, id: null, signature: "" });
        setDraftError("");
        setReplySubject("");
        setReplyBody("");
        setAiReply("");
        setAiPrompt("");
        setAiError("");
        setSummaryOpen(false);
        setSummaryError("");
        setReplyAttachments([]);
        setReplyOptionsOpen(false);
        setCtaPickerOpen(false);
        setSavedEmailPickerOpen(false);
        setSavedEmailSearch("");
        setReplyFooterIncluded(false);
        setPreviewAttachmentIndex(null);
        setSendError("");
    }

    const selectThread = (thread: InboxThread) => {
        // A draft (or a conversation with a saved reply) reopens for editing.
        const draftThread = thread.draft
            ? thread
            : payload?.threads.find((candidate) => candidate.draft?.threadId === thread.id);
        if (draftThread) {
            resumeDraft(draftThread);
            return;
        }
        setComposeOpen(false);
        setComposeAccountPickerOpen(false);
        if (thread.id !== selectedThreadId) {
            setReplySubject("");
            setSummaryOpen(false);
            setChatDraft("");
        }
        setSelectedThreadId(thread.id);

        if (thread.unread) saveThreadAction(thread, { read: true });
    };

    const unreadInboxCount = useMemo(
        () =>
            (payload?.threads ?? []).filter(
                (thread) => thread.folder === "inbox" && thread.unread,
            ).length,
        [payload],
    );

    useEffect(() => {
        window.dispatchEvent(
            new CustomEvent("cobrai:inbox-unread-changed", {
                detail: {
                    count: unreadInboxCount,
                },
            }),
        );
    }, [unreadInboxCount]);


    const selectedThread =
        visibleThreads.find((thread) => thread.id === selectedThreadId) ?? null;

    const displayedMessage = selectedThread
        ? getLatestMessage(selectedThread)
        : null;

    const currentSummary = selectedThread
        ? emailSummaries[selectedThread.id]
        : undefined;

    const availableComposeAccounts = useMemo(() => {
        const fromThreads = (payload?.threads ?? []).map((thread) => ({
            id: thread.id,
            name: thread.customerName,
            email: thread.customerEmail,
            company: thread.customerCompany || undefined,
        }));

        const merged = [...composeAccounts, ...fromThreads];
        const unique = new Map<string, ComposeAccount>();

        for (const account of merged) {
            const email = account.email?.trim().toLowerCase();
            if (!email || unique.has(email)) continue;
            unique.set(email, account);
        }

        return Array.from(unique.values()).sort((first, second) =>
            first.name.localeCompare(second.name),
        );
    }, [composeAccounts, payload]);

    const filteredComposeAccounts = useMemo(() => {
        const query = composeAccountSearch.trim().toLowerCase();
        if (!query) return availableComposeAccounts;

        return availableComposeAccounts.filter((account) =>
            [account.name, account.email, account.company]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(query)),
        );
    }, [availableComposeAccounts, composeAccountSearch]);

    // A typed address that isn't in the list can be emailed directly.
    const typedComposeEmail = useMemo(() => {
        const value = composeAccountSearch.trim().toLowerCase();
        if (!/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/.test(value)) return "";
        return availableComposeAccounts.some((account) => account.email.toLowerCase() === value) ? "" : value;
    }, [availableComposeAccounts, composeAccountSearch]);

    const chooseComposeRecipient = (account: ComposeAccount) => {
        setComposeRecipient(account);
        setComposeAccountSearch("");
        setComposeAccountPickerOpen(false);
        requestAnimationFrame(() => replyRef.current?.focus());
    };

    const filteredSavedEmails = useMemo(() => {
        const query = savedEmailSearch.trim().toLowerCase();

        if (!query) return savedEmails;

        return savedEmails.filter((email) =>
            [email.subject, email.emailType]
                .filter(Boolean)
                .some((value) => value.toLowerCase().includes(query)),
        );
    }, [savedEmailSearch, savedEmails]);

    const previewAttachmentUrl = useMemo(
        () => (previewAttachment ? URL.createObjectURL(previewAttachment) : ""),
        [previewAttachment],
    );

    useEffect(() => {
        return () => {
            if (previewAttachmentUrl) {
                URL.revokeObjectURL(previewAttachmentUrl);
            }
        };
    }, [previewAttachmentUrl]);

    const replaceThread = (threadId: string, next: (thread: InboxThread) => InboxThread) => {
        setPayload((current) =>
            current
                ? {
                    ...current,
                    threads: current.threads.map((thread) => (thread.id === threadId ? next(thread) : thread)),
                }
                : current,
        );
    };

    /**
     * Apply a star/read/folder/tag change at once and save it. Sample threads
     * are saved in this browser; real ones on the server, undone if that fails.
     */
    const saveThreadAction = (thread: InboxThread, action: ThreadAction) => {
        const previous = thread;
        replaceThread(thread.id, (current) => applyThreadAction(current, action));

        if (thread.demo) {
            saveDemoThreadAction(thread.id, action);
            return;
        }

        void fetch(`/api/dashboard/inbox/threads/${encodeURIComponent(thread.id)}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(action),
        })
            .then(async (response) => {
                if (response.ok) return;
                const result = (await response.json().catch(() => ({}))) as { error?: string };
                throw new Error(result.error || "Could not save that change.");
            })
            .catch((saveError: unknown) => {
                replaceThread(thread.id, () => previous);
                setError(saveError instanceof Error ? saveError.message : "Could not save that change.");
            });
    };

    /**
     * Apply one change to every ticked email: optimistic, saved in one request
     * for real mail, in this browser for samples, and undone if saving fails.
     * Drafts can only be deleted, which discards them.
     */
    const bulkThreadAction = (targets: InboxThread[], action: ThreadAction) => {
        setCheckedIds([]);
        setSelectMode(false);
        if (action.folder === "deleted") {
            for (const thread of targets) if (thread.draft) void discardDraft(thread.draft.id);
        }
        const threads = targets.filter((thread) => !thread.draft);
        if (threads.length === 0) return;

        const previous = new Map(threads.map((thread) => [thread.id, thread]));
        for (const thread of threads) {
            replaceThread(thread.id, (current) => applyThreadAction(current, action));
            if (thread.demo) saveDemoThreadAction(thread.id, action);
        }
        const realIds = threads.filter((thread) => !thread.demo).map((thread) => thread.id);
        if (realIds.length === 0) return;

        void fetch("/api/dashboard/inbox/threads", {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ threadIds: realIds, ...action }),
        })
            .then(async (response) => {
                if (response.ok) return;
                const result = (await response.json().catch(() => ({}))) as { error?: string };
                throw new Error(result.error || "Could not save that change.");
            })
            .catch((saveError: unknown) => {
                for (const id of realIds) {
                    const before = previous.get(id);
                    if (before) replaceThread(id, () => before);
                }
                setError(saveError instanceof Error ? saveError.message : "Could not save that change.");
            });
    };

    const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);

    // A received image or PDF open in the preview window.
    const [receivedPreview, setReceivedPreview] = useState<
        { fileName: string; mimeType: string; sizeLabel: string; url: string } | null
    >(null);

    /**
     * Open a received file: images and PDFs show in the preview window,
     * anything else downloads. Errors show in the banner.
     */
    const openReceivedAttachment = async (attachment: { id: string; fileName: string; mimeType: string; sizeLabel: string }) => {
        setDownloadingAttachmentId(attachment.id);
        try {
            const response = await fetch(`/api/dashboard/inbox/attachments/${encodeURIComponent(attachment.id)}`, {
                credentials: "include",
            });
            if (!response.ok) {
                const result = (await response.json().catch(() => ({}))) as { error?: string };
                throw new Error(result.error || "The attachment could not be downloaded.");
            }
            const blob = await response.blob();
            const mimeType = (response.headers.get("content-type") || attachment.mimeType).split(";")[0].trim().toLowerCase();
            const url = URL.createObjectURL(blob.type === mimeType ? blob : new Blob([blob], { type: mimeType }));
            if (PREVIEWABLE_TYPES.has(mimeType)) {
                setReceivedPreview({ fileName: attachment.fileName, mimeType, sizeLabel: attachment.sizeLabel, url });
                return;
            }
            saveBlobUrl(url, attachment.fileName);
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
        } catch (downloadError) {
            setError(downloadError instanceof Error ? downloadError.message : "The attachment could not be downloaded.");
        } finally {
            setDownloadingAttachmentId(null);
        }
    };

    const closeReceivedPreview = () => {
        if (receivedPreview) URL.revokeObjectURL(receivedPreview.url);
        setReceivedPreview(null);
    };

    // One preview window for both a received file and a file you're attaching.
    const previewView = receivedPreview ?? (previewAttachment && previewAttachmentUrl
        ? {
            fileName: previewAttachment.name,
            mimeType: previewAttachment.type,
            sizeLabel: `${Math.max(1, Math.round(previewAttachment.size / 1024))} KB`,
            url: previewAttachmentUrl,
        }
        : null);
    const closePreview = () => {
        closeReceivedPreview();
        setPreviewAttachmentIndex(null);
    };

    const toggleChecked = (threadId: string) =>
        setCheckedIds((current) =>
            current.includes(threadId) ? current.filter((id) => id !== threadId) : [...current, threadId]);

    const markSelectedThreadUnread = () => {
        if (selectedThread) saveThreadAction(selectedThread, { read: false });
    };

    const setSelectedThreadLabels = (labels: string[]) => {
        if (selectedThread) saveThreadAction(selectedThread, { labels });
    };

    const editContact = (threadId: string, patch: ContactEdits) => {
        setContactEdits((current) => {
            const next = { ...current, [threadId]: { ...current[threadId], ...patch } };
            try {
                window.localStorage.setItem(CONTACT_EDITS_KEY, JSON.stringify(next));
            } catch {
                // Edits still apply for this session.
            }
            return next;
        });
    };

    const archiveSelectedThread = () => {
        if (selectedThread) saveThreadAction(selectedThread, { folder: "archived" });
    };

    const deleteSelectedThread = () => {
        if (selectedThread?.draft) {
            void discardDraft(selectedThread.draft.id);
            return;
        }
        if (selectedThread) saveThreadAction(selectedThread, { folder: "deleted" });
    };

    const restoreSelectedThread = () => {
        if (selectedThread) saveThreadAction(selectedThread, { folder: null });
    };

    const toggleSelectedThreadStar = () => {
        if (selectedThread) saveThreadAction(selectedThread, { starred: !selectedThread.starred });
    };

    const openCompose = () => {
        setSendError("");
        setSavedDraft({ target: "compose", id: null, signature: "" });
        setDraftError("");
        setComposeOpen(true);
        setComposeRecipient(null);
        setComposeAccountSearch("");
        setComposeAccountPickerOpen(true);
        setReplySubject("");
        setReplyBody("");
        setReplyAttachments([]);
        setReplyOptionsOpen(false);
        setCtaPickerOpen(false);
        setSavedEmailPickerOpen(false);
        setReplyFooterIncluded(false);

        if (replyRef.current) {
            replyRef.current.innerHTML = "";
        }

        requestAnimationFrame(() => {
            composeAccountPickerRef.current
                ?.querySelector<HTMLInputElement>("input")
                ?.focus();
        });
    };

    const closeCompose = () => {
        setSendError("");
        setComposeOpen(false);
        setComposeRecipient(null);
        setComposeAccountSearch("");
        setComposeAccountPickerOpen(false);
        setReplySubject("");
        setReplyBody("");
        setReplyAttachments([]);
        setReplyOptionsOpen(false);
        setCtaPickerOpen(false);
        setSavedEmailPickerOpen(false);
        setReplyFooterIncluded(false);

        if (replyRef.current) {
            replyRef.current.innerHTML = "";
        }
    };

    const sendReply = async () => {
        if (sending) return;

        const html = replyRef.current?.innerHTML ?? "";
        if (!replyRef.current?.innerText.trim()) {
            setSendError("Write a message before sending.");
            return;
        }
        if (composeOpen && !composeRecipient) {
            setComposeAccountPickerOpen(true);
            setSendError("Choose a recipient before sending.");
            return;
        }
        if (!composeOpen && !selectedThread) return;
        if (composeOpen && !replySubject.trim()) {
            setSendError("Add a subject before sending.");
            return;
        }
        if (replyAttachments.length > MAX_ATTACHMENTS) {
            setSendError(`Attach up to ${MAX_ATTACHMENTS} files per email.`);
            return;
        }
        if (replyAttachments.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_ATTACHMENT_BYTES) {
            setSendError("Attachments can add up to 20 MB per email.");
            return;
        }
        if (replyAttachments.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
            setSendError("Attachments must be 10 MB or smaller.");
            return;
        }

        const threadId = composeOpen ? "" : selectedThread?.id ?? "";
        const signature = JSON.stringify([
            threadId,
            composeRecipient?.email ?? "",
            replySubject,
            html,
            replyAttachments.map((file) => [file.name, file.size, file.lastModified]),
        ]);
        if (sendKeyRef.current?.signature !== signature) {
            sendKeyRef.current = { signature, key: crypto.randomUUID() };
        }

        const form = new FormData();
        form.set("sendKey", sendKeyRef.current.key);
        form.set("subject", replySubject.trim());
        form.set("html", html);
        if (threadId) {
            form.set("threadId", threadId);
        } else if (composeRecipient) {
            form.set("to", composeRecipient.email);
            form.set("toName", composeRecipient.name);
        }
        for (const file of replyAttachments) form.append("attachment", file);
        if (savedDraft.target === draftTarget && savedDraft.id) form.set("draftId", savedDraft.id);
        const sendingDraftSignature = draftSignature;

        const wasCompose = composeOpen;
        let sentThreadId = "";

        try {
            setSending(true);
            setSendError("");

            const response = await fetch("/api/dashboard/inbox/send", {
                method: "POST",
                body: form,
            });
            const result = (await response.json().catch(() => ({}))) as {
                sentThreadId?: string;
                error?: string;
            };

            if (!response.ok) {
                throw new Error(result.error || "The email could not be sent.");
            }
            sentThreadId = result.sentThreadId ?? "";
        } catch (sendFailure) {
            setSendError(
                sendFailure instanceof Error
                    ? sendFailure.message
                    : "The email could not be sent.",
            );
            return;
        } finally {
            setSending(false);
        }

        sendKeyRef.current = null;
        // The server removed the draft along with sending it.
        sentDraftSignatureRef.current = sendingDraftSignature;
        setSavedDraft({ target: draftTarget, id: null, signature: "" });
        setDraftError("");
        setReplySubject("");
        setReplyBody("");
        if (replyRef.current) {
            replyRef.current.innerHTML = "";
        }
        setReplyAttachments([]);
        setReplyOptionsOpen(false);
        setCtaPickerOpen(false);
        setReplyFooterIncluded(false);

        if (attachmentInputRef.current) {
            attachmentInputRef.current.value = "";
        }

        if (composeOpen) {
            setComposeOpen(false);
            setComposeRecipient(null);
            setComposeAccountSearch("");
            setComposeAccountPickerOpen(false);
        }

        // Pull the sent message into the thread and the Sent folder.
        await loadInbox({ silent: true });
        if (wasCompose && sentThreadId) {
            setActiveFolder("sent");
            setSelectedThreadId(sentThreadId);
            router.replace("/dashboard/inbox?folder=sent", { scroll: false });
        }
    };

    // ---- Drafts: saved as you type, reopened from the Drafts folder ----------

    // What a draft would be saved against right now: Compose, or a reply to a
    // real email conversation in the Inbox.
    const replyDraftThread = !composeOpen && selectedThread && canReplyIn(activeFolder) &&
        !selectedThread.demo && !selectedThread.draft && !isChatChannel(selectedThread.channel)
        ? selectedThread
        : null;
    const draftTarget = composeOpen ? "compose" : replyDraftThread?.id ?? null;
    const draftSignature = draftTarget
        ? JSON.stringify({
            threadId: replyDraftThread?.id ?? null,
            to: composeOpen ? composeRecipient?.email ?? "" : "",
            toName: composeOpen ? composeRecipient?.name ?? "" : "",
            subject: replySubject,
            html: replyBody,
        })
        : "";
    const draftIsEmpty = !replyBody.replace(/<[^>]*>|&nbsp;/g, "").trim() && !replySubject.trim() &&
        !(composeOpen && composeRecipient);
    const draftSaved = Boolean(draftTarget && savedDraft.target === draftTarget && savedDraft.id &&
        savedDraft.signature === draftSignature);

    // Cleanup of the save effect below runs after this, so it can tell
    // "still typing here" from "moved to another draft".
    const currentDraftTargetRef = useRef<string | null>(null);
    useLayoutEffect(() => {
        currentDraftTargetRef.current = draftTarget;
        return () => {
            currentDraftTargetRef.current = null;
        };
    }, [draftTarget]);

    useEffect(() => {
        if (!draftTarget || sending) return;
        const known = savedDraft.target === draftTarget ? savedDraft : { id: null, signature: "" };
        if (draftSignature === known.signature || draftSignature === sentDraftSignatureRef.current) return;
        if (draftIsEmpty && !known.id && draftTarget === "compose") return;

        const target = draftTarget;
        const body = JSON.stringify({ ...JSON.parse(draftSignature), draftId: known.id });
        const save = (keepalive: boolean) => fetch("/api/dashboard/inbox/drafts", {
            method: "PUT",
            credentials: "include",
            keepalive,
            headers: { "Content-Type": "application/json" },
            body,
        });
        let started = false;
        const timer = window.setTimeout(() => {
            started = true;
            void save(false)
                .then(async (response) => {
                    const result = (await response.json().catch(() => ({}))) as { draftId?: string | null; error?: string };
                    if (!response.ok) throw new Error(result.error || "Draft not saved.");
                    if (currentDraftTargetRef.current !== target) return;
                    setSavedDraft({ target, id: result.draftId ?? null, signature: draftSignature });
                    setDraftError("");
                    void loadInbox({ silent: true });
                })
                .catch((saveError: unknown) => {
                    if (currentDraftTargetRef.current !== target) return;
                    setDraftError(saveError instanceof Error ? saveError.message : "Draft not saved.");
                });
        }, 1200);

        return () => {
            window.clearTimeout(timer);
            // Moving to another thread or closing Compose: save what's unsaved now.
            if (!started && currentDraftTargetRef.current !== target &&
                draftSignature !== sentDraftSignatureRef.current) {
                void save(true).then(() => loadInbox({ silent: true })).catch(() => undefined);
            }
        };
    }, [draftIsEmpty, draftSignature, draftTarget, loadInbox, savedDraft, sending]);

    /** Reopen a saved draft in Compose, or in the reply box of its conversation. */
    const resumeDraft = (thread: InboxThread) => {
        const draft = thread.draft;
        if (!draft) return;
        setSendError("");
        setDraftError("");
        if (draft.threadId) {
            setComposeOpen(false);
            setComposeAccountPickerOpen(false);
            setActiveFolder("inbox");
            setSelectedThreadId(draft.threadId);
            // Same thread for the reset check, so the draft isn't wiped.
            setComposerThreadId(draft.threadId);
            setSavedDraft({
                target: draft.threadId,
                id: draft.id,
                signature: JSON.stringify({ threadId: draft.threadId, to: "", toName: "", subject: draft.subject, html: draft.html }),
            });
            router.replace("/dashboard/inbox", { scroll: false });
        } else {
            openCompose();
            const recipient = draft.toEmail
                ? { id: `new:${draft.toEmail}`, name: draft.toName || draft.toEmail, email: draft.toEmail }
                : null;
            setComposeRecipient(recipient);
            setComposeAccountPickerOpen(!recipient);
            setSavedDraft({
                target: "compose",
                id: draft.id,
                signature: JSON.stringify({
                    threadId: null, to: recipient?.email ?? "", toName: recipient?.name ?? "",
                    subject: draft.subject, html: draft.html,
                }),
            });
        }
        setReplySubject(draft.subject);
        setReplyBody(draft.html);
        requestAnimationFrame(() => {
            if (replyRef.current) replyRef.current.innerHTML = draft.html;
            replyRef.current?.focus();
        });
    };

    const discardDraft = async (draftId: string) => {
        try {
            const response = await fetch(`/api/dashboard/inbox/drafts/${encodeURIComponent(draftId)}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (!response.ok) throw new Error("The draft could not be deleted.");
            await loadInbox({ silent: true });
        } catch (discardError) {
            setError(discardError instanceof Error ? discardError.message : "The draft could not be deleted.");
        }
    };

    /** Throw away the email being composed, including its saved draft. */
    const discardCompose = () => {
        sentDraftSignatureRef.current = draftSignature;
        const draftId = savedDraft.target === "compose" ? savedDraft.id : null;
        closeCompose();
        if (draftId) void discardDraft(draftId);
    };

    const runEditorCommand = (command: string, value?: string) => {
        replyRef.current?.focus();
        document.execCommand(command, false, value);
        setReplyBody(replyRef.current?.innerHTML ?? "");
    };

    const insertHtmlIntoReply = (html: string) => {
        const editor = replyRef.current;
        if (!editor) return;

        editor.insertAdjacentHTML("beforeend", html);
        setReplyBody(editor.innerHTML);

        requestAnimationFrame(() => {
            editor.focus();

            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            selection?.removeAllRanges();
            selection?.addRange(range);
        });
    };

    const insertLink = () => {
        const url = window.prompt("Paste the link URL");

        if (!url?.trim()) return;

        const href = safeLinkUrl(url);
        if (!href) {
            setSendError("Links must start with http://, https:// or mailto:.");
            return;
        }

        const label = window.prompt("Link text", "Open link")?.trim() || url.trim();
        insertHtmlIntoReply(
            `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`,
        );
        setReplyOptionsOpen(false);
    };

    const syncReplyEditor = () => {
        setReplyBody(replyRef.current?.innerHTML ?? "");
    };

    const removeTrailingEmptyReplyNodes = (editor: HTMLDivElement) => {
        let trailingNode = editor.lastChild;

        while (trailingNode) {
            const previousNode = trailingNode.previousSibling;
            const isEmptyTextNode =
                trailingNode.nodeType === Node.TEXT_NODE &&
                !(trailingNode.textContent ?? "").trim();
            const isEmptyElement =
                trailingNode instanceof HTMLElement &&
                !trailingNode.matches(
                    "[data-cobrai-cta], [data-cobrai-footer]",
                ) &&
                !(trailingNode.innerText ?? "").trim() &&
                !trailingNode.querySelector(
                    "img, a, button, [data-cobrai-cta], [data-cobrai-footer]",
                );

            if (!isEmptyTextNode && !isEmptyElement) break;

            trailingNode.remove();
            trailingNode = previousNode;
        }
    };

    const replyFooter = (editor: HTMLElement) =>
        Array.from(editor.children).find((child) => child.hasAttribute("data-cobrai-footer")) as HTMLElement | undefined;

    /** The footer always closes the email, even if text is typed after it. */
    const keepFooterLast = (editor: HTMLElement) => {
        const footer = replyFooter(editor);
        if (footer && editor.lastChild !== footer) editor.appendChild(footer);
    };

    /**
     * Where the selected block's toolbar sits, relative to the editor
     * wrapper: beside the button (right, or left when there's no room) so it
     * never covers the text around it; inside the footer's right edge.
     */
    const blockToolbarPosition = (block: HTMLElement) => {
        const editor = replyRef.current;
        const scroll = editor?.scrollTop ?? 0;
        const top = block.offsetTop + block.offsetHeight / 2 - scroll;
        const link = block.hasAttribute("data-cobrai-cta") ? block.querySelector<HTMLElement>("a") : null;
        if (!link) return { top, left: block.offsetLeft + block.offsetWidth - 4, side: "left" as const };

        const toolbarWidth = 200;
        const right = link.offsetLeft + link.offsetWidth + 10;
        return right + toolbarWidth <= (editor?.clientWidth ?? 0)
            ? { top, left: right, side: "right" as const }
            : { top, left: link.offsetLeft - 10, side: "left" as const };
    };

    const selectBlock = (block: HTMLElement | null) => {
        const editor = replyRef.current;
        editor?.querySelectorAll("[data-selected]").forEach((element) => element.removeAttribute("data-selected"));
        activeBlockRef.current = block;
        if (!block) {
            setActiveBlock(null);
            return;
        }
        block.setAttribute("data-selected", "true");
        setActiveBlock({
            kind: block.hasAttribute("data-cobrai-footer") ? "footer" : "cta",
            ...blockToolbarPosition(block),
        });
    };

    /** Inserts a block where the caret was, never below the footer. */
    const insertBlockAtCaret = (html: string) => {
        const editor = replyRef.current;
        if (!editor) return null;
        const template = document.createElement("template");
        template.innerHTML = html.trim();
        const block = template.content.firstElementChild as HTMLElement | null;
        if (!block) return null;

        const footer = replyFooter(editor);
        const range = savedRangeRef.current;
        let reference: ChildNode | null = null;

        if (range && editor.contains(range.startContainer)) {
            if (range.startContainer === editor) {
                reference = editor.childNodes[range.startOffset] ?? null;
            } else {
                let node: Node | null = range.startContainer;
                while (node && node.parentNode !== editor) node = node.parentNode;
                reference = node ? node.nextSibling : null;
            }
        }
        if (!reference || (footer && footer.compareDocumentPosition(reference) & Node.DOCUMENT_POSITION_FOLLOWING)) {
            reference = footer ?? null;
        }
        editor.insertBefore(block, reference);

        // Leave a line to keep typing on after a button at the end.
        if (!block.nextSibling || block.nextSibling === footer) {
            const line = document.createElement("p");
            line.innerHTML = "<br>";
            block.after(line);
        }

        syncReplyEditor();
        return block;
    };

    const insertSavedCtaIntoReply = (cta: BuilderSavedCta) => {
        const block = insertBlockAtCaret(buildSavedBuilderCtaHtml(cta));
        setReplyOptionsOpen(false);
        setCtaPickerOpen(false);
        if (block) requestAnimationFrame(() => selectBlock(block));
    };

    const insertSavedEmailIntoReply = (email: BuilderSavedEmail) => {
        const editor = replyRef.current;
        if (!editor) return;

        removeTrailingEmptyReplyNodes(editor);
        const footer = replyFooter(editor);
        if (footer) footer.insertAdjacentHTML("beforebegin", buildEditableSavedEmailHtml(email));
        else editor.insertAdjacentHTML("beforeend", buildEditableSavedEmailHtml(email));

        if (!replySubject.trim()) {
            setReplySubject(email.subject);
        }

        syncReplyEditor();
        setReplyOptionsOpen(false);
        setSavedEmailPickerOpen(false);
        setSavedEmailSearch("");

        requestAnimationFrame(() => {
            editor.focus();

            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            selection?.removeAllRanges();
            selection?.addRange(range);
        });
    };

    const toggleReplyFooter = () => {
        const editor = replyRef.current;
        if (!editor) return;
        setReplyOptionsOpen(false);

        const existingFooter = replyFooter(editor);
        if (existingFooter) {
            if (activeBlockRef.current === existingFooter) selectBlock(null);
            existingFooter.remove();
            setReplyFooterIncluded(false);
            syncReplyEditor();
            return;
        }

        const latestSettings = getSavedFooterSettings();
        setFooterSettings(latestSettings);
        if (!latestSettings.enabled) return;

        removeTrailingEmptyReplyNodes(editor);
        editor.insertAdjacentHTML("beforeend", buildReplyFooterHtml(latestSettings));
        setReplyFooterIncluded(true);
        syncReplyEditor();
    };

    const alignActiveCta = (alignment: "left" | "center" | "right") => {
        const block = activeBlockRef.current;
        if (!block) return;
        // Written as an inline style so the alignment survives sending.
        block.style.textAlign = alignment;
        syncReplyEditor();
        requestAnimationFrame(() => selectBlock(block));
    };

    const editActiveCta = () => {
        const block = activeBlockRef.current;
        const link = block?.querySelector<HTMLAnchorElement>("a");
        if (!block || !link) return;

        const nextText = window.prompt("Button text", link.textContent?.trim() || "");
        if (nextText === null) return;
        const nextLink = window.prompt("Button link", link.getAttribute("href") || "");
        if (nextLink === null) return;

        if (nextText.trim()) link.textContent = nextText.trim();
        if (nextLink.trim()) link.setAttribute("href", nextLink.trim());
        syncReplyEditor();
        requestAnimationFrame(() => selectBlock(block));
    };

    const removeActiveBlock = () => {
        const block = activeBlockRef.current;
        if (!block) return;
        if (block.hasAttribute("data-cobrai-footer")) setReplyFooterIncluded(false);
        selectBlock(null);
        block.remove();
        syncReplyEditor();
        replyRef.current?.focus();
    };

    const handleReplyEditorClick = (event: ReactMouseEvent<HTMLDivElement>) => {
        const block = (event.target as HTMLElement).closest<HTMLElement>("[data-cobrai-cta], [data-cobrai-footer]");
        if (block && replyRef.current?.contains(block)) {
            // A click selects the block; it never follows the button's link.
            event.preventDefault();
            selectBlock(block);
            return;
        }
        selectBlock(null);
    };

    const handleReplyInput = (event: FormEvent<HTMLDivElement>) => {
        keepFooterLast(event.currentTarget);
        setReplyBody(event.currentTarget.innerHTML);
        if (activeBlockRef.current) selectBlock(activeBlockRef.current.isConnected ? activeBlockRef.current : null);
    };

    // ---- Drag a button between paragraphs ----
    const handleReplyDragStart = (event: DragEvent<HTMLDivElement>) => {
        const block = (event.target as HTMLElement).closest?.<HTMLElement>("[data-cobrai-cta]");
        if (!block) return;
        draggedCtaRef.current = block;
        selectBlock(null);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", "");
    };

    const handleReplyDragOver = (event: DragEvent<HTMLDivElement>) => {
        const editor = replyRef.current;
        const dragged = draggedCtaRef.current;
        if (!editor || !dragged) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";

        const blocks = Array.from(editor.children).filter(
            (child) => child !== dragged && !child.hasAttribute("data-cobrai-footer"),
        ) as HTMLElement[];
        const before = blocks.find((block) => {
            const box = block.getBoundingClientRect();
            return event.clientY < box.top + box.height / 2;
        }) ?? null;

        dropBeforeRef.current = before ?? replyFooter(editor) ?? null;
        const last = blocks[blocks.length - 1];
        const top = before
            ? before.offsetTop - 3
            : last
                ? last.offsetTop + last.offsetHeight + 1
                : 8;
        setDropLineTop(top - editor.scrollTop);
    };

    const endReplyDrag = () => {
        draggedCtaRef.current = null;
        dropBeforeRef.current = null;
        setDropLineTop(null);
    };

    const handleReplyDrop = (event: DragEvent<HTMLDivElement>) => {
        const editor = replyRef.current;
        const dragged = draggedCtaRef.current;
        if (!editor || !dragged) return;
        event.preventDefault();
        editor.insertBefore(dragged, dropBeforeRef.current);
        endReplyDrag();
        syncReplyEditor();
        requestAnimationFrame(() => selectBlock(dragged));
    };

    const insertSignature = () => {
        insertHtmlIntoReply("<p>Best,<br />The Cobrai Team</p>");
        setReplyOptionsOpen(false);
    };

    const clearReply = () => {
        setReplySubject("");
        setReplyBody("");
        if (replyRef.current) {
            replyRef.current.innerHTML = "";
        }
        setReplyAttachments([]);
        setPreviewAttachmentIndex(null);
        setReplyOptionsOpen(false);

        if (attachmentInputRef.current) {
            attachmentInputRef.current.value = "";
        }

        requestAnimationFrame(() => replyRef.current?.focus());
    };

    const removeReplyAttachment = (index: number) => {
        setReplyAttachments((current) => current.filter((_, position) => position !== index));
        setPreviewAttachmentIndex(null);
        setReplyOptionsOpen(false);

        if (attachmentInputRef.current) {
            attachmentInputRef.current.value = "";
        }
    };

    const generateEmailSummary = async (regenerate = false) => {
        if (!selectedThread || !displayedMessage) return;

        if (currentSummary && !regenerate) {
            setSummaryOpen((current) => !current);
            return;
        }

        try {
            setSummarising(true);
            setSummaryError("");
            setSummaryOpen(true);

            const response = await fetch("/api/dashboard/inbox/ai-summary", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspaceId:
                        payload?.workspaceId ?? getStoredWorkspaceId(),
                    thread: selectedThread,
                    message: displayedMessage,
                }),
            });

            const result = (await response.json()) as {
                summary?: EmailSummary;
                error?: string;
            };

            if (!response.ok || !result.summary) {
                throw new Error(
                    result.error || "The email summary could not be generated.",
                );
            }

            setEmailSummaries((current) => ({
                ...current,
                [selectedThread.id]: result.summary as EmailSummary,
            }));
        } catch (summaryGenerationError) {
            setSummaryError(
                summaryGenerationError instanceof Error
                    ? summaryGenerationError.message
                    : "The email summary could not be generated.",
            );
        } finally {
            setSummarising(false);
        }
    };

    const generateAiReply = async () => {
        if (!selectedThread || !aiPrompt.trim()) return;

        try {
            setGeneratingReply(true);
            setAiError("");

            const response = await fetch("/api/dashboard/inbox/ai-reply", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspaceId:
                        payload?.workspaceId ?? getStoredWorkspaceId(),
                    instruction: aiPrompt.trim(),
                    thread: selectedThread,
                }),
            });

            const result = (await response.json()) as {
                reply?: string;
                error?: string;
            };

            if (!response.ok || !result.reply) {
                throw new Error(
                    result.error || "The AI reply could not be generated.",
                );
            }

            setAiReply(result.reply);
        } catch (generationError) {
            setAiError(
                generationError instanceof Error
                    ? generationError.message
                    : "The AI reply could not be generated.",
            );
        } finally {
            setGeneratingReply(false);
        }
    };

    const useAiReply = () => {
        if (!aiReply.trim()) return;

        const formattedReply = aiReply
            .trim()
            .split(/\n{2,}/)
            .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
            .join("");

        setReplyBody(formattedReply);
        if (replyRef.current) {
            replyRef.current.innerHTML = formattedReply;
        }
        setAiPanelOpen(false);
    };

    const selectedDateOption =
        dateRangeOptions.find((option) => option.value === dateRange) ??
        dateRangeOptions[0];

    const listThreads = visibleThreads.filter((thread) => listFilter !== "unread" || thread.unread);
    // Ticks only count for emails still in the list (a folder change or
    // search drops the rest).
    const checkedThreads = listThreads.filter((thread) => checkedIds.includes(thread.id));
    const allChecked = listThreads.length > 0 && checkedThreads.length === listThreads.length;
    const checkedInBin = checkedThreads.length > 0 &&
        checkedThreads.every((thread) => thread.folder === "archived" || thread.folder === "deleted");
    const checkedAllStarred = checkedThreads.length > 0 && checkedThreads.every((thread) => thread.starred);
    const allThreads = payload?.threads ?? [];
    // Counts follow the chosen date range, so a folder never shows a number
    // for emails the list then hides.
    const channelThreads = (channel: InboxChannel) =>
        allThreads.filter((thread) => channelOf(thread) === channel && inDateRange(thread, dateRange, loadedAt));
    const channelUnread = (channel: InboxChannel) =>
        channelThreads(channel).filter((thread) => thread.folder === "inbox" && thread.unread).length;
    const activeMeta = CHANNEL_META[activeChannel];
    const chatChannelActive = isChatChannel(activeChannel);
    // Chats have no sent mail, drafts or failed sends, so those folders hide.
    const mainFolders = chatChannelActive
        ? MAIN_FOLDERS.filter((item) => item.folder === "inbox" || item.folder === "starred" || item.folder === "deleted")
        : MAIN_FOLDERS;
    const otherFolders = chatChannelActive ? OTHER_FOLDERS.filter((item) => item.folder === "archived") : OTHER_FOLDERS;
    const selectedIsChat = Boolean(selectedThread && isChatChannel(selectedThread.channel));
    const chatThread = selectedThread && selectedIsChat
        ? (() => {
            const { properties, ...fields } = contactEdits[selectedThread.id] ?? {};
            void properties;
            return { ...selectedThread, ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) } as InboxThread;
        })()
        : null;
    /** Counts for the chosen channel only. */
    const folderCount = (folder: InboxFolder) =>
        channelThreads(activeChannel).filter((thread) => threadInFolder(thread, folder)).length;
    const toggleSection = (name: string) =>
        setClosedSections((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));
    const viewTitle = listFilter === "unread"
        ? "Unread"
        : [...MAIN_FOLDERS, ...OTHER_FOLDERS].find((item) => item.folder === activeFolder)?.label ?? "Inbox";
    const inboxUrl = (folder: InboxFolder, channel: InboxChannel) => {
        const params = new URLSearchParams();
        if (channel !== "email") params.set("channel", channel);
        if (folder !== "inbox") params.set("folder", folder);
        const query = params.toString();
        return query ? `/dashboard/inbox?${query}` : "/dashboard/inbox";
    };
    const openFolder = (folder: InboxFolder) => {
        setListFilter("all");
        if (folder === activeFolder) return;
        if (composeOpen) closeCompose();
        setActiveFolder(folder);
        setSelectedThreadId("");
        router.replace(inboxUrl(folder, activeChannel), { scroll: false });
    };
    const exitSelectMode = () => {
        setSelectMode(false);
        setCheckedIds([]);
    };
    const showComposer = composeOpen || (Boolean(selectedThread) && canReplyIn(activeFolder) && !selectedIsChat);
    /** Switch channel; the folder stays if that channel has it. */
    const openChannel = (channel: InboxChannel) => {
        if (channel === activeChannel) return;
        if (composeOpen) closeCompose();
        const chat = isChatChannel(channel);
        const folder = chat && !["inbox", "starred", "deleted", "archived"].includes(activeFolder) ? "inbox" : activeFolder;
        setActiveChannel(channel);
        setActiveFolder(folder);
        setListFilter("all");
        setSelectedThreadId("");
        setSummaryOpen(false);
        router.replace(inboxUrl(folder, channel), { scroll: false });
    };
    // Chat channels aren't connected yet: a sent chat message is added to the
    // demo conversation here. Real sending goes through each integration.
    const appendChatMessage = (threadId: string, text: string, file: File | null = null) => {
        const sentAt = new Date().toISOString();
        const attachments = file
            ? [{
                id: `local_file_${crypto.randomUUID()}`,
                fileName: file.name,
                mimeType: file.type || "application/octet-stream",
                sizeLabel: file.size >= 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`,
                url: URL.createObjectURL(file),
            }]
            : undefined;
        setPayload((current) => current && ({
            ...current,
            threads: current.threads.map((thread) => thread.id !== threadId ? thread : {
                ...thread,
                preview: text || attachments?.[0]?.fileName || "",
                lastMessageAt: sentAt,
                messages: [...thread.messages, {
                    id: `local_${crypto.randomUUID()}`,
                    direction: "outbound",
                    fromName: "You",
                    fromEmail: "",
                    toName: thread.customerName,
                    toEmail: thread.customerHandle ?? "",
                    sentAt,
                    status: "sent",
                    html: null,
                    plainText: text,
                    attachments,
                }],
            }),
        }));
    };
    /**
     * Share an email by forwarding it: Compose opens with "Fwd:" and the
     * original quoted below. The original goes in as plain text, so none of
     * the incoming email's HTML runs in the editor. Files aren't re-sent;
     * the header lists them so the recipient knows what came with it.
     */
    const forwardSelectedThread = () => {
        const message = displayedMessage;
        if (!selectedThread || !message) return;
        const subject = /^fwd?:/i.test(selectedThread.subject) ? selectedThread.subject : `Fwd: ${selectedThread.subject}`;
        const files = message.attachments?.map((attachment) => attachment.fileName) ?? [];
        const header = [
            "---------- Forwarded message ----------",
            `From: ${message.fromName} <${message.fromEmail}>`,
            `Date: ${formatFullDate(message.sentAt)}`,
            `Subject: ${selectedThread.subject}`,
            `To: ${message.toEmail || message.toName}`,
            ...(files.length ? [`Attachments (not included): ${files.join(", ")}`] : []),
        ].map(escapeHtml).join("<br>");
        const body = escapeHtml(message.plainText.trim()).replace(/\n/g, "<br>");
        const html = `<p><br></p><p>${header}</p><blockquote>${body}</blockquote>`;

        openCompose();
        setReplySubject(subject);
        setReplyBody(html);
        requestAnimationFrame(() => {
            if (replyRef.current) replyRef.current.innerHTML = html;
        });
    };

    const emailContact = (thread: InboxThread) => {
        openCompose();
        setComposeRecipient({ id: thread.customerId ?? thread.id, name: thread.customerName, email: thread.customerEmail, company: thread.customerCompany ?? undefined });
        setComposeAccountPickerOpen(false);
    };
    const canUseAi = !composeOpen && Boolean(selectedThread);
    const selectedIndex = listThreads.findIndex((thread) => thread.id === selectedThreadId);
    const stepThread = (offset: number) => {
        const next = listThreads[selectedIndex + offset];
        if (next) selectThread(next);
    };

    return (
        <main className={styles.page}>
            {error && <div className={styles.errorBanner} role="alert">{error}</div>}
            {!setupNoticeDismissed && (resendSetup === "missing" || resendSetup === "sending_only") && (
                <div className={styles.setupNotice} role="status">
                    <CircleAlert size={15} aria-hidden="true" />
                    <span>
                        {resendSetup === "missing"
                            ? "Connect Resend to send email from the inbox and receive replies."
                            : "Your Resend key can only send, so customer replies won't arrive here. Reconnect Resend with a full-access key to receive them."}
                    </span>
                    <Link href="/dashboard/integrations" className={styles.ghostButton}>Open Integrations</Link>
                    <button type="button" className={styles.iconButton} aria-label="Dismiss" onClick={() => setSetupNoticeDismissed(true)}>
                        <X size={14} />
                    </button>
                </div>
            )}

            <section className={`${styles.shell} ${foldersFolded ? styles.shellFolded : ""}`}>
                {/* ---- Inbox sidebar: folders, views and channels ---- */}
                <aside className={styles.folderPane} aria-label="Inbox navigation">
                    <div className={styles.paneHead}>
                        <h1 className={styles.paneTitle}>Inbox</h1>
                        <button
                            type="button"
                            className={styles.foldButton}
                            aria-label={foldersFolded ? "Show folders" : "Hide folders"}
                            aria-expanded={!foldersFolded}
                            title={foldersFolded ? "Show folders" : "Hide folders"}
                            onClick={() => setFoldersFolded((folded) => !folded)}
                        >
                            {foldersFolded ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
                        </button>
                    </div>

                    <nav className={styles.folderSection} aria-label={`${activeMeta.label} folders`}>
                        {mainFolders.map(({ folder, label, icon: Icon }) => (
                            <button
                                key={folder}
                                type="button"
                                className={activeFolder === folder && listFilter === "all" ? styles.folderActive : styles.folderLink}
                                aria-current={activeFolder === folder && listFilter === "all" ? "page" : undefined}
                                title={label}
                                onClick={() => openFolder(folder)}
                            >
                                <Icon size={15} aria-hidden="true" />
                                <span>{label}</span>
                                <small>{folderCount(folder)}</small>
                            </button>
                        ))}
                        <button
                            type="button"
                            className={listFilter === "unread" ? styles.folderActive : styles.folderLink}
                            aria-current={listFilter === "unread" ? "page" : undefined}
                            title="Unread"
                            onClick={() => {
                                openFolder("inbox");
                                setListFilter("unread");
                            }}
                        >
                            <MailOpen size={15} aria-hidden="true" />
                            <span>Unread</span>
                            <small>{channelUnread(activeChannel)}</small>
                        </button>
                    </nav>

                    {otherFolders.length > 0 && (
                        <section className={styles.folderSection}>
                            <button type="button" className={styles.sectionHead} aria-expanded={!closedSections.includes("others")} onClick={() => toggleSection("others")}>
                                Others
                                <ChevronDown size={13} className={closedSections.includes("others") ? styles.chevronClosed : undefined} aria-hidden="true" />
                            </button>
                            {!closedSections.includes("others") && otherFolders.map(({ folder, label, icon: Icon }) => (
                                <button
                                    key={folder}
                                    type="button"
                                    className={activeFolder === folder && listFilter === "all" ? styles.folderActive : styles.folderLink}
                                    aria-current={activeFolder === folder && listFilter === "all" ? "page" : undefined}
                                    onClick={() => openFolder(folder)}
                                >
                                    <Icon size={15} aria-hidden="true" />
                                    <span>{label}</span>
                                    <small>{folderCount(folder)}</small>
                                </button>
                            ))}
                        </section>
                    )}

                    {/* Channels, listed like Others. Picking one switches the
                        folders above and the list to that channel. */}
                    <section className={`${styles.folderSection} ${styles.channelsSection}`} aria-label="Channels">
                        <button type="button" className={styles.sectionHead} aria-expanded={!closedSections.includes("channels")} onClick={() => toggleSection("channels")}>
                            Channels
                            <ChevronDown size={13} className={closedSections.includes("channels") ? styles.chevronClosed : undefined} aria-hidden="true" />
                        </button>
                        {!closedSections.includes("channels") && (
                            <>
                                {(["email", ...CHAT_CHANNELS] as InboxChannel[]).map((channel) => {
                                    const label = CHANNEL_META[channel].label;
                                    if (channel !== "email" && channelThreads(channel).length === 0) {
                                        return (
                                            <Link
                                                key={channel}
                                                href="/dashboard/integrations"
                                                className={styles.channelSoon}
                                                title={`Connect ${label} to bring its conversations into the inbox.`}
                                            >
                                                <ChannelLogo channel={channel} size={15} />
                                                <span>{label}</span>
                                            </Link>
                                        );
                                    }
                                    const unread = channelUnread(channel);
                                    return (
                                        <button
                                            key={channel}
                                            type="button"
                                            className={channel === activeChannel ? styles.folderActive : styles.folderLink}
                                            aria-current={channel === activeChannel ? "page" : undefined}
                                            title={label}
                                            onClick={() => openChannel(channel)}
                                        >
                                            <ChannelLogo channel={channel} size={15} />
                                            <span>{label}</span>
                                            {unread > 0 && <small>{unread}</small>}
                                        </button>
                                    );
                                })}
                                {channelProviders.map((label) => {
                                    const channel = Object.values(UPCOMING_CHANNELS).find((item) => item.label === label)!;
                                    return (
                                        <Link
                                            key={label}
                                            href="/dashboard/integrations"
                                            className={styles.channelSoon}
                                            title={`${label} is connected, but its messages don't come into the inbox yet.`}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={channel.logo} alt="" width={15} height={15} />
                                            <span>{label}</span>
                                        </Link>
                                    );
                                })}
                                <Link href="/dashboard/integrations" className={styles.addChannel} title="Add channel">
                                    <Plus size={15} aria-hidden="true" />
                                    <span>Add channel</span>
                                </Link>
                            </>
                        )}
                    </section>
                </aside>

                <div className={styles.topBar}>
                    <span className={styles.viewTitle}>
                        <ChannelLogo channel={activeChannel} size={15} />
                        {activeMeta.label}
                        <span className={styles.viewTitleSep}>/</span>
                        {viewTitle}
                    </span>

                    <label className={styles.headerSearch}>
                        <Search size={14} aria-hidden="true" />
                        <input
                            ref={searchRef}
                            type="search"
                            placeholder="Search…"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            aria-label="Search mail"
                        />
                        {search ? (
                            <button type="button" aria-label="Clear search" onClick={() => setSearch("")}>
                                <X size={12} />
                            </button>
                        ) : (
                            <kbd>⌘K</kbd>
                        )}
                    </label>

                    <span className={styles.spacer} />

                    <span className={styles.range}>
                        {listThreads.length ? `${selectedIndex >= 0 ? selectedIndex + 1 : 1}–${listThreads.length}` : "0"} of {listThreads.length}
                    </span>

                    <button
                        type="button"
                        className={selectMode ? styles.ghostButtonActive : styles.ghostButton}
                        aria-pressed={selectMode}
                        onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                        disabled={listThreads.length === 0 && !selectMode}
                    >
                        <ListChecks size={13} aria-hidden="true" />
                        {selectMode ? "Done" : "Select"}
                    </button>

                    <div className={styles.pager}>
                        <button type="button" className={styles.iconButton} aria-label="Previous email" disabled={selectedIndex <= 0} onClick={() => stepThread(-1)}>
                            <ChevronLeft size={15} />
                        </button>
                        <button type="button" className={styles.iconButton} aria-label="Next email" disabled={selectedIndex < 0 || selectedIndex >= listThreads.length - 1} onClick={() => stepThread(1)}>
                            <ChevronRight size={15} />
                        </button>
                    </div>

                    {activeChannel === "email" && (
                        <button
                            type="button"
                            className={styles.primaryButton}
                            onClick={composeOpen ? closeCompose : openCompose}
                            aria-expanded={composeOpen}
                        >
                            {composeOpen ? <X size={14} /> : <PenSquare size={14} />}
                            {composeOpen ? "Close" : "Compose"}
                        </button>
                    )}
                </div>

                {/* ---- Message list ---- */}
                <aside className={styles.listPane}>
                    {/* Date filter, just above the emails. */}
                    <div className={styles.listHeader}>
                        {dateRange !== "all" && <span className={styles.listHeaderLabel}>{selectedDateOption.label}</span>}
                        <div ref={dateFilterRef} className={styles.dateFilter}>
                            <button
                                type="button"
                                className={dateRange === "all" ? styles.iconButton : styles.iconButtonActive}
                                aria-haspopup="listbox"
                                aria-expanded={dateMenuOpen}
                                aria-label={`Filter by date: ${selectedDateOption.label}`}
                                title={selectedDateOption.label}
                                onClick={() => setDateMenuOpen((current) => !current)}
                            >
                                <SlidersHorizontal size={14} aria-hidden="true" />
                            </button>
                            {dateMenuOpen && (
                                <div className={styles.menu} role="listbox" aria-label="Filter emails by date">
                                    <div className={styles.menuLabel}>Date</div>
                                    {dateRangeOptions.map((option) => {
                                        const isSelected = option.value === dateRange;
                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                className={isSelected ? styles.menuItemActive : styles.menuItem}
                                                onClick={() => {
                                                    setDateRange(option.value);
                                                    setDateMenuOpen(false);
                                                }}
                                            >
                                                {option.label}
                                                {isSelected && <Check size={14} />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                    {selectMode && (
                        <div className={styles.bulkBar} role="toolbar" aria-label="Selected emails">
                            <input
                                type="checkbox"
                                className={styles.bulkCheck}
                                checked={allChecked}
                                ref={(input) => {
                                    if (input) input.indeterminate = checkedThreads.length > 0 && !allChecked;
                                }}
                                onChange={() => setCheckedIds(allChecked ? [] : listThreads.map((thread) => thread.id))}
                                aria-label={allChecked ? "Clear selection" : "Select all emails"}
                            />
                            <span className={styles.bulkCount}>
                                {checkedThreads.length ? `${checkedThreads.length} selected` : "Select emails"}
                            </span>
                            <span className={styles.spacer} />
                            {checkedInBin ? (
                                <button type="button" className={styles.iconButton} aria-label="Move back to the inbox" title="Restore" onClick={() => bulkThreadAction(checkedThreads, { folder: null })} disabled={checkedThreads.length === 0}>
                                    <RotateCcw size={15} />
                                </button>
                            ) : (
                                <>
                                    <button type="button" className={styles.iconButton} aria-label="Archive selected" title="Archive" onClick={() => bulkThreadAction(checkedThreads, { folder: "archived" })} disabled={checkedThreads.length === 0}>
                                        <Archive size={15} />
                                    </button>
                                    <button type="button" className={styles.iconButton} aria-label="Delete selected" title="Delete" onClick={() => bulkThreadAction(checkedThreads, { folder: "deleted" })} disabled={checkedThreads.length === 0}>
                                        <Trash2 size={15} />
                                    </button>
                                </>
                            )}
                            <button type="button" className={styles.iconButton} aria-label="Mark selected as read" title="Mark read" onClick={() => bulkThreadAction(checkedThreads, { read: true })} disabled={checkedThreads.length === 0}>
                                <MailCheck size={15} />
                            </button>
                            <button type="button" className={styles.iconButton} aria-label="Mark selected as unread" title="Mark unread" onClick={() => bulkThreadAction(checkedThreads, { read: false })} disabled={checkedThreads.length === 0}>
                                <MailOpen size={15} />
                            </button>
                            <button
                                type="button"
                                className={styles.iconButton}
                                aria-label={checkedAllStarred ? "Unstar selected" : "Star selected"}
                                title={checkedAllStarred ? "Unstar" : "Star"}
                                onClick={() => bulkThreadAction(checkedThreads, { starred: !checkedAllStarred })}
                                disabled={checkedThreads.length === 0}
                            >
                                {checkedAllStarred ? <StarOff size={15} /> : <Star size={15} />}
                            </button>
                            <button type="button" className={styles.iconButton} aria-label="Stop selecting" title="Done" onClick={exitSelectMode}>
                                <X size={15} />
                            </button>
                        </div>
                    )}
                    <div className={`${styles.threadList} ${selectMode ? styles.threadListSelecting : ""}`}>
                        {loading ? (
                            <div className={styles.emptyState}>
                                <Loader2 size={18} className={styles.spinning} />
                                Loading emails
                            </div>
                        ) : listThreads.length === 0 ? (
                            <div className={styles.emptyState}>
                                <MailOpen size={18} />
                                No emails here
                                <small>Try another folder, date range or search.</small>
                            </div>
                        ) : (
                            listThreads.map((thread) => {
                                const latestMessage = getLatestMessage(thread);
                                const attachments = latestMessage?.attachments ?? [];
                                const checked = checkedIds.includes(thread.id);
                                return (
                                    <div key={thread.id} className={checked ? styles.threadRowChecked : styles.threadRow}>
                                        {selectMode && (
                                            <input
                                                type="checkbox"
                                                className={styles.threadCheck}
                                                checked={checked}
                                                onChange={() => toggleChecked(thread.id)}
                                                aria-label={`Select email from ${thread.customerName}: ${thread.subject}`}
                                            />
                                        )}
                                        <button
                                            type="button"
                                            className={[
                                                selectedThreadId === thread.id && !composeOpen && !selectMode ? styles.threadActive : styles.thread,
                                                thread.unread ? styles.threadUnread : "",
                                            ].join(" ")}
                                            aria-pressed={selectMode ? checked : undefined}
                                            onClick={() => {
                                                // In select mode a click ticks the email instead of opening it.
                                                if (selectMode) {
                                                    toggleChecked(thread.id);
                                                    return;
                                                }
                                                if (composeOpen) closeCompose();
                                                selectThread(thread);
                                            }}
                                        >
                                            <span className={styles.threadTop}>
                                                <span className={styles.avatarWrap}>
                                                    <span className={styles.avatar} style={avatarStyle(thread.customerName)}>
                                                        {getInitials(thread.customerName)}
                                                    </span>

                                                </span>
                                                <span className={styles.threadFrom}>{thread.customerName}</span>
                                                {thread.starred && <Star size={11} className={styles.starIcon} aria-label="Starred" />}
                                                <time>{formatListDate(thread.lastMessageAt)}</time>
                                            </span>
                                            <span className={styles.threadSubject}>{thread.subject}</span>
                                            <span className={styles.threadPreview}>{thread.preview}</span>
                                            {attachments.length > 0 && (
                                                <span className={styles.threadChips}>
                                                    {attachments.slice(0, 2).map((attachment) => {
                                                        const AttachmentIcon = getAttachmentIcon(attachment.mimeType, attachment.fileName);
                                                        return (
                                                            <span key={attachment.id} className={styles.chip} title={attachment.fileName}>
                                                                <AttachmentIcon size={11} />
                                                                <span>{attachment.fileName}</span>
                                                            </span>
                                                        );
                                                    })}
                                                    {attachments.length > 2 && <span className={styles.chip}>+{attachments.length - 2}</span>}
                                                </span>
                                            )}
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </aside>

                {/* ---- Reading pane ---- */}
                <section className={styles.readerPane}>
                    {!selectedThread && !composeOpen ? (
                        <div className={styles.readerEmpty}>
                            <Inbox size={22} />
                            <span>Select an email to read it</span>
                        </div>
                    ) : (
                        <>
                            {!composeOpen && selectedThread && !selectedIsChat && (
                                <div className={styles.toolbar}>
                                    <div className={styles.toolbarGroup}>
                                        {selectedThread.folder === "archived" || selectedThread.folder === "deleted" ? (
                                            <button type="button" className={styles.iconButton} aria-label="Move back to the inbox" title="Restore" onClick={restoreSelectedThread}>
                                                <RotateCcw size={15} />
                                            </button>
                                        ) : (
                                            <>
                                                <button type="button" className={styles.iconButton} aria-label="Archive conversation" title="Archive" onClick={archiveSelectedThread}>
                                                    <Archive size={15} />
                                                </button>
                                                <button type="button" className={styles.iconButton} aria-label="Delete conversation" title="Delete" onClick={deleteSelectedThread}>
                                                    <Trash2 size={15} />
                                                </button>
                                            </>
                                        )}
                                        <button type="button" className={styles.iconButton} aria-label="Mark as unread" title="Mark unread" onClick={markSelectedThreadUnread}>
                                            <MailOpen size={15} />
                                        </button>
                                    </div>
                                    {selectedIsChat && (
                                        <span className={styles.chatTitle}>
                                            <span className={styles.senderName}>{selectedThread.customerName}</span>
                                            <span>{selectedThread.customerHandle} · {CHANNEL_META[channelOf(selectedThread)].label}</span>
                                        </span>
                                    )}
                                    <div className={styles.toolbarGroup}>
                                        <button
                                            type="button"
                                            className={summaryOpen ? styles.summaryButtonOn : styles.summaryButton}
                                            disabled={summarising}
                                            aria-expanded={summaryOpen}
                                            title={selectedIsChat ? "Summarise this conversation with AI" : "Summarise this email with AI"}
                                            onClick={() => generateEmailSummary(false)}
                                        >
                                            {summarising ? <Loader2 size={14} className={styles.spinning} /> : <Sparkles size={14} />}
                                            Summarise
                                        </button>
                                        <button
                                            type="button"
                                            className={selectedThread.starred ? styles.iconButtonStarred : styles.iconButton}
                                            aria-label={selectedThread.starred ? "Unstar conversation" : "Star conversation"}
                                            aria-pressed={selectedThread.starred}
                                            title={selectedThread.starred ? "Unstar" : "Star"}
                                            onClick={toggleSelectedThreadStar}
                                        >
                                            <Star size={15} fill={selectedThread.starred ? "currentColor" : "none"} />
                                        </button>
                                        {canReplyIn(activeFolder) && !selectedIsChat && (
                                            <button type="button" className={styles.iconButton} aria-label="Reply" title="Reply" onClick={() => replyRef.current?.focus()}>
                                                <Reply size={15} />
                                            </button>
                                        )}
                                        {!selectedIsChat && !selectedThread.draft && (
                                            <button type="button" className={styles.iconButton} aria-label="Forward email" title="Forward" onClick={forwardSelectedThread}>
                                                <Forward size={15} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {summaryOpen && selectedThread && !composeOpen && !selectedIsChat && (
                                <SummaryCard
                                    summary={currentSummary}
                                    loading={summarising}
                                    error={summaryError}
                                    messageCount={selectedThread.messages.length}
                                    isChat={selectedIsChat}
                                    onRefresh={() => void generateEmailSummary(true)}
                                    onClose={() => setSummaryOpen(false)}
                                />
                            )}

                            {/* Messaging channels read as a chat, with the customer's
                                profile docked beside it. */}
                            {selectedIsChat && chatThread && !composeOpen && (
                                <div className={styles.chatLayout}>
                                    <InboxChat
                                        thread={chatThread}
                                        avatarStyle={avatarStyle}
                                        initials={getInitials}
                                        draft={chatDraft}
                                        setDraft={setChatDraft}
                                        onSend={(text, file) => appendChatMessage(chatThread.id, text, file)}
                                        onToggleStar={toggleSelectedThreadStar}
                                        onMarkUnread={markSelectedThreadUnread}
                                        onArchive={archiveSelectedThread}
                                        onRestore={restoreSelectedThread}
                                        onDelete={deleteSelectedThread}
                                        onSetLabels={setSelectedThreadLabels}
                                    />
                                    {sidePanel.open ? (
                                        <ChatSidePanel
                                            thread={chatThread}
                                            edits={contactEdits[chatThread.id] ?? {}}
                                            onEdit={(patch) => editContact(chatThread.id, patch)}
                                            tab={sidePanel.tab}
                                            onTab={(tab) => setSidePanel({ open: true, tab })}
                                            onFold={() => setSidePanel((current) => ({ ...current, open: false }))}
                                            avatarStyle={avatarStyle}
                                            initials={getInitials}
                                            onEmail={() => emailContact(chatThread)}
                                            draft={chatDraft}
                                            onInsertDraft={setChatDraft}
                                            workspaceId={payload?.workspaceId ?? getStoredWorkspaceId()}
                                        />
                                    ) : (
                                        <div className={styles.sideRail} aria-label="Folded panel">
                                            <button type="button" className={styles.iconButton} aria-label="Show profile" title="Profile" onClick={() => setSidePanel({ open: true, tab: "profile" })}>
                                                <UserRound size={15} />
                                            </button>
                                            <button type="button" className={styles.iconButtonAi} aria-label="Show AI assistant" title="AI assistant" onClick={() => setSidePanel({ open: true, tab: "ai" })}>
                                                <Sparkles size={15} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* The email and the reply share one scroll: the whole email
                                comes first and the reply card follows it, so the reply
                                never covers what was sent. */}
                            <div className={styles.readerFlow}>
                                {!composeOpen && !selectedIsChat && (
                                <div className={styles.readerScroll}>
                                    {selectedThread && displayedMessage && (
                                        <>
                                            <div className={styles.messageHead}>
                                            <div className={styles.sender}>
                                                <span className={styles.avatarLarge} style={avatarStyle(displayedMessage.fromName)}>
                                                    {getInitials(displayedMessage.fromName)}
                                                </span>
                                                <span className={styles.senderCopy}>
                                                    <span className={styles.senderName}>{displayedMessage.fromName}</span>
                                                    <span>{displayedMessage.fromEmail}</span>
                                                </span>
                                                <time>{formatFullDate(displayedMessage.sentAt)}</time>
                                            </div>

                                            <h2 className={styles.subject}>{selectedThread.subject}</h2>

                                            {(displayedMessage.toName || displayedMessage.toEmail) && (
                                                <div className={styles.recipients}>
                                                    <span>To</span>
                                                    <span className={styles.personChip}>
                                                        <span className={styles.avatarTiny} style={avatarStyle(displayedMessage.toName || displayedMessage.toEmail)}>
                                                            {getInitials(displayedMessage.toName || displayedMessage.toEmail)}
                                                        </span>
                                                        {displayedMessage.toEmail || displayedMessage.toName}
                                                    </span>
                                                </div>
                                            )}

                                            {savedAccountEmails &&
                                                !selectedThread.demo &&
                                                channelOf(selectedThread) === "email" &&
                                                selectedThread.customerEmail &&
                                                !savedAccountEmails.has(selectedThread.customerEmail.toLowerCase()) &&
                                                !dismissedSavePrompts.has(selectedThread.customerEmail.toLowerCase()) && (
                                                    <SaveAccountPrompt
                                                        key={selectedThread.customerEmail}
                                                        email={selectedThread.customerEmail}
                                                        name={selectedThread.customerName}
                                                        company={selectedThread.customerCompany}
                                                        onSaved={() => void loadComposeAccounts()}
                                                        onDismiss={() => setDismissedSavePrompts((current) => new Set(current).add(selectedThread.customerEmail.toLowerCase()))}
                                                    />
                                                )}
                                            </div>

                                            <ThreadHistory
                                                key={selectedThread.id}
                                                messages={selectedThread.messages.slice(0, -1)}
                                                formatDate={formatFullDate}
                                                avatar={(name) => (
                                                    <span className={styles.avatarSmall} style={avatarStyle(name)}>
                                                        {getInitials(name)}
                                                    </span>
                                                )}
                                            />

                                            <div className={styles.body}>
                                                <MessageBody message={displayedMessage} />
                                            </div>

                                            {displayedMessage.attachments && displayedMessage.attachments.length > 0 && (
                                                <div className={styles.attachmentGrid}>
                                                    {displayedMessage.attachments.map((attachment) => {
                                                        const AttachmentIcon = getAttachmentIcon(attachment.mimeType, attachment.fileName);
                                                        const copy = (
                                                            <>
                                                                <AttachmentIcon size={15} className={styles.attachmentIcon} />
                                                                <span className={styles.attachmentCopy}>
                                                                    <span>{attachment.fileName}</span>
                                                                    <small>{attachment.sizeLabel}</small>
                                                                </span>
                                                            </>
                                                        );
                                                        // Received files (kept by Resend) and sent files we stored
                                                        // open here: images and PDFs in a preview, the rest download.
                                                        // Older sent files kept only their name.
                                                        if (!selectedThread.demo && (attachment.id.startsWith("rcv_") || attachment.stored)) {
                                                            const busy = downloadingAttachmentId === attachment.id;
                                                            const previewable = PREVIEWABLE_TYPES.has(attachment.mimeType.toLowerCase());
                                                            return (
                                                                <button
                                                                    key={attachment.id}
                                                                    type="button"
                                                                    className={styles.attachmentButton}
                                                                    title={`${previewable ? "Open" : "Download"} ${attachment.fileName}`}
                                                                    disabled={busy}
                                                                    onClick={() => void openReceivedAttachment(attachment)}
                                                                >
                                                                    {copy}
                                                                    {busy
                                                                        ? <Loader2 size={14} className={styles.spinning} />
                                                                        : previewable
                                                                            ? <Maximize2 size={14} className={styles.attachmentIcon} />
                                                                            : <Download size={14} className={styles.attachmentIcon} />}
                                                                </button>
                                                            );
                                                        }
                                                        return (
                                                            <div
                                                                key={attachment.id}
                                                                className={styles.attachment}
                                                                title={selectedThread.demo
                                                                    ? `${attachment.fileName} (sample file)`
                                                                    : `${attachment.fileName}: only the file name is kept for files you send`}
                                                            >
                                                                {copy}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                                )}

                                {/* ---- Docked reply / compose box ---- */}
                                {showComposer && (
                                    <section
                                        className={composeOpen ? styles.composerFull : replyExpanded ? styles.composerTall : styles.composer}
                                        aria-label={composeOpen ? "New message" : "Reply"}
                                    >
                                        {composeOpen ? (
                                            <>
                                                <h2 className={styles.composeTitle}>New message</h2>
                                                <div ref={composeAccountPickerRef} className={styles.fieldRow}>
                                                    <span className={styles.fieldLabel}>To</span>
                                                    {composeRecipient ? (
                                                        <button
                                                            type="button"
                                                            className={styles.personChip}
                                                            onClick={() => {
                                                                setComposeRecipient(null);
                                                                setComposeAccountSearch("");
                                                                setComposeAccountPickerOpen(true);
                                                            }}
                                                            aria-label={`Change recipient ${composeRecipient.name}`}
                                                        >
                                                            <span className={styles.avatarTiny} style={avatarStyle(composeRecipient.name)}>{getInitials(composeRecipient.name)}</span>
                                                            {composeRecipient.name}
                                                            <X size={11} />
                                                        </button>
                                                    ) : (
                                                        <input
                                                            className={styles.fieldInput}
                                                            value={composeAccountSearch}
                                                            onChange={(event) => {
                                                                setComposeAccountSearch(event.target.value);
                                                                setComposeAccountPickerOpen(true);
                                                            }}
                                                            onFocus={() => setComposeAccountPickerOpen(true)}
                                                            onKeyDown={(event) => {
                                                                if (event.key !== "Enter") return;
                                                                event.preventDefault();
                                                                if (typedComposeEmail) {
                                                                    chooseComposeRecipient({ id: `new:${typedComposeEmail}`, name: typedComposeEmail, email: typedComposeEmail });
                                                                } else if (filteredComposeAccounts.length === 1) {
                                                                    chooseComposeRecipient(filteredComposeAccounts[0]);
                                                                }
                                                            }}
                                                            placeholder="Search accounts or type an email…"
                                                            aria-label="Select account to email"
                                                        />
                                                    )}

                                                    {composeAccountPickerOpen && !composeRecipient && (
                                                        <div className={styles.accountMenu} role="listbox" aria-label="Accounts">
                                                            <div className={styles.menuLabel}>Accounts <span>{filteredComposeAccounts.length}</span></div>
                                                            <div className={styles.subList}>
                                                                {typedComposeEmail && (
                                                                    <button
                                                                        type="button"
                                                                        role="option"
                                                                        aria-selected={false}
                                                                        className={styles.menuItem}
                                                                        onClick={() => chooseComposeRecipient({ id: `new:${typedComposeEmail}`, name: typedComposeEmail, email: typedComposeEmail })}
                                                                    >
                                                                        <span className={styles.avatarTiny} style={avatarStyle(typedComposeEmail)}>{getInitials(typedComposeEmail)}</span>
                                                                        <span className={styles.menuCopy}>
                                                                            Send to {typedComposeEmail}
                                                                            <small>Not saved as an account</small>
                                                                        </span>
                                                                    </button>
                                                                )}
                                                                {filteredComposeAccounts.length > 0 ? (
                                                                    filteredComposeAccounts.map((account) => (
                                                                        <button
                                                                            key={`${account.id}-${account.email}`}
                                                                            type="button"
                                                                            role="option"
                                                                            aria-selected={false}
                                                                            className={styles.menuItem}
                                                                            onClick={() => {
                                                                                setComposeRecipient(account);
                                                                                setComposeAccountSearch("");
                                                                                setComposeAccountPickerOpen(false);
                                                                                requestAnimationFrame(() => replyRef.current?.focus());
                                                                            }}
                                                                        >
                                                                            <span className={styles.avatarTiny} style={avatarStyle(account.name)}>{getInitials(account.name)}</span>
                                                                            <span className={styles.menuCopy}>
                                                                                {account.name}
                                                                                <small>{[account.company, account.email].filter(Boolean).join(" · ")}</small>
                                                                            </span>
                                                                        </button>
                                                                    ))
                                                                ) : !typedComposeEmail && (
                                                                    <div className={styles.menuEmpty}>No matching accounts. Type a full email address to send to someone new.</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <label className={styles.fieldRow}>
                                                    <span className={styles.fieldLabel}>Subject</span>
                                                    <input
                                                        className={styles.fieldInput}
                                                        type="text"
                                                        value={replySubject}
                                                        onChange={(event) => setReplySubject(event.target.value)}
                                                        placeholder="Email subject"
                                                    />
                                                </label>
                                            </>
                                        ) : selectedThread && (
                                            <div className={styles.composerHead}>
                                                <span className={styles.avatarSmall} style={avatarStyle("You")}>Y</span>
                                                <span className={styles.senderCopy}>
                                                    <span className={styles.senderName}>You</span>
                                                    <span>Replying to {selectedThread.customerEmail}</span>
                                                </span>
                                                <button
                                                    type="button"
                                                    className={styles.iconButton}
                                                    aria-label={replyExpanded ? "Shrink reply" : "Expand reply"}
                                                    aria-pressed={replyExpanded}
                                                    title={replyExpanded ? "Shrink" : "Expand"}
                                                    onClick={() => setReplyExpanded((open) => !open)}
                                                >
                                                    {replyExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                                                </button>
                                            </div>
                                        )}

                                        {!composeOpen && selectedThread && (
                                            <label className={styles.fieldRow}>
                                                <span className={styles.fieldLabel}>Subject</span>
                                                {/* Shows the "Re:" subject the reply is sent with; it can be
                                                    edited but never left empty. */}
                                                <input
                                                    className={styles.fieldInput}
                                                    type="text"
                                                    value={replySubject || replySubjectFor(selectedThread.subject)}
                                                    onChange={(event) => setReplySubject(event.target.value)}
                                                    aria-label="Reply subject"
                                                />
                                            </label>
                                        )}

                                        {/* AI writing sits inside the reply box */}
                                        {aiPanelOpen && canUseAi && selectedThread && (
                                            <div className={styles.aiBox}>
                                                <div className={styles.aiPromptRow}>
                                                    <Sparkles size={14} className={styles.aiIcon} aria-hidden="true" />
                                                    <textarea
                                                        value={aiPrompt}
                                                        onChange={(event) => setAiPrompt(event.target.value)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === "Enter" && !event.shiftKey) {
                                                                event.preventDefault();
                                                                if (aiPrompt.trim() && !generatingReply) void generateAiReply();
                                                            }
                                                        }}
                                                        rows={1}
                                                        placeholder="Tell AI what to write, e.g. confirm Thursday at 2:30pm"
                                                        aria-label="What should the reply say?"
                                                        autoFocus
                                                    />
                                                    <button
                                                        type="button"
                                                        className={styles.aiGo}
                                                        disabled={!aiPrompt.trim() || generatingReply}
                                                        onClick={generateAiReply}
                                                        aria-label="Write with AI"
                                                    >
                                                        {generatingReply ? <Loader2 size={13} className={styles.spinning} /> : <ArrowUp size={13} />}
                                                    </button>
                                                    <button type="button" className={styles.iconButton} aria-label="Close AI writer" onClick={() => setAiPanelOpen(false)}>
                                                        <X size={13} />
                                                    </button>
                                                </div>
                                                {aiError && <p className={styles.aiError}>{aiError}</p>}
                                                {aiReply && (
                                                    <div className={styles.aiSuggestion}>
                                                        <p>{aiReply}</p>
                                                        <div className={styles.aiSuggestionActions}>
                                                            <button type="button" className={styles.primaryButton} onClick={useAiReply}>Use this reply</button>
                                                            <button type="button" className={styles.ghostButton} onClick={() => setAiReply("")}>Discard</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className={styles.editorWrap}>
                                            <div
                                                ref={replyRef}
                                                className={styles.editor}
                                                contentEditable
                                                suppressContentEditableWarning
                                                role="textbox"
                                                aria-multiline="true"
                                                aria-label={composeOpen ? "Email message" : "Reply message"}
                                                data-placeholder={composeOpen ? "Write your email…" : `Reply to ${selectedThread?.customerName ?? "this email"}…`}
                                                onInput={handleReplyInput}
                                                onClick={handleReplyEditorClick}
                                                onScroll={() => activeBlockRef.current && selectBlock(activeBlockRef.current)}
                                                onBlur={() => selectBlock(null)}
                                                onDragStart={handleReplyDragStart}
                                                onDragOver={handleReplyDragOver}
                                                onDrop={handleReplyDrop}
                                                onDragEnd={endReplyDrag}
                                            />

                                            {dropLineTop !== null && (
                                                <span className={styles.dropLine} style={{ top: dropLineTop }} aria-hidden="true" />
                                            )}

                                            {/* Controls for the selected button or footer. They sit on top
                                                of the editor, so they are never part of the email. */}
                                            {activeBlock && (
                                                <div
                                                    className={activeBlock.side === "right" ? styles.blockToolbar : styles.blockToolbarLeft}
                                                    style={{ top: activeBlock.top, left: activeBlock.left }}
                                                    role="toolbar"
                                                    aria-label={activeBlock.kind === "cta" ? "Button" : "Footer"}
                                                    onMouseDown={(event) => event.preventDefault()}
                                                >
                                                    {activeBlock.kind === "cta" ? (
                                                        <>
                                                            <span className={styles.blockHandle} title="Drag the button to move it">
                                                                <GripVertical size={13} aria-hidden="true" />
                                                            </span>
                                                            <button type="button" aria-label="Align left" title="Align left" onClick={() => alignActiveCta("left")}><AlignLeft size={13} /></button>
                                                            <button type="button" aria-label="Align centre" title="Align centre" onClick={() => alignActiveCta("center")}><AlignCenter size={13} /></button>
                                                            <button type="button" aria-label="Align right" title="Align right" onClick={() => alignActiveCta("right")}><AlignRight size={13} /></button>
                                                            <span className={styles.blockDivider} aria-hidden="true" />
                                                            <button type="button" aria-label="Edit button" title="Edit text and link" onClick={editActiveCta}><Pencil size={13} /></button>
                                                            <button type="button" aria-label="Remove button" title="Remove" onClick={removeActiveBlock}><Trash2 size={13} /></button>
                                                        </>
                                                    ) : (
                                                        <button type="button" className={styles.blockTextButton} onClick={removeActiveBlock}>
                                                            <Trash2 size={13} />
                                                            Remove footer
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {replyAttachments.map((file, index) => (
                                            <div key={`${file.name}-${file.lastModified}-${index}`} className={styles.replyAttachment}>
                                                <button
                                                    type="button"
                                                    className={styles.attachment}
                                                    onClick={() => setPreviewAttachmentIndex(index)}
                                                    title={`Preview ${file.name}`}
                                                >
                                                    <File size={14} className={styles.attachmentIcon} />
                                                    <span className={styles.attachmentCopy}>
                                                        <span>{file.name}</span>
                                                        <small>{Math.max(1, Math.round(file.size / 1024))} KB</small>
                                                    </span>
                                                </button>
                                                <button type="button" className={styles.iconButton} aria-label={`Remove ${file.name}`} onClick={() => removeReplyAttachment(index)}>
                                                    <X size={13} />
                                                </button>
                                            </div>
                                        ))}

                                        <div className={styles.replyBar}>
                                            {canUseAi && (
                                                <button
                                                    type="button"
                                                    className={aiPanelOpen ? styles.aiButtonActive : styles.aiButton}
                                                    aria-expanded={aiPanelOpen}
                                                    onClick={() => setAiPanelOpen((open) => !open)}
                                                >
                                                    <Sparkles size={13} />
                                                    Use AI
                                                </button>
                                            )}

                                            <div className={styles.format} role="toolbar" aria-label="Formatting">
                                                {([
                                                    ["bold", "Bold", Bold],
                                                    ["italic", "Italic", Italic],
                                                    ["underline", "Underline", Underline],
                                                    ["insertUnorderedList", "Bulleted list", List],
                                                    ["insertOrderedList", "Numbered list", ListOrdered],
                                                    ["justifyLeft", "Align left", AlignLeft],
                                                    ["justifyCenter", "Align centre", AlignCenter],
                                                    ["justifyRight", "Align right", AlignRight],
                                                ] as const).map(([command, label, Icon]) => (
                                                    <button key={command} type="button" className={styles.formatButton} aria-label={label} title={label} onClick={() => runEditorCommand(command)}>
                                                        <Icon size={14} />
                                                    </button>
                                                ))}
                                                <button type="button" className={styles.formatButton} aria-label="Attach a file" title="Attach file" onClick={() => attachmentInputRef.current?.click()}>
                                                    <Paperclip size={14} />
                                                </button>
                                                <button type="button" className={styles.formatButton} aria-label="Undo" title="Undo" onClick={() => runEditorCommand("undo")}>
                                                    <Undo2 size={14} />
                                                </button>
                                                <button type="button" className={styles.formatButton} aria-label="Redo" title="Redo" onClick={() => runEditorCommand("redo")}>
                                                    <Redo2 size={14} />
                                                </button>
                                            </div>

                                            <span className={styles.spacer} />

                                            <div ref={replyOptionsRef} className={styles.moreWrap}>
                                                <button
                                                    type="button"
                                                    className={styles.iconButton}
                                                    aria-label="More reply options"
                                                    title="More options"
                                                    aria-haspopup="menu"
                                                    aria-expanded={replyOptionsOpen}
                                                    onClick={() => setReplyOptionsOpen((current) => !current)}
                                                >
                                                    <MoreHorizontal size={15} />
                                                </button>

                                                {replyOptionsOpen && (
                                                    <div className={styles.moreMenu} role="menu">
                                                        <button type="button" role="menuitem" className={styles.menuItem} onClick={insertLink}>
                                                            <LinkIcon size={14} />
                                                            Insert link
                                                        </button>

                                                        <div className={styles.subWrap}>
                                                            <button
                                                                type="button"
                                                                role="menuitem"
                                                                aria-haspopup="menu"
                                                                aria-expanded={ctaPickerOpen}
                                                                className={ctaPickerOpen ? styles.menuItemActive : styles.menuItem}
                                                                onClick={() => {
                                                                    setSavedEmailPickerOpen(false);
                                                                    setCtaPickerOpen((current) => !current);
                                                                }}
                                                            >
                                                                <MousePointerClick size={14} />
                                                                <span className={styles.menuCopy}>Insert button</span>
                                                                <ChevronRight size={14} />
                                                            </button>

                                                            {ctaPickerOpen && (
                                                                <div className={styles.subMenu}>
                                                                    <div className={styles.menuLabel}>Saved buttons</div>
                                                                    {savedReplyCtas.map((cta) => (
                                                                        <button key={cta.id} type="button" className={styles.menuItem} onClick={() => insertSavedCtaIntoReply(cta)}>
                                                                            <span
                                                                                className={styles.ctaSwatch}
                                                                                style={{
                                                                                    background: cta.variant === "primary" ? cta.colour : "#ffffff",
                                                                                    borderColor: cta.colour,
                                                                                }}
                                                                            />
                                                                            <span className={styles.menuCopy}>
                                                                                {cta.name}
                                                                                <small>{cta.text}</small>
                                                                            </span>
                                                                            {cta.isDefault && <span className={styles.badge}>Default</span>}
                                                                        </button>
                                                                    ))}
                                                                    <Link href="/dashboard/email-builder" className={styles.menuLink}>
                                                                        Manage buttons
                                                                        <ArrowRight size={13} />
                                                                    </Link>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className={styles.subWrap}>
                                                            <button
                                                                type="button"
                                                                role="menuitem"
                                                                aria-haspopup="menu"
                                                                aria-expanded={savedEmailPickerOpen}
                                                                className={savedEmailPickerOpen ? styles.menuItemActive : styles.menuItem}
                                                                onClick={() => {
                                                                    setCtaPickerOpen(false);
                                                                    setSavedEmailPickerOpen((current) => !current);
                                                                    if (!savedEmailsLoading) void loadSavedEmails();
                                                                }}
                                                            >
                                                                <FileText size={14} />
                                                                <span className={styles.menuCopy}>Insert saved email</span>
                                                                <ChevronRight size={14} />
                                                            </button>

                                                            {savedEmailPickerOpen && (
                                                                <div className={styles.subMenu}>
                                                                    <label className={styles.menuSearch}>
                                                                        <Search size={13} />
                                                                        <input
                                                                            value={savedEmailSearch}
                                                                            onChange={(event) => setSavedEmailSearch(event.target.value)}
                                                                            placeholder="Search saved emails"
                                                                            autoFocus
                                                                        />
                                                                    </label>
                                                                    <div className={styles.subList}>
                                                                        {savedEmailsLoading ? (
                                                                            <div className={styles.menuEmpty}><Loader2 size={14} className={styles.spinning} /> Loading…</div>
                                                                        ) : savedEmailsError ? (
                                                                            <div className={styles.menuEmpty}>{savedEmailsError}</div>
                                                                        ) : filteredSavedEmails.length > 0 ? (
                                                                            filteredSavedEmails.map((email) => (
                                                                                <button key={email.id} type="button" className={styles.menuItem} onClick={() => insertSavedEmailIntoReply(email)}>
                                                                                    <FileText size={14} />
                                                                                    <span className={styles.menuCopy}>
                                                                                        {email.subject}
                                                                                        <small>
                                                                                            {email.emailType || "Saved email"}
                                                                                            {email.createdAt ? ` · ${formatListDate(email.createdAt)}` : ""}
                                                                                        </small>
                                                                                    </span>
                                                                                </button>
                                                                            ))
                                                                        ) : (
                                                                            <div className={styles.menuEmpty}>
                                                                                {savedEmailSearch ? "No saved emails match your search." : "No saved emails yet."}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <Link href="/dashboard/email-builder" className={styles.menuLink}>
                                                                        Manage saved emails
                                                                        <ArrowRight size={13} />
                                                                    </Link>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <button
                                                            type="button"
                                                            role="menuitemcheckbox"
                                                            aria-checked={replyFooterIncluded}
                                                            className={styles.menuItem}
                                                            onClick={toggleReplyFooter}
                                                        >
                                                            <PanelBottom size={14} />
                                                            <span className={styles.menuCopy}>
                                                                {replyFooterIncluded ? "Remove email footer" : "Include email footer"}
                                                                <small>{footerSettings.enabled ? "Uses your Email Builder footer" : "Turn it on in Email Builder first"}</small>
                                                            </span>
                                                            {replyFooterIncluded && <Check size={14} />}
                                                        </button>
                                                        <button type="button" role="menuitem" className={styles.menuItem} onClick={insertSignature}>
                                                            <Signature size={14} />
                                                            Insert signature
                                                        </button>
                                                        {replyAttachments.length > 0 && (
                                                            <button
                                                                type="button"
                                                                role="menuitem"
                                                                className={styles.menuItem}
                                                                onClick={() => {
                                                                    setReplyOptionsOpen(false);
                                                                    setPreviewAttachmentIndex(0);
                                                                }}
                                                            >
                                                                <File size={14} />
                                                                Preview attachment
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                type="button"
                                                className={styles.iconButton}
                                                aria-label={composeOpen ? "Discard email" : "Clear reply"}
                                                title={composeOpen ? "Discard" : "Clear"}
                                                onClick={composeOpen ? discardCompose : clearReply}
                                            >
                                                <Trash2 size={14} />
                                            </button>

                                            {sendError && (
                                                <p className={styles.aiError} role="alert">{sendError}</p>
                                            )}
                                            {!sendError && draftError && (
                                                <p className={styles.aiError} role="status">{draftError}</p>
                                            )}
                                            {!sendError && !draftError && draftSaved && (
                                                <span className={styles.fieldLabel} role="status">Draft saved</span>
                                            )}
                                            <button
                                                type="button"
                                                className={styles.primaryButton}
                                                disabled={sending || !replyBody.replace(/<[^>]*>/g, "").trim() || (composeOpen && !composeRecipient)}
                                                aria-busy={sending}
                                                onClick={() => void sendReply()}
                                            >
                                                {sending ? "Sending…" : "Send"}
                                                {sending ? <Loader2 size={14} className={styles.spinning} /> : <Send size={14} />}
                                            </button>
                                        </div>

                                        <input
                                            ref={attachmentInputRef}
                                            type="file"
                                            multiple
                                            hidden
                                            onChange={(event) => {
                                                const picked = Array.from(event.target.files ?? []);
                                                const next = [...replyAttachments, ...picked];
                                                if (next.length > MAX_ATTACHMENTS) {
                                                    setSendError(`Attach up to ${MAX_ATTACHMENTS} files per email.`);
                                                }
                                                setReplyAttachments(next.slice(0, MAX_ATTACHMENTS));
                                                setPreviewAttachmentIndex(null);
                                                // Let the same file be picked again after removing it.
                                                event.target.value = "";
                                            }}
                                        />
                                    </section>
                                )}
                            </div>
                        </>
                    )}
                </section>
            </section>

            {previewView && (
                <div
                    className={styles.overlay}
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Preview ${previewView.fileName}`}
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) closePreview();
                    }}
                >
                    <div className={styles.modal}>
                        <header className={styles.modalHead}>
                            <span>
                                {previewView.fileName}
                                <small>{previewView.sizeLabel}</small>
                            </span>
                            <span className={styles.spacer} />
                            <button
                                type="button"
                                className={styles.iconButton}
                                aria-label={`Download ${previewView.fileName}`}
                                title="Download"
                                onClick={() => saveBlobUrl(previewView.url, previewView.fileName)}
                            >
                                <Download size={16} />
                            </button>
                            <button type="button" className={styles.iconButton} aria-label="Close attachment preview" onClick={closePreview}>
                                <X size={16} />
                            </button>
                        </header>
                        <div className={styles.modalBody}>
                            {previewView.mimeType.startsWith("image/") && previewView.mimeType !== "image/svg+xml" ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={previewView.url} alt={previewView.fileName} />
                            ) : previewView.mimeType === "application/pdf" ? (
                                <iframe src={previewView.url} title={previewView.fileName} />
                            ) : (
                                <div className={styles.emptyState}>
                                    <File size={22} />
                                    {previewView.fileName}
                                    <small>A browser preview isn&apos;t available for this file type.</small>
                                    <button type="button" className={styles.ghostButton} onClick={() => saveBlobUrl(previewView.url, previewView.fileName)}>
                                        Download
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
