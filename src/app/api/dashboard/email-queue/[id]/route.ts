import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const existingEmail = await prisma.scheduledEmail.findUnique({
      where: { id },
    });

    if (!existingEmail) {
      return NextResponse.json(
        { error: "Queued email not found." },
        { status: 404 }
      );
    }

    if (existingEmail.status === "sent") {
      return NextResponse.json(
        { error: "Sent emails cannot be edited." },
        { status: 409 }
      );
    }

    if (existingEmail.status === "cancelled") {
      return NextResponse.json(
        { error: "Cancelled emails cannot be edited." },
        { status: 409 }
      );
    }

    const updatedEmail = await prisma.scheduledEmail.update({
      where: { id },
      data: {
        subject,
        plainText,
      },
      include: {
        customer: true,
      },
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