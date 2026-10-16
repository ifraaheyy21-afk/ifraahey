import { NextRequest, NextResponse } from "next/server";
import {
    areScopesValid,
    findOAuthClient,
    isAllowedRedirectUri,
    parseScopes,
} from "../../../../../lib/oauth";
import { oauthJsonError } from "../../../../../lib/oauth-responses";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
    try {
        const clientId = request.nextUrl.searchParams.get("client_id") || "";
        const redirectUri =
            request.nextUrl.searchParams.get("redirect_uri") || "";
        const responseType =
            request.nextUrl.searchParams.get("response_type") || "";
        const scope = request.nextUrl.searchParams.get("scope");

        const client = findOAuthClient(clientId);

        if (!client) {
            return oauthJsonError(
                "invalid_client",
                "The supplied OAuth client is not registered.",
                401
            );
        }

        if (!isAllowedRedirectUri(client, redirectUri)) {
            return oauthJsonError(
                "invalid_request",
                "The redirect URI is not registered for this client."
            );
        }

        if (responseType !== "code") {
            return oauthJsonError(
                "unsupported_response_type",
                "Mailgine supports only response_type=code."
            );
        }

        if (!areScopesValid(scope)) {
            return oauthJsonError(
                "invalid_scope",
                "One or more requested scopes are unsupported."
            );
        }

        return NextResponse.json(
            {
                clientName: client.name,
                scopes: parseScopes(scope),
            },
            {
                headers: {
                    "Cache-Control": "no-store",
                },
            }
        );
    } catch (error) {
        console.error("OAuth validation error:", error);

        return oauthJsonError(
            "server_error",
            "Mailgine could not validate this authorization request.",
            500
        );
    }
}