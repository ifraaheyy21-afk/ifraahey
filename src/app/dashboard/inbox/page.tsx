"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    Archive,
    ArrowRight,
    Bold,
    Bot,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronRight,
    File,
    FileSpreadsheet,
    FileText,
    Film,
    Image,
    Inbox,
    Italic,
    Link as LinkIcon,
    Link2,
    List,
    ListOrdered,
    Loader2,
    MailOpen,
    MoreHorizontal,
    Music2,
    MousePointerClick,
    PanelBottom,
    Paperclip,
    Redo2,
    Reply,
    Search,
    Signature,
    Send,
    Sparkles,
    Star,
    Trash2,
    Underline,
    Undo2,
    X,
} from "lucide-react";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
} from "react";

import type {
    InboxFolder,
    InboxMessage,
    InboxPayload,
    InboxThread,
} from "../../../lib/inbox-data";

import styles from "./inbox.module.css";

type DateRange = "24h" | "7d" | "30d" | "60d";

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

const dateRangeOptions: Array<{ value: DateRange; label: string; days: number }> = [
    { value: "24h", label: "Last 24 hours", days: 1 },
    { value: "7d", label: "Last 7 days", days: 7 },
    { value: "30d", label: "Last 30 days", days: 30 },
    { value: "60d", label: "Last 60 days", days: 60 },
];


const folderHeadings: Record<InboxFolder, string> = {
    inbox: "Received emails",
    starred: "Starred emails",
    sent: "Sent emails",
    drafts: "Draft emails",
    scheduled: "Scheduled emails",
    deleted: "Deleted emails",
    failed: "Failed emails",
    archived: "Archived emails",
};

