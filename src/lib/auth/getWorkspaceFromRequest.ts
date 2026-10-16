import { prisma } from "../../lib/prisma";
import { firebaseAdminAuth } from "../../lib/firebase-admin";

const SESSION_COOKIE_NAME = "__session";

export class AuthError extends Error {
    status: number;
    code?: string;

    constructor(
        message: string,
        status = 401,
        code?: string,
    ) {
        super(message);

        this.name = "AuthError";
        this.status = status;
        this.code = code;
    }
}

type AuthenticatedWorkspace = {
    workspaceId: string;
    user: {
        uid: string;
        email: string;
    };
};

function cleanText(
    value: string | null | undefined,
) {
    return value?.trim() ?? "";
}

function getBearerToken(req: Request) {
    const header =
        req.headers.get("authorization") ?? "";

    const match =
        header.match(/^Bearer\s+(.+)$/i);

    return match?.[1]?.trim() || null;
}

function getCookieValue(
    req: Request,
    name: string,
) {
    const cookieHeader =
        req.headers.get("cookie") ?? "";

    for (const part of cookieHeader.split(";")) {
        const separatorIndex =
            part.indexOf("=");

        if (separatorIndex < 0) continue;

        const key =
            part
                .slice(0, separatorIndex)
                .trim();

        if (key !== name) continue;

        const rawValue =
            part
                .slice(separatorIndex + 1)
                .trim();

        try {
            return decodeURIComponent(rawValue);
        } catch {
            return rawValue;
        }
    }

    return null;
}

function getFirebaseErrorDetails(
    error: unknown,
) {
    if (
        !error ||
        typeof error !== "object"
    ) {
        return {
            code: "UNKNOWN_FIREBASE_AUTH_ERROR",
            message:
                "Unknown Firebase authentication error.",
        };
    }

    const record = error as {
        code?: unknown;
        message?: unknown;
    };

    return {
        code:
            typeof record.code === "string" &&
                record.code.trim()
                ? record.code.trim()
                : "UNKNOWN_FIREBASE_AUTH_ERROR",

        message:
            typeof record.message === "string" &&
                record.message.trim()
                ? record.message.trim()
                : "Unknown Firebase authentication error.",
    };
}

function getErrorCode(
    error: unknown,
) {
    if (
        error &&
        typeof error === "object" &&
        "code" in error
    ) {
        const code =
            (error as { code?: unknown })
                .code;

        if (
            typeof code === "string" &&
            code.trim()
        ) {
            return code.trim();
        }
    }

    return "";
}

function getDevelopmentWorkspaceId() {
    if (
        process.env.NODE_ENV === "production"
    ) {
        return "";
    }

    return cleanText(
        process.env.DEV_WORKSPACE_ID,
    );
}

async function verifyRequestIdentity(
    req: Request,
) {
    const bearerToken =
        getBearerToken(req);

    if (bearerToken) {
        try {
            return await firebaseAdminAuth
                .verifyIdToken(
                    bearerToken,
                    true,
                );
        } catch (error) {
            const firebaseError =
                getFirebaseErrorDetails(error);

            console.error(
                "[Firebase verifyIdToken]",
                firebaseError.code,
                firebaseError.message,
            );

            throw new AuthError(
                "Your authentication token is invalid or expired.",
                401,
                "INVALID_AUTH_TOKEN",
            );
        }
    }

    const sessionCookie =
        getCookieValue(
            req,
            SESSION_COOKIE_NAME,
        );

    if (!sessionCookie) {
        throw new AuthError(
            "Authentication required.",
            401,
            "AUTH_REQUIRED",
        );
    }

    try {
        return await firebaseAdminAuth
            .verifySessionCookie(
                sessionCookie,
                true,
            );
    } catch {
        throw new AuthError(
            "Your session is invalid or expired. Please sign in again.",
            401,
            "INVALID_SESSION",
        );
    }
}

export async function getWorkspaceFromRequest(
    req: Request,
): Promise<AuthenticatedWorkspace> {
    const decoded =
        await verifyRequestIdentity(req);

    const uid =
        cleanText(decoded.uid);

    const email =
        cleanText(
            decoded.email,
        ).toLowerCase();

    if (!uid || !email) {
        throw new AuthError(
            "Your authenticated account does not have an email address.",
            403,
            "EMAIL_REQUIRED",
        );
    }

    try {
        const existing =
            await prisma.workspace.findFirst({
                where: {
                    userEmail: {
                        equals: email,
                        mode: "insensitive",
                    },
                },

                select: {
                    id: true,
                },
            });

        // First authenticated request for a new account: provision its
        // workspace. The unique userEmail makes concurrent first requests safe.
        const workspace =
            existing ??
            await prisma.workspace.upsert({
                where: { userEmail: email },
                update: {},
                create: {
                    userEmail: email,
                    name: `${email.split("@")[0]}'s Workspace`,
                },
                select: {
                    id: true,
                },
            });

        return {
            workspaceId: workspace.id,

            user: {
                uid,
                email,
            },
        };
    } catch (error) {
        if (error instanceof AuthError) {
            throw error;
        }

        const errorCode =
            getErrorCode(error);

        const developmentWorkspaceId =
            getDevelopmentWorkspaceId();

        if (
            errorCode === "P1001" &&
            developmentWorkspaceId
        ) {
            console.warn(
                "[Workspace lookup]",
                "Database is unavailable. Using DEV_WORKSPACE_ID for local development.",
            );

            return {
                workspaceId:
                    developmentWorkspaceId,

                user: {
                    uid,
                    email,
                },
            };
        }

        if (
            errorCode === "P1001" &&
            process.env.NODE_ENV !== "production"
        ) {
            throw new AuthError(
                "The database is unavailable and DEV_WORKSPACE_ID is not configured for local development.",
                503,
                "DATABASE_UNAVAILABLE",
            );
        }

        throw error;
    }
}