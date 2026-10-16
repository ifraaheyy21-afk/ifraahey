import { NextResponse } from "next/server";

export function oauthJsonError(
    error: string,
    description: string,
    status = 400
) {
    return NextResponse.json(
        {
            error,
            error_description: description,
        },
        {
            status,
            headers: {
                "Cache-Control": "no-store",
                Pragma: "no-cache",
            },
        }
    );
}

export function oauthSuccess(body: Record<string, unknown>) {
    return NextResponse.json(body, {
        status: 200,
        headers: {
            "Cache-Control": "no-store",
            Pragma: "no-cache",
        },
    });
}