"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Newsreader } from "next/font/google";
import {
    ArrowUp,
    Check,
    ChevronRight,
    GitBranch,
    Paperclip,
    Plug,
    Search,
    Sparkles,
    X,
} from "lucide-react";

import styles from "./workflow-starter.module.css";

const serif = Newsreader({
    subsets: ["latin"],
    weight: ["500"],
    display: "swap",
});

export type StarterIntegration = {
    provider: string;
    name: string;
    status: string;
    connected: boolean;
};

export type StarterTemplate = {
    id: string;
    title: string;
    description: string;
    prompt: string;
};

type Attachment = { id: string; name: string; size: number };

type Props = {
    greeting: string;
    prompt: string;
    onPromptChange: (value: string) => void;
    onSubmit: () => void;
    building: boolean;

    providerName: string;
    providerLogo: ReactNode;

    attachments: Attachment[];
    formatSize: (bytes: number) => string;
    onAttach: () => void;
    onRemoveAttachment: (id: string) => void;

    integrations: StarterIntegration[];
    connectedCount: number;
    loadingProvider: string | null;
    renderIntegrationLogo: (integration: StarterIntegration, size: number) => ReactNode;
    onToggleIntegration: (integration: StarterIntegration) => void;
    onManageIntegrations: () => void;
    integrationsMenuOpen: boolean;
    onIntegrationsMenuOpenChange: (open: boolean) => void;
    integrationsMenuRef: RefObject<HTMLSpanElement | null>;

    onStartFromScratch: () => void;

    unfinishedWorkflow: { id: string; stepCount: number; updatedAt: string } | null;
    onContinueWorkflow: (id: string) => void;

    templates: StarterTemplate[];
    renderTemplateIcons: (template: StarterTemplate) => ReactNode;
};

