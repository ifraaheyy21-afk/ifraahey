import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireWorkspace } from "../../../../../lib/auth/requireWorkspace";
import { plainTextToHtml } from "../../../../../lib/automation/template";

export const dynamic = "force-dynamic";

// Only emails the sender has not yet touched can be edited; once a send is
// attempted the exact provider payload is frozen for safe replay.
const EDITABLE_STATUSES = ["scheduled", "failed"];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireWorkspace(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await req.json();

    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const plainText = typeof body.plainText === "string" ? body.plainText.trim() : "";

    if (!subject) {
      return NextResponse.json(
        { error: "Subject is required." },
        { status: 400 }
      );
    }

    if (!plainText) {
      return NextResponse.json(
        { error: "Email body is required." },
        { status: 400 }
      );
    }

    const existingEmail = await prisma.scheduledEmail.findFirst({
      where: { id, workspaceId: auth.workspaceId },
    });

    if (!existingEmail) {
      return NextResponse.json(
        { error: "Queued email not found." },
        { status: 404 }
      );
    }

    if (
      !EDITABLE_STATUSES.includes(existingEmail.status) ||
      existingEmail.sendAttemptedAt
    ) {
      return NextResponse.json(
        { error: "This email has already been sent or is sending, so it can no longer be edited." },
        { status: 409 }
      );
    }

    // The sender delivers `html`, so regenerate it from the edited text.
    const updated = await prisma.scheduledEmail.updateMany({
      where: {
        id,
        workspaceId: auth.workspaceId,
        status: { in: EDITABLE_STATUSES },
        sendAttemptedAt: null,
      },
      data: {
        subject,
        plainText,
        html: plainTextToHtml(plainText),
      },
    });

    if (updated.count !== 1) {
      return NextResponse.json(
        { error: "This email started sending before your edit was saved." },
        { status: 409 }
      );
    }

    const updatedEmail = await prisma.scheduledEmail.findUnique({
      where: { id },
      include: { customer: true },
    });

    return NextResponse.json({
      email: updatedEmail,
    });
  } catch (error) {
    console.error("EMAIL_QUEUE_PATCH_ERROR", error);

    return NextResponse.json(
      { error: "Failed to update queued email." },
      { status: 500 }
    );
  }
}
