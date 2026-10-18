"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
    Blocks,
    CircleStop,
    Clock3,
    GitBranch,
    History,
    Mail,
    MailOpen,
    Maximize2,
    Minus,
    MousePointerClick,
    PanelLeftClose,
    Plus,
    Reply,
    Search,
    Sparkles,
    Tag,
    UserPlus,
    Webhook,
    Zap,
    CalendarClock,
    CreditCard,
    MailWarning,
    ChevronRight,
} from "lucide-react";

import type { ZoomControls } from "./FlowBuilder";
import styles from "./builder-sidebar.module.css";

export type SidebarTab = "steps" | "triggers" | "integrations" | "ai";

type StepType = "trigger" | "email" | "delay" | "condition" | "action";

type Integration = { provider: string; name: string; connected: boolean; logo: ReactNode };

type Props = {
    tab: SidebarTab | null;
    onTabChange: (tab: SidebarTab | null) => void;
    hasTrigger: boolean;
    targetLabel: string | null;
    onAdd: (type: StepType, presetId: string) => void;
    integrations: Integration[];
    onManageIntegrations: () => void;
    aiPanel: ReactNode;
    runsOpen: boolean;
    onToggleRuns: () => void;
    zoom: ZoomControls;
};

type Item = { id: string; type: StepType; label: string; icon: typeof Zap; hint: string };

const TRIGGER_GROUPS: Array<{ label: string; items: Item[] }> = [
    {
        label: "Contacts",
        items: [
            { id: "trigger-contact-added", type: "trigger", label: "New contact added", icon: UserPlus, hint: "A contact is created" },
            { id: "trigger-tag-added", type: "trigger", label: "Tag added", icon: Tag, hint: "A contact gets a tag" },
            { id: "trigger-renewal-upcoming", type: "trigger", label: "Renewal coming up", icon: CalendarClock, hint: "Days before renewal" },
        ],
    },
    {
        label: "Email activity",
        items: [
            { id: "trigger-email-opened", type: "trigger", label: "Email opened", icon: MailOpen, hint: "First open of any email" },
            { id: "trigger-email-clicked", type: "trigger", label: "Link clicked", icon: MousePointerClick, hint: "First click in any email" },
            { id: "trigger-reply-received", type: "trigger", label: "Reply received", icon: Reply, hint: "A contact replies" },
            { id: "trigger-email-bounced", type: "trigger", label: "Email bounced", icon: MailWarning, hint: "An email bounces" },
        ],
    },
    {
        label: "From your apps",
        items: [
            { id: "trigger-payment-failed", type: "trigger", label: "Payment failed", icon: CreditCard, hint: "Sent by Stripe via Zapier" },
            { id: "trigger-custom-event", type: "trigger", label: "Custom event", icon: Webhook, hint: "Any named event" },
        ],
    },
];

const OUTPUT_ITEMS: Item[] = [
    { id: "email-send", type: "email", label: "Send email", icon: Mail, hint: "Email the contact" },
];

const LOGIC_ITEMS: Item[] = [
    { id: "condition", type: "condition", label: "If / Else", icon: GitBranch, hint: "Branch on email activity" },
    { id: "delay", type: "delay", label: "Delay", icon: Clock3, hint: "Wait before continuing" },
];

const CONTACT_ITEMS: Item[] = [
    { id: "action-add-tag", type: "action", label: "Add tag", icon: Tag, hint: "Tag the contact" },
    { id: "action-stop", type: "action", label: "End workflow", icon: CircleStop, hint: "Stop for this contact" },
];

const RAIL: Array<{ tab: SidebarTab; label: string; icon: typeof Zap }> = [
    { tab: "steps", label: "Add step", icon: Plus },
    { tab: "triggers", label: "Triggers", icon: Zap },
    { tab: "integrations", label: "Integrations", icon: Blocks },
    { tab: "ai", label: "AI assistant", icon: Sparkles },
];

