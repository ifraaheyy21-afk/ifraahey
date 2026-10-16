import { NextResponse } from "next/server";
import { authenticateOAuthRequest } from "../../../../lib/oauth";

export const runtime = "nodejs";

export async function GET(request: Request) {
    try {
        const authentication = await authenticateOAuthRequest(
            request,
            "workspace:read"
        );

        if (!authentication) {
            return NextResponse.json(
                {
                    error: "invalid_token",
                    message:
                        "The access token is invalid, expired, or missing the required scope.",
                },
                {
                    status: 401,
                    headers: {
                        "WWW-Authenticate": 'Bearer realm="Mailgine"',
                    },
                }
            );
        }

        return NextResponse.json({
            id: authentication.workspace.id,
            workspace_id: authentication.workspace.id,
            workspace_name:
                authentication.workspace.name || "Mailgine workspace",
            email: authentication.workspace.userEmail,
        });
    } catch (error) {
        console.error("Zapier authentication test error:", error);

        return NextResponse.json(
            {
                error: "server_error",
                message: "Mailgine could not verify this connection.",
            },
            {
                status: 500,
            }
        );
    }
}