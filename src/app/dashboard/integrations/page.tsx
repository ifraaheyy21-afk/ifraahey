"use client";

import "@fontsource/inter";
import { useEffect, useMemo, useState } from "react";
import { integrations } from "../../../lib/integrationsData";

type ConnectedIntegration = {
    provider: string;
    status: string;
};

function normaliseProviderName(name: string) {
    return name.toLowerCase().replace(/\s+/g, "_");
}

function getLogoUrl(item: { name: string; domain: string }) {
    const provider = normaliseProviderName(item.name);

    const logos: Record<string, string> = {
        slack: "https://www.google.com/s2/favicons?domain=slack.com&sz=128",
        salesforce:
            "https://www.google.com/s2/favicons?domain=salesforce.com&sz=128",
        pipedrive: "https://www.google.com/s2/favicons?domain=pipedrive.com&sz=128",
        stripe: "https://www.google.com/s2/favicons?domain=stripe.com&sz=128",

        hubspot: "https://www.google.com/s2/favicons?domain=hubspot.com&sz=128",
        intercom: "https://www.google.com/s2/favicons?domain=intercom.com&sz=128",
        sendgrid: "https://www.google.com/s2/favicons?domain=sendgrid.com&sz=128",
        mailgun: "https://www.google.com/s2/favicons?domain=mailgun.com&sz=128",
        resend: "https://cdn.simpleicons.org/resend/000000",
        zapier: "https://www.google.com/s2/favicons?domain=zapier.com&sz=128",
        google_calendar: "https://cdn.simpleicons.org/googlecalendar",
        posthog: "https://www.google.com/s2/favicons?domain=posthog.com&sz=128",
    };

    return (
        logos[provider] ||
        `https://www.google.com/s2/favicons?domain=${item.domain}&sz=128`
    );
}

function handleLogoError(event: React.SyntheticEvent<HTMLImageElement>) {
    const img = event.currentTarget;
    const fallback = img.dataset.fallback;

    if (fallback && img.src !== fallback) {
        img.src = fallback;
    }
}