/** Empty-workflow screen: describe an automation and OpenClaw builds it. */
export default function WorkflowStarter(props: Props) {
    const {
        greeting, prompt, onPromptChange, onSubmit, building,
        providerName, providerLogo,
        attachments, formatSize, onAttach, onRemoveAttachment,
        integrations, connectedCount, loadingProvider, renderIntegrationLogo,
        onToggleIntegration, onManageIntegrations,
        integrationsMenuOpen, onIntegrationsMenuOpenChange, integrationsMenuRef,
        onStartFromScratch,
        unfinishedWorkflow, onContinueWorkflow,
        templates, renderTemplateIcons,
    } = props;

    const [query, setQuery] = useState("");
    const templatesRef = useRef<HTMLDivElement | null>(null);

    const canSend = (prompt.trim().length > 0 || attachments.length > 0) && !building;

    const { connected, available } = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const matching = needle
            ? integrations.filter((item) => item.name.toLowerCase().includes(needle))
            : integrations;
        return {
            connected: matching.filter((item) => item.connected),
            available: matching.filter((item) => !item.connected),
        };
    }, [integrations, query]);

    const notConnected = integrations.filter((item) => !item.connected && item.status === "Available");

    useEffect(() => {
        if (!integrationsMenuOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onIntegrationsMenuOpenChange(false);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [integrationsMenuOpen, onIntegrationsMenuOpenChange]);

    function renderIntegrationRow(integration: StarterIntegration) {
        const isLoading = loadingProvider === integration.provider;
        const isAvailable = integration.connected || integration.status === "Available";
        return (
            <button
                key={integration.provider}
                type="button"
                role="menuitemcheckbox"
                aria-checked={integration.connected}
                disabled={isLoading || !isAvailable}
                className={styles.menuItem}
                onClick={() => onToggleIntegration(integration)}
            >
                <span className={styles.menuItemLogo}>{renderIntegrationLogo(integration, 16)}</span>
                <span className={styles.menuItemLabel}>{integration.name}</span>
                {!isAvailable && <span className={styles.menuItemBadge}>Soon</span>}
                <span className={`${styles.toggle} ${integration.connected ? styles.toggleOn : ""}`} aria-hidden="true" />
            </button>
        );
    }

    return (
        <div className={styles.starter}>
            <div className={styles.glow} aria-hidden="true" />

            <header className={styles.intro}>
                <h1 className={serif.className}>{greeting}</h1>
                <p>Describe an automation in plain words and {providerName} builds the workflow for you.</p>
            </header>


            <div className={styles.tray}>
                <div className={styles.composer}>
                    <div className={styles.composerBody}>
                        <Sparkles size={16} className={styles.sparkle} aria-hidden="true" />
                        <textarea
                            aria-label="Describe what you want to automate"
                            value={prompt}
                            onChange={(event) => onPromptChange(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    if (canSend) onSubmit();
                                }
                            }}
                            placeholder="Describe what you want to automate…"
                            rows={3}
                            autoFocus
                        />
                    </div>

                    <div className={styles.composerFooter}>
                        <div className={styles.composerTags}>
                          
                            {attachments.map((attachment) => (
                                <span key={attachment.id} className={styles.fileTag}>
                                    <Paperclip size={11} aria-hidden="true" />
                                    <span className={styles.fileName}>{attachment.name}</span>
                                    <span className={styles.fileSize}>{formatSize(attachment.size)}</span>
                                    <button
                                        type="button"
                                        aria-label={`Remove ${attachment.name}`}
                                        onClick={() => onRemoveAttachment(attachment.id)}
                                    >
                                        <X size={11} />
                                    </button>
                                </span>
                            ))}
                        </div>



                        <button
                            type="button"
                            className={styles.send}
                            aria-label="Build workflow"
                            title="Build workflow"
                            disabled={!canSend}
                            onClick={onSubmit}
                        >
                            {building ? <span className={styles.sendSpinner} /> : <ArrowUp size={16} />}
                        </button>
                    </div>
                </div>

                <div className={styles.trayBar}>
                    <span className={styles.provider}>
                        {providerLogo}
                        {providerName}
                    </span>

                    <div className={styles.trayActions}>
                        <button type="button" className={styles.trayButton} onClick={onAttach}>
                            <Paperclip size={13} aria-hidden="true" />
                            Attach files
                        </button>

                        <span ref={integrationsMenuRef} className={styles.menuAnchor}>
                            <button
                                type="button"
                                className={`${styles.trayButton} ${integrationsMenuOpen ? styles.trayButtonOpen : ""}`}
                                aria-haspopup="menu"
                                aria-expanded={integrationsMenuOpen}
                                onClick={() => onIntegrationsMenuOpenChange(!integrationsMenuOpen)}
                            >
                                <Plug size={13} aria-hidden="true" />
                                Connect apps
                                {connectedCount > 0 && <span className={styles.count}>{connectedCount}</span>}
                            </button>

                            {integrationsMenuOpen && (
                                <div className={styles.menu} role="menu" aria-label="Connect apps">
                                    <label className={styles.menuSearch}>
                                        <Search size={13} aria-hidden="true" />
                                        <input
                                            value={query}
                                            onChange={(event) => setQuery(event.target.value)}
                                            placeholder="Search apps…"
                                            aria-label="Search apps"
                                            autoFocus
                                        />
                                    </label>

                                    <div className={styles.menuScroll}>
                                        {connected.length > 0 && (
                                            <div className={styles.menuSection}>
                                                <span className={styles.menuSectionLabel}>Connected</span>
                                                {connected.map(renderIntegrationRow)}
                                            </div>
                                        )}
                                        {available.length > 0 && (
                                            <div className={styles.menuSection}>
                                                <span className={styles.menuSectionLabel}>Available</span>
                                                {available.map(renderIntegrationRow)}
                                            </div>
                                        )}
                                        {connected.length + available.length === 0 && (
                                            <p className={styles.menuEmpty}>No apps match “{query}”.</p>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        className={styles.menuFooter}
                                        onClick={() => {
                                            onIntegrationsMenuOpenChange(false);
                                            onManageIntegrations();
                                        }}
                                    >
                                        <Plug size={14} aria-hidden="true" />
                                        Manage integrations
                                        <ChevronRight size={14} className={styles.menuFooterChevron} aria-hidden="true" />
                                    </button>
                                </div>
                            )}
                        </span>
                    </div>
                </div>
            </div>

            {notConnected.length > 0 && (
                <button
                    type="button"
                    className={styles.connectStrip}
                    onClick={() => onIntegrationsMenuOpenChange(true)}
                >
                    <span>Connect your tools so {providerName} can use them in workflows</span>
                    <span className={styles.logoStack} aria-hidden="true">
                        {notConnected.slice(0, 3).map((integration) => (
                            <span key={integration.provider}>{renderIntegrationLogo(integration, 14)}</span>
                        ))}
                        {notConnected.length > 3 && <em>{notConnected.length - 3}+</em>}
                    </span>
                    <ChevronRight size={14} aria-hidden="true" />
                </button>
            )}

            <div className={styles.manualRow}>
                <span>Prefer to build it yourself?</span>
                <button type="button" className={styles.manualButton} onClick={onStartFromScratch}>
                    Start from scratch
                    <ChevronRight size={14} aria-hidden="true" />
                </button>
            </div>

            {unfinishedWorkflow && (
                <div className={styles.continueCard}>
                    <span className={styles.continueIcon}><GitBranch size={15} /></span>
                    <div className={styles.continueCopy}>
                        <strong>Continue building your workflow</strong>
                        <span>
                            Last edited {new Date(unfinishedWorkflow.updatedAt).toLocaleDateString([], { day: "numeric", month: "short" })}
                            {" · "}
                            {unfinishedWorkflow.stepCount} {unfinishedWorkflow.stepCount === 1 ? "step" : "steps"}
                        </span>
                    </div>
                    <button type="button" className={styles.continueButton} onClick={() => onContinueWorkflow(unfinishedWorkflow.id)}>
                        Continue
                        <ChevronRight size={14} />
                    </button>
                </div>
            )}

            {templates.length > 0 && (
                <section ref={templatesRef} className={styles.templates} aria-label="Templates">
                    <h2>Start from a template</h2>
                    <div className={styles.templateList}>
                        {templates.map((template) => (
                            <button
                                key={template.id}
                                type="button"
                                className={`${styles.template} ${prompt === template.prompt ? styles.templateActive : ""}`}
                                onClick={() => onPromptChange(template.prompt)}
                            >
                                <span className={styles.templateIcons}>{renderTemplateIcons(template)}</span>
                                <span className={styles.templateCopy}>
                                    <strong>{template.title}</strong>
                                    <span>{template.description}</span>
                                </span>
                                {prompt === template.prompt
                                    ? <Check size={14} className={styles.templateCheck} aria-hidden="true" />
                                    : <ChevronRight size={14} className={styles.templateArrow} aria-hidden="true" />}
                            </button>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
