import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.redirect(
        new URL("/dashboard/integrations/resend", process.env.NEXT_PUBLIC_APP_URL)
    );
}