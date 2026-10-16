"use client";

import "@fontsource/inter";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { auth } from "../../../lib/firebase";
import "./page.css";

type AuthorizationDetails = {
    clientName: string;
    scopes: string[];
};

const scopeLabels: Record<string, string> = {
    "workspace:read": "View your Mailgine workspace",
    "customers:read": "View your customers",
    "customers:write": "Create and update customers",
    "emails:read": "View generated and scheduled emails",
    "emails:write": "Create and schedule emails",
    "events:read": "View email activity and tracking events",
};

export default function OAuthAuthorizePage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [details, setDetails] = useState<AuthorizationDetails | null>(null);
    const [detailsLoading, setDetailsLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const requestValues = useMemo(
        () => ({
            clientId: searchParams.get("client_id") || "",
            redirectUri: searchParams.get("redirect_uri") || "",
            responseType: searchParams.get("response_type") || "",
            scope: searchParams.get("scope") || "workspace:read",
            state: searchParams.get("state") || "",
            codeChallenge: searchParams.get("code_challenge") || "",
            codeChallengeMethod:
                searchParams.get("code_challenge_method") || "",
        }),
        [searchParams]
    );

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            setAuthLoading(false);
        });

        return unsubscribe;
    }, []);

    useEffect(() => {
        async function loadRequestDetails() {
            try {
                const params = new URLSearchParams({
                    client_id: requestValues.clientId,
                    redirect_uri: requestValues.redirectUri,
                    response_type: requestValues.responseType,
                    scope: requestValues.scope,
                });

                const response = await fetch(
                    `/api/oauth/authorize/validate?${params.toString()}`,
                    {
                        cache: "no-store",
                    }
                );

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.error_description ||
                        data.error ||
                        "Invalid authorization request."
                    );
                }

                setDetails(data);
            } catch (requestError) {
                setError(
                    requestError instanceof Error
                        ? requestError.message
                        : "Invalid authorization request."
                );
            } finally {
                setDetailsLoading(false);
            }
        }

        loadRequestDetails();
    }, [requestValues]);

    function goToLogin() {
        const returnUrl = `${window.location.pathname}${window.location.search}`;

        router.push(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    }

    async function handleDecision(
        event: FormEvent<HTMLFormElement>,
        approved: boolean
    ) {
        event.preventDefault();

        if (!user || submitting) {
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            const idToken = await user.getIdToken();

            const response = await fetch("/api/oauth/authorize", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    approved,
                    clientId: requestValues.clientId,
                    redirectUri: requestValues.redirectUri,
                    responseType: requestValues.responseType,
                    scope: requestValues.scope,
                    state: requestValues.state,
                    codeChallenge: requestValues.codeChallenge || null,
                    codeChallengeMethod:
                        requestValues.codeChallengeMethod || null,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error_description ||
                    data.error ||
                    "Unable to complete authorization."
                );
            }

            if (!data.redirectTo) {
                throw new Error("Mailgine did not return a redirect URL.");
            }

            window.location.assign(data.redirectTo);
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : "Unable to complete authorization."
            );
            setSubmitting(false);
        }
    }

    if (authLoading || detailsLoading) {
        return (
            <main className="oauthPage">
                <section className="oauthCard">
                    <p className="oauthStatus">Loading authorization request…</p>
                </section>
            </main>
        );
    }

    if (error && !details) {
        return (
            <main className="oauthPage">
                <section className="oauthCard">
                    <div className="oauthBrand">Mailgine</div>
                    <h1>Authorization request unavailable</h1>
                    <p className="oauthDescription">{error}</p>
                </section>
            </main>
        );
    }

    if (!user) {
        return (
            <main className="oauthPage">
                <section className="oauthCard">
                    <div className="oauthBrand">Mailgine</div>
                    <h1>Sign in to continue</h1>
                    <p className="oauthDescription">
                        Sign in to your Mailgine account before connecting it
                        to {details?.clientName || "Zapier"}.
                    </p>

                    <button
                        type="button"
                        className="primaryButton"
                        onClick={goToLogin}
                    >
                        Sign in to Mailgine
                    </button>
                </section>
            </main>
        );
    }

    return (
        <main className="oauthPage">
            <section className="oauthCard">
                <div className="connectionHeader">
                    <div className="appLogo mailgineLogo">M</div>
                    <div className="connectionLine" />
                    <div className="appLogo zapierLogo">_</div>
                </div>

                <div className="oauthBrand">Mailgine</div>

                <h1>
                    Connect Mailgine to {details?.clientName || "Zapier"}?
                </h1>

                <p className="oauthDescription">
                    {details?.clientName || "Zapier"} is requesting permission
                    to access your Mailgine workspace.
                </p>

                <div className="accountBox">
                    <span>Signed in as</span>
                    <strong>{user.email || "Mailgine user"}</strong>
                </div>

                <div className="permissions">
                    <p className="permissionsTitle">
                        This connection will be able to:
                    </p>

                    <ul>
                        {details?.scopes.map((scope) => (
                            <li key={scope}>
                                <span className="permissionCheck">✓</span>
                                <span>{scopeLabels[scope] || scope}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {error ? <p className="errorMessage">{error}</p> : null}

                <div className="buttonRow">
                    <form onSubmit={(event) => handleDecision(event, false)}>
                        <button
                            type="submit"
                            className="secondaryButton"
                            disabled={submitting}
                        >
                            Cancel
                        </button>
                    </form>

                    <form onSubmit={(event) => handleDecision(event, true)}>
                        <button
                            type="submit"
                            className="primaryButton"
                            disabled={submitting}
                        >
                            {submitting ? "Connecting…" : "Allow access"}
                        </button>
                    </form>
                </div>

                <p className="securityNote">
                    You can disconnect Zapier from Mailgine at any time.
                </p>
            </section>
        </main>
    );
}