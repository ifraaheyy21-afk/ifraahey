"use client";

/* Integrations, modelled on the "Integrations Page - CRM Dashboard" Dribbble
   shot: title, a status switcher with search, then titled category sections
   in a full-width three-column grid of cards (logo, name, description, and a
   footer with buttons and a toggle). */

import { use, useEffect, useMemo, useState } from "react";

import {
    CATEGORIES,
    INTEGRATIONS,
    favicon,
    type IntegrationEntry,
} from "../../../lib/integrations-catalogue";
import styles from "./integrations-page.module.css";

type ConnectedIntegration = {
    provider: string;
    status: string;
};

type StatusFilter = "all" | "connected" | "disconnected";

const STATUS_TABS: { id: StatusFilter; label: string; short?: string }[] = [
    { id: "all", label: "All applications", short: "All" },
    { id: "connected", label: "Connected" },
    { id: "disconnected", label: "Not connected" },
];

const REQUEST_EMAIL = "support@mailgine.com";

function requestHref(name?: string) {
    const subject = name ? `Integration request: ${name}` : "Integration request";
    return `mailto:${REQUEST_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

function nameFor(id: string) {
    return INTEGRATIONS.find((item) => item.id === id)?.name ?? id.replace(/_/g, " ");
}

function categoryLabel(item: IntegrationEntry) {
    return CATEGORIES.find((entry) => entry.id === item.category)?.label ?? "";
}

/* Decorative logo wall beside the title. Three rows of up to 24 tiles; CSS
   shows as many columns as fit, so the wall always ends flush with the
   page's right edge. Each row starts at a different point in the list so
   repeats don't line up. */
const MOSAIC = Array.from({ length: 72 }, (_, index) => {
    const row = Math.floor(index / 24);
    return INTEGRATIONS[(index + row * 7) % INTEGRATIONS.length];
});

function handleLogoError(event: React.SyntheticEvent<HTMLImageElement>) {
    const img = event.currentTarget;
    const fallback = img.dataset.fallback;

    if (fallback && img.src !== fallback) {
        img.src = fallback;
    }
}

/** Connected providers for this workspace, or null if they couldn't load. */
async function fetchStatus(): Promise<ConnectedIntegration[] | null> {
    try {
        const res = await fetch("/api/integrations/status", {
            credentials: "include",
            cache: "no-store",
        });

        if (!res.ok) {
            return null;
        }

        const data = await res.json();

        return Array.isArray(data.integrations) ? data.integrations : [];
    } catch (error) {
        console.error("Failed to load integrations:", error);
        return null;
    }
}

function first(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

export default function IntegrationsPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = use(searchParams);
    const connectedParam = first(params.connected);
    const errorParam = first(params.error);

    const [connectedIntegrations, setConnectedIntegrations] = useState<
        ConnectedIntegration[]
    >([]);
    const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [noticeHidden, setNoticeHidden] = useState(false);
    /* Shown when someone tries a tool that isn't wired up yet. */
    const [comingNotice, setComingNotice] = useState<string | null>(null);

    async function loadStatus() {
        const list = await fetchStatus();
        if (list) setConnectedIntegrations(list);
    }

    useEffect(() => {
        let active = true;

        void fetchStatus().then((list) => {
            if (active && list) setConnectedIntegrations(list);
        });

        return () => {
            active = false;
        };
    }, []);

    const connectedProviders = useMemo(() => {
        return new Set(
            connectedIntegrations
                .filter((item) => item.status === "connected")
                .map((item) => item.provider.toLowerCase()),
        );
    }, [connectedIntegrations]);

    function isConnected(item: IntegrationEntry) {
        return Boolean(item.provider && connectedProviders.has(item.provider));
    }

    const needle = query.trim().toLowerCase();

    const visible = INTEGRATIONS.filter((item) => {
        if (statusFilter === "connected" && !isConnected(item)) return false;
        if (statusFilter === "disconnected" && isConnected(item)) return false;
        if (!needle) return true;

        return [item.name, item.description, categoryLabel(item)]
            .join(" ")
            .toLowerCase()
            .includes(needle);
    });

    const sections = CATEGORIES.map((entry) => ({
        ...entry,
        items: visible.filter((item) => item.category === entry.id),
    })).filter((section) => section.items.length > 0);

    function handleConnect(item: IntegrationEntry) {
        if (item.connect) {
            window.location.assign(item.connect);
            return;
        }

        setComingNotice(
            `${item.name} isn't ready to connect yet. It's on its way.`,
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    async function handleDisconnect(item: IntegrationEntry) {
        const provider = item.provider;

        if (!provider || !window.confirm(`Disconnect ${item.name}?`)) {
            return;
        }

        try {
            setLoadingProvider(provider);

            const res = await fetch("/api/integrations/disconnect", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ provider }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => null);

                window.alert(data?.error || `Failed to disconnect ${item.name}.`);

                return;
            }

            await loadStatus();
        } catch (error) {
            console.error(`Failed to disconnect ${provider}:`, error);
            window.alert(`Failed to disconnect ${item.name}.`);
        } finally {
            setLoadingProvider(null);
        }
    }

    const notice = comingNotice
        ? { tone: "ok" as const, text: comingNotice }
        : noticeHidden
            ? null
            : errorParam
                ? {
                    tone: "error" as const,
                    text: `Couldn't finish connecting: ${errorParam.replace(/_/g, " ")}.`,
                }
                : connectedParam
                    ? { tone: "ok" as const, text: `${nameFor(connectedParam)} is connected.` }
                    : null;

    return (
        <section className={styles.page}>
            <header className={styles.header}>
                <div className={styles.headerText}>
                    <h1>Integrations</h1>
                    <p>Integrate with your favourite apps.</p>
                </div>

                <div className={styles.mosaic} aria-hidden="true">
                    {MOSAIC.map((item, index) => (
                        <span key={index}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- remote brand logos */}
                            <img
                                src={item.logo}
                                data-fallback={favicon(item.domain)}
                                onError={handleLogoError}
                                alt=""
                            />
                        </span>
                    ))}
                </div>
            </header>

            {notice && (
                <div
                    className={`${styles.notice} ${notice.tone === "error" ? styles.noticeError : ""}`}
                    role="status"
                >
                    <span>{notice.text}</span>
                    <button
                        type="button"
                        aria-label="Dismiss"
                        onClick={() => {
                            setComingNotice(null);
                            setNoticeHidden(true);
                        }}
                    >
                        ×
                    </button>
                </div>
            )}

            <div className={styles.toolbar}>
                <div className={styles.tabs} role="tablist" aria-label="Filter by status">
                    {STATUS_TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={statusFilter === tab.id}
                            className={statusFilter === tab.id ? styles.tabActive : undefined}
                            onClick={() => setStatusFilter(tab.id)}
                        >
                            {tab.short ? (
                                <>
                                    <span className={styles.longLabel}>{tab.label}</span>
                                    <span className={styles.shortLabel}>{tab.short}</span>
                                </>
                            ) : (
                                tab.label
                            )}
                        </button>
                    ))}
                </div>

                <div className={styles.toolbarEnd}>
                    <label className={styles.search}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search"
                            aria-label="Search integrations"
                        />
                    </label>

                    <a className={styles.requestButton} href={requestHref()}>
                        Request a tool
                    </a>
                </div>
            </div>

            {sections.length === 0 ? (
                <div className={styles.empty}>
                    <p>No integrations match{needle ? ` “${query.trim()}”` : " this filter"}.</p>
                    <a href={requestHref(query.trim() || undefined)}>Request it</a>
                </div>
            ) : (
                sections.map((section) => (
                    <section key={section.id} className={styles.section}>
                        <h2>{section.label}</h2>
                        <p className={styles.sectionBlurb}>{section.blurb}</p>

                        <div className={styles.grid}>
                            {section.items.map((item) => {
                                const connected = isConnected(item);
                                const busy = loadingProvider === item.provider;

                                return (
                                    <article key={item.id} className={styles.card}>
                                        <div className={styles.cardBody}>
                                            <span className={styles.logo}>
                                                {/* eslint-disable-next-line @next/next/no-img-element -- remote brand logos */}
                                                <img
                                                    src={item.logo}
                                                    data-fallback={favicon(item.domain)}
                                                    onError={handleLogoError}
                                                    alt=""
                                                    loading="lazy"
                                                />
                                            </span>
                                            <div>
                                                <h3>{item.name}</h3>
                                                <p>{item.description}</p>
                                            </div>
                                        </div>

                                        <div className={styles.cardFoot}>
                                            <div className={styles.actions}>
                                                {connected ? (
                                                    <>
                                                        {item.manage && <a href={item.manage}>Manage</a>}
                                                        <button
                                                            type="button"
                                                            className={styles.danger}
                                                            onClick={() => handleDisconnect(item)}
                                                            disabled={busy}
                                                        >
                                                            {busy ? "Disconnecting…" : "Disconnect"}
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button type="button" onClick={() => handleConnect(item)}>
                                                        Connect
                                                    </button>
                                                )}
                                            </div>

                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={connected}
                                                aria-label={`${connected ? "Disconnect" : "Connect"} ${item.name}`}
                                                className={styles.toggle}
                                                disabled={busy}
                                                onClick={() =>
                                                    connected
                                                        ? handleDisconnect(item)
                                                        : handleConnect(item)
                                                }
                                            >
                                                <span />
                                            </button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </section>
                ))
            )}
        </section>
    );
}
