"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import {
    CalendarClock,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Download,
    Eye,
    Funnel,
    Mail,
    MousePointer2,
    Reply,
    Search,
    PoundSterling,
    Send,
    ShieldX,
    X,
    Clock,
    Sparkles,
    Star,
    Trash2,
    ArrowRight,
    Link2,
    MoreHorizontal,
    Paperclip,
    MousePointerClick,
    Pencil,
    Signature,
    AlignCenter,
    AlignLeft,
    AlignRight,
    Bold,
    Italic,
    List,
    ListOrdered,
    Redo2,
    Underline,
    Undo2,
} from "lucide-react";
import {
    customers as demoCustomers,
    customerKpis,
    type Customer,
} from "../../../../lib/customersData";
import { getCustomerEmailsById } from "../../../../lib/customerEmailsData";

import "./customer-profile.css";

type CustomerProfilePageProps = {
    params: Promise<{ id: string }>;
};

type CustomerWithMrr = Partial<Customer> & {
    id: string;
    name: string;
    email: string;
    company: string;
    mrr?: number;
    engagementScore?: number;
    lastActivity?: string;
    clickRate?: string;
    openRate?: string | number;
    lastEmail?: string;
};

type EditableAccountDetails = {
    company: string;
    name: string;
    email: string;
    mrr: string;
    engagementScore: string;
};

type ReplyCta = {
    id: string;
    label: string;
    url: string;
    variant: "filled" | "outline" | "text";
    size: "small" | "medium" | "large";
    radius: "square" | "rounded" | "pill";
    alignment: "left" | "center" | "right";
    backgroundColor: string;
    textColor: string;
};

type SavedBuilderCta = {
    id: string;
    name: string;
    text: string;
    link: string;
    colour: string;
    textColour: string;
    variant: "primary" | "secondary" | "outline" | "text";
    size: "small" | "medium" | "large";
    radius: number;
    alignment: "left" | "center" | "right";
    isDefault: boolean;
};

