"use client";

import "@fontsource/inter";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { FREE_SENDER_MESSAGE, isFreeEmailDomain } from "../../../../lib/resend-errors";
import "./page.css";

type ResendConnection = {
    provider: string;
    status: string;
    senderName: string | null;
    senderEmail: string | null;
    senderDomain: string | null;
    permission: string | null;
    domainStatus: string | null;
    connectedAt: string | null;
};

function getWorkspaceId() {
    if (typeof window === "undefined") {
        return "demo-workspace";
    }

    return localStorage.getItem("workspaceId") || "demo-workspace";
}

export default function ResendIntegrationPage() {
    const [apiKey, setApiKey] = useState("");
    const [senderName, setSenderName] = useState("");
    const [senderEmail, setSenderEmail] = useState("");

    const [connection, setConnection] =
        useState<ResendConnection | null>(null);

    const [loadingStatus, setLoadingStatus] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    async function loadStatus() {
        try {
            setLoadingStatus(true);

            const res = await fetch(
                "/api/integrations/resend/status",
                {
                    cache: "no-store",
                    headers: {
                        "x-workspace-id": getWorkspaceId(),
                    },
                }
            );

            const text = await res.text();
            const data = text ? JSON.parse(text) : null;

            if (!res.ok) {
                throw new Error(
                    data?.error || "Failed to load Resend status."
                );
            }

            const integration =
                data?.integration as ResendConnection | null;

            setConnection(data?.connected ? integration : null);

            if (integration?.senderName) {
                setSenderName(integration.senderName);
            }

            if (integration?.senderEmail) {
                setSenderEmail(integration.senderEmail);
            }
        } catch (loadError) {
            console.error(loadError);

            setError(
                loadError instanceof Error
                    ? loadError.message
                    : "Failed to load Resend status."
            );
        } finally {
            setLoadingStatus(false);
        }
    }

    useEffect(() => {
        void loadStatus();
    }, []);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setError("");
        setSuccess("");

        if (!apiKey.trim()) {
            setError("Enter your Resend API key.");
            return;
        }

        if (!senderEmail.trim()) {
            setError("Enter your verified sender email.");
            return;
        }

        if (isFreeEmailDomain(senderEmail)) {
            setError(FREE_SENDER_MESSAGE);
            return;
        }

        try {
            setSubmitting(true);

            const res = await fetch(
                "/api/integrations/resend/save",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-workspace-id": getWorkspaceId(),
                    },
                    body: JSON.stringify({
                        apiKey: apiKey.trim(),
                        senderName: senderName.trim(),
                        senderEmail: senderEmail.trim(),
                    }),
                }
            );

            const text = await res.text();
            const data = text ? JSON.parse(text) : null;

            if (!res.ok) {
                throw new Error(
                    data?.error || "Failed to connect Resend."
                );
            }

            setApiKey("");
            setSuccess("Your Resend account is connected.");
            await loadStatus();
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : "Failed to connect Resend."
            );
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDisconnect() {
        const confirmed = window.confirm(
            "Disconnect Resend? Mailgine will no longer be able to send emails for this workspace."
        );

        if (!confirmed) {
            return;
        }

        setError("");
        setSuccess("");

        try {
            setDisconnecting(true);

            const res = await fetch(
                "/api/integrations/disconnect",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-workspace-id": getWorkspaceId(),
                    },
                    body: JSON.stringify({
                        provider: "resend",
                    }),
                }
            );

            const text = await res.text();
            const data = text ? JSON.parse(text) : null;

            if (!res.ok) {
                throw new Error(
                    data?.error || "Failed to disconnect Resend."
                );
            }

            setConnection(null);
            setApiKey("");
            setSuccess("Resend has been disconnected.");
        } catch (disconnectError) {
            setError(
                disconnectError instanceof Error
                    ? disconnectError.message
                    : "Failed to disconnect Resend."
            );
        } finally {
            setDisconnecting(false);
        }
    }

    return (
        <main className="resendPage">
            <div className="resendContainer">
                <Link
                    href="/dashboard/integrations"
                    className="backLink"
                >
                    ← Back to integrations
                </Link>

                <header className="resendHeader">
                    <div className="resendLogo">
                        <img
                            src="https://cdn.simpleicons.org/resend/000000"
                            alt="Resend logo"
                        />
                    </div>

                    <div>
                        <div className="headerTitleRow">
                            <h1>Connect Resend</h1>

                            {connection && (
                                <span className="connectedBadge">
                                    Connected
                                </span>
                            )}
                        </div>

                        <p>
                            Send Mailgine emails through your own Resend
                            account, verified domain, sending limits and
                            reputation.
                        </p>
                    </div>
                </header>

                {error && (
                    <div className="notice errorNotice" role="alert">
                        {error}
                    </div>
                )}

                {success && (
                    <div className="notice successNotice">
                        {success}
                    </div>
                )}

                {loadingStatus ? (
                    <section className="resendCard">
                        <p className="loadingText">
                            Loading Resend connection…
                        </p>
                    </section>
                ) : (
                    <>
                        {connection && (
                            <section className="resendCard connectionCard">
                                <div className="cardHeading">
                                    <div>
                                        <h2>Connected account</h2>
                                        <p>
                                            Mailgine will use this Resend
                                            account for workspace emails.
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        className="disconnectButton"
                                        onClick={handleDisconnect}
                                        disabled={disconnecting}
                                    >
                                        {disconnecting
                                            ? "Disconnecting…"
                                            : "Disconnect"}
                                    </button>
                                </div>

                                {connection.senderEmail && isFreeEmailDomain(connection.senderEmail) && (
                                    <div className="notice errorNotice" role="alert">
                                        Emails won&apos;t send from {connection.senderEmail}. {FREE_SENDER_MESSAGE} Replace the connection below.
                                    </div>
                                )}

                                <dl className="connectionDetails">
                                    <div>
                                        <dt>Sender</dt>
                                        <dd>
                                            {connection.senderName
                                                ? `${connection.senderName} <${connection.senderEmail}>`
                                                : connection.senderEmail}
                                        </dd>
                                    </div>

                                    <div>
                                        <dt>Domain</dt>
                                        <dd>
                                            {connection.senderDomain ||
                                                "Not available"}
                                        </dd>
                                    </div>

                                    <div>
                                        <dt>API permission</dt>
                                        <dd>
                                            {connection.permission ===
                                                "sending_access"
                                                ? "Sending access"
                                                : "Full access"}
                                        </dd>
                                    </div>

                                    <div>
                                        <dt>Domain check</dt>
                                        <dd>
                                            {connection.domainStatus ===
                                                "checked_on_send"
                                                ? "Checked when sending"
                                                : connection.domainStatus ||
                                                "Unknown"}
                                        </dd>
                                    </div>
                                </dl>
                            </section>
                        )}

                        <form
                            className="resendCard"
                            onSubmit={handleSubmit}
                        >
                            <div className="cardHeading">
                                <div>
                                    <h2>
                                        {connection
                                            ? "Replace connection"
                                            : "Resend credentials"}
                                    </h2>

                                    <p>
                                        Your API key is encrypted before it
                                        is stored.
                                    </p>
                                </div>
                            </div>

                            <div className="formGroup">
                                <label htmlFor="resendApiKey">
                                    Resend API key
                                </label>

                                <input
                                    id="resendApiKey"
                                    type="password"
                                    value={apiKey}
                                    onChange={(event) =>
                                        setApiKey(event.target.value)
                                    }
                                    placeholder="re_xxxxxxxxxxxxxxxxx"
                                    autoComplete="off"
                                    spellCheck={false}
                                    required
                                />

                                <span>
                                    Create a key with Sending access in
                                    your Resend dashboard. The key is never
                                    shown again after saving.
                                </span>
                            </div>

                            <div className="formGrid">
                                <div className="formGroup">
                                    <label htmlFor="senderName">
                                        Sender name
                                    </label>

                                    <input
                                        id="senderName"
                                        type="text"
                                        value={senderName}
                                        onChange={(event) =>
                                            setSenderName(
                                                event.target.value
                                            )
                                        }
                                        placeholder="Acme"
                                        maxLength={100}
                                    />
                                </div>

                                <div className="formGroup">
                                    <label htmlFor="senderEmail">
                                        Verified sender email
                                    </label>

                                    <input
                                        id="senderEmail"
                                        type="email"
                                        value={senderEmail}
                                        onChange={(event) =>
                                            setSenderEmail(
                                                event.target.value
                                            )
                                        }
                                        placeholder="hello@acme.com"
                                        aria-invalid={isFreeEmailDomain(senderEmail) || undefined}
                                        required
                                    />
                                    <span>
                                        {isFreeEmailDomain(senderEmail)
                                            ? "Free email addresses like Gmail can't send through Resend. Use an address on your own verified domain."
                                            : "An address on a domain you've verified in Resend."}
                                    </span>
                                </div>
                            </div>

                            <div className="formActions">
                                <Link
                                    href="/dashboard/integrations"
                                    className="cancelButton"
                                >
                                    Cancel
                                </Link>

                                <button
                                    type="submit"
                                    className="connectButton"
                                    disabled={submitting}
                                >
                                    {submitting
                                        ? "Validating…"
                                        : connection
                                            ? "Replace connection"
                                            : "Connect Resend"}
                                </button>
                            </div>
                        </form>

                        <section className="setupCard">
                            <h2>Before connecting</h2>

                            <ol>
                                <li>
                                    Add and verify your domain inside
                                    Resend.
                                </li>
                                <li>
                                    Create an API key with Sending access.
                                </li>
                                <li>
                                    Paste the key and your verified sender
                                    email above.
                                </li>
                            </ol>
                        </section>
                    </>
                )}
            </div>
        </main>
    );
}