const folderOptions: Array<{ value: InboxFolder; label: string }> = [
    { value: "inbox", label: "Received" },
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

function buildSavedBuilderCtaHtml(cta: BuilderSavedCta) {
    const padding =
        cta.size === "small"
            ? "9px 14px"
            : cta.size === "large"
                ? "14px 24px"
                : "11px 18px";
    const fontSize =
        cta.size === "small"
            ? "12px"
            : cta.size === "large"
                ? "15px"
                : "14px";
    const isOutline = cta.variant === "outline";
    const isText = cta.variant === "text";
    const isSecondary = cta.variant === "secondary";
    const background =
        isOutline || isText
            ? "transparent"
            : isSecondary
                ? "#ffffff"
                : cta.colour;
    const border =
        isOutline || isSecondary ? `1px solid ${cta.colour}` : "none";
    const colour =
        isOutline || isText || isSecondary ? cta.colour : cta.textColour;

    return `
        <div
            class="profileInboxDraggableCta"
            data-cobrai-cta="${cta.id}"
            data-cta-alignment="${cta.alignment}"
            contenteditable="false"
            style="
                position:relative;
                display:block;
                width:100%;
                height:auto;
                min-height:0;
                max-height:none;
                margin:10px 0 8px;
                padding:6px;
                overflow:visible;
            "
        >
            <div
                class="profileInboxCtaContent"
                contenteditable="false"
                style="
                    display:block;
                    width:100%;
                    height:auto;
                    min-height:0;
                    max-height:none;
                    margin:0;
                    padding:8px 4px;
                    overflow:visible;
                    text-align:${cta.alignment};
                "
            >
                <a
                    href="${cta.link}"
                    data-cobrai-cta-link="${cta.link}"
                    target="_blank"
                    rel="noopener noreferrer"
                    draggable="false"
                    contenteditable="false"
                    style="
                        display:${isText ? "inline" : "inline-flex"};
                        align-items:center;
                        justify-content:center;
                        max-width:100%;
                        padding:${isText ? "0" : padding};
                        border-radius:${Math.max(0, cta.radius)}px;
                        background:${background};
                        border:${border};
                        color:${colour};
                        font-family:Inter,Arial,sans-serif;
                        font-size:${fontSize};
                        font-weight:600;
                        line-height:1.3;
                        text-decoration:${isText ? "underline" : "none"};
                        white-space:normal;
                        overflow-wrap:anywhere;
                        text-align:center;
                        cursor:pointer;
                    "
                >${cta.text}</a>
            </div>

            <div
                class="profileInboxCtaToolbar"
                contenteditable="false"
                role="toolbar"
                aria-label="CTA controls"
            >
                <button type="button" data-cobrai-cta-action="edit" title="Edit CTA">Edit</button>
                <button type="button" data-cobrai-cta-action="up" title="Move up">↑</button>
                <button type="button" data-cobrai-cta-action="down" title="Move down">↓</button>
                <button type="button" data-cobrai-cta-action="left" title="Align left">Left</button>
                <button type="button" data-cobrai-cta-action="center" title="Align centre">Centre</button>
                <button type="button" data-cobrai-cta-action="right" title="Align right">Right</button>
                <button
                    type="button"
                    class="isDanger"
                    data-cobrai-cta-action="remove"
                    title="Remove CTA"
                >Remove</button>
            </div>
        </div>
    `;
}

function buildReplyFooterHtml(settings: BuilderFooterSettings) {
    const companyLine =
        settings.showCompanyName && settings.companyName.trim()
            ? `<div class="profileInboxFooterCompany">${settings.companyName.trim()}</div>`
            : "";

    const copyrightLine =
        settings.showCopyright && settings.copyrightText.trim()
            ? `<div class="profileInboxFooterCopyright">${settings.copyrightText.trim()}</div>`
            : "";

    const links = [
        settings.showUnsubscribe && settings.unsubscribeText.trim()
            ? `<a href="${settings.unsubscribeLink || "{{unsubscribe_link}}"}" contenteditable="false">${settings.unsubscribeText.trim()}</a>`
            : "",
        settings.showPreferences && settings.preferencesText.trim()
            ? `<a href="${settings.preferencesLink || "{{preferences_link}}"}" contenteditable="false">${settings.preferencesText.trim()}</a>`
            : "",
    ].filter(Boolean);

    const linksLine = links.length
        ? `<div class="profileInboxFooterLinks">${links.join(
            ` <span class="profileInboxFooterSeparator">${settings.separator}</span> `,
        )}</div>`
        : "";

    return `
        <div
            class="profileInboxReplyFooter"
            data-cobrai-footer="true"
            contenteditable="false"
            style="
                text-align:${settings.alignment};
                color:${settings.textColour};
                font-size:${settings.textSize};
                --reply-footer-divider:${settings.dividerColour};
            "
        >
            ${settings.showDivider ? '<div class="profileInboxFooterDivider"></div>' : ""}
            ${companyLine}
            ${copyrightLine}
            ${linksLine}
            <button
                type="button"
                class="profileInboxFooterRemove"
                data-cobrai-footer-action="remove"
                contenteditable="false"
                aria-label="Remove email footer"
                title="Remove footer"
            >Remove footer</button>
        </div>
    `;
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

function statusLabel(message: InboxMessage) {
    const labels: Record<InboxMessage["status"], string> = {
        received: "Received",
        scheduled: "Scheduled",
        sent: "Sent",
        delivered: "Delivered",
        opened: "Opened",
        clicked: "Clicked",
        replied: "Replied",
        failed: "Failed",
    };

    return labels[message.status];
}

export default function InboxPage() {
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
    const [dateRange, setDateRange] = useState<DateRange>("30d");
    const [dateMenuOpen, setDateMenuOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [selectedThreadId, setSelectedThreadId] = useState("");
    const [composeOpen, setComposeOpen] = useState(false);
    const [composeAccounts, setComposeAccounts] = useState<ComposeAccount[]>([]);
    const [composeRecipient, setComposeRecipient] = useState<ComposeAccount | null>(null);
    const [composeAccountSearch, setComposeAccountSearch] = useState("");
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
    const [replyAttachment, setReplyAttachment] = useState<globalThis.File | null>(null);
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
    const [attachmentPreviewOpen, setAttachmentPreviewOpen] = useState(false);
    const replyRef = useRef<HTMLDivElement>(null);
    const attachmentInputRef = useRef<HTMLInputElement>(null);
    const dateFilterRef = useRef<HTMLDivElement>(null);
    const replyOptionsRef = useRef<HTMLDivElement>(null);
    const composeAccountPickerRef = useRef<HTMLDivElement>(null);

    const loadInbox = useCallback(async () => {
        try {
            setLoading(true);

            setError("");

            const workspaceId = getStoredWorkspaceId();
            const response = await fetch(
                `/api/dashboard/inbox?workspaceId=${encodeURIComponent(workspaceId)}`,
                {
                    method: "GET",
                    cache: "no-store",
                },
            );

            const result = (await response.json()) as InboxPayload & {
                error?: string;
            };

            if (!response.ok) {
                throw new Error(result.error || "Failed to load the inbox.");
            }

            setPayload(result);
        } catch (loadError) {
            setError(
                loadError instanceof Error
                    ? loadError.message
                    : "Failed to load the inbox.",
            );
        } finally {
            setLoading(false);
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

    useEffect(() => {
        loadInbox();
    }, [loadInbox]);

    useEffect(() => {
        void loadComposeAccounts();
    }, [loadComposeAccounts]);

    useEffect(() => {
        void loadSavedEmails();
    }, [loadSavedEmails]);

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

    useEffect(() => {
        if (
            requestedFolder &&
            folderOptions.some((folder) => folder.value === requestedFolder)
        ) {
            setActiveFolder(requestedFolder as InboxFolder);
        }
    }, [requestedFolder]);

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

        const selectedRange = dateRangeOptions.find(
            (option) => option.value === dateRange,
        );
        const rangeStart = Date.now() - (selectedRange?.days ?? 30) * 24 * 60 * 60 * 1000;

        const filtered = (payload?.threads ?? []).filter((thread) => {
            const belongsToFolder =
                activeFolder === "starred"
                    ? thread.folder === "starred" || thread.starred
                    : thread.folder === activeFolder;
            const lastMessageTime = new Date(thread.lastMessageAt).getTime();
            const belongsToDateRange =
                !Number.isNaN(lastMessageTime) && lastMessageTime >= rangeStart;

            if (!belongsToFolder || !belongsToDateRange) return false;
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

        return [...filtered].sort(
            (first, second) =>
                new Date(second.lastMessageAt).getTime() -
                new Date(first.lastMessageAt).getTime(),
        );
    }, [activeFolder, dateRange, payload, search]);

    useEffect(() => {
        if (visibleThreads.length === 0) {
            setSelectedThreadId("");
            return;
        }

        const selectedThreadStillVisible = visibleThreads.some(
            (thread) => thread.id === selectedThreadId,
        );

        if (!selectedThreadStillVisible) {
            setSelectedThreadId(visibleThreads[0].id);
        }
    }, [selectedThreadId, visibleThreads]);

    useEffect(() => {
        setReplySubject("");
        setReplyBody("");
        setAiReply("");
        setAiPrompt("");
        setAiError("");
        setSummaryOpen(false);
        setSummaryError("");
        setReplyAttachment(null);
        setReplyOptionsOpen(false);
        setCtaPickerOpen(false);
        setSavedEmailPickerOpen(false);
        setSavedEmailSearch("");
        setReplyFooterIncluded(false);
        setAttachmentPreviewOpen(false);
    }, [selectedThreadId]);

    const selectThread = (thread: InboxThread) => {
        setComposeOpen(false);
        setComposeAccountPickerOpen(false);
        setSelectedThreadId(thread.id);

        if (!thread.unread) {
            return;
        }

        setPayload((current) => {
            if (!current) {
                return current;
            }

            return {
                ...current,
                threads: current.threads.map((currentThread) =>
                    currentThread.id === thread.id
                        ? {
                            ...currentThread,
                            unread: false,
                        }
                        : currentThread,
                ),
            };
        });
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

    const filteredSavedEmails = useMemo(() => {
        const query = savedEmailSearch.trim().toLowerCase();

        if (!query) return savedEmails;

        return savedEmails.filter((email) =>
            [email.subject, email.emailType]
                .filter(Boolean)
                .some((value) => value.toLowerCase().includes(query)),
        );
    }, [savedEmailSearch, savedEmails]);

    const replyAttachmentUrl = useMemo(
        () => (replyAttachment ? URL.createObjectURL(replyAttachment) : ""),
        [replyAttachment],
    );

    useEffect(() => {
        return () => {
            if (replyAttachmentUrl) {
                URL.revokeObjectURL(replyAttachmentUrl);
            }
        };
    }, [replyAttachmentUrl]);

    const updateSelectedThread = (updates: Partial<InboxThread>) => {
        if (!selectedThread) return;

        setPayload((current) =>
            current
                ? {
                    ...current,
                    threads: current.threads.map((thread) =>
                        thread.id === selectedThread.id
                            ? { ...thread, ...updates }
                            : thread,
                    ),
                }
                : current,
        );
    };

    const archiveSelectedThread = () => {
        updateSelectedThread({ folder: "archived" });
    };

    const deleteSelectedThread = () => {
        if (!selectedThread) return;

        updateSelectedThread({
            folder: "deleted",
            unread: false,
            archived: false,
        });
    };

    const toggleSelectedThreadStar = () => {
        if (!selectedThread) return;

        const nextStarred = !selectedThread.starred;

        updateSelectedThread({
            starred: nextStarred,
        });
    };

    const openCompose = () => {
        setComposeOpen(true);
        setComposeRecipient(null);
        setComposeAccountSearch("");
        setComposeAccountPickerOpen(true);
        setReplySubject("");
        setReplyBody("");
        setReplyAttachment(null);
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
        setComposeOpen(false);
        setComposeRecipient(null);
        setComposeAccountSearch("");
        setComposeAccountPickerOpen(false);
        setReplySubject("");
        setReplyBody("");
        setReplyAttachment(null);
        setReplyOptionsOpen(false);
        setCtaPickerOpen(false);
        setSavedEmailPickerOpen(false);
        setReplyFooterIncluded(false);

        if (replyRef.current) {
            replyRef.current.innerHTML = "";
        }
    };

    const sendReply = () => {
        if (!replyRef.current?.innerText.trim()) return;
        if (composeOpen && !composeRecipient) {
            setComposeAccountPickerOpen(true);
            return;
        }
        setReplySubject("");
        setReplyBody("");
        if (replyRef.current) {
            replyRef.current.innerHTML = "";
        }
        setReplyAttachment(null);
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
    };

    const focusReplyEditor = () => {
        requestAnimationFrame(() => replyRef.current?.focus());
    };

    const runEditorCommand = (command: string, value?: string) => {
        replyRef.current?.focus();
        document.execCommand(command, false, value);
        setReplyBody(replyRef.current?.innerHTML ?? "");
    };

    const insertEditorText = (text: string) => {
        replyRef.current?.focus();
        document.execCommand("insertText", false, text);
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

        const label = window.prompt("Link text", "Open link")?.trim() || url.trim();
        insertHtmlIntoReply(
            `<a href="${url.trim()}" target="_blank" rel="noreferrer">${label}</a>`,
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

    const insertSavedCtaIntoReply = (cta: BuilderSavedCta) => {
        const editor = replyRef.current;
        if (!editor) return;

        removeTrailingEmptyReplyNodes(editor);
        editor.insertAdjacentHTML(
            "beforeend",
            buildSavedBuilderCtaHtml(cta),
        );
        syncReplyEditor();
        setReplyOptionsOpen(false);
        setCtaPickerOpen(false);

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

    const insertSavedEmailIntoReply = (email: BuilderSavedEmail) => {
        const editor = replyRef.current;
        if (!editor) return;

        removeTrailingEmptyReplyNodes(editor);
        editor.insertAdjacentHTML("beforeend", buildEditableSavedEmailHtml(email));

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

        const existingFooter =
            editor.querySelector<HTMLElement>("[data-cobrai-footer]");

        if (existingFooter) {
            const spacer = existingFooter.nextElementSibling;
            existingFooter.remove();

            if (
                spacer instanceof HTMLElement &&
                spacer.innerHTML === "<br>"
            ) {
                spacer.remove();
            }

            setReplyFooterIncluded(false);
            syncReplyEditor();
            setReplyOptionsOpen(false);
            return;
        }

        const latestSettings = getSavedFooterSettings();
        setFooterSettings(latestSettings);

        if (!latestSettings.enabled) {
            setReplyOptionsOpen(false);
            return;
        }

        editor.focus();
        removeTrailingEmptyReplyNodes(editor);
        editor.insertAdjacentHTML(
            "beforeend",
            buildReplyFooterHtml(latestSettings),
        );
        setReplyFooterIncluded(true);
        syncReplyEditor();
        setReplyOptionsOpen(false);
    };

    const selectReplyCta = (cta: HTMLElement | null) => {
        const editor = replyRef.current;
        if (!editor) return;

        editor
            .querySelectorAll(".profileInboxDraggableCta.isSelected")
            .forEach((element) => {
                if (element !== cta) {
                    element.classList.remove("isSelected");
                }
            });

        if (cta) cta.classList.add("isSelected");
    };

    const moveReplyCta = (
        cta: HTMLElement,
        direction: "up" | "down",
    ) => {
        const editor = replyRef.current;
        if (!editor) return;

        const blocks = Array.from(editor.children).filter((child) => {
            return (
                child instanceof HTMLElement &&
                child.innerHTML !== "<br>"
            );
        }) as HTMLElement[];

        const currentIndex = blocks.indexOf(cta);
        if (currentIndex < 0) return;

        if (direction === "up") {
            const previous = blocks[currentIndex - 1];
            if (previous) editor.insertBefore(cta, previous);
        } else {
            const next = blocks[currentIndex + 1];
            if (next) editor.insertBefore(next, cta);
        }

        selectReplyCta(cta);
        syncReplyEditor();
    };

    const alignReplyCta = (
        cta: HTMLElement,
        alignment: "left" | "center" | "right",
    ) => {
        cta.dataset.ctaAlignment = alignment;
        selectReplyCta(cta);
        syncReplyEditor();
    };

    const editReplyCta = (cta: HTMLElement) => {
        const link = cta.querySelector<HTMLAnchorElement>("a");
        if (!link) return;

        const nextText = window.prompt(
            "Button text",
            link.textContent?.trim() || "",
        );
        if (nextText === null) return;

        const nextLink = window.prompt(
            "Button link",
            link.getAttribute("href") || "",
        );
        if (nextLink === null) return;

        const cleanText = nextText.trim();
        const cleanLink = nextLink.trim();

        if (cleanText) link.textContent = cleanText;

        if (cleanLink) {
            link.setAttribute("href", cleanLink);
            link.dataset.cobraiCtaLink = cleanLink;
        }

        selectReplyCta(cta);
        syncReplyEditor();
    };

    const handleReplyEditorClick = (
        event: ReactMouseEvent<HTMLDivElement>,
    ) => {
        const target = event.target as HTMLElement;
        const footerAction =
            target.closest<HTMLElement>("[data-cobrai-footer-action]");
        const footer =
            target.closest<HTMLElement>("[data-cobrai-footer]");

        if (footerAction && footer) {
            event.preventDefault();
            event.stopPropagation();

            const spacer = footer.nextElementSibling;
            footer.remove();

            if (
                spacer instanceof HTMLElement &&
                spacer.innerHTML === "<br>"
            ) {
                spacer.remove();
            }

            setReplyFooterIncluded(false);
            syncReplyEditor();
            return;
        }

        const actionButton =
            target.closest<HTMLElement>("[data-cobrai-cta-action]");
        const cta = target.closest<HTMLElement>("[data-cobrai-cta]");

        if (actionButton && cta) {
            event.preventDefault();
            event.stopPropagation();

            const action = actionButton.dataset.cobraiCtaAction;

            if (action === "edit") {
                editReplyCta(cta);
                return;
            }

            if (action === "up" || action === "down") {
                moveReplyCta(cta, action);
                return;
            }

            if (
                action === "left" ||
                action === "center" ||
                action === "right"
            ) {
                alignReplyCta(cta, action);
                return;
            }

            if (action === "remove") {
                const spacer = cta.nextElementSibling;
                cta.remove();

                if (
                    spacer instanceof HTMLElement &&
                    spacer.innerHTML === "<br>"
                ) {
                    spacer.remove();
                }

                syncReplyEditor();
                return;
            }
        }

        if (cta) {
            event.preventDefault();
            selectReplyCta(cta);
            return;
        }

        selectReplyCta(null);
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
        setReplyAttachment(null);
        setAttachmentPreviewOpen(false);
        setReplyOptionsOpen(false);

        if (attachmentInputRef.current) {
            attachmentInputRef.current.value = "";
        }

        requestAnimationFrame(() => replyRef.current?.focus());
    };

    const selectReplyText = () => {
        setReplyOptionsOpen(false);
        requestAnimationFrame(() => {
            const editor = replyRef.current;
            if (!editor) return;

            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editor);
            selection?.removeAllRanges();
            selection?.addRange(range);
            editor.focus();
        });
    };

    const removeReplyAttachment = () => {
        setReplyAttachment(null);
        setAttachmentPreviewOpen(false);
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
            .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
            .join("");

        setReplyBody(formattedReply);
        if (replyRef.current) {
            replyRef.current.innerHTML = formattedReply;
        }
        setAiPanelOpen(false);
    };

    const selectedDateOption =
        dateRangeOptions.find((option) => option.value === dateRange) ??
        dateRangeOptions[2];

    return (
        <main className={styles.page}>
            {error && <div className={styles.errorBanner}>{error}</div>}

            <section className={styles.inboxShell}>
                <header className={styles.shellHeader}>
                    <div className={styles.shellHeaderCopy}>
                        <h1>{folderHeadings[activeFolder]}</h1>
                        <p>
                            Read customer replies, manage conversations and respond
                            from one place.
                        </p>
                    </div>

                    <button
                        type="button"
                        className={styles.composeTopButton}
                        onClick={composeOpen ? closeCompose : openCompose}
                        aria-expanded={composeOpen}
                    >
                        {composeOpen ? <X size={15} /> : <Send size={15} />}
                        {composeOpen ? "Close" : "Compose"}
                    </button>
                </header>

                <aside className={styles.threadPanel}>
                    <div className={styles.threadPanelHeader}>
                        <div
                            ref={dateFilterRef}
                            className={styles.dateFilter}
                        >
                            <button
                                type="button"
                                className={styles.dateFilterButton}
                                aria-haspopup="listbox"
                                aria-expanded={dateMenuOpen}
                                onClick={() =>
                                    setDateMenuOpen((current) => !current)
                                }
                            >
                                <CalendarDays size={15} />
                                <span>{selectedDateOption.label}</span>
                                <ChevronDown
                                    size={14}
                                    className={
                                        dateMenuOpen
                                            ? styles.dateFilterChevronOpen
                                            : ""
                                    }
                                />
                            </button>

                            {dateMenuOpen && (
                                <div
                                    className={styles.dateFilterMenu}
                                    role="listbox"
                                    aria-label="Filter emails by date range"
                                >
                                    {dateRangeOptions.map((option) => {
                                        const isSelected =
                                            option.value === dateRange;

                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                className={
                                                    isSelected
                                                        ? styles.dateFilterOptionActive
                                                        : styles.dateFilterOption
                                                }
                                                onClick={() => {
                                                    setDateRange(option.value);
                                                    setDateMenuOpen(false);
                                                }}
                                            >
                                                <span>{option.label}</span>
                                                {isSelected && <Check size={14} />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={styles.threadTotal}>
                        <strong>
                            {visibleThreads.length} messages
                        </strong>

                    </div>


                    <label className={styles.searchBox}>
                        <Search size={15} />
                        <input
                            type="search"
                            placeholder="Search mail"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                        {search && (
                            <button
                                type="button"
                                aria-label="Clear search"
                                onClick={() => setSearch("")}
                            >
                                <X size={13} />
                            </button>
                        )}
                    </label>

                    <div className={styles.threadList}>
                        {loading ? (
                            <div className={styles.emptyState}>
                                <Loader2
                                    size={21}
                                    className={styles.spinning}
                                />
                                <strong>Loading emails</strong>
                            </div>
                        ) : visibleThreads.length === 0 ? (
                            <div className={styles.emptyState}>
                                <MailOpen size={21} />
                                <strong>No emails found</strong>
                                <span>
                                    Try another folder or clear your search.
                                </span>
                            </div>
                        ) : (
                            visibleThreads.map((thread) => {
                                const latestMessage =
                                    getLatestMessage(thread);

                                return (
                                    <button
                                        key={thread.id}
                                        type="button"
                                        className={[
                                            styles.threadRow,
                                            selectedThreadId === thread.id
                                                ? styles.selectedThread
                                                : "",
                                            thread.unread
                                                ? styles.unreadThread
                                                : "",
                                        ]
                                            .filter(Boolean)
                                            .join(" ")}
                                        onClick={() => selectThread(thread)}
                                    >
                                        <span className={styles.threadAvatar}>
                                            {getInitials(thread.customerName)}
                                        </span>

                                        <span
                                            className={styles.threadInformation}
                                        >
                                            <span
                                                className={styles.threadTopLine}
                                            >
                                                <span className={styles.threadNameLine}>
                                                    <strong>{thread.customerName}</strong>
                                                    <small
                                                        className={[
                                                            styles.threadReadState,
                                                            thread.unread
                                                                ? styles.threadUnreadState
                                                                : "",
                                                        ]
                                                            .filter(Boolean)
                                                            .join(" ")}
                                                    >
                                                        {thread.unread
                                                            ? "Unread"
                                                            : latestMessage
                                                                ? statusLabel(latestMessage)
                                                                : "Opened"}
                                                    </small>
                                                    {thread.starred && (
                                                        <Star size={12} fill="currentColor" />
                                                    )}
                                                </span>
                                                <time>
                                                    {formatListDate(
                                                        thread.lastMessageAt,
                                                    )}
                                                </time>
                                            </span>

                                            <span className={styles.companyName}>
                                                {thread.customerCompany ??
                                                    thread.customerEmail}
                                            </span>

                                            <span className={styles.subject}>
                                                {thread.subject}
                                            </span>

                                            <span className={styles.preview}>
                                                {thread.preview}
                                            </span>

                                            {latestMessage?.attachments &&
                                                latestMessage.attachments.length > 0 && (
                                                    <span className={styles.threadAttachments}>
                                                        {latestMessage.attachments
                                                            .slice(0, 2)
                                                            .map((attachment) => {
                                                                const AttachmentIcon =
                                                                    getAttachmentIcon(
                                                                        attachment.mimeType,
                                                                        attachment.fileName,
                                                                    );

                                                                return (
                                                                    <span
                                                                        key={attachment.id}
                                                                        className={styles.threadAttachment}
                                                                        title={attachment.fileName}
                                                                    >
                                                                        <AttachmentIcon size={12} />
                                                                        <span>
                                                                            {attachment.fileName}
                                                                        </span>
                                                                    </span>
                                                                );
                                                            })}

                                                        {latestMessage.attachments.length > 2 && (
                                                            <span
                                                                className={
                                                                    styles.threadAttachmentCount
                                                                }
                                                            >
                                                                +
                                                                {latestMessage.attachments.length -
                                                                    2}
                                                            </span>
                                                        )}
                                                    </span>
                                                )}

                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </div>

                </aside>

                <section
                    className={[
                        styles.readerPanel,
                        activeFolder !== "inbox" && !composeOpen
                            ? styles.readerPanelWithoutReply
                            : "",
                    ]
                        .filter(Boolean)
                        .join(" ")}
                >
                    {!selectedThread ? (
                        <div className={styles.readerEmpty}>
                            <Inbox size={28} />
                            <strong>Select a conversation</strong>
                            <span>
                                Choose an email from the list to read it.
                            </span>
                        </div>
                    ) : (
                        <>
                            <div className={styles.readerToolbar}>
                                <div className={styles.readerToolbarLeft}>
                                    <button
                                        type="button"
                                        aria-label="Archive conversation"
                                        data-tooltip="Archive"
                                        onClick={archiveSelectedThread}
                                    >
                                        <Archive size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label="Delete conversation"
                                        data-tooltip="Delete"
                                        onClick={deleteSelectedThread}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        className={
                                            selectedThread.starred
                                                ? styles.starredToolbarButton
                                                : undefined
                                        }
                                        aria-label="Star or unstar conversation"
                                        data-tooltip={
                                            selectedThread.starred ? "Unstar" : "Star"
                                        }
                                        onClick={toggleSelectedThreadStar}
                                    >
                                        <Star size={16} fill={selectedThread.starred ? "currentColor" : "none"} />
                                    </button>
                                </div>

                                {activeFolder === "inbox" && !composeOpen && (


                                    <button
                                        type="button"
                                        className={styles.summaryButton}
                                        disabled={summarising}
                                        aria-expanded={summaryOpen}
                                        onClick={() => generateEmailSummary(false)}
                                    >
                                        {summarising ? (
                                            <Loader2
                                                size={14}
                                                className={styles.spinning}
                                            />
                                        ) : (
                                            <Sparkles size={14} />
                                        )}
                                        {summarising
                                            ? "Summarising..."
                                            : currentSummary && summaryOpen
                                                ? "Hide summary"
                                                : "AI summary"}
                                    </button>


                                )}
                            </div>

                            <section className={styles.emailDocument}>
                                {displayedMessage && (
                                    <>
                                        <header className={styles.emailHeading}>
                                            <div className={styles.emailIdentity}>
                                                <span className={styles.messageAvatar}>
                                                    {getInitials(
                                                        displayedMessage.fromName,
                                                    )}
                                                </span>

                                                <div className={styles.emailIdentityText}>
                                                    <div className={styles.senderLine}>
                                                        <strong>
                                                            {displayedMessage.fromName}
                                                        </strong>
                                                        <span>
                                                            {displayedMessage.fromEmail}
                                                        </span>
                                                    </div>
                                                </div>

                                                <time>
                                                    {formatFullDate(
                                                        displayedMessage.sentAt,
                                                    )}
                                                </time>
                                            </div>

                                            <div className={styles.emailHeadingTop}>
                                                <h2>{selectedThread.subject}</h2>
                                            </div>
                                        </header>

                                        {summaryOpen && (
                                            <section
                                                className={styles.summaryPanel}
                                                aria-live="polite"
                                            >
                                                {summarising ? (
                                                    <div className={styles.summaryLoading}>
                                                        <Loader2
                                                            size={15}
                                                            className={styles.spinning}
                                                        />
                                                        <span>Summarising this email…</span>
                                                    </div>
                                                ) : summaryError ? (
                                                    <div className={styles.summaryError}>
                                                        <span>{summaryError}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                generateEmailSummary(true)
                                                            }
                                                        >
                                                            Try again
                                                        </button>
                                                    </div>
                                                ) : currentSummary ? (
                                                    <>
                                                        <div className={styles.summaryPanelHeader}>
                                                            <div className={styles.summaryTitle}>
                                                                <Sparkles size={13} />
                                                                <span>Summary</span>
                                                                <small>AI</small>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                aria-label="Refresh AI summary"
                                                                onClick={() =>
                                                                    generateEmailSummary(true)
                                                                }
                                                            >
                                                                Refresh
                                                            </button>
                                                        </div>

                                                        <p className={styles.summaryText}>
                                                            {currentSummary.summary}
                                                        </p>

                                                        <div className={styles.summaryAction}>
                                                            <span>Next step</span>
                                                            <p>
                                                                {currentSummary.recommendedAction}
                                                            </p>
                                                        </div>

                                                        <div className={styles.summaryFooter}>
                                                            <span>
                                                                AI-generated from {selectedThread.messages.length}{" "}
                                                                {selectedThread.messages.length === 1
                                                                    ? "message"
                                                                    : "messages"}
                                                            </span>
                                                            <span>
                                                                {currentSummary.sentiment} · {currentSummary.urgency} urgency
                                                            </span>
                                                        </div>
                                                    </>
                                                ) : null}
                                            </section>
                                        )}

                                        <div className={styles.emailBody}>
                                            {displayedMessage.html ? (
                                                <div
                                                    dangerouslySetInnerHTML={{
                                                        __html:
                                                            displayedMessage.html,
                                                    }}
                                                />
                                            ) : (
                                                <p>
                                                    {
                                                        displayedMessage.plainText
                                                    }
                                                </p>
                                            )}
                                        </div>

                                        {displayedMessage.attachments &&
                                            displayedMessage.attachments.length >
                                            0 && (
                                                <div
                                                    className={
                                                        styles.emailAttachments
                                                    }
                                                >
                                                    {displayedMessage.attachments.map(
                                                        (attachment) => {
                                                            const AttachmentIcon =
                                                                getAttachmentIcon(
                                                                    attachment.mimeType,
                                                                    attachment.fileName,
                                                                );

                                                            return (
                                                                <button
                                                                    key={
                                                                        attachment.id
                                                                    }
                                                                    type="button"
                                                                    title={`Open ${attachment.fileName}`}
                                                                >
                                                                    <AttachmentIcon
                                                                        size={20}
                                                                    />
                                                                    <span>
                                                                        <strong>
                                                                            {
                                                                                attachment.fileName
                                                                            }
                                                                        </strong>
                                                                        <small>
                                                                            {
                                                                                attachment.sizeLabel
                                                                            }
                                                                        </small>
                                                                    </span>
                                                                </button>
                                                            );
                                                        },
                                                    )}
                                                </div>
                                            )}
                                    </>
                                )}
                            </section>

                            {(activeFolder === "inbox" || composeOpen) && (
                                <footer
                                    className={[
                                        styles.replyComposer,
                                        composeOpen ? styles.composeComposer : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                >
                                    {composeOpen ? (
                                        <div
                                            ref={composeAccountPickerRef}
                                            className={styles.composeRecipientPicker}
                                        >
                                            <div className={styles.composeRecipientSearch}>
                                                <Search size={15} />
                                                {composeRecipient ? (
                                                    <button
                                                        type="button"
                                                        className={styles.composeRecipientChip}
                                                        onClick={() => {
                                                            setComposeRecipient(null);
                                                            setComposeAccountSearch("");
                                                            setComposeAccountPickerOpen(true);
                                                        }}
                                                    >
                                                        <span>
                                                            <strong>{composeRecipient.name}</strong>
                                                            <small>{composeRecipient.email}</small>
                                                        </span>
                                                        <X size={13} />
                                                    </button>
                                                ) : (
                                                    <input
                                                        value={composeAccountSearch}
                                                        onChange={(event) => {
                                                            setComposeAccountSearch(event.target.value);
                                                            setComposeAccountPickerOpen(true);
                                                        }}
                                                        onFocus={() => setComposeAccountPickerOpen(true)}
                                                        placeholder="Search accounts by name, company or email..."
                                                        aria-label="Select account to email"
                                                    />
                                                )}
                                            </div>

                                            {composeAccountPickerOpen && !composeRecipient && (
                                                <div
                                                    className={styles.composeAccountMenu}
                                                    role="listbox"
                                                    aria-label="Accounts"
                                                >
                                                    <div className={styles.composeAccountMenuHeader}>
                                                        <span>Accounts</span>
                                                        <small>{filteredComposeAccounts.length}</small>
                                                    </div>

                                                    <div className={styles.composeAccountList}>
                                                        {filteredComposeAccounts.length > 0 ? (
                                                            filteredComposeAccounts.map((account) => (
                                                                <button
                                                                    key={`${account.id}-${account.email}`}
                                                                    type="button"
                                                                    role="option"
                                                                    onClick={() => {
                                                                        setComposeRecipient(account);
                                                                        setComposeAccountSearch("");
                                                                        setComposeAccountPickerOpen(false);
                                                                        requestAnimationFrame(() =>
                                                                            replyRef.current?.focus(),
                                                                        );
                                                                    }}
                                                                >
                                                                    <span className={styles.composeAccountAvatar}>
                                                                        {getInitials(account.name)}
                                                                    </span>
                                                                    <span className={styles.composeAccountCopy}>
                                                                        <strong>{account.name}</strong>
                                                                        <small>
                                                                            {[account.company, account.email]
                                                                                .filter(Boolean)
                                                                                .join(" · ")}
                                                                        </small>
                                                                    </span>
                                                                </button>
                                                            ))
                                                        ) : (
                                                            <div className={styles.composeAccountEmpty}>
                                                                No matching accounts
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className={styles.replyRecipientRow}>
                                            <Reply size={14} />
                                            <span>To</span>
                                            <strong>{selectedThread.customerName}</strong>
                                            <span className={styles.replyRecipientEmail}>
                                                {selectedThread.customerEmail}
                                            </span>
                                        </div>
                                    )}

                                    <label className={styles.replySubjectRow}>
                                        <span>Subject</span>
                                        <input
                                            type="text"
                                            value={replySubject}
                                            onChange={(event) =>
                                                setReplySubject(event.target.value)
                                            }
                                            placeholder={composeOpen ? "Email subject" : "Add a subject"}
                                        />
                                    </label>

                                    <div
                                        ref={replyRef}
                                        className={styles.replyEditor}
                                        contentEditable
                                        suppressContentEditableWarning
                                        role="textbox"
                                        aria-multiline="true"
                                        data-placeholder={composeOpen ? "Write your email..." : "Write your reply..."}
                                        onInput={(event) =>
                                            setReplyBody(event.currentTarget.innerHTML)
                                        }
                                        onClick={handleReplyEditorClick}
                                    />

                                    {replyAttachment && (
                                        <div className={styles.replyAttachment}>
                                            <button
                                                type="button"
                                                className={styles.replyAttachmentPreviewButton}
                                                onClick={() => setAttachmentPreviewOpen(true)}
                                                title={`Preview ${replyAttachment.name}`}
                                            >
                                                <File size={14} />
                                                <span>
                                                    <strong>{replyAttachment.name}</strong>
                                                    <small>
                                                        {(replyAttachment.size / 1024).toFixed(0)} KB · Click to preview
                                                    </small>
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.replyAttachmentRemoveButton}
                                                aria-label="Remove attachment"
                                                onClick={removeReplyAttachment}
                                            >
                                                <X size={13} />
                                            </button>
                                        </div>
                                    )}

                                    <div className={styles.replyToolbar}>
                                        <div className={styles.replyToolbarGroup}>
                                            <button
                                                type="button"
                                                aria-label="Undo"
                                                title="Undo"
                                                onClick={() => runEditorCommand("undo")}
                                            >
                                                <Undo2 size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Redo"
                                                title="Redo"
                                                onClick={() => runEditorCommand("redo")}
                                            >
                                                <Redo2 size={15} />
                                            </button>

                                            <span className={styles.replyToolbarDivider} />

                                            <button
                                                type="button"
                                                aria-label="Bold"
                                                title="Bold"
                                                onClick={() => runEditorCommand("bold")}
                                            >
                                                <Bold size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Italic"
                                                title="Italic"
                                                onClick={() => runEditorCommand("italic")}
                                            >
                                                <Italic size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Underline"
                                                title="Underline"
                                                onClick={() => runEditorCommand("underline")}
                                            >
                                                <Underline size={15} />
                                            </button>

                                            <span className={styles.replyToolbarDivider} />

                                            <button
                                                type="button"
                                                aria-label="Align left"
                                                title="Align left"
                                                onClick={() => runEditorCommand("justifyLeft")}
                                            >
                                                <AlignLeft size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Align centre"
                                                title="Align centre"
                                                onClick={() => runEditorCommand("justifyCenter")}
                                            >
                                                <AlignCenter size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Align right"
                                                title="Align right"
                                                onClick={() => runEditorCommand("justifyRight")}
                                            >
                                                <AlignRight size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Bulleted list"
                                                title="Bulleted list"
                                                onClick={() => runEditorCommand("insertUnorderedList")}
                                            >
                                                <List size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Numbered list"
                                                title="Numbered list"
                                                onClick={() => runEditorCommand("insertOrderedList")}
                                            >
                                                <ListOrdered size={15} />
                                            </button>
                                        </div>

                                        <div className={styles.replyToolbarActions}>
                                            <div className={styles.replyTools}>
                                                <button
                                                    type="button"
                                                    aria-label="Attach a file"
                                                    title="Attach file"
                                                    onClick={() =>
                                                        attachmentInputRef.current?.click()
                                                    }
                                                >
                                                    <Paperclip size={16} />
                                                </button>

                                                <button
                                                    type="button"
                                                    aria-label="Generate AI reply"
                                                    title="AI reply"
                                                    onClick={() =>
                                                        setAiPanelOpen(true)
                                                    }
                                                >
                                                    <Sparkles size={16} />
                                                </button>

                                                <div
                                                    ref={replyOptionsRef}
                                                    className={styles.replyOptions}
                                                >
                                                    <button
                                                        type="button"
                                                        aria-label="More reply options"
                                                        title="More options"
                                                        aria-haspopup="menu"
                                                        aria-expanded={replyOptionsOpen}
                                                        onClick={() =>
                                                            setReplyOptionsOpen(
                                                                (current) => !current,
                                                            )
                                                        }
                                                    >
                                                        <MoreHorizontal size={17} />
                                                    </button>

                                                    {replyOptionsOpen && (
                                                        <div
                                                            className={styles.replyOptionsMenu}
                                                            role="menu"
                                                        >
                                                            <button
                                                                type="button"
                                                                role="menuitem"
                                                                onClick={() =>
                                                                    attachmentInputRef.current?.click()
                                                                }
                                                            >
                                                                <Paperclip size={14} />
                                                                Add attachment
                                                            </button>
                                                            <button
                                                                type="button"
                                                                role="menuitem"
                                                                onClick={insertLink}
                                                            >
                                                                <LinkIcon size={14} />
                                                                Insert link
                                                            </button>
                                                            <div
                                                                className={
                                                                    styles.replyCtaPickerWrap
                                                                }
                                                            >
                                                                <button
                                                                    type="button"
                                                                    role="menuitem"
                                                                    aria-haspopup="menu"
                                                                    aria-expanded={
                                                                        ctaPickerOpen
                                                                    }
                                                                    className={
                                                                        ctaPickerOpen
                                                                            ? styles.replyMenuActive
                                                                            : ""
                                                                    }
                                                                    onClick={() => {
                                                                        setSavedEmailPickerOpen(false);
                                                                        setCtaPickerOpen(
                                                                            (current) => !current,
                                                                        );
                                                                    }}
                                                                >
                                                                    <MousePointerClick
                                                                        size={14}
                                                                    />
                                                                    <span>
                                                                        <strong>
                                                                            Insert CTA
                                                                        </strong>
                                                                        <small>
                                                                            Saved in Email Builder
                                                                        </small>
                                                                    </span>
                                                                    <ChevronRight
                                                                        size={14}
                                                                        className={
                                                                            styles.replyCtaChevron
                                                                        }
                                                                    />
                                                                </button>

                                                                {ctaPickerOpen && (
                                                                    <div
                                                                        className={
                                                                            styles.replyCtaPicker
                                                                        }
                                                                    >
                                                                        <div
                                                                            className={
                                                                                styles.replyCtaPickerHeader
                                                                            }
                                                                        >
                                                                            <strong>
                                                                                Choose CTA
                                                                            </strong>
                                                                            <small>
                                                                                Saved in Email Builder
                                                                            </small>
                                                                        </div>

                                                                        <div
                                                                            className={
                                                                                styles.replyCtaPickerList
                                                                            }
                                                                        >
                                                                            {savedReplyCtas.map(
                                                                                (
                                                                                    cta,
                                                                                ) => (
                                                                                    <button
                                                                                        key={
                                                                                            cta.id
                                                                                        }
                                                                                        type="button"
                                                                                        onClick={() =>
                                                                                            insertSavedCtaIntoReply(
                                                                                                cta,
                                                                                            )
                                                                                        }
                                                                                    >
                                                                                        <span
                                                                                            className={
                                                                                                styles.replyCtaColour
                                                                                            }
                                                                                            style={{
                                                                                                background:
                                                                                                    cta.variant ===
                                                                                                        "primary"
                                                                                                        ? cta.colour
                                                                                                        : "#ffffff",
                                                                                                borderColor:
                                                                                                    cta.colour,
                                                                                            }}
                                                                                        />
                                                                                        <span
                                                                                            className={
                                                                                                styles.replyCtaPickerCopy
                                                                                            }
                                                                                        >
                                                                                            <strong>
                                                                                                {
                                                                                                    cta.name
                                                                                                }
                                                                                            </strong>
                                                                                            <small>
                                                                                                {
                                                                                                    cta.text
                                                                                                }
                                                                                            </small>
                                                                                        </span>
                                                                                        {cta.isDefault && (
                                                                                            <span
                                                                                                className={
                                                                                                    styles.replyCtaDefault
                                                                                                }
                                                                                            >
                                                                                                Default
                                                                                            </span>
                                                                                        )}
                                                                                    </button>
                                                                                ),
                                                                            )}
                                                                        </div>

                                                                        <Link
                                                                            href="/dashboard/email-builder"
                                                                            className={
                                                                                styles.replyManageCtas
                                                                            }
                                                                        >
                                                                            Manage CTAs
                                                                            <ArrowRight
                                                                                size={
                                                                                    13
                                                                                }
                                                                            />
                                                                        </Link>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className={styles.replySavedEmailPickerWrap}>
                                                                <button
                                                                    type="button"
                                                                    role="menuitem"
                                                                    aria-haspopup="menu"
                                                                    aria-expanded={savedEmailPickerOpen}
                                                                    className={
                                                                        savedEmailPickerOpen
                                                                            ? styles.replyMenuActive
                                                                            : ""
                                                                    }
                                                                    onClick={() => {
                                                                        setCtaPickerOpen(false);
                                                                        setSavedEmailPickerOpen(
                                                                            (current) => !current,
                                                                        );

                                                                        if (!savedEmailsLoading) {
                                                                            void loadSavedEmails();
                                                                        }
                                                                    }}
                                                                >
                                                                    <FileText size={14} />
                                                                    <span>
                                                                        <strong>Insert saved email</strong>
                                                                        <small>Saved in Email Builder</small>
                                                                    </span>
                                                                    <ChevronRight
                                                                        size={14}
                                                                        className={styles.replyCtaChevron}
                                                                    />
                                                                </button>

                                                                {savedEmailPickerOpen && (
                                                                    <div className={styles.replySavedEmailPicker}>
                                                                        <div className={styles.replyCtaPickerHeader}>
                                                                            <strong>Choose saved email</strong>
                                                                            <small>Inserted content remains editable</small>
                                                                        </div>

                                                                        <label className={styles.replySavedEmailSearch}>
                                                                            <Search size={13} />
                                                                            <input
                                                                                value={savedEmailSearch}
                                                                                onChange={(event) =>
                                                                                    setSavedEmailSearch(
                                                                                        event.target.value,
                                                                                    )
                                                                                }
                                                                                placeholder="Search saved emails"
                                                                                autoFocus
                                                                            />
                                                                        </label>

                                                                        <div className={styles.replySavedEmailList}>
                                                                            {savedEmailsLoading ? (
                                                                                <div className={styles.replySavedEmailState}>
                                                                                    <Loader2
                                                                                        size={16}
                                                                                        className={styles.spin}
                                                                                    />
                                                                                    <span>Loading saved emails...</span>
                                                                                </div>
                                                                            ) : savedEmailsError ? (
                                                                                <div className={styles.replySavedEmailState}>
                                                                                    <span>{savedEmailsError}</span>
                                                                                </div>
                                                                            ) : filteredSavedEmails.length > 0 ? (
                                                                                filteredSavedEmails.map((email) => (
                                                                                    <button
                                                                                        key={email.id}
                                                                                        type="button"
                                                                                        onClick={() =>
                                                                                            insertSavedEmailIntoReply(
                                                                                                email,
                                                                                            )
                                                                                        }
                                                                                    >
                                                                                        <FileText size={14} />
                                                                                        <span>
                                                                                            <strong>{email.subject}</strong>
                                                                                            <small>
                                                                                                {email.emailType || "Saved email"}
                                                                                                {email.createdAt
                                                                                                    ? ` · ${formatListDate(email.createdAt)}`
                                                                                                    : ""}
                                                                                            </small>
                                                                                        </span>
                                                                                    </button>
                                                                                ))
                                                                            ) : (
                                                                                <div className={styles.replySavedEmailState}>
                                                                                    <span>
                                                                                        {savedEmailSearch
                                                                                            ? "No saved emails match your search."
                                                                                            : "No saved emails yet."}
                                                                                    </span>
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        <Link
                                                                            href="/dashboard/email-builder"
                                                                            className={styles.replyManageCtas}
                                                                        >
                                                                            Manage saved emails
                                                                            <ArrowRight size={13} />
                                                                        </Link>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <button
                                                                type="button"
                                                                role="menuitem"
                                                                className={
                                                                    replyFooterIncluded
                                                                        ? styles.replyMenuActive
                                                                        : ""
                                                                }
                                                                onClick={
                                                                    toggleReplyFooter
                                                                }
                                                            >
                                                                <PanelBottom
                                                                    size={14}
                                                                />
                                                                <span>
                                                                    <strong>
                                                                        {replyFooterIncluded
                                                                            ? "Remove email footer"
                                                                            : "Include email footer"}
                                                                    </strong>
                                                                    <small>
                                                                        {footerSettings.enabled
                                                                            ? "Uses your Email Builder footer"
                                                                            : "Enable it in Email Builder first"}
                                                                    </small>
                                                                </span>
                                                                {replyFooterIncluded && (
                                                                    <Check
                                                                        size={14}
                                                                        className={
                                                                            styles.replyFooterCheck
                                                                        }
                                                                    />
                                                                )}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                role="menuitem"
                                                                onClick={insertSignature}
                                                            >
                                                                <Signature size={14} />
                                                                Insert signature
                                                            </button>
                                                            {replyAttachment && (
                                                                <button
                                                                    type="button"
                                                                    role="menuitem"
                                                                    onClick={() => {
                                                                        setReplyOptionsOpen(false);
                                                                        setAttachmentPreviewOpen(true);
                                                                    }}
                                                                >
                                                                    <File size={14} />
                                                                    Preview attachment
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                role="menuitem"
                                                                className={styles.replyClearOption}
                                                                onClick={clearReply}
                                                                disabled={
                                                                    !replySubject &&
                                                                    !replyBody &&
                                                                    !replyAttachment
                                                                }
                                                            >
                                                                <Trash2 size={14} />
                                                                Clear reply
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                className={styles.sendButton}
                                                disabled={
                                                    !replyRef.current?.innerText.trim() ||
                                                    (composeOpen && !composeRecipient)
                                                }
                                                onClick={sendReply}
                                            >
                                                Send now
                                                <Send size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <input
                                        ref={attachmentInputRef}
                                        type="file"
                                        className={styles.hiddenFileInput}
                                        onChange={(event) => {
                                            setReplyAttachment(
                                                event.target.files?.[0] ?? null,
                                            );
                                            setAttachmentPreviewOpen(false);
                                        }}
                                    />
                                </footer>
                            )}

                            {attachmentPreviewOpen && replyAttachment && replyAttachmentUrl && (
                                <div
                                    className={styles.attachmentPreviewOverlay}
                                    role="dialog"
                                    aria-modal="true"
                                    aria-label={`Preview ${replyAttachment.name}`}
                                    onMouseDown={(event) => {
                                        if (event.target === event.currentTarget) {
                                            setAttachmentPreviewOpen(false);
                                        }
                                    }}
                                >
                                    <div className={styles.attachmentPreviewModal}>
                                        <header>
                                            <div>
                                                <strong>{replyAttachment.name}</strong>
                                                <span>
                                                    {(replyAttachment.size / 1024).toFixed(0)} KB
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                aria-label="Close attachment preview"
                                                onClick={() => setAttachmentPreviewOpen(false)}
                                            >
                                                <X size={16} />
                                            </button>
                                        </header>

                                        <div className={styles.attachmentPreviewBody}>
                                            {replyAttachment.type.startsWith("image/") ? (
                                                <img
                                                    src={replyAttachmentUrl}
                                                    alt={replyAttachment.name}
                                                />
                                            ) : replyAttachment.type === "application/pdf" ? (
                                                <iframe
                                                    src={replyAttachmentUrl}
                                                    title={replyAttachment.name}
                                                />
                                            ) : (
                                                <div className={styles.attachmentPreviewFallback}>
                                                    <File size={30} />
                                                    <strong>{replyAttachment.name}</strong>
                                                    <span>
                                                        A browser preview is not available for this file type.
                                                    </span>
                                                    <a
                                                        href={replyAttachmentUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        Open file
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {aiPanelOpen && (
                                <aside className={styles.aiPanel}>
                                    <header className={styles.aiPanelHeader}>
                                        <div>
                                            <span>
                                                <Bot size={17} />
                                            </span>
                                            <div>
                                                <strong>
                                                    AI Reply Assistant
                                                </strong>
                                                <small>
                                                    Generate a personalised
                                                    response
                                                </small>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            aria-label="Close AI assistant"
                                            onClick={() =>
                                                setAiPanelOpen(false)
                                            }
                                        >
                                            <X size={16} />
                                        </button>
                                    </header>

                                    <div className={styles.aiPanelBody}>
                                        <div className={styles.aiContext}>
                                            <span>Replying to</span>
                                            <strong>
                                                {selectedThread.customerName}
                                            </strong>
                                            <small>
                                                {selectedThread.subject}
                                            </small>
                                        </div>

                                        <label className={styles.aiPrompt}>
                                            <span>
                                                What should the reply do?
                                            </span>
                                            <textarea
                                                value={aiPrompt}
                                                onChange={(event) =>
                                                    setAiPrompt(
                                                        event.target.value,
                                                    )
                                                }
                                                placeholder="Example: Write a warm, concise reply. Confirm Thursday at 2:30 PM and mention that James can join the call."
                                            />
                                        </label>

                                        <button
                                            type="button"
                                            className={
                                                styles.generateReplyButton
                                            }
                                            disabled={
                                                !aiPrompt.trim() ||
                                                generatingReply
                                            }
                                            onClick={generateAiReply}
                                        >
                                            {generatingReply ? (
                                                <Loader2
                                                    size={15}
                                                    className={styles.spinning}
                                                />
                                            ) : (
                                                <Sparkles size={15} />
                                            )}
                                            {generatingReply
                                                ? "Generating..."
                                                : "Generate reply"}
                                        </button>

                                        {aiError && (
                                            <div className={styles.aiError}>
                                                {aiError}
                                            </div>
                                        )}

                                        {aiReply && (
                                            <div
                                                className={
                                                    styles.aiGeneratedReply
                                                }
                                            >
                                                <div>
                                                    <strong>
                                                        Suggested reply
                                                    </strong>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setAiReply("")
                                                        }
                                                    >
                                                        Clear
                                                    </button>
                                                </div>

                                                <p>{aiReply}</p>

                                                <button
                                                    type="button"
                                                    className={
                                                        styles.useReplyButton
                                                    }
                                                    onClick={useAiReply}
                                                >
                                                    <Reply size={14} />
                                                    Use this reply
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </aside>
                            )}
                        </>
                    )}
                </section>
            </section>
        </main>
    );
}
