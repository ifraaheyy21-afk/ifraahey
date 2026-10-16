import { NextResponse } from "next/server";
import {
    getResendErrorMessage,
    getWorkspaceResendClient,
} from "../../../../lib/resendIntegration";

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const { to, subject, html, workspaceId } = body;

        if (!to || !subject || !html || !workspaceId) {
            return NextResponse.json(
                {
                    error:
                        "Missing to, subject, html, or workspaceId.",
                },
                { status: 400 }
            );
        }

        const { resend, metadata } =
            await getWorkspaceResendClient(workspaceId);

        const resendMetadata =
            metadata &&
                typeof metadata === "object" &&
                !Array.isArray(metadata)
                ? (metadata as {
                    senderName?: string | null;
                    senderEmail?: string | null;
                })
                : {};

        const senderEmail = resendMetadata.senderEmail;
        const senderName = resendMetadata.senderName;

        if (!senderEmail) {
            return NextResponse.json(
                {
                    error:
                        "The connected Resend account does not have a sender email.",
                },
                { status: 400 }
            );
        }

        const from = senderName
            ? `${senderName} <${senderEmail}>`
            : senderEmail;

        const result = await resend.emails.send({
            from,
            to,
            subject,
            html,
        });

        if (result.error) {
            throw new Error(
                getResendErrorMessage(result.error)
            );
        }

        if (!result.data?.id) {
            throw new Error(
                "Resend did not return an email identifier."
            );
        }

        return NextResponse.json({
            success: true,
            data: result.data,
        });
    } catch (error) {
        console.error("Resend send error:", error);

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to send email.",
            },
            { status: 500 }
        );
    }
}