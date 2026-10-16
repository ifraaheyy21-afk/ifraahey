import crypto from "node:crypto";
import { prisma } from "../lib/prisma";

export const ACCESS_TOKEN_LIFETIME_SECONDS = 60 * 60;
export const REFRESH_TOKEN_LIFETIME_SECONDS = 60 * 60 * 24 * 90;
export const AUTHORIZATION_CODE_LIFETIME_SECONDS = 60 * 10;

export const SUPPORTED_OAUTH_SCOPES = [
    "workspace:read",
    "customers:read",
    "customers:write",
    "emails:read",
    "emails:write",
    "events:read",
    "events:write",
] as const;

type SupportedScope = (typeof SUPPORTED_OAUTH_SCOPES)[number];

export type OAuthClient = {
    clientId: string;
    clientSecret: string;
    name: string;
    redirectUris: string[];
};

export function getZapierOAuthClient(): OAuthClient {
    const clientId = process.env.ZAPIER_OAUTH_CLIENT_ID;
    const clientSecret = process.env.ZAPIER_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.ZAPIER_OAUTH_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error(
            "Missing ZAPIER_OAUTH_CLIENT_ID, ZAPIER_OAUTH_CLIENT_SECRET, or ZAPIER_OAUTH_REDIRECT_URI"
        );
    }

    return {
        clientId,
        clientSecret,
        name: "Zapier",
        redirectUris: [redirectUri],
    };
}

export function findOAuthClient(clientId: string): OAuthClient | null {
    const zapier = getZapierOAuthClient();

    return timingSafeEqual(clientId, zapier.clientId) ? zapier : null;
}

export function isAllowedRedirectUri(
    client: OAuthClient,
    redirectUri: string
): boolean {
    return client.redirectUris.some((allowedUri) =>
        timingSafeEqual(allowedUri, redirectUri)
    );
}

export function timingSafeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function generateSecureToken(prefix: string): string {
    return `${prefix}_${crypto.randomBytes(48).toString("base64url")}`;
}

export function hashToken(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
}

export function parseScopes(scopeValue?: string | null): SupportedScope[] {
    const requestedScopes = (scopeValue || "workspace:read")
        .split(/\s+/)
        .map((scope) => scope.trim())
        .filter(Boolean);

    const uniqueScopes = [...new Set(requestedScopes)];

    return uniqueScopes.filter(
        (scope): scope is SupportedScope =>
            SUPPORTED_OAUTH_SCOPES.includes(scope as SupportedScope)
    );
}

export function areScopesValid(scopeValue?: string | null): boolean {
    const requestedScopes = (scopeValue || "workspace:read")
        .split(/\s+/)
        .map((scope) => scope.trim())
        .filter(Boolean);

    return requestedScopes.every((scope) =>
        SUPPORTED_OAUTH_SCOPES.includes(scope as SupportedScope)
    );
}

export function scopesToString(scopes: readonly string[]): string {
    return [...new Set(scopes)].join(" ");
}

export function hasRequiredScope(
    grantedScopes: string,
    requiredScope: SupportedScope
): boolean {
    return grantedScopes.split(/\s+/).includes(requiredScope);
}

export function addSeconds(date: Date, seconds: number): Date {
    return new Date(date.getTime() + seconds * 1000);
}

export function extractBearerToken(request: Request): string | null {
    const authorization = request.headers.get("authorization");

    if (!authorization) {
        return null;
    }

    const [scheme, token] = authorization.split(/\s+/);

    if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
        return null;
    }

    return token;
}

export function extractBasicClientCredentials(
    request: Request
): { clientId: string; clientSecret: string } | null {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Basic ")) {
        return null;
    }

    try {
        const encoded = authorization.slice("Basic ".length);
        const decoded = Buffer.from(encoded, "base64").toString("utf8");
        const separatorIndex = decoded.indexOf(":");

        if (separatorIndex < 0) {
            return null;
        }

        return {
            clientId: decodeURIComponent(decoded.slice(0, separatorIndex)),
            clientSecret: decodeURIComponent(
                decoded.slice(separatorIndex + 1)
            ),
        };
    } catch {
        return null;
    }
}

export async function authenticateOAuthRequest(
    request: Request,
    requiredScope?: SupportedScope
) {
    const rawToken = extractBearerToken(request);

    if (!rawToken) {
        return null;
    }

    const tokenHash = hashToken(rawToken);
    const now = new Date();

    const token = await prisma.oAuthAccessToken.findUnique({
        where: {
            tokenHash,
        },
        include: {
            workspace: true,
        },
    });

    if (
        !token ||
        token.revokedAt ||
        token.expiresAt.getTime() <= now.getTime()
    ) {
        return null;
    }

    if (
        requiredScope &&
        !hasRequiredScope(token.scopes, requiredScope)
    ) {
        return null;
    }

    return token;
}

export function createPkceChallenge(codeVerifier: string): string {
    return crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");
}