export default function IntegrationsPage() {
    const [connectedIntegrations, setConnectedIntegrations] = useState<
        ConnectedIntegration[]
    >([]);
    const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

    async function loadStatus() {
        try {
            const res = await fetch("/api/integrations/status", {
                cache: "no-store",
            });

            if (!res.ok) {
                return;
            }

            const data = await res.json();

            setConnectedIntegrations(
                Array.isArray(data.integrations) ? data.integrations : [],
            );
        } catch (error) {
            console.error("Failed to load integrations:", error);
        }
    }

    useEffect(() => {
        void loadStatus();
    }, []);

    const connectedProviders = useMemo(() => {
        return new Set(
            connectedIntegrations
                .filter((item) => item.status === "connected")
                .map((item) => normaliseProviderName(item.provider)),
        );
    }, [connectedIntegrations]);

    const uniqueIntegrations = useMemo(() => {
        const seenProviders = new Set<string>();

        return integrations.filter((item) => {
            const provider = normaliseProviderName(item.name);

            if (seenProviders.has(provider)) {
                return false;
            }

            seenProviders.add(provider);
            return true;
        });
    }, []);

    function handleConnect(itemName: string) {
        const provider = normaliseProviderName(itemName);

        const oauthRoutes: Record<string, string> = {
            salesforce: "/api/integrations/salesforce/connect",
            pipedrive: "/api/integrations/pipedrive/connect",
            intercom: "/api/integrations/intercom/connect",
            google_calendar: "/api/integrations/google-calendar/connect",
            slack: "/api/integrations/slack/connect",
        };

        const dashboardRoutes: Record<string, string> = {
            resend: "/dashboard/integrations/resend",
        };

        const oauthRoute = oauthRoutes[provider];

        if (oauthRoute) {
            window.location.href = oauthRoute;
            return;
        }

        const dashboardRoute = dashboardRoutes[provider];

        if (dashboardRoute) {
            window.location.href = dashboardRoute;
            return;
        }

        console.warn(`No connection flow has been configured for ${provider}.`);
    }

    async function handleDisconnect(itemName: string) {
        const provider = normaliseProviderName(itemName);

        const confirmed = window.confirm(`Disconnect ${itemName}?`);

        if (!confirmed) {
            return;
        }

        try {
            setLoadingProvider(provider);

            const res = await fetch("/api/integrations/disconnect", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ provider }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => null);

                window.alert(data?.error || `Failed to disconnect ${itemName}.`);

                return;
            }

            await loadStatus();
        } catch (error) {
            console.error(`Failed to disconnect ${provider}:`, error);
            window.alert(`Failed to disconnect ${itemName}.`);
        } finally {
            setLoadingProvider(null);
        }
    }

    function handleRequestIntegration() {
        window.location.href =
            "mailto:support@mailgine.com?subject=Integration request";
    }

    return (
        <section className="integrationsPage">
            <section className="integrationsContent">
                <header className="integrationsHeader">
                    <div>
                        <h1>Integrations</h1>

                        <span>
                            Connect the tools your customers already use, then let AI analyse
                            activity, risk, revenue and email opportunities.
                        </span>
                    </div>

                    <button type="button" onClick={handleRequestIntegration}>
                        + Request integration
                    </button>
                </header>

                <section className="integrationHero">
                    <div>
                        <h2>Sync customer data from your favourite tools</h2>

                        <p>
                            Import customers from payments, CRM, support, email, spreadsheets
                            and workspaces so Mailgine can generate personalised AI emails.
                        </p>
                    </div>

                    <div className="heroStack" aria-label="Featured integrations">
                        {uniqueIntegrations.slice(0, 5).map((item) => {
                            const provider = normaliseProviderName(item.name);

                            return (
                                <img
                                    key={`hero-${provider}`}
                                    src={getLogoUrl(item)}
                                    data-fallback={`https://www.google.com/s2/favicons?domain=${item.domain}&sz=128`}
                                    onError={handleLogoError}
                                    alt={`${item.name} logo`}
                                />
                            );
                        })}
                    </div>
                </section>

                <section className="integrationsGrid">
                    {uniqueIntegrations.map((item) => {
                        const provider = normaliseProviderName(item.name);
                        const isConnected = connectedProviders.has(provider);
                        const isLoading = loadingProvider === provider;

                        return (
                            <article
                                className="integrationCard"
                                key={`integration-${provider}`}
                            >
                                <div className="integrationTop">
                                    <img
                                        src={getLogoUrl(item)}
                                        data-fallback={`https://www.google.com/s2/favicons?domain=${item.domain}&sz=128`}
                                        onError={handleLogoError}
                                        alt={`${item.name} logo`}
                                    />

                                    <div>
                                        <h3>{item.name}</h3>
                                        <p>{item.domain}</p>
                                    </div>

                                    <span
                                        className={
                                            isConnected
                                                ? "statusBadge connected"
                                                : item.status === "Available"
                                                    ? "statusBadge available"
                                                    : "statusBadge soon"
                                        }
                                    >
                                        {isConnected ? "Connected" : item.status}
                                    </span>
                                </div>

                                <div className="integrationCategory">{item.category}</div>

                                <p className="integrationDescription">{item.description}</p>

                                {isConnected ? (
                                    <button
                                        type="button"
                                        className="integrationButton disconnectButton"
                                        onClick={() => handleDisconnect(item.name)}
                                        disabled={isLoading}
                                    >
                                        {isLoading ? "Disconnecting..." : "Disconnect"}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="integrationButton"
                                        onClick={() => handleConnect(item.name)}
                                        disabled={isLoading}
                                    >
                                        Connect
                                    </button>
                                )}
                            </article>
                        );
                    })}
                </section>
            </section>
        </section>
    );
}
