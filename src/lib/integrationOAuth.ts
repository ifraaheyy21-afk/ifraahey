import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import {
    AuthError,
    getWorkspaceFromRequest,
} from "./auth/getWorkspaceFromRequest";

const STATE_TTL_SECONDS = 10 * 60;

function stateCookieName(provider: string) {
    return `oauth_state_${provider}`;
}

function readCookie(req: Request, name: string) {
    for (const part of (req.headers.get("cookie") ?? "").split(";")) {
        const index = part.indexOf("=");
        if (index < 0 || part.slice(0, index).trim() !== name) continue;
        try {
            return decodeURIComponent(part.slice(index + 1).trim());
        } catch {
            return null;
        }
    }
    return null;
}

function safeEqual(a: string, b: string) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
}

function integrationsRedirect(req: Request, query: string) {
    return NextResponse.redirect(
        new URL(`/dashboard/integrations?${query}`, req.url),
    );
}

async function workspaceOrRedirect(req: Request) {
    try {
        return await getWorkspaceFromRequest(req);
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.redirect(
                new URL(
                    `/login?returnUrl=${encodeURIComponent("/dashboard/integrations")}`,
                    req.url,
                ),
            );
        }
        throw error;
    }
}

/**
 * Start an integration OAuth flow for the signed-in workspace.
 *
 * Returns a random `state` to send to the provider, and `redirect` to build
 * the response that stores it in a short-lived HttpOnly cookie.
 */
export async function beginIntegrationOAuth(req: Request, provider: string) {
    const auth = await workspaceOrRedirect(req);
    if (auth instanceof NextResponse) return auth;

    const state = randomBytes(24).toString("hex");

    return {
        state,
        redirect(url: string | URL) {
            const response = NextResponse.redirect(url);
            response.cookies.set(stateCookieName(provider), state, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/",
                maxAge: STATE_TTL_SECONDS,
            });
            return response;
        },
    };
}

/**
 * Finish an integration OAuth callback.
 *
 * Verifies the provider echoed back the state this browser was given, and
 * resolves the workspace from the signed-in session (never from the URL), so
 * tokens can only be stored on the account that started the flow.
 */
export async function completeIntegrationOAuth(req: Request, provider: string) {
    const url = new URL(req.url);
    const returnedState = url.searchParams.get("state") ?? "";
    const expectedState = readCookie(req, stateCookieName(provider)) ?? "";

    if (!returnedState || !expectedState || !safeEqual(returnedState, expectedState)) {
        return integrationsRedirect(req, `error=${encodeURIComponent(`${provider}_invalid_state`)}`);
    }

    const auth = await workspaceOrRedirect(req);
    if (auth instanceof NextResponse) return auth;

    return { workspaceId: auth.workspaceId };
}

export function clearIntegrationOAuthState(response: NextResponse, provider: string) {
    response.cookies.delete(stateCookieName(provider));
    return response;
}
