import { NextResponse } from "next/server";

import { firebaseAdminAuth } from "../../../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE_NAME = "__session";
const SESSION_TTL_MS = 5 * 24 * 60 * 60 * 1000;
const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);

function jsonError(message: string, status: number) {
    return NextResponse.json(
        { ok: false, error: message },
        {
            status,
            headers: {
                "Cache-Control": "no-store",
            },
        },
    );
}

function getRequestOrigin(req: Request) {
    const origin = req.headers.get("origin");
    if (!origin) return null;

    try {
        return new URL(origin).origin;
    } catch {
        return null;
    }
}

function getExpectedOrigin(req: Request) {
    const configured =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_SITE_URL;

    if (configured) {
        try {
            return new URL(configured).origin;
        } catch {
            // Fall through to the request URL.
        }
    }

    return new URL(req.url).origin;
}

function isTrustedOrigin(req: Request) {
    const origin = getRequestOrigin(req);

    // Non-browser/server-to-server requests may not include Origin.
    if (!origin) return true;

    return origin === getExpectedOrigin(req);
}

export async function POST(req: Request) {
    try {
        if (!isTrustedOrigin(req)) {
            return jsonError("Invalid request origin.", 403);
        }

        const raw: unknown = await req.json().catch(() => null);

        if (
            !raw ||
            typeof raw !== "object" ||
            Array.isArray(raw)
        ) {
            return jsonError("Invalid request body.", 400);
        }

        const idToken =
            typeof (raw as Record<string, unknown>).idToken ===
                "string"
                ? String(
                    (raw as Record<string, unknown>).idToken,
                ).trim()
                : "";

        if (!idToken) {
            return jsonError(
                "Firebase ID token is required.",
                400,
            );
        }

        // Verify the Firebase ID token before converting it into
        // an HttpOnly Firebase session cookie.
        const decoded =
            await firebaseAdminAuth.verifyIdToken(
                idToken,
                true,
            );

        if (!decoded.uid) {
            return jsonError(
                "Invalid authentication token.",
                401,
            );
        }

        const sessionCookie =
            await firebaseAdminAuth.createSessionCookie(
                idToken,
                {
                    expiresIn: SESSION_TTL_MS,
                },
            );

        const response = NextResponse.json(
            { ok: true },
            {
                status: 200,
                headers: {
                    "Cache-Control": "no-store",
                },
            },
        );

        response.cookies.set({
            name: SESSION_COOKIE_NAME,
            value: sessionCookie,
            httpOnly: true,
            secure:
                process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: SESSION_TTL_SECONDS,
        });

        return response;
    } catch (error) {
        console.error("Auth session POST error:", error);

        return jsonError(
            "Unable to create authenticated session.",
            401,
        );
    }
}

export async function DELETE(req: Request) {
    if (!isTrustedOrigin(req)) {
        return jsonError("Invalid request origin.", 403);
    }

    const response = NextResponse.json(
        { ok: true },
        {
            status: 200,
            headers: {
                "Cache-Control": "no-store",
            },
        },
    );

    response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: "",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
    });

    return response;
}
