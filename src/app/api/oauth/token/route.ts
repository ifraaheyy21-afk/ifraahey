import crypto from "node:crypto";
import { prisma } from "../../../../lib/prisma";
import {
    ACCESS_TOKEN_LIFETIME_SECONDS,
    addSeconds,
    createPkceChallenge,
    extractBasicClientCredentials,
    findOAuthClient,
    generateSecureToken,
    hashToken,
    REFRESH_TOKEN_LIFETIME_SECONDS,
    timingSafeEqual,
} from "../../../../lib/oauth";
import {
    oauthJsonError,
    oauthSuccess,
} from "../../../../lib/oauth-responses";

export const runtime = "nodejs";

type TokenRequest = {
    grantType: string;
    code: string;
    refreshToken: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
    codeVerifier: string;
};

async function readTokenRequest(request: Request): Promise<TokenRequest> {
    const contentType = request.headers.get("content-type") || "";
    let values: Record<string, unknown> = {};

    if (contentType.includes("application/json")) {
        values = (await request.json()) as Record<string, unknown>;
    } else {
        const rawBody = await request.text();
        const params = new URLSearchParams(rawBody);
        values = Object.fromEntries(params.entries());
    }

    const basicCredentials = extractBasicClientCredentials(request);

    return {
        grantType: String(
            values.grant_type || values.grantType || ""
        ),
        code: String(values.code || ""),
        refreshToken: String(
            values.refresh_token || values.refreshToken || ""
        ),
        redirectUri: String(
            values.redirect_uri || values.redirectUri || ""
        ),
        clientId:
            basicCredentials?.clientId ||
            String(values.client_id || values.clientId || ""),
        clientSecret:
            basicCredentials?.clientSecret ||
            String(values.client_secret || values.clientSecret || ""),
        codeVerifier: String(
            values.code_verifier || values.codeVerifier || ""
        ),
    };
}

function createTokenPair() {
    return {
        accessToken: generateSecureToken("mg_access"),
        refreshToken: generateSecureToken("mg_refresh"),
    };
}

async function exchangeAuthorizationCode(values: TokenRequest) {
    if (!values.code) {
        return oauthJsonError(
            "invalid_request",
            "The authorization code is required."
        );
    }

    const client = findOAuthClient(values.clientId);

    if (
        !client ||
        !timingSafeEqual(values.clientSecret, client.clientSecret)
    ) {
        return oauthJsonError(
            "invalid_client",
            "The OAuth client credentials are invalid.",
            401
        );
    }

    const codeHash = hashToken(values.code);
    const now = new Date();

    const authorizationCode =
        await prisma.oAuthAuthorizationCode.findUnique({
            where: {
                codeHash,
            },
        });

    if (
        !authorizationCode ||
        authorizationCode.usedAt ||
        authorizationCode.expiresAt.getTime() <= now.getTime()
    ) {
        return oauthJsonError(
            "invalid_grant",
            "The authorization code is invalid, expired, or already used."
        );
    }

    if (
        !timingSafeEqual(authorizationCode.clientId, client.clientId)
    ) {
        return oauthJsonError(
            "invalid_grant",
            "The authorization code was issued to another client."
        );
    }

    if (
        !values.redirectUri ||
        !timingSafeEqual(
            authorizationCode.redirectUri,
            values.redirectUri
        )
    ) {
        return oauthJsonError(
            "invalid_grant",
            "The redirect URI does not match the original request."
        );
    }

    if (authorizationCode.codeChallenge) {
        if (!values.codeVerifier) {
            return oauthJsonError(
                "invalid_grant",
                "A PKCE code verifier is required."
            );
        }

        const calculatedChallenge =
            authorizationCode.codeChallengeMethod === "S256"
                ? createPkceChallenge(values.codeVerifier)
                : values.codeVerifier;

        if (
            !timingSafeEqual(
                calculatedChallenge,
                authorizationCode.codeChallenge
            )
        ) {
            return oauthJsonError(
                "invalid_grant",
                "The PKCE code verifier is invalid."
            );
        }
    }

    const { accessToken, refreshToken } = createTokenPair();
    const familyId = crypto.randomUUID();

    const result = await prisma.$transaction(async (transaction) => {
        const consumed =
            await transaction.oAuthAuthorizationCode.updateMany({
                where: {
                    id: authorizationCode.id,
                    usedAt: null,
                    expiresAt: {
                        gt: now,
                    },
                },
                data: {
                    usedAt: now,
                },
            });

        if (consumed.count !== 1) {
            return null;
        }

        await transaction.oAuthAccessToken.create({
            data: {
                tokenHash: hashToken(accessToken),
                clientId: authorizationCode.clientId,
                workspaceId: authorizationCode.workspaceId,
                scopes: authorizationCode.scopes,
                expiresAt: addSeconds(
                    now,
                    ACCESS_TOKEN_LIFETIME_SECONDS
                ),
            },
        });

        await transaction.oAuthRefreshToken.create({
            data: {
                tokenHash: hashToken(refreshToken),
                familyId,
                clientId: authorizationCode.clientId,
                workspaceId: authorizationCode.workspaceId,
                scopes: authorizationCode.scopes,
                expiresAt: addSeconds(
                    now,
                    REFRESH_TOKEN_LIFETIME_SECONDS
                ),
            },
        });

        return true;
    });

    if (!result) {
        return oauthJsonError(
            "invalid_grant",
            "The authorization code has already been redeemed."
        );
    }

    return oauthSuccess({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_LIFETIME_SECONDS,
        refresh_token: refreshToken,
        scope: authorizationCode.scopes,
    });
}