type FooterSettings = {
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

type EmailTemplate = {
    id: string;
    category: string;
    label: string;
    subject: string;
    previewText: string;
    body: string;
    cta: string;
};

type ScheduledEmail = {
    id: string;
    emailType: string;
    subject: string;
    html: string;
    plainText: string | null;
    scheduledFor: string;
    status: string;
    sentAt?: string | null;
    deliveredAt?: string | null;
    openedAt?: string | null;
    clickedAt?: string | null;
};


type SentEmailPreview = {
    id: string;
    subject: string;
    reason: string;
    outcome: string;
    sentAt: string;
    html?: string | null;
    replyPreview?: string | null;
};

type WorkspaceResponse = {
    workspaceId?: string;
    workspace?: { id: string };
};

const DEMO_WORKSPACE_ID = "demo-workspace";
const weekDays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const fallbackSavedCtas: SavedBuilderCta[] = [
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

const defaultFooterSettings: FooterSettings = {
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


function getSavedFooterSettings(): FooterSettings {
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
        } as FooterSettings;
    } catch {
        return defaultFooterSettings;
    }
}


function getSavedBuilderCtas(): SavedBuilderCta[] {
    if (typeof window === "undefined") return fallbackSavedCtas;

    try {
        const stored = localStorage.getItem("email-agent-saved-ctas");
        const parsed = stored ? JSON.parse(stored) : null;

        if (!Array.isArray(parsed) || parsed.length === 0) {
            return fallbackSavedCtas;
        }

        const validCtas = parsed.filter((cta): cta is SavedBuilderCta => {
            return Boolean(
                cta &&
                typeof cta.id === "string" &&
                typeof cta.name === "string" &&
                typeof cta.text === "string" &&
                typeof cta.link === "string"
            );
        });

        return validCtas.length > 0 ? validCtas : fallbackSavedCtas;
    } catch {
        return fallbackSavedCtas;
    }
}

const emailTemplates: EmailTemplate[] = [
    {
        id: "onboarding-reminder",
        category: "Onboarding",
        label: "Onboarding Reminder",
        subject: "Your setup checklist is ready",
        previewText: "Guide the customer toward completing setup.",
        body: "Hi {{customer_name}},\n\nWe noticed you’ve started setting up your account. Here’s a quick checklist to help you complete the most important steps and get value faster.\n\nIf you need help, we’re here to support you.",
        cta: "Complete setup",
    },
    {
        id: "welcome-email",
        category: "Onboarding",
        label: "Welcome Email",
        subject: "Welcome to your account",
        previewText: "Introduce the customer to the product.",
        body: "Hi {{customer_name}},\n\nWelcome aboard. We’re excited to help you get started and make the most of your account.\n\nThe first step is to complete your setup so everything is ready.",
        cta: "Get started",
    },
    {
        id: "product-education",
        category: "Engagement",
        label: "Product Education",
        subject: "A quick way to get more value",
        previewText: "Educate the customer on a useful feature.",
        body: "Hi {{customer_name}},\n\nHere’s one feature that can help you get more value from your account this week.\n\nIt only takes a few minutes to try, and it can help improve your workflow.",
        cta: "View feature",
    },
    {
        id: "upgrade-offer",
        category: "Expansion",
        label: "Upgrade Offer",
        subject: "You may be ready for the next plan",
        previewText: "Suggest an upgrade based on usage.",
        body: "Hi {{customer_name}},\n\nBased on your recent activity, it looks like you may benefit from the next plan.\n\nYou’ll unlock more capacity, better automation, and more flexibility for your team.",
        cta: "View plans",
    },
];

function isDemoWorkspaceId(workspaceId: string) {
    return workspaceId === DEMO_WORKSPACE_ID;
}

function normaliseStatus(status?: string) {
    return (status || "scheduled").toLowerCase();
}

function getDemoScheduledEmailsKey(customerId: string) {
    return `demo-scheduled-emails-${customerId}`;
}

function getDemoScheduledEmails(customerId: string): ScheduledEmail[] {
    if (typeof window === "undefined") return [];

    try {
        const stored = localStorage.getItem(getDemoScheduledEmailsKey(customerId));
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveDemoScheduledEmails(customerId: string, emails: ScheduledEmail[]) {
    if (typeof window === "undefined") return;
    localStorage.setItem(getDemoScheduledEmailsKey(customerId), JSON.stringify(emails));
}

function getStoredWorkspaceId() {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("workspaceId") || "";
}

function mergeDemoAndLiveCustomers(liveCustomers: CustomerWithMrr[], workspaceId: string) {
    if (liveCustomers.length > 0) return liveCustomers;
    if (isDemoWorkspaceId(workspaceId) || !workspaceId) return demoCustomers;
    return [];
}

function formatCurrency(value?: number) {
    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
    }).format(typeof value === "number" ? value : 0);
}

function isSameDate(firstDate: Date, secondDate: Date) {
    return (
        firstDate.getFullYear() === secondDate.getFullYear() &&
        firstDate.getMonth() === secondDate.getMonth() &&
        firstDate.getDate() === secondDate.getDate()
    );
}

function buildCtaHtml(cta: ReplyCta) {
    const padding =
        cta.size === "small"
            ? "9px 14px"
            : cta.size === "large"
                ? "14px 24px"
                : "11px 18px";

    const borderRadius =
        cta.radius === "square"
            ? "4px"
            : cta.radius === "pill"
                ? "999px"
                : "10px";

    const isOutline = cta.variant === "outline";
    const isText = cta.variant === "text";

    return `
        <div style="text-align:${cta.alignment};margin:20px 0;">
            <a
                href="${cta.url}"
                target="_blank"
                rel="noopener noreferrer"
                style="
                    display:inline-block;
                    padding:${isText ? "0" : padding};
                    border-radius:${borderRadius};
                    background:${isOutline || isText ? "transparent" : cta.backgroundColor};
                    border:${isOutline ? `1px solid ${cta.backgroundColor}` : "none"};
                    color:${isOutline || isText ? cta.backgroundColor : cta.textColor};
                    font-family:Inter,Arial,sans-serif;
                    font-size:14px;
                    font-weight:600;
                    line-height:1.2;
                    text-decoration:${isText ? "underline" : "none"};
                "
            >
                ${cta.label}
            </a>
        </div>
    `;
}

function buildSavedBuilderCtaHtml(cta: SavedBuilderCta) {
    const padding =
        cta.size === "small"
            ? "9px 14px"
            : cta.size === "large"
                ? "14px 24px"
                : "11px 18px";
    const fontSize = cta.size === "small" ? "12px" : cta.size === "large" ? "15px" : "14px";
    const isOutline = cta.variant === "outline";
    const isText = cta.variant === "text";
    const isSecondary = cta.variant === "secondary";
    const background = isOutline || isText ? "transparent" : isSecondary ? "#ffffff" : cta.colour;
    const border = isOutline || isSecondary ? `1px solid ${cta.colour}` : "none";
    const colour = isOutline || isText || isSecondary ? cta.colour : cta.textColour;

    return `
        <div
            class="profileInboxDraggableCta"
            data-cobrai-cta="${cta.id}"
            data-cta-alignment="${cta.alignment}"
            contenteditable="false"
        >
            <div class="profileInboxCtaContent" contenteditable="false">
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

            <div class="profileInboxCtaToolbar" contenteditable="false" role="toolbar" aria-label="CTA controls">
                <button type="button" data-cobrai-cta-action="edit" title="Edit CTA">Edit</button>
                <button type="button" data-cobrai-cta-action="up" title="Move up">↑</button>
                <button type="button" data-cobrai-cta-action="down" title="Move down">↓</button>
                <button type="button" data-cobrai-cta-action="left" title="Align left">Left</button>
                <button type="button" data-cobrai-cta-action="center" title="Align centre">Centre</button>
                <button type="button" data-cobrai-cta-action="right" title="Align right">Right</button>
                <button type="button" class="isDanger" data-cobrai-cta-action="remove" title="Remove CTA">Remove</button>
            </div>
        </div>
    `;
}


function buildReplyFooterHtml(settings: FooterSettings) {
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

function buildEmailHtml(template: EmailTemplate, customerName: string) {
    const body = template.body.replaceAll("{{customer_name}}", customerName);

    return `
        <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#111827;">
            ${body
            .split("\n")
            .filter(Boolean)
            .map((line) => `<p>${line}</p>`)
            .join("")}
            <p>
                <a href="#" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:10px;">
                    ${template.cta}
                </a>
            </p>
        </div>
    `;
}

function getScheduledPreview(emailType: string) {
    const type = emailType.toLowerCase();
    if (type.includes("engagement") || type.includes("education")) return "Educate the customer on a useful feature.";
    if (type.includes("expansion") || type.includes("upgrade")) return "Suggest an upgrade based on customer usage.";
    if (type.includes("reply")) return "Reply scheduled from the email conversation.";
    if (type.includes("retention") || type.includes("recovery")) return "Prevent churn with a timely customer check-in.";
    return "Help the customer complete core setup actions.";
}

function formatScheduledFor(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Invalid date";

    return date.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatDateInputValue(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().split("T")[0];
}

function formatTimeInputValue(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "13:00";

    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${hours}:${minutes}`;
}

function getDueStatus(value: string, status?: string) {
    const currentStatus = normaliseStatus(status);

    if (["sent", "delivered", "failed", "bounced", "complained", "sending"].includes(currentStatus)) {
        return currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1);
    }

    const scheduledDate = new Date(value);
    const now = new Date();
    const diff = scheduledDate.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (Number.isNaN(days)) return "Scheduled";
    if (days < 0) return "Overdue";
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";

    return `Due in ${days} days`;
}


function getEmailTypeClass(emailType: string) {
    const normalisedType = emailType.toLowerCase();

    if (normalisedType.includes("onboarding")) return "emailTypeOnboarding";
    if (normalisedType.includes("retention")) return "emailTypeRetention";
    if (normalisedType.includes("engagement")) return "emailTypeEngagement";
    if (normalisedType.includes("expansion")) return "emailTypeExpansion";
    if (normalisedType.includes("education")) return "emailTypeEducation";
    if (normalisedType.includes("reply")) return "emailTypeReply";
    if (normalisedType.includes("opened")) return "emailTypeOpened";
    if (normalisedType.includes("replied")) return "emailTypeReplied";

    return "emailTypeDefault";
}

function getCustomerOpenRate(customer?: CustomerWithMrr) {
    const value = customer?.openRate;

    if (typeof value === "string" && value.trim()) {
        return value;
    }

    return "0%";
}

function getSentEmailRows(
    customerId: string,
    workspaceId: string,
    scheduledEmails: ScheduledEmail[]
): SentEmailPreview[] {
    if (isDemoWorkspaceId(workspaceId)) {
        return getCustomerEmailsById(customerId).map((email) => ({
            id: email.id,
            subject: email.subject,
            reason: email.reason,
            outcome: email.outcome,
            sentAt: email.sentAt,
            html: email.html,
            replyPreview: email.replyPreview,
        }));
    }

    return scheduledEmails
        .filter((email) => {
            const status = normaliseStatus(email.status);
            return ["sent", "delivered", "opened", "clicked"].includes(status);
        })
        .map((email) => {
            const status = normaliseStatus(email.status);
            const sentAt =
                email.sentAt ||
                email.deliveredAt ||
                email.openedAt ||
                email.clickedAt ||
                email.scheduledFor;

            return {
                id: email.id,
                subject: email.subject,
                reason: getScheduledPreview(email.emailType),
                outcome: status.charAt(0).toUpperCase() + status.slice(1),
                sentAt: formatScheduledFor(sentAt),
                html: email.html,
                replyPreview: null,
            };
        });
}


namespace EmbeddedCustomerEmailActivity {
    type CustomerEmailActivityProps = {
        customerId: string;
        accountDetails?: {
            company?: string;
            name?: string;
            email?: string;
            mrr?: number;
            engagementScore?: number;
        };
    };

    type CustomerWithMrr = Customer & {
        engagementScore?: number;
        lastActivity?: string;
        clickRate?: string;
        lastEmail?: string;
        mrr?: number;
        status?: string;
    };

    type EmailHistoryItem = {
        id: string;
        customerId: string;
        subject: string;
        previewText: string;
        type: string;
        outcome: string;
        reply?: boolean;
        sentAt: string;
        from: string;
        html: string;
        replyPreview?: string;
        starred?: boolean;
        deliveryMethod?: string;
        sendMode?: string;
    };

    type LiveActivityItem = {
        id: string;
        title: string;
        description: string;
        time: string;
        tone: "sent" | "opened" | "replied" | "ignored";
    };

    type ActivePopup = "email" | "reply" | "schedule" | "scheduleReply" | null;
    type ActivityDateRange = "24h" | "7d" | "30d" | "60d";

    const activityDateRangeOptions: Array<{
        value: ActivityDateRange;
        label: string;
        days: number;
    }> = [
            { value: "24h", label: "Last 24 hours", days: 1 },
            { value: "7d", label: "Last 7 days", days: 7 },
            { value: "30d", label: "Last 30 days", days: 30 },
            { value: "60d", label: "Last 60 days", days: 60 },
        ];

    const EMAILS_PER_PAGE = 8;

    function getWorkspaceId() {
        if (typeof window === "undefined") return "demo-workspace";
        return localStorage.getItem("workspaceId") || "demo-workspace";
    }

    function mergeDemoAndLiveCustomers(liveCustomers: CustomerWithMrr[]) {
        const liveCustomerIds = new Set(liveCustomers.map((customer) => customer.id));
        const missingDemoCustomers = demoCustomers.filter(
            (customer) => !liveCustomerIds.has(customer.id),
        );

        return [...missingDemoCustomers, ...liveCustomers];
    }

    function getOutcomeLabel(outcome: string) {
        const normalisedOutcome = outcome.toLowerCase();

        if (normalisedOutcome.includes("scheduled") || normalisedOutcome.includes("queued")) {
            return "Scheduled";
        }

        if (normalisedOutcome.includes("replied")) return "Replied";

        if (
            normalisedOutcome.includes("opened") &&
            !normalisedOutcome.includes("not")
        ) {
            return "Opened";
        }

        return "Ignored";
    }

    function emailWasReplied(email: EmailHistoryItem) {
        return Boolean(email.reply || getOutcomeLabel(email.outcome) === "Replied");
    }

    function emailWasOpened(email: EmailHistoryItem) {
        const outcome = getOutcomeLabel(email.outcome);

        return outcome === "Opened" || outcome === "Replied" || emailWasReplied(email);
    }

    function normalizeEmail(
        email: Partial<EmailHistoryItem> & { reason?: string },
    ): EmailHistoryItem {
        const subject = email.subject || "Untitled email";
        const previewText = email.previewText || email.reason || "";
        const outcome = email.outcome || "Not Opened";

        return {
            id: email.id || crypto.randomUUID(),
            customerId: email.customerId || "",
            subject,
            previewText,
            type: email.type || "Retention",
            outcome,
            reply: Boolean(email.reply || getOutcomeLabel(outcome) === "Replied"),
            sentAt: email.sentAt || "Unknown",
            from: email.from || "Team",
            html:
                email.html ||
                `
                <div style="width:100%;background:#f8fafc;padding:28px 16px;font-family:Inter,Arial,sans-serif;color:#111827;box-sizing:border-box;">
                    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;padding:28px;box-sizing:border-box;">
                        <p style="margin:0 0 12px;font-size:12px;line-height:1.5;color:#6b7280;">Sent email</p>
                        <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;font-weight:600;color:#111827;">${subject}</h1>
                        <p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#374151;">${previewText ||
                "Retention email sent to improve account engagement."
                }</p>
                        <a href="#" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;border-radius:10px;padding:11px 16px;font-size:13px;font-weight:500;">View account</a>
                    </div>
                </div>
                `,
            replyPreview: email.replyPreview || "",
            deliveryMethod: email.deliveryMethod || email.sendMode || "",
            sendMode: email.sendMode || "",
        };
    }

    function getSentEmailPreview(email: { previewText?: string; subject: string }) {
        if (email.previewText) return email.previewText;

        const lowerSubject = email.subject.toLowerCase();

        if (lowerSubject.includes("usage") || lowerSubject.includes("upgrade")) {
            return "Suggest an upgrade based on customer usage.";
        }

        if (lowerSubject.includes("capacity") || lowerSubject.includes("growing")) {
            return "Help the customer get more value from their account.";
        }

        return "Retention email sent to improve account engagement.";
    }

    function getSentEmailType(email: { subject: string; type?: string }) {
        if (email.type) return email.type;

        const lowerSubject = email.subject.toLowerCase();

        if (lowerSubject.includes("onboarding") || lowerSubject.includes("setup")) {
            return "Onboarding";
        }

        if (lowerSubject.includes("upgrade") || lowerSubject.includes("plan")) {
            return "Expansion";
        }

        return "Retention";
    }

    function getReplyLabel(outcome: string, reply?: boolean) {
        return reply || getOutcomeLabel(outcome) === "Replied" ? "Yes" : "No";
    }

    function getDeliveryMethodLabel(
        email: EmailHistoryItem,
        view: "all" | "received" | "sent" | "scheduled" | "starred",
    ) {
        if (view === "scheduled") return "Scheduled";

        const method = (email.deliveryMethod || email.sendMode || "").trim();

        if (method) {
            return method.charAt(0).toUpperCase() + method.slice(1);
        }

        return "Sent";
    }

    function getStatusTone(value: string) {
        const normalisedValue = value.toLowerCase();

        if (
            normalisedValue.includes("replied") ||
            normalisedValue.includes("opened") ||
            normalisedValue.includes("delivered") ||
            normalisedValue.includes("success")
        ) {
            return "statusToneSuccess";
        }

        if (
            normalisedValue.includes("failed") ||
            normalisedValue.includes("bounced") ||
            normalisedValue.includes("expired")
        ) {
            return "statusToneDanger";
        }

        if (
            normalisedValue.includes("scheduled") ||
            normalisedValue.includes("queued") ||
            normalisedValue.includes("pending")
        ) {
            return "statusTonePending";
        }

        if (
            normalisedValue.includes("automated") ||
            normalisedValue.includes("manual") ||
            normalisedValue.includes("sent")
        ) {
            return "statusToneInfo";
        }

        return "statusToneNeutral";
    }

    function parseActivityDate(value: string) {
        const trimmed = value.trim();
        const now = new Date();

        const relativeMatch = trimmed.match(
            /^(Today|Yesterday)\s*[·,-]?\s*(\d{1,2}):(\d{2})$/i,
        );

        if (relativeMatch) {
            const date = new Date(now);

            if (relativeMatch[1].toLowerCase() === "yesterday") {
                date.setDate(date.getDate() - 1);
            }

            date.setHours(
                Number(relativeMatch[2]),
                Number(relativeMatch[3]),
                0,
                0,
            );

            return date;
        }

        const shortDateMatch = trimmed.match(
            /^(\d{1,2})\s+([A-Za-z]{3})\s*[·,-]?\s*(\d{1,2}):(\d{2})$/,
        );

        if (shortDateMatch) {
            const monthLookup: Record<string, number> = {
                jan: 0,
                feb: 1,
                mar: 2,
                apr: 3,
                may: 4,
                jun: 5,
                jul: 6,
                aug: 7,
                sep: 8,
                oct: 9,
                nov: 10,
                dec: 11,
            };
            const month = monthLookup[shortDateMatch[2].toLowerCase()];

            if (month !== undefined) {
                const parsed = new Date(
                    now.getFullYear(),
                    month,
                    Number(shortDateMatch[1]),
                    Number(shortDateMatch[3]),
                    Number(shortDateMatch[4]),
                    0,
                    0,
                );

                // Demo dates without a year should resolve to the most recent
                // occurrence, not a browser-dependent year such as 2001.
                if (parsed.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
                    parsed.setFullYear(parsed.getFullYear() - 1);
                }

                return parsed;
            }
        }

        const directDate = new Date(trimmed);

        return Number.isNaN(directDate.getTime()) ? null : directDate;
    }

    function getDefaultCustomerReplyPreview(customerName: string) {
        const firstName = customerName.split(" ")[0] || "Sarah";

        return `Hi ${firstName},

    Thanks for reaching out.

    We've been reviewing the report and noticed a few areas where we could improve onboarding for new users.

    Let's schedule a quick call next week to discuss potential solutions.

    Best,
    Brooklyn Simmons`;
    }

    function getDefaultReplyDraft(customerName: string, companyName: string) {
        const firstName = customerName.split(" ")[0] || "Brooklyn";

        return `Hi ${firstName},

    Thanks for your note. For those two at-risk accounts at ${companyName}, we recommend reaching out with personalized check-ins and offering tailored resources to address their needs. I can also share some best practices that have worked well for similar customers.

    Would you like me to set up a quick call to walk through this together?

    Best,
    Sarah`;
    }

    function stripHtmlToText(html?: string) {
        if (!html) return "";

        return html
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<br\s*\/?\s*>/gi, "\n")
            .replace(/<\/p>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }


    function buildScheduledEmailPreviewHtml(
        customerName: string,
        subject: string,
        body: string,
    ) {
        const firstName = customerName.split(" ")[0] || "there";
        const safeSubject = subject.trim() || "Scheduled email";
        const safeBody = (body.trim() || "Your email content will appear here.")
            .replace(/{{first_name}}/gi, firstName)
            .replace(/\n/g, "<br />");

        return `
            <div style="width:100%;min-height:100%;background:#f8fafc;padding:36px 18px;font-family:Inter,Arial,sans-serif;color:#111827;box-sizing:border-box;">
                <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:22px;overflow:hidden;box-shadow:0 18px 40px rgba(15,23,42,0.08);">
                    <div style="padding:34px 34px 22px;text-align:center;border-bottom:1px solid #eef2f7;">
                        <div style="width:42px;height:42px;margin:0 auto 18px;border-radius:13px;background:#1d9bf0;color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;">${firstName.charAt(0).toUpperCase()}</div>
                        <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.04em;color:#111827;">${safeSubject}</h1>
                    </div>
                    <div style="padding:28px 34px 30px;font-size:14px;line-height:1.75;color:#374151;">
                        ${safeBody}
                        <div style="text-align:center;margin-top:28px;">
                            <a href="#" style="display:inline-block;background:#1d9bf0;color:#ffffff;text-decoration:none;border-radius:11px;padding:12px 18px;font-size:13px;font-weight:700;">View recommendation</a>
                        </div>
                    </div>
                    <div style="padding:18px 34px 26px;text-align:center;font-size:11px;line-height:1.6;color:#9ca3af;">
                        You are receiving this because you are a customer contact.<br />
                        <a href="#" style="color:#6b7280;">Unsubscribe</a>
                    </div>
                </div>
            </div>
        `;
    }

    function getEmailTypeClass(emailType: string) {
        const type = emailType.toLowerCase();

        if (type.includes("onboarding")) return "emailTypeOnboarding";
        if (type.includes("retention")) return "emailTypeRetention";
        if (type.includes("report")) return "emailTypeReport";
        if (type.includes("update")) return "emailTypeUpdate";
        if (type.includes("support")) return "emailTypeSupport";
        if (type.includes("engagement")) return "emailTypeEngagement";
        if (type.includes("expansion")) return "emailTypeExpansion";
        if (type.includes("education")) return "emailTypeEducation";
        if (type.includes("reply")) return "emailTypeReply";

        return "emailTypeDefault";
    }

    function getOutcomeClass(outcome: string) {
        const label = getOutcomeLabel(outcome);

        if (label === "Scheduled") return "emailOutcomeScheduled";
        if (label === "Replied") return "emailOutcomeReplied";
        if (label === "Opened") return "emailOutcomeOpened";

        return "emailOutcomeIgnored";
    }

    function parsePercent(value?: string) {
        if (!value) return 0;

        const parsed = Number(value.replace("%", "").trim());

        return Number.isFinite(parsed) ? parsed : 0;
    }

    function getRateChange(current: number, previous: number, reverse = false) {
        const difference = current - previous;
        const isPositive = reverse ? difference <= 0 : difference >= 0;

        return {
            label: `${difference >= 0 ? "+" : ""}${difference}% vs last 30 days`,
            className: isPositive ? "emailMetricPositive" : "emailMetricNegative",
        };
    }

    function getCountChange(current: number, previous: number, reverse = false) {
        const difference = current - previous;
        const isPositive = reverse ? difference <= 0 : difference >= 0;

        return {
            label: `${difference >= 0 ? "+" : ""}${difference} vs last 30 days`,
            className: isPositive ? "emailMetricPositive" : "emailMetricNegative",
        };
    }

    function formatDateInput(date: Date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    function getMonthDays(date: Date) {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startOffset = (firstDay.getDay() + 6) % 7;

        return [
            ...Array.from({ length: startOffset }, () => null),
            ...Array.from({ length: lastDay.getDate() }, (_, index) => {
                return new Date(year, month, index + 1);
            }),
        ];
    }

    function formatScheduledFor(date: Date) {
        const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
            date.getDay()
        ];
        const month = [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
        ][date.getMonth()];
        const day = String(date.getDate()).padStart(2, "0");
        const year = date.getFullYear();
        const hour = String(date.getHours()).padStart(2, "0");
        const minute = String(date.getMinutes()).padStart(2, "0");

        return `${weekday}, ${day} ${month} ${year} at ${hour}:${minute}`;
    }

    function buildLiveActivityItems(rows: EmailHistoryItem[]): LiveActivityItem[] {
        return rows.slice(0, 6).map((email) => {
            const outcome = getOutcomeLabel(email.outcome);
            const emailType = getSentEmailType(email);

            if (outcome === "Replied") {
                return {
                    id: `reply-${email.id}`,
                    title: "Customer replied",
                    description: `${email.subject} · ${emailType}`,
                    time: email.sentAt,
                    tone: "replied",
                };
            }

            if (outcome === "Opened") {
                return {
                    id: `opened-${email.id}`,
                    title: "Email opened",
                    description: `${email.subject} · ${emailType}`,
                    time: email.sentAt,
                    tone: "opened",
                };
            }

            return {
                id: `sent-${email.id}`,
                title: "Email sent",
                description: `${email.subject} · ${emailType}`,
                time: email.sentAt,
                tone: "sent",
            };
        });
    }

    function downloadCustomerEmailsCsv(
        customerCompany: string,
        rows: EmailHistoryItem[],
    ) {
        const headers = ["Email", "Preview", "Type", "Outcome", "Reply", "Sent"];

        const csvRows = rows.map((email) => ({
            Email: email.subject,
            Preview: getSentEmailPreview(email),
            Type: getSentEmailType(email),
            Outcome: getOutcomeLabel(email.outcome),
            Reply: getReplyLabel(email.outcome, email.reply),
            Sent: email.sentAt,
        }));

        const csv = [
            headers.join(","),
            ...csvRows.map((row) =>
                headers
                    .map(
                        (header) =>
                            `"${String(row[header as keyof typeof row]).replace(/"/g, '""')}"`,
                    )
                    .join(","),
            ),
        ].join("\n");

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `${customerCompany || "customer"}-email-history.csv`;
        link.click();

        URL.revokeObjectURL(url);
    }

    export function Component({ customerId, accountDetails }: CustomerEmailActivityProps) {
        const demoEmails = useMemo(() => {
            return getCustomerEmailsById(customerId).map((email) =>
                normalizeEmail(email),
            );
        }, [customerId]);

        const [liveCustomers, setLiveCustomers] = useState<CustomerWithMrr[]>([]);
        const [liveEmails, setLiveEmails] = useState<EmailHistoryItem[]>([]);
        const [scheduledActivityEmails, setScheduledActivityEmails] = useState<EmailHistoryItem[]>([]);
        const [activityView, setActivityView] = useState<"all" | "received" | "sent" | "scheduled" | "starred" | "deleted">("all");
        const [isLoadingCustomer, setIsLoadingCustomer] = useState(true);
        const [isLoadingEmails, setIsLoadingEmails] = useState(true);
        const [search, setSearch] = useState("");
        const [activityDateRange, setActivityDateRange] =
            useState<ActivityDateRange>("30d");
        const [activityDateMenuOpen, setActivityDateMenuOpen] = useState(false);
        const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
        const [drawerOpen, setDrawerOpen] = useState(false);
        const [activePopup, setActivePopup] = useState<ActivePopup>(null);
        const [replyDraft, setReplyDraft] = useState("");
        const [replySubject, setReplySubject] = useState("");
        const replyEditorRef = useRef<HTMLDivElement>(null);
        const [isGeneratingReply, setIsGeneratingReply] = useState(false);
        const [aiAssistOpen, setAiAssistOpen] = useState(false);
        const [replyToolsOpen, setReplyToolsOpen] = useState(false);
        const [ctaPickerOpen, setCtaPickerOpen] = useState(false);
        const [savedReplyCtas, setSavedReplyCtas] = useState<SavedBuilderCta[]>(fallbackSavedCtas);
        const [footerSettings, setFooterSettings] = useState<FooterSettings>(defaultFooterSettings);
        const [replyFooterIncluded, setReplyFooterIncluded] = useState(false);
        const [summaryOpen, setSummaryOpen] = useState(false);
        const [originalEmailExpanded, setOriginalEmailExpanded] = useState(false);
        const [starredEmailIds, setStarredEmailIds] = useState<Set<string>>(
            () => new Set(),
        );
        const [deletedEmailIds, setDeletedEmailIds] = useState<Set<string>>(
            () => new Set(),
        );
        const [deletedEmailsLoaded, setDeletedEmailsLoaded] = useState(false);
        const [page, setPage] = useState(1);
        const [calendarDate, setCalendarDate] = useState(new Date());
        const [scheduleDate, setScheduleDate] = useState(formatDateInput(new Date()));
        const [scheduleTime, setScheduleTime] = useState("13:00");
        const [scheduleEmailType, setScheduleEmailType] = useState("Retention");
        const [scheduleEmailPrompt, setScheduleEmailPrompt] = useState("");
        const [scheduleEmailSubject, setScheduleEmailSubject] = useState("");
        const [scheduleEmailBody, setScheduleEmailBody] = useState("");
        const [scheduleEmailHtml, setScheduleEmailHtml] = useState("");
        const [isGeneratingScheduleEmail, setIsGeneratingScheduleEmail] = useState(false);
        const [isSchedulePreviewOpen, setIsSchedulePreviewOpen] = useState(false);
        const [schedulePopoverOpen, setSchedulePopoverOpen] = useState(false);

        useEffect(() => {
            if (typeof window === "undefined") return;

            try {
                const stored = localStorage.getItem(
                    `deleted-customer-emails-${customerId}`,
                );
                const parsed = stored ? JSON.parse(stored) : [];

                setDeletedEmailIds(
                    new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []),
                );
            } catch {
                setDeletedEmailIds(new Set());
            } finally {
                setDeletedEmailsLoaded(true);
            }
        }, [customerId]);

        useEffect(() => {
            if (typeof window === "undefined" || !deletedEmailsLoaded) return;

            localStorage.setItem(
                `deleted-customer-emails-${customerId}`,
                JSON.stringify(Array.from(deletedEmailIds)),
            );
        }, [customerId, deletedEmailIds, deletedEmailsLoaded]);

        useEffect(() => {
            const loadBuilderPreferences = () => {
                setSavedReplyCtas(getSavedBuilderCtas());
                setFooterSettings(getSavedFooterSettings());
            };

            loadBuilderPreferences();
            window.addEventListener("storage", loadBuilderPreferences);

            return () => window.removeEventListener("storage", loadBuilderPreferences);
        }, []);

        const allCustomers = useMemo(() => {
            return mergeDemoAndLiveCustomers(liveCustomers);
        }, [liveCustomers]);

        const baseActivityCustomer = allCustomers.find((item) => item.id === customerId);
        const customer = useMemo(() => {
            if (!baseActivityCustomer) return undefined;
            return accountDetails
                ? { ...baseActivityCustomer, ...accountDetails }
                : baseActivityCustomer;
        }, [accountDetails, baseActivityCustomer]);
        const sentActivityEmails = liveEmails.length > 0 ? liveEmails : demoEmails;
        const allActivityEmails = useMemo(() => {
            const seen = new Set<string>();

            return [...sentActivityEmails, ...scheduledActivityEmails].filter(
                (email) => {
                    if (seen.has(email.id)) return false;
                    seen.add(email.id);
                    return true;
                },
            );
        }, [scheduledActivityEmails, sentActivityEmails]);

        const emails = useMemo(() => {
            if (activityView === "deleted") {
                return allActivityEmails.filter((email) =>
                    deletedEmailIds.has(email.id),
                );
            }

            if (activityView === "scheduled") {
                return scheduledActivityEmails.filter(
                    (email) => !deletedEmailIds.has(email.id),
                );
            }

            if (activityView === "received") {
                return sentActivityEmails.filter(
                    (email) =>
                        !deletedEmailIds.has(email.id) &&
                        (Boolean(email.reply) ||
                            getOutcomeLabel(email.outcome) === "Replied"),
                );
            }

            if (activityView === "starred") {
                return sentActivityEmails.filter(
                    (email) =>
                        !deletedEmailIds.has(email.id) &&
                        (Boolean(email.starred) ||
                            starredEmailIds.has(email.id)),
                );
            }

            if (activityView === "sent") {
                return sentActivityEmails.filter(
                    (email) => !deletedEmailIds.has(email.id),
                );
            }

            return allActivityEmails.filter(
                (email) => !deletedEmailIds.has(email.id),
            );
        }, [
            activityView,
            allActivityEmails,
            deletedEmailIds,
            scheduledActivityEmails,
            sentActivityEmails,
            starredEmailIds,
        ]);

        useEffect(() => {
            async function loadCustomers() {
                try {
                    const response = await fetch(
                        `/api/dashboard/customers?workspaceId=${encodeURIComponent(
                            getWorkspaceId(),
                        )}`,
                        { cache: "no-store" },
                    );

                    if (!response.ok) {
                        setLiveCustomers([]);
                        return;
                    }

                    const data = await response.json();

                    setLiveCustomers(Array.isArray(data.customers) ? data.customers : []);
                } catch {
                    setLiveCustomers([]);
                } finally {
                    setIsLoadingCustomer(false);
                }
            }

            loadCustomers();
        }, []);

        useEffect(() => {
            async function loadScheduledActivity() {
                const workspaceId = getWorkspaceId();

                if (workspaceId === DEMO_WORKSPACE_ID) {
                    const demoScheduled = getDemoScheduledEmails(customerId).map((email) =>
                        normalizeEmail({
                            id: email.id,
                            customerId,
                            subject: email.subject,
                            previewText:
                                email.plainText || getScheduledPreview(email.emailType),
                            type: email.emailType,
                            outcome: "Scheduled",
                            reply: false,
                            sentAt: formatScheduledFor(new Date(email.scheduledFor)),
                            from: "Cobrai",
                            html: email.html,
                        }),
                    );

                    setScheduledActivityEmails(demoScheduled);
                    return;
                }

                try {
                    const response = await fetch(
                        `/api/email-agent/scheduled?workspaceId=${encodeURIComponent(
                            workspaceId,
                        )}&customerId=${encodeURIComponent(customerId)}`,
                        { cache: "no-store" },
                    );

                    if (!response.ok) {
                        setScheduledActivityEmails([]);
                        return;
                    }

                    const data = await response.json();
                    const rows = Array.isArray(data.scheduledEmails)
                        ? data.scheduledEmails
                        : [];

                    setScheduledActivityEmails(
                        rows
                            .filter((email: ScheduledEmail) => {
                                const status = normaliseStatus(email.status);
                                return !["sent", "delivered", "opened", "clicked"].includes(status);
                            })
                            .map((email: ScheduledEmail) =>
                                normalizeEmail({
                                    id: email.id,
                                    customerId,
                                    subject: email.subject,
                                    previewText:
                                        email.plainText ||
                                        getScheduledPreview(email.emailType),
                                    type: email.emailType,
                                    outcome: "Scheduled",
                                    reply: false,
                                    sentAt: formatScheduledFor(new Date(email.scheduledFor)),
                                    from: "Cobrai",
                                    html: email.html,
                                }),
                            )
                    );
                } catch {
                    setScheduledActivityEmails([]);
                }
            }

            loadScheduledActivity();
        }, [customerId]);

        useEffect(() => {
            async function loadEmailHistory() {
                try {
                    const response = await fetch(
                        `/api/dashboard/customers/${encodeURIComponent(
                            customerId,
                        )}/emails?workspaceId=${encodeURIComponent(getWorkspaceId())}`,
                        { cache: "no-store" },
                    );

                    if (!response.ok) {
                        setLiveEmails([]);
                        return;
                    }

                    const data = await response.json();
                    const emailHistory = Array.isArray(data.emails)
                        ? data.emails
                        : Array.isArray(data.emailHistory)
                            ? data.emailHistory
                            : [];

                    setLiveEmails(
                        emailHistory.map((email: Partial<EmailHistoryItem>) =>
                            normalizeEmail(email),
                        ),
                    );
                } catch {
                    setLiveEmails([]);
                } finally {
                    setIsLoadingEmails(false);
                }
            }

            loadEmailHistory();
        }, [customerId]);

        const sentEmails = sentActivityEmails.length;
        const openedEmails = sentActivityEmails.filter(
            (email) => getOutcomeLabel(email.outcome) === "Opened",
        ).length;
        const repliedEmails = sentActivityEmails.filter(
            (email) => getOutcomeLabel(email.outcome) === "Replied",
        ).length;
        const unopenedEmails = sentActivityEmails.filter(
            (email) => getOutcomeLabel(email.outcome) === "Ignored",
        ).length;

        const openRate =
            sentEmails > 0 ? Math.round((openedEmails / sentEmails) * 100) : 0;
        const replyRate =
            sentEmails > 0 ? Math.round((repliedEmails / sentEmails) * 100) : 0;
        const clickRate = parsePercent(customer?.clickRate);

        const previousMonthStats = {
            sent: Math.max(sentEmails - 4, 1),
            openedRate: Math.max(openRate - 8, 0),
            replyRate: Math.max(replyRate - 3, 0),
            unopened: Math.max(unopenedEmails - 2, 0),
            clickRate: Math.max(clickRate - 2, 0),
        };

        const metricCards = [
            {
                label: "Emails Sent",
                value: `${sentEmails}`,
                icon: Mail,
                tone: "blue",
                change: getCountChange(sentEmails, previousMonthStats.sent),
            },
            {
                label: "Open Rate",
                value: `${openRate}%`,
                icon: Mail,
                tone: "green",
                change: getRateChange(openRate, previousMonthStats.openedRate),
            },
            {
                label: "Reply Rate",
                value: `${replyRate}%`,
                icon: Reply,
                tone: "purple",
                change: getRateChange(replyRate, previousMonthStats.replyRate),
            },
            {
                label: "Unopened Emails",
                value: `${unopenedEmails}`,
                icon: ShieldX,
                tone: "orange",
                change: getCountChange(unopenedEmails, previousMonthStats.unopened, true),
            },
            {
                label: "Click Rate",
                value: `${clickRate}%`,
                icon: MousePointer2,
                tone: "sky",
                change: getRateChange(clickRate, previousMonthStats.clickRate),
            },
        ];

        const liveActivities = useMemo(() => {
            return buildLiveActivityItems(emails);
        }, [emails]);

        const emailTypes = useMemo(() => {
            const uniqueTypes = new Set(emails.map((email) => getSentEmailType(email)));
            return Array.from(uniqueTypes);
        }, [emails]);

        const selectedActivityDateOption =
            activityDateRangeOptions.find(
                (option) => option.value === activityDateRange,
            ) ?? activityDateRangeOptions[2];

        const scheduleEmailTypes = useMemo(() => {
            const types = new Set([scheduleEmailType, ...emailTypes, "Onboarding", "Retention", "Expansion", "Education"]);
            return Array.from(types).filter(Boolean);
        }, [emailTypes, scheduleEmailType]);

        const filteredEmails = useMemo(() => {
            const query = search.trim().toLowerCase();

            return emails.filter((email) => {
                const type = getSentEmailType(email);
                const outcome = getOutcomeLabel(email.outcome);
                const reply = getReplyLabel(email.outcome, email.reply);

                const matchesSearch =
                    !query ||
                    email.subject.toLowerCase().includes(query) ||
                    getSentEmailPreview(email).toLowerCase().includes(query) ||
                    type.toLowerCase().includes(query) ||
                    outcome.toLowerCase().includes(query) ||
                    reply.toLowerCase().includes(query);

                if (!matchesSearch) return false;

                const activityDate = parseActivityDate(email.sentAt);
                const dateRangeStart =
                    Date.now() -
                    selectedActivityDateOption.days * 24 * 60 * 60 * 1000;

                if (
                    activityDate &&
                    activityDate.getTime() < dateRangeStart
                ) {
                    return false;
                }

                return true;
            });
        }, [emails, search, selectedActivityDateOption.days]);

        useEffect(() => {
            setPage(1);
            setSelectedEmailId(null);
        }, [activityDateRange, activityView, search]);

        useEffect(() => {
            setSearch("");
        }, [activityView]);

        const totalPages = Math.max(
            Math.ceil(filteredEmails.length / EMAILS_PER_PAGE),
            1,
        );
        const safePage = Math.min(page, totalPages);
        const startIndex = (safePage - 1) * EMAILS_PER_PAGE;
        const endIndex = startIndex + EMAILS_PER_PAGE;
        const visibleEmails = filteredEmails.slice(startIndex, endIndex);
        const showingStart = filteredEmails.length === 0 ? 0 : startIndex + 1;
        const showingEnd = Math.min(endIndex, filteredEmails.length);
        const selectedEmail =
            emails.find((email) => email.id === selectedEmailId) || null;
        const selectedEmailBody = selectedEmail
            ? stripHtmlToText(selectedEmail.html) ||
            selectedEmail.previewText ||
            "No email body is available."
            : "";
        const canReplyToSelectedEmail = Boolean(
            selectedEmail &&
            emailWasReplied(selectedEmail) &&
            activityView !== "scheduled" &&
            activityView !== "deleted",
        );
        const monthDays = getMonthDays(calendarDate);

        useEffect(() => {
            if (visibleEmails.length === 0) {
                setSelectedEmailId(null);
                return;
            }

            const selectedStillVisible = visibleEmails.some(
                (email) => email.id === selectedEmailId,
            );

            if (!selectedStillVisible) {
                setSelectedEmailId(visibleEmails[0].id);
            }
        }, [selectedEmailId, visibleEmails]);

        function toggleSelectedEmailStar() {
            if (!selectedEmail) return;

            setStarredEmailIds((current) => {
                const next = new Set(current);

                if (next.has(selectedEmail.id)) {
                    next.delete(selectedEmail.id);
                } else {
                    next.add(selectedEmail.id);
                }

                return next;
            });
        }

        useEffect(() => {
            const editor = replyEditorRef.current;
            if (!editor) return;

            const editorText = editor.innerText.replace(/\u00a0/g, " ");
            if (editorText !== replyDraft) {
                editor.innerText = replyDraft;
            }
        }, [replyDraft, selectedEmailId]);

        function moveSelectedEmailToDeleted() {
            if (!selectedEmail) return;

            setDeletedEmailIds((current) => {
                const next = new Set(current);
                next.add(selectedEmail.id);
                return next;
            });

            setSelectedEmailId(null);
            setSchedulePopoverOpen(false);
            setAiAssistOpen(false);
            setSummaryOpen(false);
        }

        function handleSelectEmail(emailId: string) {
            const email = emails.find((item) => item.id === emailId);
            const fallbackCustomer = customer || allCustomers.find((item) => item.id === customerId);

            setSelectedEmailId(emailId);
            setDrawerOpen(false);
            setActivePopup(null);
            setAiAssistOpen(false);
            setSummaryOpen(false);
            setOriginalEmailExpanded(false);
            setSchedulePopoverOpen(false);
            setReplyToolsOpen(false);
            setCtaPickerOpen(false);
            setReplyDraft("");
            setReplySubject(email ? `Re: ${email.subject}` : "");
            setCalendarDate(new Date());
            setScheduleDate(formatDateInput(new Date()));
            setScheduleTime("13:00");
            setScheduleEmailType(email ? getSentEmailType(email) : "Retention");
            setScheduleEmailPrompt("");
            setScheduleEmailSubject("");
            setScheduleEmailBody("");
            setScheduleEmailHtml("");
            setIsSchedulePreviewOpen(false);
        }

        function handleCloseEmailDrawer() {
            setDrawerOpen(false);
            setActivePopup(null);
            setIsSchedulePreviewOpen(false);
        }

        function handleClosePopup() {
            setActivePopup(null);
        }

        async function handleGenerateReply() {
            if (!selectedEmail || !customer) return;

            setIsGeneratingReply(true);

            try {
                const response = await fetch("/api/email-agent/generate-reply", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        customer: {
                            id: customer.id,
                            name: customer.name,
                            company: customer.company,
                            email: customer.email,
                            mrr: customer.mrr,
                            status: customer.status,
                            engagementScore: customer.engagementScore,
                            lastActivity: customer.lastActivity,
                        },
                        email: {
                            id: selectedEmail.id,
                            subject: selectedEmail.subject,
                            previewText: selectedEmail.previewText,
                            type: selectedEmail.type,
                            outcome: selectedEmail.outcome,
                            sentAt: selectedEmail.sentAt,
                            from: selectedEmail.from,
                        },
                        replyPreview: selectedEmail.replyPreview || "",
                    }),
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || "Failed to generate reply");
                }

                setReplyDraft(data.reply || "");
            } catch (error) {
                console.error("Generate reply error:", error);
                setReplyDraft(
                    "Sorry, I couldn't generate a reply right now. Please try again.",
                );
            } finally {
                setIsGeneratingReply(false);
            }
        }

        async function handleGenerateScheduleEmail() {
            if (!customer) return;

            setIsGeneratingScheduleEmail(true);

            try {
                const response = await fetch("/api/email-agent/generate", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        workspaceId: getWorkspaceId(),
                        emailType: scheduleEmailType,
                        prompt: scheduleEmailPrompt,
                        customer: {
                            id: customer.id,
                            name: customer.name,
                            company: customer.company,
                            email: customer.email,
                            mrr: customer.mrr,
                            status: customer.status,
                            engagementScore: customer.engagementScore,
                            lastActivity: customer.lastActivity,
                        },
                    }),
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || "Failed to generate email");
                }

                setScheduleEmailSubject(data.subject || "");
                setScheduleEmailBody(data.plainText || stripHtmlToText(data.html) || "");
                setScheduleEmailHtml(data.html || "");
            } catch (error) {
                console.error("Generate scheduled email error:", error);
            } finally {
                setIsGeneratingScheduleEmail(false);
            }
        }

        function handleScheduleReply() {
            if (!selectedEmail) return;

            const isReplySchedule = activePopup === "scheduleReply";
            const body = isReplySchedule
                ? replyDraft.trim()
                : scheduleEmailBody.trim() ||
                selectedEmail.previewText.trim() ||
                stripHtmlToText(selectedEmail.html);
            const subject = isReplySchedule
                ? replySubject.trim() || `Re: ${selectedEmail.subject}`
                : scheduleEmailSubject.trim() || selectedEmail.subject;

            if (!body) return;

            const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`);

            console.log(isReplySchedule ? "Schedule reply" : "Schedule email", {
                customerId,
                emailId: selectedEmail.id,
                emailType: isReplySchedule ? "Reply" : scheduleEmailType,
                subject,
                body,
                scheduledAt: Number.isNaN(scheduledAt.getTime())
                    ? null
                    : scheduledAt.toISOString(),
            });

            setActivePopup(null);
            setSchedulePopoverOpen(false);
        }

        function handleSendNow() {
            if (!replyDraft.trim()) return;

            console.log("Send now", {
                customerId,
                emailId: selectedEmail?.id,
                subject: replySubject.trim() || (selectedEmail ? `Re: ${selectedEmail.subject}` : ""),
                body: replyDraft,
                html: replyEditorRef.current?.innerHTML || "",
            });
        }

        function insertIntoReply(value: string) {
            setReplyDraft((current) => {
                const separator = current.trim() ? "\n\n" : "";
                return `${current}${separator}${value}`;
            });
            setReplyToolsOpen(false);
        }

        function insertSavedCtaIntoReply(cta: SavedBuilderCta) {
            const editor = replyEditorRef.current;
            if (!editor) return;

            editor.focus();
            document.execCommand("insertHTML", false, buildSavedBuilderCtaHtml(cta));
            syncReplyEditor();
            setReplyToolsOpen(false);
            setCtaPickerOpen(false);
        }


        function toggleReplyFooter() {
            const editor = replyEditorRef.current;
            if (!editor) return;

            const existingFooter = editor.querySelector<HTMLElement>("[data-cobrai-footer]");

            if (existingFooter) {
                const spacer = existingFooter.nextElementSibling;
                existingFooter.remove();

                if (spacer instanceof HTMLElement && spacer.innerHTML === "<br>") {
                    spacer.remove();
                }

                setReplyFooterIncluded(false);
                syncReplyEditor();
                setReplyToolsOpen(false);
                return;
            }

            const latestSettings = getSavedFooterSettings();
            setFooterSettings(latestSettings);

            if (!latestSettings.enabled) {
                setReplyToolsOpen(false);
                return;
            }

            editor.focus();
            editor.insertAdjacentHTML("beforeend", buildReplyFooterHtml(latestSettings));
            setReplyFooterIncluded(true);
            syncReplyEditor();
            setReplyToolsOpen(false);
        }


        function selectReplyCta(cta: HTMLElement | null) {
            const editor = replyEditorRef.current;
            if (!editor) return;

            editor.querySelectorAll(".profileInboxDraggableCta.isSelected").forEach((element) => {
                if (element !== cta) element.classList.remove("isSelected");
            });

            if (cta) cta.classList.add("isSelected");
        }

        function moveReplyCta(cta: HTMLElement, direction: "up" | "down") {
            const editor = replyEditorRef.current;
            if (!editor) return;

            const blocks = Array.from(editor.children).filter((child) => {
                return child instanceof HTMLElement && child.innerHTML !== "<br>";
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
        }

        function alignReplyCta(cta: HTMLElement, alignment: "left" | "center" | "right") {
            cta.dataset.ctaAlignment = alignment;
            selectReplyCta(cta);
            syncReplyEditor();
        }

        function editReplyCta(cta: HTMLElement) {
            const link = cta.querySelector<HTMLAnchorElement>("a");
            if (!link) return;

            const nextText = window.prompt("Button text", link.textContent?.trim() || "");
            if (nextText === null) return;

            const nextLink = window.prompt("Button link", link.getAttribute("href") || "");
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
        }

        function handleReplyEditorClick(event: ReactMouseEvent<HTMLDivElement>) {
            const target = event.target as HTMLElement;
            const footerAction = target.closest<HTMLElement>("[data-cobrai-footer-action]");
            const footer = target.closest<HTMLElement>("[data-cobrai-footer]");

            if (footerAction && footer) {
                event.preventDefault();
                event.stopPropagation();

                const spacer = footer.nextElementSibling;
                footer.remove();

                if (spacer instanceof HTMLElement && spacer.innerHTML === "<br>") {
                    spacer.remove();
                }

                setReplyFooterIncluded(false);
                syncReplyEditor();
                return;
            }

            const actionButton = target.closest<HTMLElement>("[data-cobrai-cta-action]");
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

                if (action === "left" || action === "center" || action === "right") {
                    alignReplyCta(cta, action);
                    return;
                }

                if (action === "remove") {
                    const spacer = cta.nextElementSibling;
                    cta.remove();
                    if (spacer instanceof HTMLElement && spacer.innerHTML === "<br>") spacer.remove();
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
        }


        function syncReplyEditor() {
            const editor = replyEditorRef.current;
            if (!editor) return;
            setReplyDraft(editor.innerText.replace(/\u00a0/g, " "));
        }

        function applyReplyFormat(command: string, value?: string) {
            const editor = replyEditorRef.current;
            if (!editor) return;

            editor.focus();
            document.execCommand(command, false, value);
            syncReplyEditor();
        }

        function handleInsertReplyLink() {
            const url = window.prompt("Paste a link");
            if (!url?.trim()) return;

            applyReplyFormat("createLink", url.trim());
            setReplyToolsOpen(false);
        }

        function handleReplyAttachment() {
            const input = document.createElement("input");
            input.type = "file";
            input.multiple = true;
            input.onchange = () => {
                // Keep the existing sending logic untouched. The selected files can be
                // connected to the current attachment upload flow when available.
                setReplyToolsOpen(false);
            };
            input.click();
        }

        function handleSendScheduledEmailNow() {
            if (!selectedEmail) return;

            const body = scheduleEmailBody.trim();
            const subject = scheduleEmailSubject.trim() || selectedEmail.subject;

            if (!body) return;

            console.log("Send scheduled email now", {
                customerId,
                emailId: selectedEmail.id,
                emailType: scheduleEmailType,
                subject,
                body,
            });

            setActivePopup(null);
        }

        if ((!customer && isLoadingCustomer) || isLoadingEmails) {
            return (
                <section className="emailsPage embeddedEmailActivity">
                    <section className="emailsContent">
                        <section className="emailsEmptyState">
                            <h1>Loading email history...</h1>
                        </section>
                    </section>
                </section>
            );
        }

        if (!customer) {
            return (
                <section className="emailsPage embeddedEmailActivity">
                    <section className="emailsContent">
                        <section className="emailsEmptyState">
                            <h1>Customer not found</h1>
                            <p>This customer does not exist.</p>
                        </section>
                    </section>
                </section>
            );
        }

        return (
            <section className="emailsPage embeddedEmailActivity">
                <section className="emailsContent">
                    <div className="emailsTopRow">
                        <div className="emailsIntroBlock">
                            <Link
                                href={`/dashboard/customers/${encodeURIComponent(customer.id)}`}
                                className="backToCustomer"
                            >
                                <ChevronLeft size={15} />
                                Back To Account
                            </Link>

                            <header className="emailsHeader">
                                <h1>Email Activity </h1>
                                <strong>{customer.company}</strong>
                                <p>
                                    {customer.name || "–"} <span>·</span> {customer.email || "–"}
                                </p>
                            </header>
                        </div>

                        <button
                            type="button"
                            className="emailDownloadButton"
                            onClick={() =>
                                downloadCustomerEmailsCsv(customer.company, filteredEmails)
                            }
                        >
                            <Download size={14} />
                            Download CSV
                        </button>
                    </div>

                    <section className="emailsMetricStrip">
                        {metricCards.map((metric) => {
                            const Icon = metric.icon;

                            return (
                                <article className="emailMetricCard" key={metric.label}>
                                    <div
                                        className={`emailMetricIcon emailMetricIcon-${metric.tone}`}
                                    >
                                        <Icon size={18} />
                                    </div>

                                    <div className="emailMetricCopy">
                                        <span>{metric.label}</span>
                                        <strong>{metric.value}</strong>
                                        <p className={metric.change.className}>
                                            {metric.change.label}
                                        </p>
                                    </div>
                                </article>
                            );
                        })}
                    </section>

                    <section className={`emailsActivityWorkspace ${activityView === "received" ? "emailsActivityWorkspaceReceived" : ""}`}>
                        <section className="emailActivityListPanel">
                            <div className="activityInboxToolbar">
                                <div className="activityInboxControlRow">
                                    <div className="activityInboxHeading">
                                        <strong>
                                            {activityView === "received"
                                                ? "Received emails"
                                                : activityView === "sent"
                                                    ? "Sent emails"
                                                    : activityView === "scheduled"
                                                        ? "Scheduled emails"
                                                        : activityView === "starred"
                                                            ? "Starred emails"
                                                            : activityView === "deleted"
                                                                ? "Deleted emails"
                                                                : "Inbox"}
                                        </strong>
                                    </div>

                                    <div className="activityInboxControls">
                                        <div className="activityDateFilter">
                                            <button
                                                type="button"
                                                className="activityDateFilterButton"
                                                aria-haspopup="listbox"
                                                aria-expanded={activityDateMenuOpen}
                                                onClick={() =>
                                                    setActivityDateMenuOpen(
                                                        (current) => !current,
                                                    )
                                                }
                                            >
                                                <CalendarDays size={15} />
                                                <span>
                                                    {selectedActivityDateOption.label}
                                                </span>
                                                <ChevronDown
                                                    size={14}
                                                    className={
                                                        activityDateMenuOpen
                                                            ? "activityDateFilterChevronOpen"
                                                            : ""
                                                    }
                                                />
                                            </button>

                                            {activityDateMenuOpen && (
                                                <div
                                                    className="activityDateFilterMenu"
                                                    role="listbox"
                                                    aria-label="Filter email activity by date"
                                                >
                                                    {activityDateRangeOptions.map(
                                                        (option) => {
                                                            const isSelected =
                                                                option.value ===
                                                                activityDateRange;

                                                            return (
                                                                <button
                                                                    key={option.value}
                                                                    type="button"
                                                                    role="option"
                                                                    aria-selected={
                                                                        isSelected
                                                                    }
                                                                    className={
                                                                        isSelected
                                                                            ? "activityDateFilterOption activityDateFilterOptionActive"
                                                                            : "activityDateFilterOption"
                                                                    }
                                                                    onClick={() => {
                                                                        setActivityDateRange(
                                                                            option.value,
                                                                        );
                                                                        setActivityDateMenuOpen(
                                                                            false,
                                                                        );
                                                                    }}
                                                                >
                                                                    <span>
                                                                        {option.label}
                                                                    </span>
                                                                    {isSelected && (
                                                                        <Check
                                                                            size={14}
                                                                        />
                                                                    )}
                                                                </button>
                                                            );
                                                        },
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <label className="activityMailboxFilter">
                                            <Funnel
                                                size={15}
                                                className="activityMailboxFilterIcon"
                                            />
                                            <select
                                                value={activityView}
                                                onChange={(event) =>
                                                    setActivityView(
                                                        event.target.value as
                                                        | "all"
                                                        | "received"
                                                        | "sent"
                                                        | "scheduled"
                                                        | "starred"
                                                        | "deleted",
                                                    )
                                                }
                                                aria-label="Filter email activity"
                                            >
                                                <option value="all">
                                                    All emails
                                                </option>
                                                <option value="received">
                                                    Received emails
                                                </option>
                                                <option value="sent">
                                                    Sent emails
                                                </option>
                                                <option value="scheduled">
                                                    Scheduled emails
                                                </option>
                                                <option value="starred">
                                                    Starred emails
                                                </option>
                                                <option value="deleted">
                                                    Deleted emails
                                                </option>
                                            </select>
                                            <ChevronDown
                                                size={14}
                                                className="activityMailboxFilterChevron"
                                            />
                                        </label>
                                    </div>
                                </div>

                                <div className="activityInboxTotal">
                                    {filteredEmails.length}{" "}
                                    {filteredEmails.length === 1 ? "email" : "emails"}
                                </div>

                                <nav className="activityInboxTabs" aria-label="Email views">
                                    <button
                                        type="button"
                                        className={activityView === "all" ? "activityInboxTab activityInboxTabActive" : "activityInboxTab"}
                                        onClick={() => setActivityView("all")}
                                    >
                                        All Mails
                                    </button>
                                    <button
                                        type="button"
                                        className={activityView === "received" ? "activityInboxTab activityInboxTabActive" : "activityInboxTab"}
                                        onClick={() => setActivityView("received")}
                                    >
                                        Received
                                    </button>
                                    <button
                                        type="button"
                                        className={activityView === "sent" ? "activityInboxTab activityInboxTabActive" : "activityInboxTab"}
                                        onClick={() => setActivityView("sent")}
                                    >
                                        Sent
                                    </button>
                                    <button
                                        type="button"
                                        className={activityView === "scheduled" ? "activityInboxTab activityInboxTabActive" : "activityInboxTab"}
                                        onClick={() => setActivityView("scheduled")}
                                    >
                                        Scheduled
                                    </button>
                                    <button
                                        type="button"
                                        className={activityView === "starred" ? "activityInboxTab activityInboxTabActive" : "activityInboxTab"}
                                        onClick={() => setActivityView("starred")}
                                    >
                                        Starred
                                    </button>
                                </nav>

                                <div className="activityInboxSearchRow">
                                    <div className="emailsSearchField">
                                        <Search size={15} />
                                        <input
                                            type="text"
                                            placeholder="Search emails, people, files..."
                                            value={search}
                                            onChange={(event) =>
                                                setSearch(event.target.value)
                                            }
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="emailActivityTableWrap">
                                <div className="emailActivityTable">
                                    <div className="emailActivityTableHead">
                                        <span>Email</span>
                                        <span>Type</span>
                                        <span>Opened</span>
                                        <span>Replied</span>
                                        <span>Delivery</span>
                                        <span>Sent</span>
                                        <span aria-hidden="true" />
                                    </div>

                                    <div className="emailActivityList">
                                        {visibleEmails.length > 0 ? (
                                            visibleEmails.map((email) => {
                                                const emailType = getSentEmailType(email);
                                                const outcome = getOutcomeLabel(email.outcome);
                                                const isScheduled =
                                                    activityView === "scheduled" || outcome === "Scheduled";

                                                return (
                                                    <button
                                                        type="button"
                                                        className={`emailActivityRow emailActivityTableRow ${selectedEmailId === email.id
                                                            ? "emailActivityRowActive"
                                                            : ""
                                                            }`}
                                                        key={email.id}
                                                        onClick={() => handleSelectEmail(email.id)}
                                                    >
                                                        <span className="emailActivityRowAvatar" aria-hidden="true">
                                                            {(email.from || "Team").slice(0, 1).toUpperCase()}
                                                        </span>

                                                        <span className="emailActivityTableEmail">
                                                            <span className="emailActivityRowTopline">
                                                                <strong className="emailActivitySender">
                                                                    {email.from || "Team"}
                                                                </strong>

                                                                <span className="emailActivityRowToplineMeta">
                                                                    {(email.starred || starredEmailIds.has(email.id)) && (
                                                                        <Star size={12} fill="currentColor" />
                                                                    )}
                                                                    <time>{email.sentAt}</time>
                                                                </span>
                                                            </span>

                                                            <strong className="emailActivitySubject">
                                                                {email.subject}
                                                            </strong>
                                                            <p>{getSentEmailPreview(email)}</p>

                                                            <span className="emailActivityRowTags">
                                                                <em className="emailActivityTableBadge emailActivityTableBadgeNeutral">
                                                                    {emailType}
                                                                </em>

                                                                {isScheduled ? (
                                                                    <em className="emailActivityTableBadge emailActivityTableBadgeScheduled">
                                                                        Scheduled
                                                                    </em>
                                                                ) : (
                                                                    <em
                                                                        className={`emailActivityTableBadge ${emailWasOpened(email)
                                                                            ? "emailActivityTableBadgePositive"
                                                                            : "emailActivityTableBadgeNeutral"
                                                                            }`}
                                                                    >
                                                                        {emailWasOpened(email) ? "Opened" : "Not opened"}
                                                                    </em>
                                                                )}

                                                                {!isScheduled && emailWasReplied(email) && (
                                                                    <em className="emailActivityTableBadge emailActivityTableBadgePositive">
                                                                        Replied
                                                                    </em>
                                                                )}
                                                            </span>
                                                        </span>
                                                    </button>
                                                );
                                            })
                                        ) : (
                                            <div className="emailActivityEmpty">
                                                {activityView === "deleted" ? (
                                                    <>
                                                        <Trash2 size={20} />
                                                        <strong>No deleted emails</strong>
                                                        <span>Emails you delete will appear here.</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Mail size={20} />
                                                        <strong>No email activity found</strong>
                                                        <span>Try changing your search or filters.</span>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <footer className="emailActivityPagination">
                                <p>
                                    Showing {showingStart} to {showingEnd} of{" "}
                                    {filteredEmails.length}
                                </p>

                                <div className="emailPagination">
                                    <button
                                        type="button"
                                        aria-label="Previous page"
                                        disabled={safePage === 1}
                                        onClick={() =>
                                            setPage((currentPage) => Math.max(currentPage - 1, 1))
                                        }
                                    >
                                        <ChevronLeft size={15} />
                                    </button>
                                    <span>{safePage} / {totalPages}</span>
                                    <button
                                        type="button"
                                        aria-label="Next page"
                                        disabled={safePage === totalPages}
                                        onClick={() =>
                                            setPage((currentPage) =>
                                                Math.min(currentPage + 1, totalPages),
                                            )
                                        }
                                    >
                                        <ChevronRight size={15} />
                                    </button>
                                </div>
                            </footer>
                        </section>

                        <section className="emailActivityReader">
                            {selectedEmail ? (
                                <>
                                    <div className="inboxReaderToolbar">
                                        <div className="inboxReaderToolbarLeft">
                                            {canReplyToSelectedEmail && (
                                                <button
                                                    type="button"
                                                    aria-label="Reply to email"
                                                    title="Reply"
                                                    onClick={() => setAiAssistOpen(true)}
                                                >
                                                    <Reply size={16} />
                                                </button>
                                            )}

                                            {activityView !== "deleted" && (
                                                <button
                                                    type="button"
                                                    className="inboxDeleteButton"
                                                    aria-label="Move email to deleted"
                                                    title="Delete email"
                                                    onClick={moveSelectedEmailToDeleted}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}

                                            <button
                                                type="button"
                                                aria-label="Schedule another email"
                                                title="Schedule email"
                                                aria-expanded={schedulePopoverOpen}
                                                className={
                                                    schedulePopoverOpen
                                                        ? "scheduleToolbarButton scheduleToolbarButtonActive"
                                                        : "scheduleToolbarButton"
                                                }
                                                onClick={() =>
                                                    setSchedulePopoverOpen(
                                                        (current) => !current,
                                                    )
                                                }
                                            >
                                                <CalendarClock size={16} />
                                            </button>

                                            <button
                                                type="button"
                                                aria-label={
                                                    selectedEmail.starred ||
                                                        starredEmailIds.has(selectedEmail.id)
                                                        ? "Remove star from email"
                                                        : "Star email"
                                                }
                                                title={
                                                    selectedEmail.starred ||
                                                        starredEmailIds.has(selectedEmail.id)
                                                        ? "Unstar email"
                                                        : "Star email"
                                                }
                                                className={
                                                    selectedEmail.starred ||
                                                        starredEmailIds.has(selectedEmail.id)
                                                        ? "inboxStarButton inboxStarButtonActive"
                                                        : "inboxStarButton"
                                                }
                                                onClick={toggleSelectedEmailStar}
                                            >
                                                <Star
                                                    size={16}
                                                    fill={
                                                        selectedEmail.starred ||
                                                            starredEmailIds.has(selectedEmail.id)
                                                            ? "currentColor"
                                                            : "none"
                                                    }
                                                />
                                            </button>
                                        </div>

                                        {canReplyToSelectedEmail && (
                                            <div className="inboxReaderToolbarRight">
                                                <button
                                                    type="button"
                                                    className="profileSummaryButton"
                                                    aria-expanded={summaryOpen}
                                                    onClick={() =>
                                                        setSummaryOpen((current) => !current)
                                                    }
                                                >
                                                    <Sparkles size={14} />
                                                    {summaryOpen ? "Hide summary" : "AI summary"}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {schedulePopoverOpen && (
                                        <div className="readerSchedulePopover">
                                            <div className="readerSchedulePopoverHeader">
                                                <div>
                                                    <strong>Schedule email</strong>
                                                    <span>
                                                        {scheduleDate && scheduleTime
                                                            ? formatScheduledFor(
                                                                new Date(
                                                                    `${scheduleDate}T${scheduleTime}`,
                                                                ),
                                                            )
                                                            : "Choose a date and time"}
                                                    </span>
                                                </div>

                                                <button
                                                    type="button"
                                                    aria-label="Close schedule calendar"
                                                    onClick={() =>
                                                        setSchedulePopoverOpen(false)
                                                    }
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>

                                            <div className="readerScheduleCalendar">
                                                <div className="readerScheduleMonth">
                                                    <button
                                                        type="button"
                                                        aria-label="Previous month"
                                                        onClick={() =>
                                                            setCalendarDate(
                                                                new Date(
                                                                    calendarDate.getFullYear(),
                                                                    calendarDate.getMonth() - 1,
                                                                    1,
                                                                ),
                                                            )
                                                        }
                                                    >
                                                        <ChevronLeft size={15} />
                                                    </button>

                                                    <strong>
                                                        {calendarDate.toLocaleDateString(
                                                            "en-GB",
                                                            {
                                                                month: "long",
                                                                year: "numeric",
                                                            },
                                                        )}
                                                    </strong>

                                                    <button
                                                        type="button"
                                                        aria-label="Next month"
                                                        onClick={() =>
                                                            setCalendarDate(
                                                                new Date(
                                                                    calendarDate.getFullYear(),
                                                                    calendarDate.getMonth() + 1,
                                                                    1,
                                                                ),
                                                            )
                                                        }
                                                    >
                                                        <ChevronRight size={15} />
                                                    </button>
                                                </div>

                                                <div className="readerScheduleWeekdays">
                                                    {weekDays.map((day) => (
                                                        <span key={day}>{day}</span>
                                                    ))}
                                                </div>

                                                <div className="readerScheduleDays">
                                                    {getMonthDays(calendarDate).map(
                                                        (day, index) =>
                                                            day ? (
                                                                <button
                                                                    type="button"
                                                                    key={day.toISOString()}
                                                                    className={
                                                                        scheduleDate ===
                                                                            formatDateInput(day)
                                                                            ? "readerScheduleDaySelected"
                                                                            : ""
                                                                    }
                                                                    onClick={() =>
                                                                        setScheduleDate(
                                                                            formatDateInput(day),
                                                                        )
                                                                    }
                                                                >
                                                                    {day.getDate()}
                                                                </button>
                                                            ) : (
                                                                <span
                                                                    key={`empty-${index}`}
                                                                />
                                                            ),
                                                    )}
                                                </div>
                                            </div>

                                            <label className="readerScheduleTime">
                                                <span>Time</span>
                                                <input
                                                    type="time"
                                                    value={scheduleTime}
                                                    onChange={(event) =>
                                                        setScheduleTime(
                                                            event.target.value,
                                                        )
                                                    }
                                                />
                                            </label>

                                            <button
                                                type="button"
                                                className="readerScheduleConfirm"
                                                onClick={() =>
                                                    handleScheduleReply()
                                                }
                                            >
                                                <CalendarClock size={14} />
                                                Schedule email
                                            </button>
                                        </div>
                                    )}

                                    <article className="inboxEmailDocument">
                                        {emailWasReplied(selectedEmail) && (
                                            <button
                                                type="button"
                                                className={`inboxOriginalEmailToggle ${originalEmailExpanded
                                                    ? "inboxOriginalEmailToggleOpen"
                                                    : ""
                                                    }`}
                                                onClick={() =>
                                                    setOriginalEmailExpanded((current) => !current)
                                                }
                                                aria-expanded={originalEmailExpanded}
                                            >
                                                <span className="inboxMessageAvatar">
                                                    {selectedEmail.from
                                                        .slice(0, 1)
                                                        .toUpperCase()}
                                                </span>

                                                <span className="inboxOriginalEmailToggleText">
                                                    <strong>{selectedEmail.from}</strong>
                                                    <small>{selectedEmail.subject}</small>
                                                </span>

                                                <time>{selectedEmail.sentAt}</time>
                                                <ChevronDown size={16} />
                                            </button>
                                        )}

                                        {(!emailWasReplied(selectedEmail) ||
                                            originalEmailExpanded) && (
                                                <>
                                                    <header className="inboxEmailHeading">
                                                        <div className="inboxEmailHeadingTop">
                                                            <div>
                                                                <span className="inboxSubjectLabel">Subject</span>
                                                                <h2>{selectedEmail.subject}</h2>
                                                            </div>

                                                        </div>

                                                        <div className="inboxEmailIdentity">
                                                            <span className="inboxMessageAvatar">
                                                                {selectedEmail.from
                                                                    .slice(0, 1)
                                                                    .toUpperCase()}
                                                            </span>

                                                            <div className="inboxIdentityText">
                                                                <div className="inboxSenderLine">
                                                                    <strong>{selectedEmail.from}</strong>

                                                                    {activityView === "scheduled" ||
                                                                        getOutcomeLabel(selectedEmail.outcome) === "Scheduled" ? (
                                                                        <span className="readerStatus readerStatusScheduled">
                                                                            Scheduled
                                                                        </span>
                                                                    ) : (
                                                                        <span className="readerStatusGroup">
                                                                            <span
                                                                                className={`readerStatus ${emailWasOpened(selectedEmail)
                                                                                    ? "readerStatusOpened"
                                                                                    : "readerStatusNeutral"
                                                                                    }`}
                                                                            >
                                                                                {emailWasOpened(selectedEmail)
                                                                                    ? "Opened"
                                                                                    : "Not opened"}
                                                                            </span>

                                                                            <span
                                                                                className={`readerStatus ${emailWasReplied(selectedEmail)
                                                                                    ? "readerStatusReplied"
                                                                                    : "readerStatusNeutral"
                                                                                    }`}
                                                                            >
                                                                                {emailWasReplied(selectedEmail)
                                                                                    ? "Replied"
                                                                                    : "Not replied"}
                                                                            </span>
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <div className="inboxRecipientRow">
                                                                    <span>To:</span>
                                                                    <strong>{customer.name}</strong>
                                                                    <small>{customer.email}</small>
                                                                </div>
                                                            </div>

                                                            <div className="inboxDeliveryMeta">
                                                                <span className="inboxDeliveryLabel">
                                                                    {activityView === "scheduled"
                                                                        ? "Scheduled for"
                                                                        : "Sent"}
                                                                </span>

                                                                <div>
                                                                    <CalendarDays size={13} />
                                                                    <time>{selectedEmail.sentAt}</time>
                                                                </div>
                                                            </div>
                                                        </div>

                                                    </header>

                                                    {canReplyToSelectedEmail && summaryOpen && (
                                                        <section className="profileAiSummary">
                                                            <div className="profileAiSummaryHeader">
                                                                <div>
                                                                    <Sparkles size={13} />
                                                                    <strong>Summary</strong>
                                                                    <small>AI</small>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSummaryOpen(false)}
                                                                >
                                                                    Close
                                                                </button>
                                                            </div>

                                                            <p>
                                                                {selectedEmail.previewText ||
                                                                    getSentEmailPreview(selectedEmail)}
                                                            </p>

                                                            <div className="profileAiSummaryAction">
                                                                <span>Next step</span>
                                                                <p>
                                                                    {getOutcomeLabel(selectedEmail.outcome) ===
                                                                        "Replied"
                                                                        ? "Review the customer reply and respond with the agreed next action."
                                                                        : "Send a concise follow-up that references this email and gives the customer one clear next step."}
                                                                </p>
                                                            </div>

                                                            <footer>
                                                                <span>
                                                                    AI-generated from this customer email
                                                                </span>
                                                                <span>
                                                                    {getSentEmailType(selectedEmail)} ·{" "}
                                                                    {getOutcomeLabel(selectedEmail.outcome)}
                                                                </span>
                                                            </footer>
                                                        </section>
                                                    )}

                                                    <div className="inboxEmailBody">
                                                        {selectedEmailBody
                                                            .split(/\n{2,}/)
                                                            .filter(Boolean)
                                                            .map((paragraph, index) => (
                                                                <p key={`${selectedEmail.id}-body-${index}`}>
                                                                    {paragraph}
                                                                </p>
                                                            ))}
                                                    </div>
                                                </>
                                            )}

                                        {emailWasReplied(selectedEmail) && (
                                            <section className="inboxCustomerReply">
                                                <header className="inboxCustomerReplyHeader">
                                                    <span className="inboxReplyIcon">
                                                        <Reply size={14} />
                                                    </span>

                                                    <div>
                                                        <div className="inboxReplySenderLine">
                                                            <strong>{customer.name}</strong>
                                                            <span className="readerStatus readerStatusOpened">
                                                                Opened
                                                            </span>
                                                            <span className="readerStatus readerStatusReplied">
                                                                Replied
                                                            </span>
                                                        </div>
                                                        <small>{customer.email}</small>
                                                    </div>

                                                    <time>{selectedEmail.sentAt}</time>
                                                </header>

                                                <div className="inboxCustomerReplyBody">
                                                    {(
                                                        selectedEmail.replyPreview ||
                                                        getDefaultCustomerReplyPreview(customer.name)
                                                    )
                                                        .split(/\n{2,}/)
                                                        .filter(Boolean)
                                                        .map((paragraph, index) => (
                                                            <p
                                                                key={`${selectedEmail.id}-reply-${index}`}
                                                            >
                                                                {paragraph}
                                                            </p>
                                                        ))}
                                                </div>
                                            </section>
                                        )}
                                    </article>

                                    {canReplyToSelectedEmail && (
                                        <>
                                            <footer className="profileInboxComposer">
                                                <div className="profileInboxComposerRecipient">
                                                    <Reply size={14} />
                                                    <span>To</span>
                                                    <strong>{customer.name}</strong>
                                                    <small>{customer.email}</small>
                                                </div>

                                                <label className="profileInboxComposerSubject">
                                                    <span>Subject</span>
                                                    <input
                                                        type="text"
                                                        value={replySubject}
                                                        onChange={(event) =>
                                                            setReplySubject(event.target.value)
                                                        }
                                                        placeholder="Add a subject"
                                                        aria-label="Reply subject"
                                                    />
                                                </label>

                                                <div className="profileInboxRichEditor">
                                                    <div
                                                        ref={replyEditorRef}
                                                        className="profileInboxEditable"
                                                        contentEditable
                                                        suppressContentEditableWarning
                                                        role="textbox"
                                                        aria-multiline="true"
                                                        aria-label={`Reply to ${customer.name}`}
                                                        data-placeholder="Write your reply..."
                                                        onInput={syncReplyEditor}
                                                        onClick={handleReplyEditorClick}
                                                    />

                                                    <div className="profileInboxFormatToolbar" aria-label="Text formatting tools">
                                                        <button type="button" title="Undo" onClick={() => applyReplyFormat("undo")}>
                                                            <Undo2 size={15} />
                                                        </button>
                                                        <button type="button" title="Redo" onClick={() => applyReplyFormat("redo")}>
                                                            <Redo2 size={15} />
                                                        </button>

                                                        <select
                                                            aria-label="Font family"
                                                            defaultValue="Arial"
                                                            onChange={(event) =>
                                                                applyReplyFormat("fontName", event.target.value)
                                                            }
                                                        >
                                                            <option value="Arial">Sans Serif</option>
                                                            <option value="Georgia">Serif</option>
                                                            <option value="Courier New">Monospace</option>
                                                        </select>

                                                        <select
                                                            aria-label="Font size"
                                                            defaultValue="3"
                                                            onChange={(event) =>
                                                                applyReplyFormat("fontSize", event.target.value)
                                                            }
                                                        >
                                                            <option value="2">Small</option>
                                                            <option value="3">Normal</option>
                                                            <option value="4">Large</option>
                                                        </select>

                                                        <span className="profileInboxToolbarDivider" />

                                                        <button type="button" title="Bold" onClick={() => applyReplyFormat("bold")}>
                                                            <Bold size={15} />
                                                        </button>
                                                        <button type="button" title="Italic" onClick={() => applyReplyFormat("italic")}>
                                                            <Italic size={15} />
                                                        </button>
                                                        <button type="button" title="Underline" onClick={() => applyReplyFormat("underline")}>
                                                            <Underline size={15} />
                                                        </button>
                                                        <label className="profileInboxTextColour" title="Text colour">
                                                            <span>A</span>
                                                            <input
                                                                type="color"
                                                                defaultValue="#111827"
                                                                aria-label="Text colour"
                                                                onChange={(event) =>
                                                                    applyReplyFormat("foreColor", event.target.value)
                                                                }
                                                            />
                                                        </label>

                                                        <span className="profileInboxToolbarDivider" />

                                                        <button type="button" title="Align left" onClick={() => applyReplyFormat("justifyLeft")}>
                                                            <AlignLeft size={15} />
                                                        </button>
                                                        <button type="button" title="Align centre" onClick={() => applyReplyFormat("justifyCenter")}>
                                                            <AlignCenter size={15} />
                                                        </button>
                                                        <button type="button" title="Align right" onClick={() => applyReplyFormat("justifyRight")}>
                                                            <AlignRight size={15} />
                                                        </button>
                                                        <button type="button" title="Numbered list" onClick={() => applyReplyFormat("insertOrderedList")}>
                                                            <ListOrdered size={15} />
                                                        </button>
                                                        <button type="button" title="Bulleted list" onClick={() => applyReplyFormat("insertUnorderedList")}>
                                                            <List size={15} />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="profileInboxComposerToolbar">
                                                    <div className="profileInboxComposerTools">
                                                        <button
                                                            type="button"
                                                            title="Add attachment"
                                                            aria-label="Add attachment"
                                                            onClick={handleReplyAttachment}
                                                        >
                                                            <Paperclip size={16} />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            title="AI reply assistant"
                                                            aria-label="Open AI reply assistant"
                                                            className={aiAssistOpen ? "isActive" : ""}
                                                            onClick={() => {
                                                                setReplyToolsOpen(false);
                                                                setCtaPickerOpen(false);
                                                                setAiAssistOpen((current) => !current);
                                                            }}
                                                        >
                                                            <Sparkles size={16} />
                                                        </button>

                                                        <div className="profileInboxMoreTools">
                                                            <button
                                                                type="button"
                                                                title="More reply tools"
                                                                aria-label="More reply tools"
                                                                aria-expanded={replyToolsOpen}
                                                                className={replyToolsOpen ? "isActive" : ""}
                                                                onClick={() => {
                                                                    setCtaPickerOpen(false);
                                                                    setReplyToolsOpen((current) => !current);
                                                                }}
                                                            >
                                                                <MoreHorizontal size={17} />
                                                            </button>

                                                            {replyToolsOpen && (
                                                                <div className="profileInboxToolsMenu">
                                                                    <button
                                                                        type="button"
                                                                        onClick={handleReplyAttachment}
                                                                    >
                                                                        <Paperclip size={14} />
                                                                        Add attachment
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={handleInsertReplyLink}
                                                                    >
                                                                        <Link2 size={14} />
                                                                        Insert link
                                                                    </button>
                                                                    <div className="profileInboxCtaPickerWrap">
                                                                        <button
                                                                            type="button"
                                                                            aria-expanded={ctaPickerOpen}
                                                                            className={ctaPickerOpen ? "isActive" : ""}
                                                                            onClick={() =>
                                                                                setCtaPickerOpen((current) => !current)
                                                                            }
                                                                        >
                                                                            <MousePointerClick size={14} />
                                                                            Insert CTA
                                                                            <ChevronRight size={14} className="profileInboxCtaChevron" />
                                                                        </button>

                                                                        {ctaPickerOpen && (
                                                                            <div className="profileInboxCtaPicker">
                                                                                <div className="profileInboxCtaPickerHeader">
                                                                                    <strong>Choose CTA</strong>
                                                                                    <small>Saved in Email Builder</small>
                                                                                </div>

                                                                                <div className="profileInboxCtaPickerList">
                                                                                    {savedReplyCtas.map((cta) => (
                                                                                        <button
                                                                                            key={cta.id}
                                                                                            type="button"
                                                                                            onClick={() => insertSavedCtaIntoReply(cta)}
                                                                                        >
                                                                                            <span
                                                                                                className="profileInboxCtaColour"
                                                                                                style={{
                                                                                                    background:
                                                                                                        cta.variant === "primary"
                                                                                                            ? cta.colour
                                                                                                            : "#ffffff",
                                                                                                    borderColor: cta.colour,
                                                                                                }}
                                                                                            />
                                                                                            <span className="profileInboxCtaPickerCopy">
                                                                                                <strong>{cta.name}</strong>
                                                                                                <small>{cta.text}</small>
                                                                                            </span>
                                                                                            {cta.isDefault && (
                                                                                                <span className="profileInboxCtaDefault">Default</span>
                                                                                            )}
                                                                                        </button>
                                                                                    ))}
                                                                                </div>

                                                                                <Link
                                                                                    href="/dashboard/email-builder"
                                                                                    className="profileInboxManageCtas"
                                                                                >
                                                                                    Manage CTAs
                                                                                    <ArrowRight size={13} />
                                                                                </Link>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        className={replyFooterIncluded ? "isActive" : ""}
                                                                        onClick={toggleReplyFooter}
                                                                    >
                                                                        <Signature size={14} />
                                                                        <span className="profileInboxFooterOptionCopy">
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
                                                                            <Check size={14} className="profileInboxFooterOptionCheck" />
                                                                        )}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            insertIntoReply("Best,\nThe Cobrai Team")
                                                                        }
                                                                    >
                                                                        <Signature size={14} />
                                                                        Insert signature
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="profileInboxClearReply"
                                                                        onClick={() => {
                                                                            setReplyDraft("");
                                                                            setReplyFooterIncluded(false);
                                                                            if (replyEditorRef.current) {
                                                                                replyEditorRef.current.innerHTML = "";
                                                                            }
                                                                            setReplyToolsOpen(false);
                                                                        }}
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
                                                        className="profileInboxSendButton"
                                                        disabled={!replyDraft.trim()}
                                                        onClick={handleSendNow}
                                                    >
                                                        Send now
                                                        <Send size={14} />
                                                    </button>
                                                </div>
                                            </footer>
                                        </>
                                    )}

                                    {canReplyToSelectedEmail &&
                                        aiAssistOpen && (
                                            <aside className="profileAiAssistant">
                                                <header>
                                                    <div className="profileAiAssistantTitle">

                                                        <div>
                                                            <strong>AI Reply Assistant</strong>
                                                            <small>
                                                                Generate a personalised response
                                                            </small>
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        aria-label="Close AI reply assistant"
                                                        onClick={() => setAiAssistOpen(false)}
                                                    >
                                                        <X size={15} />
                                                    </button>
                                                </header>

                                                <div className="profileAiAssistantBody">
                                                    <div className="profileAiContext">
                                                        <span>Replying to</span>
                                                        <strong>{customer.name}</strong>
                                                        <small>{selectedEmail.subject}</small>
                                                    </div>

                                                    <label>
                                                        <span>What should the reply do?</span>
                                                        <textarea
                                                            value={scheduleEmailPrompt}
                                                            onChange={(event) =>
                                                                setScheduleEmailPrompt(
                                                                    event.target.value,
                                                                )
                                                            }
                                                            placeholder="Example: Write a warm, concise reply. Confirm the next step and mention any agreed date or action."
                                                        />
                                                    </label>

                                                    <button
                                                        type="button"
                                                        className="profileGenerateReplyButton"
                                                        onClick={handleGenerateReply}
                                                        disabled={isGeneratingReply}
                                                    >
                                                        <Sparkles size={15} />
                                                        {isGeneratingReply
                                                            ? "Generating..."
                                                            : "Generate reply"}
                                                    </button>
                                                </div>
                                            </aside>
                                        )}
                                </>
                            ) : (
                                <div className="emailActivityReaderEmpty">
                                    <Mail size={24} />
                                    <strong>Select an email</strong>
                                    <span>Choose an email from the list to read it.</span>
                                </div>
                            )}
                        </section>
                    </section>

                </section>

                {selectedEmail && drawerOpen && (
                    <>
                        {selectedEmail && activePopup === "email" && (
                            <div className="emailModalOverlay">
                                <section className="emailPreviewModal">
                                    <div className="emailModalHeader">
                                        <div>
                                            <span>Email preview</span>
                                            <h2>{selectedEmail.subject}</h2>
                                            <p>
                                                {customer.company} <span>·</span>{" "}
                                                {getSentEmailType(selectedEmail)}
                                            </p>
                                        </div>

                                        <button type="button" onClick={handleClosePopup}>
                                            <X size={16} />
                                        </button>
                                    </div>

                                    <div className="emailModalIframeWrap">
                                        <iframe
                                            title="Sent email preview"
                                            srcDoc={selectedEmail.html}
                                        />
                                    </div>
                                </section>
                            </div>
                        )}

                        {selectedEmail && activePopup === "reply" && (
                            <div className="emailModalOverlay">
                                <section className="emailSmallModal">
                                    <div className="emailModalHeader">
                                        <div>
                                            <span>Reply preview</span>
                                            <h2>Customer reply</h2>
                                            <p>
                                                Reply status{" "}
                                                <span>·</span>{" "}
                                                {getReplyLabel(selectedEmail.outcome, selectedEmail.reply)}
                                            </p>
                                        </div>

                                        <button type="button" onClick={handleClosePopup}>
                                            <X size={16} />
                                        </button>
                                    </div>

                                    {selectedEmail.replyPreview ? (
                                        <div className="customerReplyPreviewModal">
                                            {selectedEmail.replyPreview}
                                        </div>
                                    ) : (
                                        <div className="customerReplyEmptyModal">
                                            No reply yet. You can send a follow-up or write a new
                                            email from the action panel.
                                        </div>
                                    )}
                                </section>
                            </div>
                        )}

                        {selectedEmail && activePopup === "scheduleReply" && (
                            <div className="emailModalOverlay">
                                <section className="emailScheduleModal replyScheduleModal">
                                    <div className="emailModalHeader">
                                        <div>
                                            <span>Schedule reply</span>
                                            <h2>Choose send time</h2>
                                            <p>
                                                {scheduleDate && scheduleTime
                                                    ? formatScheduledFor(
                                                        new Date(`${scheduleDate}T${scheduleTime}`),
                                                    )
                                                    : "Select date and time"}
                                            </p>
                                        </div>

                                        <button type="button" onClick={handleClosePopup}>
                                            <X size={16} />
                                        </button>
                                    </div>

                                    <div className="replyScheduleContent">
                                        <div className="emailCalendarBox">
                                            <div className="emailCalendarTop">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setCalendarDate(
                                                            new Date(
                                                                calendarDate.getFullYear(),
                                                                calendarDate.getMonth() - 1,
                                                                1,
                                                            ),
                                                        )
                                                    }
                                                >
                                                    <ChevronLeft size={16} />
                                                </button>

                                                <h3>
                                                    {
                                                        [
                                                            "January",
                                                            "February",
                                                            "March",
                                                            "April",
                                                            "May",
                                                            "June",
                                                            "July",
                                                            "August",
                                                            "September",
                                                            "October",
                                                            "November",
                                                            "December",
                                                        ][calendarDate.getMonth()]
                                                    }{" "}
                                                    {calendarDate.getFullYear()}
                                                </h3>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setCalendarDate(
                                                            new Date(
                                                                calendarDate.getFullYear(),
                                                                calendarDate.getMonth() + 1,
                                                                1,
                                                            ),
                                                        )
                                                    }
                                                >
                                                    <ChevronRight size={16} />
                                                </button>
                                            </div>

                                            <div className="emailCalendarWeek">
                                                {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(
                                                    (day) => (
                                                        <span key={day}>{day}</span>
                                                    ),
                                                )}
                                            </div>

                                            <div className="emailCalendarGrid">
                                                {monthDays.map((date, index) => {
                                                    if (!date) return <span key={`empty-reply-${index}`} />;

                                                    const formattedDate = formatDateInput(date);
                                                    const selected = scheduleDate === formattedDate;

                                                    return (
                                                        <button
                                                            key={`reply-${formattedDate}`}
                                                            type="button"
                                                            className={
                                                                selected ? "emailCalendarDaySelected" : ""
                                                            }
                                                            onClick={() => setScheduleDate(formattedDate)}
                                                        >
                                                            {date.getDate()}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <label className="emailScheduleTimeField">
                                            Time
                                            <input
                                                type="time"
                                                value={scheduleTime}
                                                onChange={(event) => setScheduleTime(event.target.value)}
                                            />
                                        </label>

                                        <div className="emailScheduleQuickActions">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const tomorrow = new Date();
                                                    tomorrow.setDate(tomorrow.getDate() + 1);
                                                    setCalendarDate(tomorrow);
                                                    setScheduleDate(formatDateInput(tomorrow));
                                                    setScheduleTime("09:00");
                                                }}
                                            >
                                                Tomorrow
                                            </button>

                                            <button type="button" onClick={() => setScheduleTime("13:00")}>
                                                13:00
                                            </button>

                                            <button type="button" onClick={() => setScheduleTime("17:00")}>
                                                17:00
                                            </button>
                                        </div>

                                        <div className="emailScheduleModalActions">
                                            <button type="button" onClick={handleClosePopup}>
                                                Cancel
                                            </button>

                                            <button
                                                type="button"
                                                className="drawerPrimaryButton"
                                                onClick={handleScheduleReply}
                                                disabled={!replyDraft.trim()}
                                            >
                                                <CalendarClock size={14} />
                                                Schedule
                                            </button>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}

                        {selectedEmail && isSchedulePreviewOpen && (
                            <div className="emailModalOverlay">
                                <section className="emailPreviewModal">
                                    <div className="emailModalHeader">
                                        <div>
                                            <span>Scheduled email preview</span>
                                            <h2>{scheduleEmailSubject || "Scheduled email"}</h2>
                                            <p>
                                                {customer.company} <span>·</span> {scheduleEmailType}
                                            </p>
                                        </div>

                                        <button type="button" onClick={() => setIsSchedulePreviewOpen(false)}>
                                            <X size={16} />
                                        </button>
                                    </div>

                                    <div className="emailModalIframeWrap">
                                        <iframe
                                            title="Scheduled email preview"
                                            srcDoc={
                                                scheduleEmailHtml ||
                                                buildScheduledEmailPreviewHtml(
                                                    customer.name,
                                                    scheduleEmailSubject,
                                                    scheduleEmailBody,
                                                )
                                            }
                                        />
                                    </div>
                                </section>
                            </div>
                        )}
                    </>
                )}
            </section>
        );
    }
}

export default function CustomerProfilePage({ params }: CustomerProfilePageProps) {
    const { id } = use(params);
    const customerId = decodeURIComponent(id);
    const today = useMemo(() => new Date(), []);

    const [workspaceId, setWorkspaceId] = useState("");
    const [liveCustomers, setLiveCustomers] = useState<CustomerWithMrr[]>([]);
    const [isLoadingCustomer, setIsLoadingCustomer] = useState(true);
    const [selectedDate, setSelectedDate] = useState(today);
    const [visibleMonth, setVisibleMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
    const [selectedTime, setSelectedTime] = useState("13:00");
    const [selectedTemplateId, setSelectedTemplateId] = useState(emailTemplates[0]?.id || "");
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
    const [isScheduling, setIsScheduling] = useState(false);
    const [notice, setNotice] = useState("");
    const [emailToDelete, setEmailToDelete] = useState<ScheduledEmail | null>(null);
    const [emailToPreview, setEmailToPreview] = useState<ScheduledEmail | null>(null);
    const [sentEmailToPreview, setSentEmailToPreview] = useState<SentEmailPreview | null>(null);
    const [previewDate, setPreviewDate] = useState("");
    const [previewTime, setPreviewTime] = useState("");
    const [isUpdatingScheduledEmail, setIsUpdatingScheduledEmail] = useState(false);
    const [isAccountEditorOpen, setIsAccountEditorOpen] = useState(false);
    const [accountDetailsOverride, setAccountDetailsOverride] = useState<Partial<CustomerWithMrr>>({});
    const [accountEditForm, setAccountEditForm] = useState<EditableAccountDetails>({
        company: "",
        name: "",
        email: "",
        mrr: "",
        engagementScore: "",
    });

    const isDemoWorkspace = isDemoWorkspaceId(workspaceId);

    const resolveWorkspaceId = useCallback(async () => {
        const stored = getStoredWorkspaceId();

        if (stored) {
            setWorkspaceId(stored);
            return stored;
        }

        const response = await fetch("/api/email-agent/bootstrap", {
            method: "GET",
            cache: "no-store",
        });

        if (!response.ok) {
            setWorkspaceId(DEMO_WORKSPACE_ID);
            return DEMO_WORKSPACE_ID;
        }

        const data: WorkspaceResponse = await response.json();
        const id = data.workspaceId || data.workspace?.id || DEMO_WORKSPACE_ID;

        if (typeof window !== "undefined") {
            localStorage.setItem("workspaceId", id);
        }

        setWorkspaceId(id);
        return id;
    }, []);

    useEffect(() => {
        resolveWorkspaceId();
    }, [resolveWorkspaceId]);

    useEffect(() => {
        async function loadCustomers() {
            if (!workspaceId) return;

            if (isDemoWorkspaceId(workspaceId)) {
                setLiveCustomers([]);
                setIsLoadingCustomer(false);
                return;
            }

            setIsLoadingCustomer(true);

            try {
                const response = await fetch(
                    `/api/dashboard/customers?workspaceId=${encodeURIComponent(workspaceId)}`,
                    { cache: "no-store" }
                );

                if (!response.ok) {
                    setLiveCustomers([]);
                    return;
                }

                const data = await response.json();
                setLiveCustomers(Array.isArray(data.customers) ? data.customers : []);
            } catch {
                setLiveCustomers([]);
            } finally {
                setIsLoadingCustomer(false);
            }
        }

        loadCustomers();
    }, [workspaceId]);

    const allCustomers = useMemo(() => {
        return mergeDemoAndLiveCustomers(liveCustomers, workspaceId);
    }, [liveCustomers, workspaceId]);

    const baseCustomer = allCustomers.find((item) => item.id === customerId);
    const customer = useMemo(() => {
        return baseCustomer
            ? { ...baseCustomer, ...accountDetailsOverride }
            : undefined;
    }, [accountDetailsOverride, baseCustomer]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        try {
            const stored = localStorage.getItem(`customer-profile-details-${customerId}`);
            const parsed = stored ? JSON.parse(stored) : null;
            setAccountDetailsOverride(parsed && typeof parsed === "object" ? parsed : {});
        } catch {
            setAccountDetailsOverride({});
        }
    }, [customerId]);

    const sentEmails = useMemo(
        () => getSentEmailRows(customerId, workspaceId, scheduledEmails),
        [customerId, workspaceId, scheduledEmails]
    );

    const customerKpi = customerKpis.find((kpi) => kpi.customerId === customer?.id);
    const emailsSentToday = customerKpi?.emailsSentToday ?? sentEmails.length;
    const emailsSentYesterday = customerKpi?.emailsSentYesterday ?? 0;
    const emailsSentChange = emailsSentToday - emailsSentYesterday;

    const openRateValue = Number(String(customer?.openRate ?? "0").replace("%", "")) || 0;
    const openRateYesterday = customerKpi?.openRateYesterday ?? openRateValue;
    const openRateChange = openRateValue - openRateYesterday;

    const queuedEmailsCount = scheduledEmails.length > 0 ? scheduledEmails.length : customerKpi?.queuedEmails ?? 0;

    const selectedTemplate = useMemo(() => {
        return emailTemplates.find((template) => template.id === selectedTemplateId) || emailTemplates[0];
    }, [selectedTemplateId]);

    const calendarMonthLabel = visibleMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    const selectedDateLabel = selectedDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

    const calendarDays = useMemo(() => {
        const year = visibleMonth.getFullYear();
        const month = visibleMonth.getMonth();
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        const emptyDaysBeforeMonth = (firstDayOfMonth.getDay() + 6) % 7;

        return [
            ...Array.from({ length: emptyDaysBeforeMonth }, () => null),
            ...Array.from({ length: lastDayOfMonth.getDate() }, (_, index) => new Date(year, month, index + 1)),
        ];
    }, [visibleMonth]);

    const loadScheduledEmails = useCallback(async () => {
        if (!customerId || !workspaceId) return;

        if (isDemoWorkspaceId(workspaceId)) {
            setScheduledEmails(getDemoScheduledEmails(customerId));
            return;
        }

        try {
            const response = await fetch(
                `/api/email-agent/scheduled?workspaceId=${encodeURIComponent(workspaceId)}&customerId=${encodeURIComponent(customerId)}`,
                { cache: "no-store" }
            );

            const data = await response.json();

            if (response.ok && Array.isArray(data.scheduledEmails)) {
                setScheduledEmails(data.scheduledEmails);
                return;
            }

            setScheduledEmails([]);
        } catch {
            setScheduledEmails([]);
        }
    }, [customerId, workspaceId]);

    useEffect(() => {
        void loadScheduledEmails();
    }, [loadScheduledEmails]);

    function showNotice(message: string) {
        setNotice(message);
        window.setTimeout(() => setNotice(""), 3000);
    }

    function openPreviewScheduledEmail(email: ScheduledEmail) {
        setEmailToPreview(email);
        setPreviewDate(formatDateInputValue(email.scheduledFor));
        setPreviewTime(formatTimeInputValue(email.scheduledFor));
    }

    function closePreviewScheduledEmail() {
        setEmailToPreview(null);
        setPreviewDate("");
        setPreviewTime("");
        setIsUpdatingScheduledEmail(false);
    }

    function closeSentEmailPreview() {
        setSentEmailToPreview(null);
    }

    function closeDeleteScheduledEmail() {
        setEmailToDelete(null);
        setIsUpdatingScheduledEmail(false);
    }

    async function handleDeleteScheduledEmail() {
        if (!customer || !emailToDelete) return;

        setIsUpdatingScheduledEmail(true);

        try {
            if (isDemoWorkspace) {
                const updatedEmails = scheduledEmails.filter((email) => email.id !== emailToDelete.id);
                setScheduledEmails(updatedEmails);
                saveDemoScheduledEmails(customer.id, updatedEmails);
                closeDeleteScheduledEmail();
                showNotice("Scheduled email deleted.");
                return;
            }

            const response = await fetch(
                `/api/email-agent/scheduled/${encodeURIComponent(emailToDelete.id)}?workspaceId=${encodeURIComponent(workspaceId)}`,
                { method: "DELETE" }
            );

            if (!response.ok) throw new Error("Failed to delete scheduled email.");

            setScheduledEmails((current) => current.filter((email) => email.id !== emailToDelete.id));
            closeDeleteScheduledEmail();
            showNotice("Scheduled email deleted.");
        } catch {
            showNotice("Failed to delete scheduled email.");
        } finally {
            setIsUpdatingScheduledEmail(false);
        }
    }

    async function handleReschedulePreviewEmail() {
        if (!customer || !emailToPreview || !previewDate || !previewTime) return;

        const nextScheduledDate = new Date(`${previewDate}T${previewTime}`);

        if (Number.isNaN(nextScheduledDate.getTime())) {
            showNotice("Choose a valid date and time.");
            return;
        }

        setIsUpdatingScheduledEmail(true);

        try {
            const updatedScheduledEmail: ScheduledEmail = {
                ...emailToPreview,
                scheduledFor: nextScheduledDate.toISOString(),
                status: "scheduled",
            };

            if (isDemoWorkspace) {
                const updatedEmails = scheduledEmails
                    .map((email) => (email.id === emailToPreview.id ? updatedScheduledEmail : email))
                    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());

                setScheduledEmails(updatedEmails);
                saveDemoScheduledEmails(customer.id, updatedEmails);
                closePreviewScheduledEmail();
                showNotice("Scheduled email rescheduled.");
                return;
            }

            const response = await fetch(`/api/email-agent/scheduled/${encodeURIComponent(emailToPreview.id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspaceId,
                    scheduledFor: nextScheduledDate.toISOString(),
                }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to reschedule email.");

            setScheduledEmails((current) =>
                current
                    .map((email) => (email.id === emailToPreview.id ? data.scheduledEmail || updatedScheduledEmail : email))
                    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
            );

            closePreviewScheduledEmail();
            showNotice("Scheduled email rescheduled.");
        } catch {
            showNotice("Failed to reschedule email.");
        } finally {
            setIsUpdatingScheduledEmail(false);
        }
    }

    async function handleScheduleEmail(sendImmediately = false) {
        if (!customer || !selectedTemplate) return;

        setIsScheduling(true);

        try {
            const scheduledDate = sendImmediately ? new Date() : new Date(selectedDate);

            if (!sendImmediately) {
                const [hours, minutes] = selectedTime.split(":").map(Number);
                scheduledDate.setHours(hours, minutes, 0, 0);
            }

            if (Number.isNaN(scheduledDate.getTime())) {
                showNotice("Choose a valid date and time.");
                return;
            }

            if (isDemoWorkspace) {
                const demoScheduledEmail: ScheduledEmail = {
                    id: `demo-scheduled-${Date.now()}`,
                    emailType: selectedTemplate.category,
                    subject: selectedTemplate.subject,
                    html: buildEmailHtml(selectedTemplate, customer.name),
                    plainText: selectedTemplate.body.replaceAll("{{customer_name}}", customer.name),
                    scheduledFor: scheduledDate.toISOString(),
                    status: sendImmediately ? "sent" : "scheduled",
                    sentAt: sendImmediately ? scheduledDate.toISOString() : null,
                };

                const updatedEmails = [...scheduledEmails, demoScheduledEmail].sort(
                    (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
                );

                setScheduledEmails(updatedEmails);
                saveDemoScheduledEmails(customer.id, updatedEmails);
                showNotice(sendImmediately ? "Email marked as sent." : "Email scheduled.");
                return;
            }

            const response = await fetch("/api/email-agent/scheduled", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspaceId,
                    customerId: customer.id,
                    emailType: selectedTemplate.category,
                    subject: selectedTemplate.subject,
                    html: buildEmailHtml(selectedTemplate, customer.name),
                    plainText: selectedTemplate.body.replaceAll("{{customer_name}}", customer.name),
                    scheduledFor: scheduledDate.toISOString(),
                }),
            });

            const data = await response.json();
            if (!response.ok || !data.scheduledEmail) throw new Error(data.error || "Failed to schedule email.");

            setScheduledEmails((current) =>
                [...current, data.scheduledEmail].sort(
                    (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
                )
            );

            showNotice(sendImmediately ? "Email queued to send now." : "Email scheduled.");
        } catch {
            showNotice(sendImmediately ? "Failed to queue email." : "Failed to schedule email.");
        } finally {
            setIsScheduling(false);
        }
    }

    function openAccountEditor() {
        if (!customer) return;

        setAccountEditForm({
            company: customer.company || "",
            name: customer.name || "",
            email: customer.email || "",
            mrr: typeof customer.mrr === "number" ? String(customer.mrr) : "",
            engagementScore:
                typeof customer.engagementScore === "number"
                    ? String(customer.engagementScore)
                    : "",
        });
        setIsAccountEditorOpen(true);
    }

    function closeAccountEditor() {
        setIsAccountEditorOpen(false);
    }

    function handleAccountEditChange(field: keyof EditableAccountDetails, value: string) {
        setAccountEditForm((current) => ({ ...current, [field]: value }));
    }

    function handleSaveAccountDetails() {
        const parsedMrr = accountEditForm.mrr.trim() === "" ? undefined : Number(accountEditForm.mrr);
        const parsedEngagement =
            accountEditForm.engagementScore.trim() === ""
                ? undefined
                : Math.min(100, Math.max(0, Number(accountEditForm.engagementScore)));

        const updatedDetails: Partial<CustomerWithMrr> = {
            company: accountEditForm.company.trim(),
            name: accountEditForm.name.trim(),
            email: accountEditForm.email.trim(),
            mrr: typeof parsedMrr === "number" && Number.isFinite(parsedMrr) ? parsedMrr : undefined,
            engagementScore:
                typeof parsedEngagement === "number" && Number.isFinite(parsedEngagement)
                    ? parsedEngagement
                    : undefined,
        };

        setAccountDetailsOverride(updatedDetails);

        if (typeof window !== "undefined") {
            localStorage.setItem(
                `customer-profile-details-${customerId}`,
                JSON.stringify(updatedDetails),
            );
        }

        setIsAccountEditorOpen(false);
        showNotice("Account details updated.");
    }

    function goToPreviousMonth() {
        setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
    }

    function goToNextMonth() {
        setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
    }

    if (!customer && isLoadingCustomer) {
        return (
            <main className="customersPage">
                <section className="customersContent">
                    <section className="customersPanel">
                        <h1>Loading customer...</h1>
                    </section>
                </section>
            </main>
        );
    }

    if (!customer) {
        return (
            <main className="customersPage">
                <section className="customersContent">
                    <Link href="/dashboard/customers" className="backToCustomers">
                        <ChevronLeft size={16} />
                        Back To Accounts
                    </Link>

                    <section className="customersPanel">
                        <h1>Account not found</h1>
                        <p>This customer profile does not exist.</p>
                    </section>
                </section>
            </main>
        );
    }

    return (
        <main className="customersPage">
            <section className="customersContent">
                <Link href="/dashboard/customers" className="backToCustomers">
                    <ChevronLeft size={16} />
                    Back To Accounts
                </Link>

                <section className="customerProfileTopPanel">
                    <header className="customerProfileHero">
                        <div>
                            <h1>{customer.company || "–"}</h1>
                            <p>
                                {customer.name || "–"} <span>·</span> {customer.email || "–"}
                            </p>
                        </div>

                        <button type="button" className="downloadCsvButton">
                            <Download size={15} />
                            Download CSV
                        </button>
                    </header>

                    <section className="accountOverviewPanel">
                        <div
                        >


                            <div className="accountOverviewAlertCopy">

                            </div>

                        </div>

                        <div className="accountOverviewGrid">
                            <section className="accountInformationSection">
                                <div className="accountOverviewHeading">
                                    <div>
                                        <p className="accountOverviewEyebrow">Account profile</p>

                                    </div>

                                    {!isAccountEditorOpen && (
                                        <button
                                            type="button"
                                            className="accountOverviewEditButton"
                                            aria-label="Edit account profile"
                                            title="Edit account profile"
                                            onClick={openAccountEditor}
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                gap: "7px",
                                                minHeight: "36px",
                                                padding: "8px 13px",
                                                border: "1px solid #e5e7eb",
                                                borderRadius: "10px",
                                                background: "#ffffff",
                                                color: "#111827",
                                                fontSize: "13px",
                                                fontWeight: 600,
                                                lineHeight: 1,
                                                cursor: "pointer",
                                            }}
                                        >
                                            <Pencil size={14} aria-hidden="true" />
                                            Edit
                                        </button>
                                    )}
                                </div>

                                {isAccountEditorOpen ? (
                                    <div
                                        className="accountInformationList"
                                        style={{ display: "grid", gap: "12px" }}
                                    >
                                        {[
                                            { label: "Account name", field: "company", type: "text" },
                                            { label: "Contact", field: "name", type: "text" },
                                            { label: "Email", field: "email", type: "email" },
                                            { label: "Monthly revenue (£)", field: "mrr", type: "number" },
                                            { label: "Engagement score", field: "engagementScore", type: "number" },
                                        ].map((item) => (
                                            <label
                                                key={item.field}
                                                style={{
                                                    display: "grid",
                                                    gridTemplateColumns: "145px minmax(0, 1fr)",
                                                    alignItems: "center",
                                                    gap: "18px",
                                                    fontSize: "13px",
                                                    color: "#6b7280",
                                                }}
                                            >
                                                <span>{item.label}</span>
                                                <input
                                                    type={item.type}
                                                    value={accountEditForm[item.field as keyof EditableAccountDetails]}
                                                    min={item.field === "engagementScore" ? 0 : undefined}
                                                    max={item.field === "engagementScore" ? 100 : undefined}
                                                    step={item.field === "mrr" ? "0.01" : "1"}
                                                    onChange={(event) =>
                                                        handleAccountEditChange(
                                                            item.field as keyof EditableAccountDetails,
                                                            event.target.value,
                                                        )
                                                    }
                                                    style={{
                                                        width: "100%",
                                                        minHeight: "38px",
                                                        padding: "8px 11px",
                                                        border: "1px solid #dfe3e8",
                                                        borderRadius: "9px",
                                                        background: "#ffffff",
                                                        color: "#111827",
                                                        font: "inherit",
                                                        outline: "none",
                                                    }}
                                                />
                                            </label>
                                        ))}

                                        <div
                                            style={{
                                                display: "grid",
                                                gridTemplateColumns: "145px minmax(0, 1fr)",
                                                alignItems: "center",
                                                gap: "18px",
                                                fontSize: "13px",
                                                color: "#6b7280",
                                            }}
                                        >
                                            <span>Account ID</span>
                                            <div
                                                style={{
                                                    minHeight: "38px",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    padding: "8px 11px",
                                                    border: "1px solid #e5e7eb",
                                                    borderRadius: "9px",
                                                    background: "#f9fafb",
                                                    color: "#6b7280",
                                                }}
                                            >
                                                {customer.id || "–"}
                                            </div>
                                        </div>

                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "flex-end",
                                                gap: "9px",
                                                paddingTop: "4px",
                                            }}
                                        >
                                            <button
                                                type="button"
                                                onClick={closeAccountEditor}
                                                style={{
                                                    minHeight: "36px",
                                                    padding: "8px 14px",
                                                    border: "1px solid #e5e7eb",
                                                    borderRadius: "9px",
                                                    background: "#ffffff",
                                                    color: "#374151",
                                                    fontSize: "13px",
                                                    fontWeight: 600,
                                                    cursor: "pointer",
                                                }}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleSaveAccountDetails}
                                                style={{
                                                    minHeight: "36px",
                                                    padding: "8px 15px",
                                                    border: "1px solid #1d9bf0",
                                                    borderRadius: "9px",
                                                    background: "#1d9bf0",
                                                    color: "#ffffff",
                                                    fontSize: "13px",
                                                    fontWeight: 600,
                                                    cursor: "pointer",
                                                }}
                                            >
                                                Save changes
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <dl className="accountInformationList">
                                        <div>
                                            <dt>Account name</dt>
                                            <dd>{customer.company || "–"}</dd>
                                        </div>
                                        <div>
                                            <dt>Contact</dt>
                                            <dd>{customer.name || "–"}</dd>
                                        </div>
                                        <div>
                                            <dt>Email</dt>
                                            <dd>{customer.email || "–"}</dd>
                                        </div>
                                        <div>
                                            <dt>Account ID</dt>
                                            <dd>{customer.id || "–"}</dd>
                                        </div>
                                        <div>
                                            <dt>Monthly revenue</dt>
                                            <dd>{typeof customer.mrr === "number" ? formatCurrency(customer.mrr) : "–"}</dd>
                                        </div>
                                        <div>
                                            <dt>Engagement score</dt>
                                            <dd>{typeof customer.engagementScore === "number" ? `${customer.engagementScore}/100` : "–"}</dd>
                                        </div>
                                    </dl>
                                )}
                            </section>

                            <section className="emailPerformanceSection">
                                <div className="accountOverviewHeading">
                                    <div>
                                        <p className="accountOverviewEyebrow">Current performance</p>
                                        <h2>Email Performance</h2>
                                    </div>
                                </div>

                                <div className="emailPerformanceGrid">
                                    <article className="emailPerformanceItem">
                                        <div className="emailPerformanceIcon">
                                            <Mail size={17} />
                                        </div>
                                        <div>
                                            <span>Emails sent</span>
                                            <strong>{customer.emailsSent ?? emailsSentToday}</strong>
                                            <small>
                                                {emailsSentChange >= 0 ? "+" : ""}
                                                {emailsSentChange} vs yesterday
                                            </small>
                                        </div>
                                    </article>

                                    <article className="emailPerformanceItem">
                                        <div className="emailPerformanceIcon">
                                            <Eye size={17} />
                                        </div>
                                        <div>
                                            <span>Average open rate</span>
                                            <strong>{getCustomerOpenRate(customer)}</strong>
                                            <small>
                                                {openRateChange >= 0 ? "↑" : "↓"}{" "}
                                                {Math.abs(openRateChange).toFixed(1)}% vs yesterday
                                            </small>
                                        </div>
                                    </article>

                                    <article className="emailPerformanceItem">
                                        <div className="emailPerformanceIcon">
                                            <MousePointerClick size={17} />
                                        </div>
                                        <div>
                                            <span>Click rate</span>
                                            <strong>{customer.clickRate || "0%"}</strong>
                                            <small>Current account click-through rate</small>
                                        </div>
                                    </article>

                                    <article className="emailPerformanceItem">
                                        <div className="emailPerformanceIcon">
                                            <CalendarClock size={17} />
                                        </div>
                                        <div>
                                            <span>Next queued email</span>
                                            <strong>
                                                {scheduledEmails[0]
                                                    ? formatScheduledFor(
                                                        scheduledEmails[0].scheduledFor,
                                                    ).split(",")[1]?.trim() || "Queued"
                                                    : "None"}
                                            </strong>
                                            <small>{queuedEmailsCount} emails queued</small>
                                        </div>
                                    </article>
                                </div>
                            </section>
                        </div>
                    </section>
                </section>

                <section className="customerProfileCleanStack noLiveActivityLayout unifiedCustomerMailWorkspace">
                    <div className="profileCard polishedCard scheduleCalendarCard">
                        <div className="polishedCardHeader">
                            <div className="cardTitleWithIcon">
                                <CalendarDays size={18} />
                                <h3>Schedule an email</h3>
                            </div>
                        </div>

                        <div className="scheduleWideGrid scheduleWideGridFull">
                            <div>
                                <label className="calendarTimeLabel">Email type</label>

                                <div className="emailTypeSelectWrap">
                                    <select
                                        className="emailTypeSelect"
                                        value={selectedTemplateId}
                                        onChange={(event) => setSelectedTemplateId(event.target.value)}
                                    >
                                        {emailTemplates.map((template) => (
                                            <option key={template.id} value={template.id}>
                                                {template.category} · {template.label}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown size={16} />
                                </div>

                                <div className="selectedEmailPreview polishedSelectedEmail">
                                    <div className="emailPreviewIcon">
                                        <Mail size={16} />
                                    </div>

                                    <div>
                                        <strong>{selectedTemplate.subject}</strong>
                                        <p>{selectedTemplate.previewText}</p>

                                        <button type="button" className="previewEmailButton" onClick={() => setIsPreviewOpen(true)}>
                                            <Eye size={14} />
                                            Preview email
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="calendarBox">
                                <div className="calendarTop">
                                    <button type="button" onClick={goToPreviousMonth}>
                                        <ChevronLeft size={16} />
                                    </button>

                                    <h3>{calendarMonthLabel}</h3>

                                    <button type="button" onClick={goToNextMonth}>
                                        <ChevronRight size={16} />
                                    </button>
                                </div>

                                <div className="calendarWeekDays">
                                    {weekDays.map((day) => (
                                        <span key={day}>{day}</span>
                                    ))}
                                </div>

                                <div className="calendarDays">
                                    {calendarDays.map((day, index) =>
                                        day ? (
                                            <button
                                                type="button"
                                                key={day.toISOString()}
                                                onClick={() => setSelectedDate(day)}
                                                className={isSameDate(day, selectedDate) ? "selectedDay" : ""}
                                            >
                                                {day.getDate()}
                                            </button>
                                        ) : (
                                            <span key={`empty-${index}`} className="mutedDay" />
                                        )
                                    )}
                                </div>
                            </div>

                            <div>
                                <div className="scheduleDateTimeGrid">
                                    <div>
                                        <label className="calendarTimeLabel">Date</label>
                                        <div className="calendarDateDisplay">
                                            <span>{selectedDateLabel}</span>
                                            <CalendarDays size={15} />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="calendarTimeLabel">Time</label>
                                        <div className="calendarTimeDisplay">
                                            <input
                                                className="calendarTimeInput"
                                                type="time"
                                                value={selectedTime}
                                                onChange={(event) => setSelectedTime(event.target.value)}
                                            />
                                            <Clock size={15} />
                                        </div>
                                    </div>
                                </div>

                                <div className="scheduleButtons">
                                    <button type="button" onClick={() => handleScheduleEmail(true)} disabled={isScheduling}>
                                        <Send size={14} />
                                        Send now
                                    </button>

                                    <button
                                        type="button"
                                        className="primaryScheduleButton"
                                        onClick={() => handleScheduleEmail(false)}
                                        disabled={isScheduling}
                                    >
                                        <CalendarDays size={14} />
                                        {isScheduling ? "Scheduling..." : "Schedule email"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="customerEmailActivitySection">
                        <EmbeddedCustomerEmailActivity.Component
                            customerId={customer.id}
                            accountDetails={{
                                company: customer.company,
                                name: customer.name,
                                email: customer.email,
                                mrr: customer.mrr,
                                engagementScore: customer.engagementScore,
                            }}
                        />
                    </div>
                </section>
            </section>

            {notice && <div className="emailScheduleNotice">{notice}</div>}

            {emailToDelete &&
                createPortal(
                    <div className="emailPreviewOverlay">
                        <div className="deleteConfirmModal">
                            <div className="emailPreviewModalHeader">
                                <div>
                                    <span>Delete scheduled email</span>
                                    <h3>Are you sure?</h3>
                                </div>

                                <button type="button" onClick={closeDeleteScheduledEmail} aria-label="Close delete confirmation">
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="emailPreviewMeta">
                                <p>Are you sure you want to delete this scheduled email?</p>
                            </div>

                            <div className="deleteConfirmActions">
                                <button type="button" className="keepScheduledButton" onClick={closeDeleteScheduledEmail} disabled={isUpdatingScheduledEmail}>
                                    No, keep it
                                </button>

                                <button type="button" className="deleteConfirmButton" onClick={handleDeleteScheduledEmail} disabled={isUpdatingScheduledEmail}>
                                    {isUpdatingScheduledEmail ? "Deleting..." : "Yes, delete"}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

            {emailToPreview && (
                <div className="emailPreviewOverlay">
                    <div className="emailPreviewModal">
                        <div className="emailPreviewModalHeader">
                            <div>
                                <span>Scheduled email preview</span>
                                <h3>{emailToPreview.subject}</h3>
                            </div>

                            <button type="button" onClick={closePreviewScheduledEmail}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="emailPreviewMeta">
                            <p>
                                <strong>To:</strong> {customer.email}
                            </p>
                            <p>
                                <strong>Scheduled for:</strong> {formatScheduledFor(emailToPreview.scheduledFor)}
                            </p>
                        </div>

                        <div className="scheduleWideGrid">
                            <div className="emailPreviewBody">
                                {emailToPreview.html ? (
                                    <div dangerouslySetInnerHTML={{ __html: emailToPreview.html }} />
                                ) : (
                                    emailToPreview.plainText?.split("\n").map((line, index) => <p key={`${line}-${index}`}>{line}</p>)
                                )}
                            </div>

                            <div>
                                <label className="calendarTimeLabel">Reschedule date</label>
                                <div className="calendarTimeDisplay">
                                    <input className="calendarTimeInput" type="date" value={previewDate} onChange={(event) => setPreviewDate(event.target.value)} />
                                    <CalendarDays size={15} />
                                </div>

                                <label className="calendarTimeLabel">Reschedule time</label>
                                <div className="calendarTimeDisplay">
                                    <input className="calendarTimeInput" type="time" value={previewTime} onChange={(event) => setPreviewTime(event.target.value)} />
                                    <Clock size={15} />
                                </div>

                                <div className="scheduleButtons">
                                    <button type="button" onClick={closePreviewScheduledEmail} disabled={isUpdatingScheduledEmail}>
                                        Close
                                    </button>

                                    <button type="button" className="primaryScheduleButton" onClick={handleReschedulePreviewEmail} disabled={isUpdatingScheduledEmail}>
                                        <CalendarDays size={14} />
                                        {isUpdatingScheduledEmail ? "Rescheduling..." : "Reschedule email"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {sentEmailToPreview && (
                <div className="emailPreviewOverlay">
                    <div className="emailPreviewModal">
                        <div className="emailPreviewModalHeader">
                            <div>
                                <span>Sent email preview</span>
                                <h3>{sentEmailToPreview.subject}</h3>
                            </div>

                            <button type="button" onClick={closeSentEmailPreview}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="emailPreviewMeta">
                            <p>
                                <strong>To:</strong> {customer.email}
                            </p>
                            <p>
                                <strong>Sent at:</strong> {sentEmailToPreview.sentAt}
                            </p>
                            <p>
                                <strong>Outcome:</strong> {sentEmailToPreview.outcome}
                            </p>
                        </div>

                        <div className="emailPreviewBody">
                            {sentEmailToPreview.html ? <div dangerouslySetInnerHTML={{ __html: sentEmailToPreview.html }} /> : <p>{sentEmailToPreview.reason}</p>}
                        </div>

                        {sentEmailToPreview.replyPreview && (
                            <div className="emailPreviewMeta">
                                <p>
                                    <strong>Reply preview:</strong> {sentEmailToPreview.replyPreview}
                                </p>
                            </div>
                        )}

                        <div className="emailPreviewActions">
                            <button type="button" onClick={closeSentEmailPreview}>
                                Close
                            </button>

                            <Link href={`/dashboard/customers/${encodeURIComponent(customer.id)}/emails`} className="viewAllEmailsButton">
                                View full history
                                <ArrowRight size={16} />
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {isPreviewOpen && (
                <div className="emailPreviewOverlay">
                    <div className="emailPreviewModal">
                        <div className="emailPreviewModalHeader">
                            <div>
                                <span>Email preview</span>
                                <h3>{selectedTemplate.subject}</h3>
                            </div>

                            <button type="button" onClick={() => setIsPreviewOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="emailPreviewMeta">
                            <p>
                                <strong>To:</strong> {customer.email}
                            </p>
                            <p>
                                <strong>Type:</strong> {selectedTemplate.label}
                            </p>
                        </div>

                        <div className="emailPreviewBody">
                            {selectedTemplate.body
                                .replaceAll("{{customer_name}}", customer.name)
                                .split("\n")
                                .map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}

                            <button type="button">{selectedTemplate.cta}</button>
                        </div>

                        <div className="emailPreviewActions">
                            <button type="button" onClick={() => setIsPreviewOpen(false)}>
                                Close
                            </button>

                            <button type="button" className="primaryScheduleButton" onClick={() => handleScheduleEmail(false)} disabled={isScheduling}>
                                <CalendarDays size={14} />
                                {isScheduling ? "Scheduling..." : "Schedule"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}