/** Icon rail plus the panel it opens: steps, triggers, integrations, AI. */
export default function BuilderSidebar(props: Props) {
    const { tab, onTabChange, hasTrigger, targetLabel, onAdd, integrations, onManageIntegrations, aiPanel, runsOpen, onToggleRuns, zoom } = props;
    const [query, setQuery] = useState("");

    const match = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return (item: Item) => !needle || `${item.label} ${item.hint}`.toLowerCase().includes(needle);
    }, [query]);

    function row(item: Item, disabled = false) {
        const Icon = item.icon;
        return (
            <button
                key={item.id}
                type="button"
                className={styles.row}
                data-type={item.type}
                disabled={disabled}
                title={disabled ? "This workflow already has a trigger" : item.hint}
                onClick={() => onAdd(item.type, item.id)}
            >
                <span className={styles.rowIcon} aria-hidden="true"><Icon size={15} /></span>
                <span className={styles.rowCopy}>
                    <strong>{item.label}</strong>
                    <span>{item.hint}</span>
                </span>
                <Plus size={15} className={styles.rowPlus} aria-hidden="true" />
            </button>
        );
    }

    function chips(items: Item[]) {
        const visible = items.filter(match);
        if (!visible.length) return null;
        return (
            <div className={styles.chips}>
                {visible.map((item) => {
                    const Icon = item.icon;
                    return (
                        <button key={item.id} type="button" className={styles.chip} data-type={item.type} title={item.hint} onClick={() => onAdd(item.type, item.id)}>
                            <span className={styles.chipIcon} aria-hidden="true"><Icon size={14} /></span>
                            {item.label}
                        </button>
                    );
                })}
            </div>
        );
    }

    function section(label: string, content: ReactNode) {
        if (!content || (Array.isArray(content) && content.length === 0)) return null;
        return (
            <section key={label} className={styles.section}>
                <h3>{label}</h3>
                {content}
            </section>
        );
    }

    const title =
        tab === "steps" ? "Add step" :
            tab === "triggers" ? "Add trigger" :
                tab === "integrations" ? "Integrations" :
                    tab === "ai" ? "AI assistant" : "";

    return (
        <div className={styles.sidebar}>
            <nav className={styles.rail} aria-label="Builder tools">
                {RAIL.map((item) => {
                    const Icon = item.icon;
                    const active = tab === item.tab;
                    return (
                        <button
                            key={item.tab}
                            type="button"
                            className={active ? styles.railActive : styles.railButton}
                            aria-label={item.label}
                            aria-pressed={active}
                            title={item.label}
                            onClick={() => onTabChange(active ? null : item.tab)}
                        >
                            <Icon size={18} />
                        </button>
                    );
                })}
                <span className={styles.railSpacer} />

                <div className={styles.zoom} role="group" aria-label="Canvas zoom">
                    <button type="button" className={styles.zoomButton} onClick={zoom.zoomIn} aria-label="Zoom in" title="Zoom in">
                        <Plus size={15} />
                    </button>
                    <span className={styles.zoomValue} aria-live="polite">{Math.round(zoom.zoom * 100)}%</span>
                    <button type="button" className={styles.zoomButton} onClick={zoom.zoomOut} aria-label="Zoom out" title="Zoom out">
                        <Minus size={15} />
                    </button>
                    <button
                        type="button"
                        className={zoom.autoFit ? styles.zoomFitActive : styles.zoomButton}
                        onClick={zoom.fit}
                        aria-label="Fit to screen"
                        aria-pressed={zoom.autoFit}
                        title="Fit to screen"
                    >
                        <Maximize2 size={14} />
                    </button>
                </div>
                <button
                    type="button"
                    className={runsOpen ? styles.railActive : styles.railButton}
                    aria-label="Runs"
                    aria-pressed={runsOpen}
                    title="Runs"
                    onClick={onToggleRuns}
                >
                    <History size={18} />
                </button>
            </nav>

            {/* The assistant brings its own header, so it fills the panel. */}
            {tab === "ai" && <div className={`${styles.panel} ${styles.panelWide}`}>{aiPanel}</div>}

            {tab && tab !== "ai" && (
                <div className={styles.panel}>
                    <div className={styles.panelHead}>
                        <h2>{title}</h2>
                        <button type="button" className={styles.collapse} onClick={() => onTabChange(null)} aria-label="Close panel" title="Close panel">
                            <PanelLeftClose size={16} />
                        </button>
                    </div>

                    {(tab === "steps" || tab === "triggers") && (
                        <>
                            <label className={styles.search}>
                                <Search size={14} aria-hidden="true" />
                                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search…" aria-label="Search" />
                            </label>
                            {targetLabel && tab === "steps" && (
                                <p className={styles.target}>Adds after <strong>{targetLabel}</strong></p>
                            )}
                            {tab === "triggers" && hasTrigger && (
                                <p className={styles.target}>This workflow already has a trigger. Click its card to change it.</p>
                            )}
                        </>
                    )}

                    <div className={styles.scroll}>
                        {tab === "triggers" && TRIGGER_GROUPS.map((group) => {
                            const items = group.items.filter(match);
                            return section(group.label, items.length ? items.map((item) => row(item, hasTrigger)) : null);
                        })}

                        {tab === "steps" && (
                            <>
                                {section("Output", OUTPUT_ITEMS.filter(match).length ? OUTPUT_ITEMS.filter(match).map((item) => row(item)) : null)}
                                {section("Logic", chips(LOGIC_ITEMS))}
                                {section("Contacts", chips(CONTACT_ITEMS))}
                                {!query && section("Generate workflow", (
                                    <button type="button" className={styles.generate} onClick={() => onTabChange("ai")}>
                                        <span className={styles.generateIcon} aria-hidden="true"><Sparkles size={15} /></span>
                                        <span className={styles.rowCopy}>
                                            <strong>Describe it to AI</strong>
                                            <span>OpenClaw builds or edits the steps for you</span>
                                        </span>
                                        <ChevronRight size={15} className={styles.rowPlus} aria-hidden="true" />
                                    </button>
                                ))}
                            </>
                        )}

                        {tab === "integrations" && (
                            <>
                                {section("Your apps", integrations.length ? integrations.map((integration) => (
                                    <div key={integration.provider} className={styles.integration}>
                                        <span className={styles.integrationLogo} aria-hidden="true">{integration.logo}</span>
                                        <span className={styles.rowCopy}>
                                            <strong>{integration.name}</strong>
                                            <span>{integration.connected ? "Connected" : "Not connected"}</span>
                                        </span>
                                        <span className={integration.connected ? styles.dotOn : styles.dotOff} aria-hidden="true" />
                                    </div>
                                )) : <p className={styles.empty}>No apps connected yet.</p>)}
                                <button type="button" className={styles.manage} onClick={onManageIntegrations}>
                                    Manage integrations
                                    <ChevronRight size={14} aria-hidden="true" />
                                </button>
                                <p className={styles.footnote}>Emails send through your Resend connection. Other apps can start workflows with events from Zapier.</p>
                            </>
                        )}

                    </div>
                </div>
            )}
        </div>
    );
}
