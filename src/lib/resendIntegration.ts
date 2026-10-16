import { createHash } from "node:crypto";
import { Resend } from "resend";
import { prisma } from "../lib/prisma";
import { decryptIntegrationSecret } from "../lib/integrationEncryption";

type ResendApiError = {
    name?: string;
    message?: string;
    statusCode?: number;
};

export type ValidateResendKeyResult =
    | {
        valid: true;
        permission: "full_access" | "sending_access";
        domains: Array<{
            id: string;
            name: string;
            status: string;
        }>;
    }
    | {
        valid: false;
        error: string;
    };

export async function validateResendApiKey(
    apiKey: string
): Promise<ValidateResendKeyResult> {
    try {
        const response = await fetch("https://api.resend.com/domains", {
            method: "GET",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: "application/json",
            },
            cache: "no-store",
        });

        const payload = (await response.json().catch(() => null)) as
            | {
                data?: Array<{
                    id?: string;
                    name?: string;
                    status?: string;
                }>;
                name?: string;
                message?: string;
            }
            | null;

        if (response.ok) {
            const domains = Array.isArray(payload?.data)
                ? payload.data
                    .filter(
                        (
                            domain
                        ): domain is {
                            id: string;
                            name: string;
                            status: string;
                        } =>
                            typeof domain.id === "string" &&
                            typeof domain.name === "string" &&
                            typeof domain.status === "string"
                    )
                    .map((domain) => ({
                        id: domain.id,
                        name: domain.name,
                        status: domain.status,
                    }))
                : [];

            return {
                valid: true,
                permission: "full_access",
                domains,
            };
        }

        /*
         * A legitimate sending-only key is authenticated by Resend but cannot
         * access the domains endpoint. Resend returns restricted_api_key.
         */
        if (
            response.status === 401 &&
            payload?.name === "restricted_api_key"
        ) {
            return {
                valid: true,
                permission: "sending_access",
                domains: [],
            };
        }

        return {
            valid: false,
            error:
                payload?.message ||
                "Resend rejected this API key. Check the key and try again.",
        };
    } catch (error) {
        console.error("Resend key validation failed:", error);

        return {
            valid: false,
            error:
                "Mailgine could not reach Resend. Check your connection and try again.",
        };
    }
}

export async function getWorkspaceResendClient(workspaceId: string) {
    const integration = await prisma.workspaceIntegration.findUnique({
        where: {
            workspaceId_provider: {
                workspaceId,
                provider: "resend",
            },
        },
        select: {
            accessToken: true,
            status: true,
            metadata: true,
        },
    });

    if (
        !integration ||
        integration.status !== "connected" ||
        !integration.accessToken
    ) {
        throw new Error(
            "Resend is not connected for this workspace."
        );
    }

    let apiKey: string;

    try {
        apiKey = decryptIntegrationSecret(integration.accessToken);
    } catch (error) {
        console.error("Failed to decrypt Resend API key:", error);

        throw new Error(
            "The connected Resend credential could not be decrypted. Reconnect Resend."
        );
    }

    // Bind retry checks to the same credential used to construct this client.
    // This server-side fingerprint contains no plaintext API key. A changed
    // key requires review of uncertain sends, even if it belongs to the same account.
    const credentialFingerprint = createHash("sha256")
        .update("mailgine:resend-credential:v1\0")
        .update(apiKey)
        .digest("hex");

    return {
        resend: new Resend(apiKey),
        metadata: integration.metadata,
        credentialFingerprint,
    };
}

export function getResendErrorMessage(error: unknown): string {
    if (!error || typeof error !== "object") {
        return "An unknown Resend error occurred.";
    }

    const resendError = error as ResendApiError;

    return resendError.message || "Resend could not process this request.";
}
