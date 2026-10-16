"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";

import { auth } from "../lib/firebase";
import { establishServerSession } from "../lib/auth/sessionClient";

/**
 * Pages read the workspace id from localStorage to decide between live and
 * demo data. Keep it matched to the signed-in account (the server ignores it
 * and always uses the session's workspace).
 */
async function syncStoredWorkspaceId() {
    const response = await fetch("/api/email-agent/bootstrap", {
        credentials: "same-origin",
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error("Unable to load your workspace.");
    }

    const data = (await response.json()) as { workspaceId?: unknown };

    if (typeof data.workspaceId === "string" && data.workspaceId) {
        try {
            window.localStorage.setItem("workspaceId", data.workspaceId);
        } catch {
            // Storage can be unavailable (private mode); the server is unaffected.
        }
    }
}

/**
 * Holds dashboard rendering until the visitor is signed in and their
 * server session cookie is fresh, so every API call from the page is
 * authenticated. Signed-out visitors are sent to the login page.
 */
export default function SessionGate({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const redirectToLogin = () => {
            const returnUrl = encodeURIComponent(
                `${window.location.pathname}${window.location.search}`,
            );
            router.replace(`/login?returnUrl=${returnUrl}`);
        };

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                if (!cancelled) {
                    setReady(false);
                    redirectToLogin();
                }
                return;
            }

            try {
                await establishServerSession(user);
                await syncStoredWorkspaceId();
                if (!cancelled) setReady(true);
            } catch (error) {
                console.error("Session refresh failed:", error);
                if (!cancelled) redirectToLogin();
            }
        });

        return () => {
            cancelled = true;
            unsubscribe();
        };
        // The session only needs establishing once per dashboard mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!ready) {
        return (
            <div
                aria-busy="true"
                aria-label={`Loading ${pathname}`}
                style={{
                    minHeight: "100vh",
                    display: "grid",
                    placeItems: "center",
                    color: "#6b7280",
                    fontSize: 14,
                }}
            >
                Loading your workspace…
            </div>
        );
    }

    return <>{children}</>;
}
