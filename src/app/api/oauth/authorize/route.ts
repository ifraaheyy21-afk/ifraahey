import { NextResponse } from "next/server";
import { firebaseAdminAuth } from "../../../../lib/firebase-admin";
import { prisma } from "../../../../lib/prisma";
import {
    addSeconds,
    areScopesValid,
    AUTHORIZATION_CODE_LIFETIME_SECONDS,
    extractBearerToken,
    findOAuthClient,
    generateSecureToken,
    hashToken,
    isAllowedRedirectUri,
    parseScopes,
    scopesToString,
} from "../../../../lib/oauth";
import { oauthJsonError } from "../../../../lib/oauth-responses";

export const runtime = "nodejs";

type AuthorizationBody = {
    approved?: boolean;
    clientId?: string;
    redirectUri?: string;
    responseType?: string;
    scope?: string;
    state?: string;
    codeChallenge?: string | null;
    codeChallengeMethod?: string | null;
};

function buildRedirect(
    redirectUri: string,
    values: Record<string, string | undefined>
) {
    const url = new URL(redirectUri);

    for (const [key, value] of Object.entries(values)) {
        if (value) {
            url.searchParams.set(key, value);
        }
    }

    return url.toString();
}

export async function POST(request: Request) {
    try {
        const firebaseIdToken = extractBearerToken(request);

        if (!firebaseIdToken) {
            return oauthJsonError(
                "access_denied",
                "You must sign in to Mailgine before authorizing Zapier.",
                401
            );
        }

        let decodedToken;

        try {
            decodedToken = await firebaseAdminAuth.verifyIdToken(
                firebaseIdToken,
                true
            );
        } catch {
            return oauthJsonError(
                "access_denied",
                "Your Mailgine session is invalid or expired.",
                401
            );
        }

        if (!decodedToken.email) {
            return oauthJsonError(
                "access_denied",
                "Your Mailgine account does not have an email address.",
                403
            );
        }

        const body = (await request.json()) as AuthorizationBody;

        const clientId = body.clientId || "";
        const redirectUri = body.redirectUri || "";
        const responseType = body.responseType || "";
        const requestedScope = body.scope || "workspace:read";
        const state = body.state || "";

        const client = findOAuthClient(clientId);

        if (!client) {
            return oauthJsonError(
                "invalid_client",
                "The OAuth client is not registered.",
                401
            );
        }

        if (!isAllowedRedirectUri(client, redirectUri)) {
            return oauthJsonError(
                "invalid_request",
                "The redirect URI does not match the registered URI."
            );
        }

        if (responseType !== "code") {
            return oauthJsonError(
                "unsupported_response_type",
                "Mailgine supports only the authorization-code flow."
            );
        }

        if (!areScopesValid(requestedScope)) {
            return oauthJsonError(
                "invalid_scope",
                "One or more requested OAuth scopes are unsupported."
            );
        }

        if (
            body.codeChallengeMethod &&
            body.codeChallengeMethod !== "S256"
        ) {
            return oauthJsonError(
                "invalid_request",
                "Only the S256 PKCE challenge method is supported."
            );
        }

        if (!body.approved) {
            return NextResponse.json({
                redirectTo: buildRedirect(redirectUri, {
                    error: "access_denied",
                    error_description:
                        "The user declined the Mailgine connection.",
                    state,
                }),
            });
        }

        const workspace = await prisma.workspace.findUnique({
            where: {
                userEmail: decodedToken.email,
            },
        });

        if (!workspace) {
            return oauthJsonError(
                "access_denied",
                "No Mailgine workspace is associated with this account.",
                403
            );
        }

        const scopes = scopesToString(parseScopes(requestedScope));
        const rawAuthorizationCode = generateSecureToken("mg_code");
        const codeHash = hashToken(rawAuthorizationCode);
        const now = new Date();

        await prisma.$transaction([
            prisma.oAuthConsent.upsert({
                where: {
                    workspaceId_clientId: {
                        workspaceId: workspace.id,
                        clientId,
                    },
                },
                update: {
                    scopes,
                },
                create: {
                    workspaceId: workspace.id,
                    clientId,
                    scopes,
                },
            }),

            prisma.oAuthAuthorizationCode.create({
                data: {
                    codeHash,
                    clientId,
                    workspaceId: workspace.id,
                    redirectUri,
                    scopes,
                    codeChallenge: body.codeChallenge || null,
                    codeChallengeMethod:
                        body.codeChallengeMethod || null,
                    expiresAt: addSeconds(
                        now,
                        AUTHORIZATION_CODE_LIFETIME_SECONDS
                    ),
                },
            }),
        ]);

        return NextResponse.json({
            redirectTo: buildRedirect(redirectUri, {
                code: rawAuthorizationCode,
                state,
            }),
        });
    } catch (error) {
        console.error("OAuth authorization error:", error);

        return oauthJsonError(
            "server_error",
            "Mailgine could not complete the authorization request.",
            500
        );
    }
}