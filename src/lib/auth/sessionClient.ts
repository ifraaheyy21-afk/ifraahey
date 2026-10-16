"use client";

import type { User } from "firebase/auth";

/**
 * Exchange the signed-in Firebase user's ID token for the HttpOnly
 * `__session` cookie that API routes verify. Same-origin fetches then send
 * it automatically, so pages do not need to attach tokens per request.
 */
export async function establishServerSession(user: User) {
    const idToken = await user.getIdToken();

    const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
        throw new Error("Unable to start your session. Please sign in again.");
    }
}

export async function clearServerSession() {
    await fetch("/api/auth/session", {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
    }).catch(() => undefined);
}
