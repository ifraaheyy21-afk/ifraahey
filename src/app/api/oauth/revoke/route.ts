import { prisma } from "../../../../lib/prisma";
import {
    extractBasicClientCredentials,
    findOAuthClient,
    hashToken,
    timingSafeEqual,
} from "../../../../lib/oauth";
import { oauthJsonError, oauthSuccess } from "../../../../lib/oauth-responses";

export const runtime = "nodejs";

export async function POST(request: Request) {
    try {
        const contentType = request.headers.get("content-type") || "";

        let token = "";
        let bodyClientId = "";
        let bodyClientSecret = "";

        if (contentType.includes("application/json")) {
            const body = (await request.json()) as Record<string, unknown>;

            token = String(body.token || "");
            bodyClientId = String(body.client_id || "");
            bodyClientSecret = String(body.client_secret || "");
        } else {
            const params = new URLSearchParams(await request.text());

            token = params.get("token") || "";
            bodyClientId = params.get("client_id") || "";
            bodyClientSecret = params.get("client_secret") || "";
        }

        const basicCredentials = extractBasicClientCredentials(request);

        const clientId =
            basicCredentials?.clientId || bodyClientId;
        const clientSecret =
            basicCredentials?.clientSecret || bodyClientSecret;

        const client = findOAuthClient(clientId);

        if (
            !client ||
            !timingSafeEqual(clientSecret, client.clientSecret)
        ) {
            return oauthJsonError(
                "invalid_client",
                "The OAuth client credentials are invalid.",
                401
            );
        }

        if (!token) {
            return oauthJsonError(
                "invalid_request",
                "A token is required."
            );
        }

        const tokenHash = hashToken(token);
        const now = new Date();

        const refreshToken =
            await prisma.oAuthRefreshToken.findUnique({
                where: {
                    tokenHash,
                },
            });

        if (refreshToken && refreshToken.clientId === client.clientId) {
            await prisma.$transaction([
                prisma.oAuthRefreshToken.updateMany({
                    where: {
                        familyId: refreshToken.familyId,
                    },
                    data: {
                        revokedAt: now,
                    },
                }),

                prisma.oAuthAccessToken.updateMany({
                    where: {
                        clientId: refreshToken.clientId,
                        workspaceId: refreshToken.workspaceId,
                        revokedAt: null,
                    },
                    data: {
                        revokedAt: now,
                    },
                }),
            ]);

            return oauthSuccess({});
        }

        await prisma.oAuthAccessToken.updateMany({
            where: {
                tokenHash,
                clientId: client.clientId,
            },
            data: {
                revokedAt: now,
            },
        });

        /*
         * OAuth revocation endpoints return success even when the token
         * was already invalid, preventing token-state information leaks.
         */
        return oauthSuccess({});
    } catch (error) {
        console.error("OAuth revocation error:", error);

        return oauthJsonError(
            "server_error",
            "Mailgine could not revoke the token.",
            500
        );
    }
}