async function exchangeRefreshToken(values: TokenRequest) {
    const client = findOAuthClient(values.clientId);

    if (
        !client ||
        !timingSafeEqual(values.clientSecret, client.clientSecret)
    ) {
        return oauthJsonError(
            "invalid_client",
            "The OAuth client credentials are invalid.",
            401
        );
    }

    if (!values.refreshToken) {
        return oauthJsonError(
            "invalid_request",
            "A refresh token is required."
        );
    }

    const refreshTokenHash = hashToken(values.refreshToken);
    const now = new Date();

    const storedRefreshToken =
        await prisma.oAuthRefreshToken.findUnique({
            where: {
                tokenHash: refreshTokenHash,
            },
        });

    if (!storedRefreshToken) {
        return oauthJsonError(
            "invalid_grant",
            "The refresh token is invalid."
        );
    }

    if (
        storedRefreshToken.revokedAt ||
        storedRefreshToken.replacedAt ||
        storedRefreshToken.expiresAt.getTime() <= now.getTime()
    ) {
        /*
         * Reuse of a rotated refresh token may indicate token theft.
         * Revoke the entire refresh-token family.
         */
        if (storedRefreshToken.replacedAt) {
            await prisma.oAuthRefreshToken.updateMany({
                where: {
                    familyId: storedRefreshToken.familyId,
                },
                data: {
                    revokedAt: now,
                },
            });
        }

        return oauthJsonError(
            "invalid_grant",
            "The refresh token is expired, revoked, or has already been rotated."
        );
    }

    if (
        !timingSafeEqual(
            storedRefreshToken.clientId,
            client.clientId
        )
    ) {
        return oauthJsonError(
            "invalid_grant",
            "The refresh token was issued to another client."
        );
    }

    const newAccessToken = generateSecureToken("mg_access");
    const newRefreshToken = generateSecureToken("mg_refresh");

    const rotated = await prisma.$transaction(
        async (transaction) => {
            const replaced =
                await transaction.oAuthRefreshToken.updateMany({
                    where: {
                        id: storedRefreshToken.id,
                        replacedAt: null,
                        revokedAt: null,
                        expiresAt: {
                            gt: now,
                        },
                    },
                    data: {
                        replacedAt: now,
                    },
                });

            if (replaced.count !== 1) {
                return false;
            }

            await transaction.oAuthAccessToken.create({
                data: {
                    tokenHash: hashToken(newAccessToken),
                    clientId: storedRefreshToken.clientId,
                    workspaceId: storedRefreshToken.workspaceId,
                    scopes: storedRefreshToken.scopes,
                    expiresAt: addSeconds(
                        now,
                        ACCESS_TOKEN_LIFETIME_SECONDS
                    ),
                },
            });

            await transaction.oAuthRefreshToken.create({
                data: {
                    tokenHash: hashToken(newRefreshToken),
                    familyId: storedRefreshToken.familyId,
                    clientId: storedRefreshToken.clientId,
                    workspaceId: storedRefreshToken.workspaceId,
                    scopes: storedRefreshToken.scopes,
                    expiresAt: addSeconds(
                        now,
                        REFRESH_TOKEN_LIFETIME_SECONDS
                    ),
                },
            });

            return true;
        }
    );

    if (!rotated) {
        return oauthJsonError(
            "invalid_grant",
            "The refresh token has already been used."
        );
    }

    return oauthSuccess({
        access_token: newAccessToken,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_LIFETIME_SECONDS,
        refresh_token: newRefreshToken,
        scope: storedRefreshToken.scopes,
    });
}

export async function POST(request: Request) {
    try {
        const values = await readTokenRequest(request);

        if (values.grantType === "authorization_code") {
            return exchangeAuthorizationCode(values);
        }

        if (values.grantType === "refresh_token") {
            return exchangeRefreshToken(values);
        }

        return oauthJsonError(
            "unsupported_grant_type",
            "Mailgine supports authorization_code and refresh_token grants."
        );
    } catch (error) {
        console.error("OAuth token error:", error);

        return oauthJsonError(
            "server_error",
            "Mailgine could not issue an OAuth token.",
            500
        );
    }
}