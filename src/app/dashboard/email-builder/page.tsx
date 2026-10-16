"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Check,
    ChevronDown,
    Copy,
    Eye,
    FileText,
    Image,
    Link2,
    Loader2,
    Plus,
    Save,
    Sparkles,
    Trash2,
    Upload,
    X,
} from "lucide-react";
import styles from "./email-builder.module.css";

type Tab = "training" | "samples" | "cta" | "footer" | "generate" | "saved";


type CtaStyle = {
    colour: string;
    textColour: string;
    variant: "primary" | "secondary" | "outline" | "text";
    size: "small" | "medium" | "large";
    radius: number;
    alignment: "left" | "center" | "right";
};

type SavedCTA = CtaStyle & {
    id: string;
    name: string;
    text: string;
    link: string;
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

type EmailSample = {
    id: string;
    title: string;
    imageUrl: string;
    fileName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    createdAt: string;
    learnedStyle?: string[];
    description?: string;
    confidence?: number;
};

type TrainingProfile = {
    companyName: string;
    website: string;
    companyDescription: string;
    idealCustomer: string;
    guidelines: string[];
};

type SavedEmail = {
    id: string;
    emailType: string;
    subject: string;
    html: string;
    plainText?: string | null;
    createdAt: string;
};

type EditableEmail = {
    subject: string;
    heading: string;
    body: string;
    ctaText: string;
    ctaLink: string;
};

type MasterTemplate = {
    id: string;
    sampleId: string | null;
    title: string;
    html: string;
    subject: string;
    heading: string;
    body: string;
    ctaText: string;
    ctaLink: string | null;
    createdAt: string;
};

type RecreatedTemplate = {
    subject?: string;
    heading?: string;
    body?: string;
    ctaText?: string;
    ctaLink?: string;
    html: string;
};

type BootstrapResponse = {
    workspaceId?: string;
    workspace?: {
        id: string;
    };
};

const emptyProfile: TrainingProfile = {
    companyName: "",
    website: "",
    companyDescription: "",
    idealCustomer: "",
    guidelines: [],
};

const emptyEditableEmail: EditableEmail = {
    subject: "",
    heading: "",
    body: "",
    ctaText: "",
    ctaLink: "",
};

const defaultCtaStyle: CtaStyle = {
    colour: "#1d9bf0",
    textColour: "#ffffff",
    variant: "primary",
    size: "medium",
    radius: 8,
    alignment: "center",
};

const starterCtas: SavedCTA[] = [
    {
        id: "cta-view-dashboard",
        name: "View dashboard",
        text: "View dashboard",
        link: "{{dashboard_link}}",
        ...defaultCtaStyle,
        isDefault: true,
    },
    {
        id: "cta-update-payment",
        name: "Update payment method",
        text: "Update payment method",
        link: "{{billing_link}}",
        ...defaultCtaStyle,
        isDefault: false,
    },
    {
        id: "cta-book-call",
        name: "Book a call",
        text: "Book a call",
        link: "{{booking_link}}",
        ...defaultCtaStyle,
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


const demoSamples: EmailSample[] = [
    {
        id: "demo-welcome",
        title: "Welcome Email Sample",
        imageUrl: "/demo/email-samples/welcome-email.jpg",
        createdAt: new Date().toISOString(),
        description: "Onboarding · Welcome new users · One CTA",
        confidence: 96,
    },
    {
        id: "demo-verify",
        title: "Verify Email Sample",
        imageUrl: "/demo/email-samples/verify-email.jpg",
        createdAt: new Date().toISOString(),
        description: "Verification · Security workflow · Trust email",
        confidence: 94,
    },
    {
        id: "demo-upgrade",
        title: "Upgrade Reminder Sample",
        imageUrl: "/demo/email-samples/upgrade-email.jpg",
        createdAt: new Date().toISOString(),
        description: "Upgrade · Usage warning · Revenue expansion",
        confidence: 91,
    },
];

const demoContent: Record<string, EditableEmail> = {
    "demo-welcome": {
        subject: "Welcome to {{company_name}}",
        heading: "Welcome!",
        body: "Hi {{first_name}}, welcome to {{company_name}}. We’re excited to have you here.",
        ctaText: "Explore now",
        ctaLink: "{{cta_link}}",
    },
    "demo-verify": {
        subject: "Verify your email address",
        heading: "Verify your email address",
        body: "Hi {{first_name}}, please confirm your email address so we can keep your account secure.",
        ctaText: "Verify email address",
        ctaLink: "{{cta_link}}",
    },
    "demo-upgrade": {
        subject: "You're close to your limit",
        heading: "Limit almost reached!",
        body: "Hi {{first_name}}, you’re close to your current plan limit. Upgrade now to avoid any interruption.",
        ctaText: "View plans & options",
        ctaLink: "{{cta_link}}",
    },
};

const guidelineGroups = [
    {
        label: "Tone",
        options: ["Friendly", "Professional", "Direct", "Conversational", "No emojis"],
    },
    {
        label: "Length",
        options: ["Keep it short", "Under 120 words", "No long paragraphs", "Simple wording"],
    },
    {
        label: "Personalisation",
        options: ["Use customer name", "Mention customer activity", "Make it feel human"],
    },
    {
        label: "CTA",
        options: ["One CTA only", "Ask them to reply", "Book a call", "Complete checkout"],
    },
];

function getSavedTab(): Tab {
    if (typeof window === "undefined") return "samples";

    const saved = localStorage.getItem("email-agent-active-tab") as Tab | null;

    if (
        saved === "training" ||
        saved === "samples" ||
        saved === "cta" ||
        saved === "footer" ||
        saved === "generate" ||
        saved === "saved"
    ) {
        return saved;
    }

    return "samples";
}

function getSavedJson<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;

    try {
        const saved = localStorage.getItem(key);
        return saved ? (JSON.parse(saved) as T) : fallback;
    } catch {
        return fallback;
    }
}

function formatDate(value?: string) {
    const date = new Date(value || Date.now());

    if (Number.isNaN(date.getTime())) return "Invalid date";

    return date.toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function stripHtml(html: string) {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function stripAgentMeta(html: string) {
    return html.replace(/<!--EMAIL_AGENT_META:[\s\S]*?-->/, "").trim();
}

function buildSavedHtmlWithMeta(params: {
    html: string;
    templateHtml: string;
    editableEmail: EditableEmail;
    selectedSampleId: string;
    selectedMasterId: string;
}) {
    const meta = encodeURIComponent(
        JSON.stringify({
            templateHtml: params.templateHtml,
            editableEmail: params.editableEmail,
            selectedSampleId: params.selectedSampleId,
            selectedMasterId: params.selectedMasterId,
        })
    );

    return `<!--EMAIL_AGENT_META:${meta}-->\n${params.html}`;
}

function readSavedHtmlMeta(html: string) {
    const match = html.match(/<!--EMAIL_AGENT_META:([\s\S]*?)-->/);

    if (!match?.[1]) return null;

    try {
        return JSON.parse(decodeURIComponent(match[1])) as {
            templateHtml: string;
            editableEmail: EditableEmail;
            selectedSampleId: string;
            selectedMasterId: string;
        };
    } catch {
        return null;
    }
}

function fillTemplateHtml(templateHtml: string, content: EditableEmail) {
    return templateHtml
        .replaceAll("{{subject}}", content.subject)
        .replaceAll("{{heading}}", content.heading)
        .replaceAll("{{body}}", content.body)
        .replaceAll("{{ctaText}}", content.ctaText)
        .replaceAll("{{ctaLink}}", content.ctaLink || "{{cta_link}}");
}

function applyCtaStyle(html: string, style: CtaStyle) {
    if (typeof document === "undefined") return html;

    const container = document.createElement("div");
    container.innerHTML = html;

    const cta = Array.from(container.querySelectorAll("a, button")).find((element) => {
        const text = element.textContent?.trim().toLowerCase() || "";
        return (
            text.length > 0 &&
            !text.includes("unsubscribe") &&
            !text.includes("privacy") &&
            !text.includes("terms")
        );
    }) as HTMLElement | undefined;

    if (!cta) return html;

    const padding =
        style.size === "small" ? "9px 16px" : style.size === "large" ? "14px 26px" : "12px 22px";
    const fontSize = style.size === "small" ? "12px" : style.size === "large" ? "14px" : "13px";

    cta.style.display = style.variant === "text" ? "inline" : "inline-block";
    cta.style.padding = style.variant === "text" ? "0" : padding;
    cta.style.borderRadius = `${style.radius}px`;
    cta.style.fontSize = fontSize;
    cta.style.fontWeight = "600";
    cta.style.textDecoration = style.variant === "text" ? "underline" : "none";
    cta.style.background =
        style.variant === "primary" ? style.colour : style.variant === "secondary" ? "#f3f4f6" : "transparent";
    cta.style.color = style.variant === "primary" ? style.textColour : style.colour;
    cta.style.border = style.variant === "outline" ? `1px solid ${style.colour}` : "1px solid transparent";

    const parent = cta.parentElement;
    if (parent) parent.style.textAlign = style.alignment;

    return container.innerHTML;
}

function applyFooterToHtml(html: string, settings: FooterSettings) {
    if (!settings.enabled) {
        return html.replace(/<!--COBRAI_FOOTER_START-->[\s\S]*?<!--COBRAI_FOOTER_END-->/g, "");
    }

    const companyLine = settings.showCompanyName && settings.companyName.trim()
        ? `<div style="margin-bottom:6px;">${settings.companyName.trim()}</div>`
        : "";

    const copyrightLine = settings.showCopyright && settings.copyrightText.trim()
        ? `<div style="margin-bottom:6px;">${settings.copyrightText.trim()}</div>`
        : "";

    const links = [
        settings.showUnsubscribe && settings.unsubscribeText.trim()
            ? `<a href="${settings.unsubscribeLink || "{{unsubscribe_link}}"}" style="color:${settings.textColour};text-decoration:none;">${settings.unsubscribeText.trim()}</a>`
            : "",
        settings.showPreferences && settings.preferencesText.trim()
            ? `<a href="${settings.preferencesLink || "{{preferences_link}}"}" style="color:${settings.textColour};text-decoration:none;">${settings.preferencesText.trim()}</a>`
            : "",
    ].filter(Boolean);

    const linksLine = links.length
        ? `<div>${links.join(` <span style="padding:0 6px;color:${settings.textColour};">${settings.separator}</span> `)}</div>`
        : "";

    const divider = settings.showDivider
        ? `<div style="height:1px;background:${settings.dividerColour};margin:28px 0 22px;"></div>`
        : `<div style="height:18px;"></div>`;

    const footer = `
<!--COBRAI_FOOTER_START-->
<div data-cobrai-footer="true" style="font-family:Inter,Arial,sans-serif;text-align:${settings.alignment};font-size:${settings.textSize};line-height:1.65;color:${settings.textColour};">
    ${divider}
    ${companyLine}
    ${copyrightLine}
    ${linksLine}
</div>
<!--COBRAI_FOOTER_END-->`.trim();

    const withoutExistingFooter = html.replace(
        /<!--COBRAI_FOOTER_START-->[\s\S]*?<!--COBRAI_FOOTER_END-->/g,
        "",
    );

    if (typeof document === "undefined") {
        return `${withoutExistingFooter}\n${footer}`;
    }

    const container = document.createElement("div");
    container.innerHTML = withoutExistingFooter;
    const emailCard = container.firstElementChild?.firstElementChild;

    if (emailCard instanceof HTMLElement) {
        emailCard.insertAdjacentHTML("beforeend", footer);
        return container.innerHTML;
    }

    return `${withoutExistingFooter}\n${footer}`;
}

function buildFallbackHtml(content: EditableEmail, sample?: EmailSample) {
    const buttonColor = sample?.id === "demo-upgrade" ? "#2563eb" : "#5b4df7";

    return `
<div style="width:100%;background:#f7f7fb;padding:34px 0;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;padding:38px 34px;text-align:center;">
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#111827;">{{heading}}</h1>
    <p style="margin:0 auto 24px;max-width:430px;font-size:14px;line-height:1.7;color:#6b7280;">{{body}}</p>
    <a href="{{ctaLink}}" style="display:inline-block;background:${buttonColor};color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 22px;font-size:13px;font-weight:600;">{{ctaText}}</a>
  </div>
</div>`.trim();
}

function createEditableTemplateFromSavedHtml(email: SavedEmail) {
    const cleanHtml = stripAgentMeta(email.html);
    const temp = document.createElement("div");
    temp.innerHTML = cleanHtml;

    const headingEl = temp.querySelector("h1, h2, h3");

    const ctaEl = Array.from(temp.querySelectorAll("a, button")).find((el) => {
        const text = el.textContent?.trim().toLowerCase() || "";
        return (
            text.length > 0 &&
            !text.includes("unsubscribe") &&
            !text.includes("privacy") &&
            !text.includes("terms")
        );
    });

    const bodyEl =
        Array.from(temp.querySelectorAll("p")).find((p) => {
            const text = p.textContent?.trim() || "";
            const lower = text.toLowerCase();

            return (
                text.length > 35 &&
                !lower.includes("thank you for registering") &&
                !lower.includes("or copy and paste") &&
                !lower.includes("security notice") &&
                !lower.includes("unsubscribe") &&
                !lower.includes("privacy") &&
                !lower.includes("terms") &&
                !lower.includes("support@") &&
                !lower.includes("customer support") &&
                !lower.includes("©")
            );
        }) || null;

    const heading = headingEl?.textContent?.trim() || email.subject;
    const body = bodyEl?.textContent?.trim() || email.plainText || stripHtml(cleanHtml);
    const ctaText = ctaEl?.textContent?.trim() || "Continue";
    const ctaLink = ctaEl?.getAttribute("href") || ctaEl?.getAttribute("data-href") || "{{cta_link}}";

    if (headingEl) headingEl.textContent = "{{heading}}";
    if (bodyEl) bodyEl.textContent = "{{body}}";

    if (ctaEl) {
        ctaEl.textContent = "{{ctaText}}";

        if (ctaEl instanceof HTMLAnchorElement) {
            ctaEl.setAttribute("href", "{{ctaLink}}");
        }
    }

    return {
        templateHtml: temp.innerHTML,
        editableEmail: {
            subject: email.subject,
            heading,
            body,
            ctaText,
            ctaLink,
        },
    };
}

function getInitialEditableEmail() {
    return getSavedJson("email-agent-editable-email", emptyEditableEmail);
}

function getInitialTemplateHtml() {
    return getSavedJson("email-agent-template-html", buildFallbackHtml(emptyEditableEmail));
}

export default function EmailAgentPage() {
    const [activeTab, setActiveTab] = useState<Tab>(getSavedTab);
    const [workspaceId, setWorkspaceId] = useState("");
    const [training, setTraining] = useState<TrainingProfile>(emptyProfile);
    const [samples, setSamples] = useState<EmailSample[]>([]);
    const [savedEmails, setSavedEmails] = useState<SavedEmail[]>([]);
    const [masterTemplates, setMasterTemplates] = useState<MasterTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [viewSavedEmail, setViewSavedEmail] = useState<SavedEmail | null>(null);
    const [savedCtas, setSavedCtas] = useState<SavedCTA[]>(() =>
        getSavedJson("email-agent-saved-ctas", starterCtas)
    );
    const [selectedCtaId, setSelectedCtaId] = useState(() =>
        getSavedJson("email-agent-selected-cta-id", "cta-view-dashboard")
    );
    const [ctaDraft, setCtaDraft] = useState<SavedCTA>(() => {
        const saved = getSavedJson<SavedCTA[]>("email-agent-saved-ctas", starterCtas);
        return saved.find((cta) => cta.isDefault) || saved[0] || starterCtas[0];
    });
    const [ctaStyle, setCtaStyle] = useState<CtaStyle>(() =>
        getSavedJson("email-agent-cta-style", defaultCtaStyle)
    );
    const [footerSettings, setFooterSettings] = useState<FooterSettings>(() =>
        getSavedJson("email-agent-footer-settings", defaultFooterSettings)
    );


    const [selectedSampleId, setSelectedSampleId] = useState(() =>
        getSavedJson("email-agent-selected-sample-id", "")
    );
    const [selectedMasterId, setSelectedMasterId] = useState(() =>
        getSavedJson("email-agent-selected-master-id", "")
    );
    const [editableEmail, setEditableEmail] = useState<EditableEmail>(getInitialEditableEmail);
    const [templateHtml, setTemplateHtml] = useState(getInitialTemplateHtml);

    const [prompt, setPrompt] = useState(() =>
        getSavedJson("email-agent-prompt", "Personalise this email for an inactive customer.")
    );
    const [uploadTitle, setUploadTitle] = useState("");
    const [uploadFile, setUploadFile] = useState<File | null>(null);

    const [isUploading, setIsUploading] = useState(false);
    const [isRecreating, setIsRecreating] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSavingMaster, setIsSavingMaster] = useState(false);
    const [isSavingEmail, setIsSavingEmail] = useState(false);

    const [previewSample, setPreviewSample] = useState<EmailSample | null>(null);
    const [isGuidelineOpen, setIsGuidelineOpen] = useState(false);
    const [customGuideline, setCustomGuideline] = useState("");
    const [message, setMessage] = useState("");

    const hasRealSamples = samples.length > 0;
    const sampleOptions = useMemo(() => {
        return hasRealSamples ? samples : demoSamples;
    }, [hasRealSamples, samples]);

    const selectedSample = selectedSampleId
        ? sampleOptions.find((sample) => sample.id === selectedSampleId)
        : undefined;

    const selectedMaster = masterTemplates.find((template) => template.id === selectedMasterId);

    const emailHtml = useMemo(() => {
        const styledEmail = applyCtaStyle(fillTemplateHtml(templateHtml, editableEmail), ctaStyle);
        return applyFooterToHtml(styledEmail, footerSettings);
    }, [templateHtml, editableEmail, ctaStyle, footerSettings]);

    async function loadData() {
        setIsLoading(true);
        setMessage("");

        try {
            const bootRes = await fetch("/api/email-agent/bootstrap", { cache: "no-store" });
            const boot: BootstrapResponse = await bootRes.json();
            const id = boot.workspaceId || boot.workspace?.id;

            if (!bootRes.ok || !id) {
                throw new Error("Unable to resolve workspace.");
            }

            setWorkspaceId(id);

            if (typeof window !== "undefined") {
                localStorage.setItem("workspaceId", id);
            }

            const [profileRes, samplesRes, emailsRes, templatesRes] = await Promise.all([
                fetch(`/api/email-agent/profile?workspaceId=${encodeURIComponent(id)}`, { cache: "no-store" }),
                fetch(`/api/email-agent/samples?workspaceId=${encodeURIComponent(id)}`, { cache: "no-store" }),
                fetch(`/api/email-agent/generated?workspaceId=${encodeURIComponent(id)}`, { cache: "no-store" }),
                fetch(`/api/email-agent/master-templates?workspaceId=${encodeURIComponent(id)}`, { cache: "no-store" }),
            ]);

            const [profileData, samplesData, emailsData, templatesData] = await Promise.all([
                profileRes.json(),
                samplesRes.json(),
                emailsRes.json(),
                templatesRes.json(),
            ]);

            if (!profileRes.ok) throw new Error(profileData.error || "Failed to load brand profile.");
            if (!samplesRes.ok) throw new Error(samplesData.error || "Failed to load samples.");
            if (!emailsRes.ok) throw new Error(emailsData.error || "Failed to load saved emails.");
            if (!templatesRes.ok) throw new Error(templatesData.error || "Failed to load templates.");

            const nextSamples: EmailSample[] = Array.isArray(samplesData.samples) ? samplesData.samples : [];
            const nextTemplates: MasterTemplate[] = Array.isArray(templatesData.templates) ? templatesData.templates : [];

            setTraining({ ...emptyProfile, ...(profileData.profile || {}) });
            setSamples(nextSamples);
            setSavedEmails(Array.isArray(emailsData.emails) ? emailsData.emails : []);
            setMasterTemplates(nextTemplates);

            if (!selectedMasterId && nextTemplates.length > 0) {
                const template = nextTemplates[0];
                setSelectedMasterId(template.id);
                setSelectedSampleId(template.sampleId || "");
                setTemplateHtml(template.html);
                setEditableEmail({
                    subject: template.subject || "",
                    heading: template.heading || "",
                    body: template.body || "",
                    ctaText: template.ctaText || "",
                    ctaLink: template.ctaLink || "{{cta_link}}",
                });
            } else if (!selectedSampleId && nextSamples.length > 0) {
                setSelectedSampleId(nextSamples[0].id);
            } else if (!selectedSampleId && nextSamples.length === 0 && nextTemplates.length === 0) {
                setSelectedSampleId("demo-welcome");
                setEditableEmail(demoContent["demo-welcome"]);
                setTemplateHtml(buildFallbackHtml(demoContent["demo-welcome"], demoSamples[0]));
            }
        } catch (error) {
            console.error("Failed to load email builder:", error);
            setMessage(error instanceof Error ? error.message : "Failed to load email builder.");
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        localStorage.setItem("email-agent-active-tab", activeTab);
    }, [activeTab]);

    useEffect(() => {
        if (isLoading) return;

        localStorage.setItem("email-agent-selected-sample-id", JSON.stringify(selectedSampleId));
        localStorage.setItem("email-agent-selected-master-id", JSON.stringify(selectedMasterId));
        localStorage.setItem("email-agent-editable-email", JSON.stringify(editableEmail));
        localStorage.setItem("email-agent-template-html", JSON.stringify(templateHtml));
        localStorage.setItem("email-agent-prompt", JSON.stringify(prompt));
    }, [isLoading, selectedSampleId, selectedMasterId, editableEmail, templateHtml, prompt]);

    useEffect(() => {
        localStorage.setItem("email-agent-saved-ctas", JSON.stringify(savedCtas));
        localStorage.setItem("email-agent-selected-cta-id", JSON.stringify(selectedCtaId));
        localStorage.setItem("email-agent-cta-style", JSON.stringify(ctaStyle));
    }, [savedCtas, selectedCtaId, ctaStyle]);

    useEffect(() => {
        localStorage.setItem("email-agent-footer-settings", JSON.stringify(footerSettings));
    }, [footerSettings]);

    useEffect(() => {
        if (!workspaceId || isLoading) return;

        const timer = setTimeout(async () => {
            try {
                await fetch("/api/email-agent/profile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        workspaceId,
                        ...training,
                    }),
                });
            } catch (error) {
                console.error("Failed to auto-save brand profile:", error);
            }
        }, 700);

        return () => clearTimeout(timer);
    }, [workspaceId, training, isLoading]);

    function updateTraining<K extends keyof TrainingProfile>(key: K, value: TrainingProfile[K]) {
        setTraining((prev) => ({ ...prev, [key]: value }));
    }

    function updateEditableEmail<K extends keyof EditableEmail>(key: K, value: EditableEmail[K]) {
        setEditableEmail((prev) => ({ ...prev, [key]: value }));
    }

    function updateFooterSetting<K extends keyof FooterSettings>(
        key: K,
        value: FooterSettings[K],
    ) {
        setFooterSettings((current) => ({ ...current, [key]: value }));
    }

    function saveFooterSettings() {
        localStorage.setItem("email-agent-footer-settings", JSON.stringify(footerSettings));
        setMessage("Footer settings saved.");
    }

    function toggleGuideline(value: string) {
        setTraining((prev) => ({
            ...prev,
            guidelines: prev.guidelines.includes(value)
                ? prev.guidelines.filter((item) => item !== value)
                : [...prev.guidelines, value],
        }));
    }

    function removeGuideline(value: string) {
        setTraining((prev) => ({
            ...prev,
            guidelines: prev.guidelines.filter((item) => item !== value),
        }));
    }

    function addCustomGuideline() {
        const value = customGuideline.trim();
        if (!value) return;

        setTraining((prev) => ({
            ...prev,
            guidelines: prev.guidelines.includes(value) ? prev.guidelines : [...prev.guidelines, value],
        }));

        setCustomGuideline("");
    }

    function selectCta(cta: SavedCTA) {
        setSelectedCtaId(cta.id);
        setCtaDraft({ ...cta });
    }

    function createNewCta() {
        const next: SavedCTA = {
            id: `cta-${Date.now()}`,
            name: "New CTA",
            text: "Continue",
            link: "{{cta_link}}",
            ...defaultCtaStyle,
            isDefault: false,
        };

        setSelectedCtaId(next.id);
        setCtaDraft(next);
    }

    function saveCta() {
        const cleanName = ctaDraft.name.trim();
        const cleanText = ctaDraft.text.trim();
        const cleanLink = ctaDraft.link.trim();

        if (!cleanName || !cleanText || !cleanLink) {
            setMessage("Add a CTA name, button text and destination before saving.");
            return;
        }

        const next = { ...ctaDraft, name: cleanName, text: cleanText, link: cleanLink };

        setSavedCtas((current) => {
            const exists = current.some((cta) => cta.id === next.id);
            return exists ? current.map((cta) => (cta.id === next.id ? next : cta)) : [next, ...current];
        });
        setSelectedCtaId(next.id);
        setMessage("CTA saved.");
    }

    function applyCtaToEmail(cta: SavedCTA = ctaDraft) {
        setEditableEmail((current) => ({ ...current, ctaText: cta.text, ctaLink: cta.link }));
        setCtaStyle({
            colour: cta.colour,
            textColour: cta.textColour,
            variant: cta.variant,
            size: cta.size,
            radius: cta.radius,
            alignment: cta.alignment,
        });
        setMessage(`“${cta.name}” applied to the email.`);
    }

    function setDefaultCta(id: string) {
        setSavedCtas((current) =>
            current.map((cta) => ({ ...cta, isDefault: cta.id === id }))
        );
        setCtaDraft((current) => ({ ...current, isDefault: current.id === id }));
        setMessage("Default CTA updated.");
    }

    function deleteCta(id: string) {
        if (!confirm("Delete this CTA?")) return;

        setSavedCtas((current) => current.filter((cta) => cta.id !== id));
        const fallback = savedCtas.find((cta) => cta.id !== id) || starterCtas[0];
        setSelectedCtaId(fallback.id);
        setCtaDraft({ ...fallback });
        setMessage("CTA deleted.");
    }

    function duplicateCta(cta: SavedCTA) {
        const duplicate = {
            ...cta,
            id: `cta-${Date.now()}`,
            name: `${cta.name} copy`,
            isDefault: false,
        };
        setSavedCtas((current) => [duplicate, ...current]);
        selectCta(duplicate);
    }

    async function deleteSample(sample: EmailSample) {
        if (sample.id.startsWith("demo-")) return;
        if (!confirm("Delete this sample?")) return;

        try {
            const res = await fetch(`/api/email-agent/samples?id=${encodeURIComponent(sample.id)}`, {
                method: "DELETE",
            });

            if (!res.ok) throw new Error("Failed to delete sample");

            setSamples((prev) => prev.filter((item) => item.id !== sample.id));

            if (selectedSampleId === sample.id) {
                setSelectedSampleId("");
            }

            setMessage("Sample deleted.");
        } catch (error) {
            console.error(error);
            setMessage("Could not delete sample.");
        }
    }

    async function uploadSample() {
        if (!workspaceId || !uploadFile || !uploadTitle.trim()) {
            setMessage("Add a sample name and image first.");
            return;
        }

        setIsUploading(true);
        setMessage("");

        try {
            const formData = new FormData();
            formData.append("file", uploadFile);
            formData.append("workspaceId", workspaceId);

            const uploadRes = await fetch("/api/email-agent/upload", {
                method: "POST",
                body: formData,
            });

            const uploadText = await uploadRes.text();
            let uploadData: any = {};

            try {
                uploadData = uploadText ? JSON.parse(uploadText) : {};
            } catch {
                console.error("Upload API did not return JSON:", uploadText);
                throw new Error("Upload API returned invalid response");
            }

            if (!uploadRes.ok) {
                throw new Error(uploadData.error || "Failed to upload image");
            }

            const saveRes = await fetch("/api/email-agent/samples", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspaceId,
                    title: uploadTitle.trim(),
                    imageUrl: uploadData.imageUrl,
                    fileName: uploadData.fileName,
                    mimeType: uploadData.mimeType,
                    sizeBytes: uploadData.sizeBytes,
                }),
            });

            const saveData = await saveRes.json();
            if (!saveRes.ok) throw new Error(saveData.error || "Failed to save sample");

            setSamples((prev) => [saveData.sample, ...prev]);
            setSelectedSampleId(saveData.sample.id);
            setUploadFile(null);
            setUploadTitle("");
            setMessage("Sample uploaded. Now recreate it as an editable template.");
        } catch (error) {
            console.error(error);
            setMessage(error instanceof Error ? error.message : "Could not upload sample.");
        } finally {
            setIsUploading(false);
        }
    }

    async function recreateTemplate(sample: EmailSample) {
        if (!workspaceId) {
            setMessage("Workspace is not ready yet.");
            return;
        }

        setSelectedSampleId(sample.id);
        setIsRecreating(true);
        setMessage("");

        try {
            const res = await fetch("/api/email-agent/recreate-template", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspaceId,
                    imageUrl: sample.imageUrl,
                    sampleTitle: sample.title,
                    brandProfile: training,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to recreate template");

            const template: RecreatedTemplate = data.template;

            const nextContent: EditableEmail = {
                subject: template.subject || demoContent[sample.id]?.subject || sample.title,
                heading: template.heading || demoContent[sample.id]?.heading || sample.title,
                body:
                    template.body ||
                    demoContent[sample.id]?.body ||
                    "Hi {{first_name}}, here is a personalised update for you.",
                ctaText: template.ctaText || demoContent[sample.id]?.ctaText || "Continue",
                ctaLink: template.ctaLink || "{{cta_link}}",
            };

            setEditableEmail(nextContent);
            setTemplateHtml(template.html || buildFallbackHtml(nextContent, sample));
            setSelectedMasterId("");
            setActiveTab("generate");
            setMessage("Template recreated. You can now edit and save it.");
        } catch (error) {
            console.error(error);

            const fallback = demoContent[sample.id] || {
                subject: sample.title,
                heading: sample.title,
                body: "Hi {{first_name}}, here is a personalised update for you.",
                ctaText: "Continue",
                ctaLink: "{{cta_link}}",
            };

            setEditableEmail(fallback);
            setTemplateHtml(buildFallbackHtml(fallback, sample));
            setSelectedMasterId("");
            setActiveTab("generate");
            setMessage("AI recreate failed, so fallback editor opened. Check quota/billing.");
        } finally {
            setIsRecreating(false);
        }
    }

    async function saveMasterTemplate() {
        if (!workspaceId) {
            setMessage("Workspace is not ready yet.");
            return;
        }

        if (!editableEmail.subject.trim() || !editableEmail.heading.trim() || !editableEmail.body.trim()) {
            setMessage("Add a subject, heading and body before saving a template.");
            return;
        }

        setIsSavingMaster(true);
        setMessage("");

        try {
            const payload = {
                workspaceId,
                sampleId: selectedSample?.id?.startsWith("demo-") ? null : selectedSample?.id || null,
                title: `${selectedSample?.title || editableEmail.subject || "Email"} Master Template`,
                html: templateHtml,
                subject: editableEmail.subject,
                heading: editableEmail.heading,
                body: editableEmail.body,
                ctaText: editableEmail.ctaText,
                ctaLink: editableEmail.ctaLink,
            };

            const res = await fetch("/api/email-agent/master-templates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save master template");

            setMasterTemplates((prev) => [data.template, ...prev]);
            setSelectedMasterId(data.template.id);
            setSelectedSampleId(data.template.sampleId || selectedSampleId || "");
            setTemplateHtml(data.template.html);

            setEditableEmail({
                subject: data.template.subject || "",
                heading: data.template.heading || "",
                body: data.template.body || "",
                ctaText: data.template.ctaText || "",
                ctaLink: data.template.ctaLink || "{{cta_link}}",
            });

            setActiveTab("generate");
            setMessage("Master template saved.");
        } catch (error) {
            console.error(error);
            setMessage(error instanceof Error ? error.message : "Could not save master template.");
        } finally {
            setIsSavingMaster(false);
        }
    }

    function useMasterTemplate(template: MasterTemplate) {
        setSelectedMasterId(template.id);
        setSelectedSampleId(template.sampleId || "");
        setTemplateHtml(template.html);

        setEditableEmail({
            subject: template.subject || "",
            heading: template.heading || "",
            body: template.body || "",
            ctaText: template.ctaText || "",
            ctaLink: template.ctaLink || "{{cta_link}}",
        });

        setActiveTab("generate");
    }

    async function generatePersonalisedCopy() {
        if (!workspaceId) return;

        if (!editableEmail.subject.trim() && !editableEmail.body.trim()) {
            setMessage("Choose or recreate a template before generating copy.");
            return;
        }

        setIsGenerating(true);
        setMessage("");

        try {
            const res = await fetch("/api/email-agent/generate-copy", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspaceId,
                    emailType: selectedMaster?.title || selectedSample?.title || "Personalised email",
                    currentEmail: editableEmail,
                    prompt,
                    brandProfile: {
                        companyName: training.companyName,
                        website: training.website,
                        companyDescription: training.companyDescription,
                        idealCustomer: training.idealCustomer,
                        guidelines: training.guidelines,
                    },
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to generate copy");

            setEditableEmail((prev) => ({
                subject: data.subject || prev.subject,
                heading: data.heading || prev.heading,
                body: data.body || prev.body,
                ctaText: data.ctaText || prev.ctaText,
                ctaLink: data.ctaLink || prev.ctaLink,
            }));

            setMessage("Personalised copy generated.");
        } catch (error) {
            console.error(error);
            setMessage("Could not generate copy. You can still edit manually.");
        } finally {
            setIsGenerating(false);
        }
    }

    async function savePersonalisedEmail() {
        if (!workspaceId || !emailHtml.trim()) return;

        if (!editableEmail.subject.trim()) {
            setMessage("Add a subject before saving.");
            return;
        }

        setIsSavingEmail(true);
        setMessage("");

        try {
            const savedHtml = buildSavedHtmlWithMeta({
                html: emailHtml,
                templateHtml,
                editableEmail,
                selectedSampleId,
                selectedMasterId,
            });

            const res = await fetch("/api/email-agent/generated", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspaceId,
                    emailType: selectedMaster?.title || selectedSample?.title || "Personalised email",
                    subject: editableEmail.subject,
                    html: savedHtml,
                    plainText: stripHtml(emailHtml),
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save email");

            setSavedEmails((prev) => [data.email, ...prev]);
            setMessage("Personalised email saved.");
            setActiveTab("saved");
        } catch (error) {
            console.error(error);
            setMessage(error instanceof Error ? error.message : "Could not save email.");
        } finally {
            setIsSavingEmail(false);
        }
    }

    function openSavedEmail(email: SavedEmail) {
        const meta = readSavedHtmlMeta(email.html);

        if (meta) {
            setSelectedSampleId(meta.selectedSampleId || "");
            setSelectedMasterId(meta.selectedMasterId || "");
            setTemplateHtml(meta.templateHtml);
            setEditableEmail(meta.editableEmail);
            setActiveTab("generate");
            return;
        }

        const fallback = createEditableTemplateFromSavedHtml(email);

        setSelectedSampleId("");
        setSelectedMasterId("");
        setTemplateHtml(fallback.templateHtml);
        setEditableEmail(fallback.editableEmail);
        setActiveTab("generate");
    }

    if (isLoading) {
        return (
            <main className={styles.page}>
                <div className={styles.emptyState}>
                    <Loader2 size={22} className={styles.spin} />
                    <h3>Loading email agent...</h3>
                </div>
            </main>
        );
    }

    return (
        <main className={styles.page}>
            <section className={styles.hero}>
                <div>
                    <span className={styles.eyebrow}>AI Email Agent</span>
                    <h1>Recreate email samples into editable templates.</h1>
                    <p>
                        Upload real email samples, recreate them as master templates, then personalise
                        the words without breaking the design.
                    </p>
                </div>
            </section>

            <nav className={styles.tabs}>
                <button
                    className={activeTab === "training" ? styles.activeTab : ""}
                    onClick={() => setActiveTab("training")}
                >
                    Brand profile
                </button>
                <button
                    className={activeTab === "samples" ? styles.activeTab : ""}
                    onClick={() => setActiveTab("samples")}
                >
                    Samples
                </button>
                <button
                    className={activeTab === "cta" ? styles.activeTab : ""}
                    onClick={() => setActiveTab("cta")}
                >
                    CTA buttons
                </button>
                <button
                    className={activeTab === "footer" ? styles.activeTab : ""}
                    onClick={() => setActiveTab("footer")}
                >
                    Footer
                </button>
                <button
                    className={activeTab === "generate" ? styles.activeTab : ""}
                    onClick={() => setActiveTab("generate")}
                >
                    Generate
                </button>
                <button
                    className={activeTab === "saved" ? styles.activeTab : ""}
                    onClick={() => setActiveTab("saved")}
                >
                    Saved
                </button>
            </nav>

            {message && <div className={styles.recommendationNotice}>{message}</div>}

            {activeTab === "training" && (
                <section className={styles.trainingShell}>
                    <section className={styles.bigCard}>
                        <div className={styles.cardTop}>
                            <div>
                                <span className={styles.stepBadge}>01</span>
                                <h2>Brand Profile</h2>
                                <p>Give the AI business context before it writes.</p>
                            </div>
                        </div>

                        <div className={styles.inputGrid}>
                            <div className={styles.field}>
                                <label>Company name</label>
                                <input
                                    value={training.companyName}
                                    onChange={(e) => updateTraining("companyName", e.target.value)}
                                    placeholder="Company name"
                                />
                            </div>

                            <div className={styles.field}>
                                <label>Website</label>
                                <input
                                    value={training.website}
                                    onChange={(e) => updateTraining("website", e.target.value)}
                                    placeholder="https://company.com"
                                />
                            </div>

                            <div className={`${styles.field} ${styles.fullField}`}>
                                <label>Company description</label>
                                <textarea
                                    value={training.companyDescription}
                                    onChange={(e) => updateTraining("companyDescription", e.target.value)}
                                    placeholder="What does the company do?"
                                />
                            </div>

                            <div className={`${styles.field} ${styles.fullField}`}>
                                <label>Ideal customer</label>
                                <textarea
                                    value={training.idealCustomer}
                                    onChange={(e) => updateTraining("idealCustomer", e.target.value)}
                                    placeholder="Who are these emails for?"
                                />
                            </div>
                        </div>
                    </section>

                    <section className={styles.guidelinesCard}>
                        <div className={styles.guidelinesHeader}>
                            <div>
                                <span className={styles.stepBadge}>02</span>
                                <h2>Guidelines</h2>
                                <p>Rules the AI should follow when personalising copy.</p>
                            </div>

                            <div className={styles.sortDropdownWrap}>
                                <button
                                    type="button"
                                    className={styles.sortDropdownButton}
                                    onClick={() => setIsGuidelineOpen((prev) => !prev)}
                                >
                                    Add guideline
                                    <ChevronDown size={15} />
                                </button>

                                {isGuidelineOpen && (
                                    <div className={styles.sortMenu}>
                                        {guidelineGroups.map((group) => (
                                            <div key={group.label} className={styles.sortMenuGroup}>
                                                <p>{group.label}</p>

                                                {group.options.map((option) => {
                                                    const selected = training.guidelines.includes(option);

                                                    return (
                                                        <button
                                                            key={option}
                                                            type="button"
                                                            className={styles.sortMenuItem}
                                                            onClick={() => toggleGuideline(option)}
                                                        >
                                                            <span>{option}</span>
                                                            {selected && <Check size={14} />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className={styles.selectedGuidelines}>
                            {training.guidelines.length > 0 ? (
                                training.guidelines.map((item) => (
                                    <button
                                        type="button"
                                        key={item}
                                        className={styles.selectedGuideline}
                                        onClick={() => removeGuideline(item)}
                                    >
                                        {item}
                                        <X size={13} />
                                    </button>
                                ))
                            ) : (
                                <p>No guidelines selected.</p>
                            )}
                        </div>

                        <div className={styles.customGuidelineRow}>
                            <input
                                value={customGuideline}
                                onChange={(e) => setCustomGuideline(e.target.value)}
                                placeholder="Type your own guideline..."
                            />
                            <button
                                type="button"
                                className={styles.secondaryButton}
                                onClick={addCustomGuideline}
                            >
                                Add
                            </button>
                        </div>
                    </section>
                </section>
            )}

            {activeTab === "samples" && (
                <section className={styles.generateGrid}>
                    <aside className={styles.panel}>
                        <div className={styles.cardTop}>
                            <div>
                                <h2>Upload email sample</h2>
                                <p>Upload a screenshot of the email design.</p>
                            </div>
                        </div>

                        <div className={styles.field}>
                            <label>Sample name</label>
                            <input
                                value={uploadTitle}
                                onChange={(e) => setUploadTitle(e.target.value)}
                                placeholder="Example: Black Friday email"
                            />
                        </div>

                        <div className={styles.field}>
                            <label>Email screenshot</label>
                            <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                            />
                        </div>

                        <button
                            className={styles.primaryButtonFull}
                            onClick={uploadSample}
                            disabled={isUploading}
                        >
                            {isUploading ? <Loader2 size={16} className={styles.spin} /> : <Upload size={16} />}
                            {isUploading ? "Uploading..." : "Upload sample"}
                        </button>
                    </aside>

                    <section className={styles.editorPanel}>
                        <div className={styles.cardTop}>
                            <div>
                                <h2>{hasRealSamples ? "Your samples" : "Demo samples"}</h2>
                                <p>
                                    {hasRealSamples
                                        ? "Recreate a sample into an editable master template."
                                        : "Upload your own sample when ready. Demo samples are only a preview."}
                                </p>
                            </div>
                            <span className={styles.softBadge}>{sampleOptions.length} samples</span>
                        </div>

                        <div className={styles.optionList}>
                            {sampleOptions.map((sample) => (
                                <div key={sample.id} className={styles.optionItem}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedSampleId(sample.id);
                                            setPreviewSample(sample);
                                        }}
                                    >
                                        <div>
                                            <strong>{sample.title}</strong>
                                            <span>{sample.description || "Saved email style sample"}</span>
                                        </div>
                                        <small>{formatDate(sample.createdAt)}</small>
                                    </button>

                                    <div className={styles.modalActions}>
                                        <button
                                            className={styles.secondaryButton}
                                            onClick={() => setPreviewSample(sample)}
                                        >
                                            <Eye size={15} />
                                            Preview
                                        </button>

                                        <button
                                            className={styles.secondaryButton}
                                            onClick={() => recreateTemplate(sample)}
                                            disabled={isRecreating}
                                        >
                                            {isRecreating && selectedSampleId === sample.id ? (
                                                <Loader2 size={15} className={styles.spin} />
                                            ) : (
                                                <Sparkles size={15} />
                                            )}
                                            Recreate
                                        </button>
                                        {!sample.id.startsWith("demo-") && (
                                            <button
                                                className={styles.deleteSmallButton}
                                                onClick={() => deleteSample(sample)}
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </section>
            )}

            {activeTab === "cta" && (
                <section className={styles.ctaBuilderGrid}>
                    <section className={styles.ctaLibraryCard}>
                        <div className={styles.ctaSectionHeader}>
                            <div>
                                <h2>Your CTA buttons</h2>
                                <p>Create and reuse buttons across your emails.</p>
                            </div>
                            <button className={styles.primaryButton} onClick={createNewCta}>
                                <Plus size={15} />
                                New CTA
                            </button>
                        </div>

                        <div className={styles.ctaList}>
                            {savedCtas.map((cta) => (
                                <button
                                    type="button"
                                    key={cta.id}
                                    className={`${styles.ctaListItem} ${selectedCtaId === cta.id ? styles.ctaListItemActive : ""}`}
                                    onClick={() => selectCta(cta)}
                                >
                                    <span
                                        className={styles.ctaColourDot}
                                        style={{ background: cta.variant === "primary" ? cta.colour : "#ffffff", borderColor: cta.colour }}
                                    />
                                    <span className={styles.ctaListCopy}>
                                        <strong>{cta.name}</strong>
                                        <small>{cta.link}</small>
                                    </span>
                                    {cta.isDefault && <span className={styles.defaultCtaBadge}>Default</span>}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className={styles.ctaEditorCard}>
                        <div className={styles.ctaSectionHeader}>
                            <div>
                                <h2>Edit CTA</h2>
                                <p>Customise the button without changing the email layout.</p>
                            </div>
                            <div className={styles.ctaHeaderActions}>
                                <button className={styles.iconButton} onClick={() => duplicateCta(ctaDraft)} title="Duplicate CTA">
                                    <Copy size={15} />
                                </button>
                                <button className={styles.iconButtonDanger} onClick={() => deleteCta(ctaDraft.id)} title="Delete CTA">
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        </div>

                        <div className={styles.ctaFields}>
                            <div className={styles.field}>
                                <label>CTA name</label>
                                <input value={ctaDraft.name} onChange={(e) => setCtaDraft((current) => ({ ...current, name: e.target.value }))} />
                            </div>
                            <div className={styles.field}>
                                <label>Button text</label>
                                <input value={ctaDraft.text} onChange={(e) => setCtaDraft((current) => ({ ...current, text: e.target.value }))} />
                            </div>
                            <div className={`${styles.field} ${styles.ctaFullField}`}>
                                <label>Destination link</label>
                                <div className={styles.ctaLinkField}>
                                    <Link2 size={15} />
                                    <input value={ctaDraft.link} onChange={(e) => setCtaDraft((current) => ({ ...current, link: e.target.value }))} placeholder="https://company.com/page" />
                                </div>
                            </div>
                        </div>

                        <div className={styles.ctaControlGroup}>
                            <span>Style</span>
                            <div className={styles.segmentedControl}>
                                {(["primary", "secondary", "outline", "text"] as const).map((variant) => (
                                    <button
                                        type="button"
                                        key={variant}
                                        className={ctaDraft.variant === variant ? styles.segmentedActive : ""}
                                        onClick={() => setCtaDraft((current) => ({ ...current, variant }))}
                                    >
                                        {variant === "text" ? "Text link" : variant.charAt(0).toUpperCase() + variant.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className={styles.ctaTwoColumns}>
                            <div className={styles.ctaControlGroup}>
                                <span>Button colour</span>
                                <div className={styles.colourInput}>
                                    <input type="color" value={ctaDraft.colour} onChange={(e) => setCtaDraft((current) => ({ ...current, colour: e.target.value }))} />
                                    <input value={ctaDraft.colour} onChange={(e) => setCtaDraft((current) => ({ ...current, colour: e.target.value }))} />
                                </div>
                            </div>
                            <div className={styles.ctaControlGroup}>
                                <span>Text colour</span>
                                <div className={styles.colourInput}>
                                    <input type="color" value={ctaDraft.textColour} onChange={(e) => setCtaDraft((current) => ({ ...current, textColour: e.target.value }))} />
                                    <input value={ctaDraft.textColour} onChange={(e) => setCtaDraft((current) => ({ ...current, textColour: e.target.value }))} />
                                </div>
                            </div>
                        </div>

                        <div className={styles.ctaTwoColumns}>
                            <div className={styles.ctaControlGroup}>
                                <span>Size</span>
                                <div className={styles.segmentedControl}>
                                    {(["small", "medium", "large"] as const).map((size) => (
                                        <button key={size} type="button" className={ctaDraft.size === size ? styles.segmentedActive : ""} onClick={() => setCtaDraft((current) => ({ ...current, size }))}>
                                            {size.charAt(0).toUpperCase() + size.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className={styles.ctaControlGroup}>
                                <span>Alignment</span>
                                <div className={styles.segmentedControl}>
                                    {(["left", "center", "right"] as const).map((alignment) => (
                                        <button key={alignment} type="button" className={ctaDraft.alignment === alignment ? styles.segmentedActive : ""} onClick={() => setCtaDraft((current) => ({ ...current, alignment }))}>
                                            {alignment.charAt(0).toUpperCase() + alignment.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className={styles.ctaControlGroup}>
                            <span>Corner radius <strong>{ctaDraft.radius}px</strong></span>
                            <input className={styles.radiusSlider} type="range" min="0" max="24" value={ctaDraft.radius} onChange={(e) => setCtaDraft((current) => ({ ...current, radius: Number(e.target.value) }))} />
                        </div>

                        <div className={styles.ctaEditorActions}>
                            <button className={styles.secondaryButtonFull} onClick={() => setDefaultCta(ctaDraft.id)}>
                                {ctaDraft.isDefault ? "Default CTA" : "Set as default"}
                            </button>
                            <button className={styles.secondaryButtonFull} onClick={saveCta}>
                                <Save size={15} />
                                Save CTA
                            </button>
                            <button className={styles.ctaPrimaryAction} onClick={() => applyCtaToEmail(ctaDraft)}>
                                Apply to email
                            </button>
                        </div>
                    </section>

                    <aside className={styles.ctaPreviewCard}>
                        <div className={styles.ctaSectionHeader}>
                            <div>
                                <h2>Preview</h2>
                                <p>This is how the CTA will look in an email.</p>
                            </div>
                        </div>

                        <div className={styles.ctaPreviewCanvas} style={{ textAlign: ctaDraft.alignment }}>
                            <a
                                href={ctaDraft.link || "#"}
                                onClick={(e) => e.preventDefault()}
                                className={styles.ctaPreviewButton}
                                style={{
                                    background: ctaDraft.variant === "primary" ? ctaDraft.colour : ctaDraft.variant === "secondary" ? "#f3f4f6" : "transparent",
                                    color: ctaDraft.variant === "primary" ? ctaDraft.textColour : ctaDraft.colour,
                                    border: ctaDraft.variant === "outline" ? `1px solid ${ctaDraft.colour}` : "1px solid transparent",
                                    borderRadius: `${ctaDraft.radius}px`,
                                    padding: ctaDraft.variant === "text" ? 0 : ctaDraft.size === "small" ? "9px 16px" : ctaDraft.size === "large" ? "14px 26px" : "12px 22px",
                                    fontSize: ctaDraft.size === "small" ? 12 : ctaDraft.size === "large" ? 14 : 13,
                                    textDecoration: ctaDraft.variant === "text" ? "underline" : "none",
                                }}
                            >
                                {ctaDraft.text || "Button text"}
                            </a>
                        </div>

                        <div className={styles.ctaPreviewEmail}>
                            <span>Hi Brooklyn,</span>
                            <p>Thanks for your response. I’ve added the recommended action below.</p>
                            <div style={{ textAlign: ctaDraft.alignment }}>
                                <span
                                    className={styles.ctaPreviewButton}
                                    style={{
                                        background: ctaDraft.variant === "primary" ? ctaDraft.colour : ctaDraft.variant === "secondary" ? "#f3f4f6" : "transparent",
                                        color: ctaDraft.variant === "primary" ? ctaDraft.textColour : ctaDraft.colour,
                                        border: ctaDraft.variant === "outline" ? `1px solid ${ctaDraft.colour}` : "1px solid transparent",
                                        borderRadius: `${ctaDraft.radius}px`,
                                        padding: ctaDraft.variant === "text" ? 0 : ctaDraft.size === "small" ? "9px 16px" : ctaDraft.size === "large" ? "14px 26px" : "12px 22px",
                                        fontSize: ctaDraft.size === "small" ? 12 : ctaDraft.size === "large" ? 14 : 13,
                                        textDecoration: ctaDraft.variant === "text" ? "underline" : "none",
                                    }}
                                >
                                    {ctaDraft.text || "Button text"}
                                </span>
                            </div>
                            <p>Let me know if you need anything else.</p>
                            <span>Best,<br />Sarah</span>
                        </div>
                    </aside>
                </section>
            )}

            {activeTab === "footer" && (
                <section className={styles.footerBuilderGrid}>
                    <section className={styles.footerSettingsCard}>
                        <div className={styles.footerCardHeader}>
                            <div>
                                <h2>Email footer</h2>
                                <p>Add a reusable footer to generated and saved emails.</p>
                            </div>

                            <label className={styles.footerToggle}>
                                <input
                                    type="checkbox"
                                    checked={footerSettings.enabled}
                                    onChange={(event) => updateFooterSetting("enabled", event.target.checked)}
                                />
                                <span />
                                Enable footer
                            </label>
                        </div>

                        <div className={styles.footerSection}>
                            <span className={styles.footerSectionLabel}>Content</span>

                            <div className={styles.footerField}>
                                <label>Company name</label>
                                <div className={styles.footerInputWithCheck}>
                                    <input
                                        value={footerSettings.companyName}
                                        onChange={(event) => updateFooterSetting("companyName", event.target.value)}
                                        placeholder="Your company"
                                    />
                                    <label className={styles.footerCheck}>
                                        <input
                                            type="checkbox"
                                            checked={footerSettings.showCompanyName}
                                            onChange={(event) => updateFooterSetting("showCompanyName", event.target.checked)}
                                        />
                                        Show company name
                                    </label>
                                </div>
                            </div>

                            <div className={styles.footerField}>
                                <label>Copyright text</label>
                                <div className={styles.footerInputWithCheck}>
                                    <input
                                        value={footerSettings.copyrightText}
                                        onChange={(event) => updateFooterSetting("copyrightText", event.target.value)}
                                        placeholder="© 2026 Your Company. All rights reserved."
                                    />
                                    <label className={styles.footerCheck}>
                                        <input
                                            type="checkbox"
                                            checked={footerSettings.showCopyright}
                                            onChange={(event) => updateFooterSetting("showCopyright", event.target.checked)}
                                        />
                                        Show copyright
                                    </label>
                                </div>
                            </div>

                            <div className={styles.footerTwoColumn}>
                                <div className={styles.footerField}>
                                    <label>Unsubscribe text</label>
                                    <input
                                        value={footerSettings.unsubscribeText}
                                        onChange={(event) => updateFooterSetting("unsubscribeText", event.target.value)}
                                    />
                                    <input
                                        value={footerSettings.unsubscribeLink}
                                        onChange={(event) => updateFooterSetting("unsubscribeLink", event.target.value)}
                                        placeholder="{{unsubscribe_link}}"
                                    />
                                    <label className={styles.footerCheck}>
                                        <input
                                            type="checkbox"
                                            checked={footerSettings.showUnsubscribe}
                                            onChange={(event) => updateFooterSetting("showUnsubscribe", event.target.checked)}
                                        />
                                        Show unsubscribe
                                    </label>
                                </div>

                                <div className={styles.footerField}>
                                    <label>Preferences text</label>
                                    <input
                                        value={footerSettings.preferencesText}
                                        onChange={(event) => updateFooterSetting("preferencesText", event.target.value)}
                                    />
                                    <input
                                        value={footerSettings.preferencesLink}
                                        onChange={(event) => updateFooterSetting("preferencesLink", event.target.value)}
                                        placeholder="{{preferences_link}}"
                                    />
                                    <label className={styles.footerCheck}>
                                        <input
                                            type="checkbox"
                                            checked={footerSettings.showPreferences}
                                            onChange={(event) => updateFooterSetting("showPreferences", event.target.checked)}
                                        />
                                        Show update preferences
                                    </label>
                                </div>
                            </div>

                            <div className={styles.footerField}>
                                <label>Separator</label>
                                <select
                                    value={footerSettings.separator}
                                    onChange={(event) =>
                                        updateFooterSetting(
                                            "separator",
                                            event.target.value as FooterSettings["separator"],
                                        )
                                    }
                                >
                                    <option value="|">|</option>
                                    <option value="·">·</option>
                                    <option value="—">—</option>
                                </select>
                            </div>
                        </div>

                        <div className={styles.footerSection}>
                            <span className={styles.footerSectionLabel}>Style</span>

                            <div className={styles.footerStyleGrid}>
                                <div className={styles.footerField}>
                                    <label>Alignment</label>
                                    <div className={styles.footerSegmented}>
                                        {(["left", "center", "right"] as const).map((alignment) => (
                                            <button
                                                type="button"
                                                key={alignment}
                                                className={footerSettings.alignment === alignment ? styles.footerSegmentActive : ""}
                                                onClick={() => updateFooterSetting("alignment", alignment)}
                                            >
                                                {alignment.charAt(0).toUpperCase() + alignment.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className={styles.footerField}>
                                    <label>Text colour</label>
                                    <div className={styles.footerColourInput}>
                                        <input
                                            type="color"
                                            value={footerSettings.textColour}
                                            onChange={(event) => updateFooterSetting("textColour", event.target.value)}
                                        />
                                        <input
                                            value={footerSettings.textColour}
                                            onChange={(event) => updateFooterSetting("textColour", event.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className={styles.footerField}>
                                    <label>Text size</label>
                                    <select
                                        value={footerSettings.textSize}
                                        onChange={(event) =>
                                            updateFooterSetting(
                                                "textSize",
                                                event.target.value as FooterSettings["textSize"],
                                            )
                                        }
                                    >
                                        <option value="11px">11px</option>
                                        <option value="12px">12px</option>
                                        <option value="13px">13px</option>
                                    </select>
                                </div>
                            </div>

                            <div className={styles.footerDividerRow}>
                                <label className={styles.footerCheck}>
                                    <input
                                        type="checkbox"
                                        checked={footerSettings.showDivider}
                                        onChange={(event) => updateFooterSetting("showDivider", event.target.checked)}
                                    />
                                    Show top divider
                                </label>

                                <div className={styles.footerColourInput}>
                                    <input
                                        type="color"
                                        value={footerSettings.dividerColour}
                                        onChange={(event) => updateFooterSetting("dividerColour", event.target.value)}
                                    />
                                    <input
                                        value={footerSettings.dividerColour}
                                        onChange={(event) => updateFooterSetting("dividerColour", event.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className={styles.footerPlaceholderNote}>
                            <Link2 size={16} />
                            <div>
                                <strong>Dynamic placeholders</strong>
                                <p>
                                    Recipient-specific links replace {"{{unsubscribe_link}}"} and
                                    {" {{preferences_link}}"} when the email is sent.
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            className={styles.footerSaveButton}
                            onClick={saveFooterSettings}
                        >
                            <Save size={15} />
                            Save footer settings
                        </button>
                    </section>

                    <aside className={styles.footerPreviewCard}>
                        <div className={styles.footerPreviewHeader}>
                            <div>
                                <h2>Footer preview</h2>
                                <p>This is how the footer will appear in emails.</p>
                            </div>
                        </div>

                        <div className={styles.footerEmailPreview}>
                            <p>Hi Sarah,</p>
                            <p>Just checking in to see how things are going with your account.</p>
                            <p>We’re here if you need anything.</p>

                            <div className={styles.footerPreviewCta}>
                                <span>View dashboard</span>
                            </div>

                            <p>Thanks,<br />The {footerSettings.companyName || "Company"} Team</p>

                            {footerSettings.enabled && (
                                <div
                                    className={styles.footerPreviewFooter}
                                    style={{
                                        textAlign: footerSettings.alignment,
                                        color: footerSettings.textColour,
                                        fontSize: footerSettings.textSize,
                                    }}
                                >
                                    {footerSettings.showDivider && (
                                        <div
                                            className={styles.footerPreviewDivider}
                                            style={{ background: footerSettings.dividerColour }}
                                        />
                                    )}
                                    {footerSettings.showCompanyName && footerSettings.companyName && (
                                        <div>{footerSettings.companyName}</div>
                                    )}
                                    {footerSettings.showCopyright && footerSettings.copyrightText && (
                                        <div>{footerSettings.copyrightText}</div>
                                    )}
                                    {(footerSettings.showUnsubscribe || footerSettings.showPreferences) && (
                                        <div>
                                            {footerSettings.showUnsubscribe && footerSettings.unsubscribeText}
                                            {footerSettings.showUnsubscribe && footerSettings.showPreferences && (
                                                <span className={styles.footerPreviewSeparator}>
                                                    {footerSettings.separator}
                                                </span>
                                            )}
                                            {footerSettings.showPreferences && footerSettings.preferencesText}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className={styles.footerAppliedNote}>
                            <Sparkles size={17} />
                            <div>
                                <strong>Automatically applied</strong>
                                <p>Used in generated emails, saved emails and master templates.</p>
                            </div>
                        </div>
                    </aside>
                </section>
            )}

            {activeTab === "generate" && (
                <section className={styles.generateStudio}>
                    <section className={styles.editStudioCard}>
                        <div className={styles.studioHeader}>
                            <div>
                                <h2>Edit your email</h2>
                                <p>Customize the content and see the preview update in real-time.</p>
                            </div>

                            <div className={styles.studioHeaderActions}>
                                <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    onClick={() => selectedSample && setPreviewSample(selectedSample)}
                                    disabled={!selectedSample}
                                >
                                    <Eye size={15} />
                                    View sample
                                </button>
                            </div>
                        </div>

                        {masterTemplates.length > 0 && (
                            <div className={styles.studioField}>
                                <label>Use saved template</label>
                                <select
                                    value={selectedMasterId}
                                    onChange={(e) => {
                                        const template = masterTemplates.find((item) => item.id === e.target.value);
                                        if (template) useMasterTemplate(template);
                                        else setSelectedMasterId("");
                                    }}
                                >
                                    <option value="">Choose a template</option>
                                    {masterTemplates.map((template) => (
                                        <option key={template.id} value={template.id}>
                                            {template.title}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className={styles.studioFieldGrid}>
                            <div className={styles.studioField}>
                                <label>Subject</label>
                                <input
                                    value={editableEmail.subject}
                                    onChange={(e) => updateEditableEmail("subject", e.target.value)}
                                />
                            </div>

                            <div className={styles.studioField}>
                                <label>
                                    Heading
                                    <span>{editableEmail.heading.length}/80</span>
                                </label>
                                <input
                                    value={editableEmail.heading}
                                    onChange={(e) => updateEditableEmail("heading", e.target.value)}
                                />
                            </div>

                            <div className={`${styles.studioField} ${styles.studioFullField}`}>
                                <label>
                                    Body
                                    <span>{editableEmail.body.length}/2000</span>
                                </label>
                                <textarea
                                    value={editableEmail.body}
                                    onChange={(e) => updateEditableEmail("body", e.target.value)}
                                />
                            </div>

                            <div className={styles.studioField}>
                                <label>
                                    CTA Text
                                    <span>{editableEmail.ctaText.length}/40</span>
                                </label>
                                <input
                                    value={editableEmail.ctaText}
                                    onChange={(e) => updateEditableEmail("ctaText", e.target.value)}
                                />
                            </div>

                            <div className={styles.studioField}>
                                <label>CTA Link</label>
                                <input
                                    value={editableEmail.ctaLink}
                                    onChange={(e) => updateEditableEmail("ctaLink", e.target.value)}
                                />
                            </div>

                            <div className={`${styles.studioField} ${styles.studioFullField}`}>
                                <label>
                                    AI Instructions Optional
                                    <span>{prompt.length}/2000</span>
                                </label>
                                <textarea
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder="Example: Personalise this email for an inactive customer."
                                />
                            </div>
                        </div>

                        <div className={styles.studioActions}>
                            <button
                                className={styles.secondaryButtonFull}
                                onClick={generatePersonalisedCopy}
                                disabled={isGenerating}
                            >
                                {isGenerating ? <Loader2 size={16} className={styles.spin} /> : <Sparkles size={16} />}
                                {isGenerating ? "Generating..." : "Generate new version"}
                            </button>

                            <button
                                className={styles.secondaryButtonFull}
                                onClick={saveMasterTemplate}
                                disabled={isSavingMaster}
                            >
                                {isSavingMaster ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />}
                                {isSavingMaster ? "Saving..." : "Save as template"}
                            </button>

                            <button
                                className={styles.purpleButtonFull}
                                onClick={savePersonalisedEmail}
                                disabled={isSavingEmail}
                            >
                                {isSavingEmail ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />}
                                {isSavingEmail ? "Saving..." : "Save personalised email"}
                            </button>
                        </div>
                    </section>

                    <section className={styles.livePreviewCard}>
                        <div className={styles.studioHeader}>
                            <div>
                                <h2>Live preview</h2>
                                <p>This is how your email will look to your recipients.</p>
                            </div>
                        </div>

                        <div className={styles.livePreviewShell}>
                            <div className={styles.livePreviewInner}>
                                <div dangerouslySetInnerHTML={{ __html: emailHtml }} />
                            </div>
                        </div>
                    </section>
                </section>
            )}

            {activeTab === "saved" && (
                <section className={styles.savedCard}>
                    <div className={styles.cardTop}>
                        <div>
                            <h2>Saved personalised emails</h2>
                            <p>Open, edit, and reuse generated emails.</p>
                        </div>

                        <span className={styles.softBadge}>{savedEmails.length} saved</span>
                    </div>

                    {savedEmails.length > 0 ? (
                        <div className={styles.tableWrap}>
                            <table className={styles.emailTable}>
                                <thead>
                                    <tr>
                                        <th>Type</th>
                                        <th>Subject</th>
                                        <th>Preview</th>
                                        <th>Created</th>
                                        <th />
                                    </tr>
                                </thead>

                                <tbody>
                                    {savedEmails.map((email) => (
                                        <tr key={email.id}>
                                            <td>{email.emailType}</td>
                                            <td>{email.subject}</td>
                                            <td>{(email.plainText || stripHtml(stripAgentMeta(email.html))).slice(0, 90)}...</td>
                                            <td>{formatDate(email.createdAt)}</td>
                                            <td>
                                                <button
                                                    className={styles.tableButton}
                                                    onClick={() => setViewSavedEmail(email)}
                                                >
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className={styles.emptyState}>
                            <FileText size={22} />
                            <h3>No saved emails yet</h3>
                            <p>Generate and save your first personalised email.</p>
                        </div>
                    )}
                </section>
            )}

            {viewSavedEmail && (
                <div className={styles.modalOverlay}>
                    <section className={styles.savedEmailModal}>
                        <button
                            className={styles.closeButton}
                            onClick={() => setViewSavedEmail(null)}
                        >
                            <X size={18} />
                        </button>

                        <div className={styles.modalHeader}>
                            <span className={styles.badge}>
                                <FileText size={14} />
                                Saved email
                            </span>

                            <h2>{viewSavedEmail.subject}</h2>
                            <p>{formatDate(viewSavedEmail.createdAt)}</p>
                        </div>

                        <div className={styles.savedEmailPreview}>
                            <iframe
                                title="Saved email preview"
                                srcDoc={stripAgentMeta(viewSavedEmail.html)}
                                className={styles.emailPreviewFrame}
                            />
                        </div>

                        <div className={styles.modalActions}>
                            <button
                                className={styles.secondaryButtonFull}
                                onClick={() => {
                                    openSavedEmail(viewSavedEmail);
                                    setViewSavedEmail(null);
                                }}
                            >
                                Edit this email
                            </button>

                            <button
                                className={styles.deleteButton}
                                onClick={async () => {
                                    if (!confirm("Delete this saved email?")) return;

                                    try {
                                        const res = await fetch(
                                            `/api/email-agent/generated?id=${encodeURIComponent(viewSavedEmail.id)}`,
                                            { method: "DELETE" }
                                        );

                                        if (!res.ok) throw new Error("Failed to delete email");

                                        setSavedEmails((prev) => prev.filter((email) => email.id !== viewSavedEmail.id));
                                        setViewSavedEmail(null);
                                        setMessage("Email deleted.");
                                    } catch (error) {
                                        console.error(error);
                                        setMessage("Could not delete email.");
                                    }
                                }}
                            >
                                Delete email
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {previewSample && (
                <div className={styles.modalOverlay}>
                    <section className={styles.previewModal}>
                        <button className={styles.closeButton} onClick={() => setPreviewSample(null)}>
                            <X size={18} />
                        </button>

                        <div className={styles.modalHeader}>
                            <span className={styles.badge}>
                                <Image size={14} />
                                Email sample
                            </span>
                            <h2>{previewSample.title}</h2>
                            <p>{formatDate(previewSample.createdAt)}</p>
                        </div>

                        <img
                            src={previewSample.imageUrl}
                            alt={previewSample.title}
                            className={styles.previewLargeImage}
                        />
                    </section>
                </div>
            )}
        </main>
    );
}
