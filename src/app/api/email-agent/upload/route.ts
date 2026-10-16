import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase";

export const runtime = "nodejs";

const BUCKET_NAME = "email-samples";
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

function getFileExtension(fileName: string) {
    const ext = fileName.split(".").pop()?.toLowerCase();

    if (ext === "jpg" || ext === "jpeg") return "jpg";
    if (ext === "png") return "png";
    if (ext === "webp") return "webp";

    return "png";
}

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get("file");
        const workspaceId = String(formData.get("workspaceId") || "").trim();

        if (!workspaceId) {
            return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
        }

        if (!(file instanceof File)) {
            return NextResponse.json({ error: "File required" }, { status: 400 });
        }

        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            return NextResponse.json(
                { error: "Only PNG, JPG, JPEG, or WEBP images are allowed." },
                { status: 400 }
            );
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: "Image must be under 5MB." },
                { status: 400 }
            );
        }

        const fileExt = getFileExtension(file.name);
        const safeWorkspaceId = workspaceId.replace(/[^a-zA-Z0-9-_]/g, "");
        const storagePath = `${safeWorkspaceId}/${crypto.randomUUID()}.${fileExt}`;

        const buffer = Buffer.from(await file.arrayBuffer());

        const { error } = await supabaseAdmin.storage
            .from(BUCKET_NAME)
            .upload(storagePath, buffer, {
                contentType: file.type,
                upsert: false,
            });

        if (error) {
            console.error("Supabase upload error:", error);

            return NextResponse.json(
                { error: error.message || "Failed to upload to storage." },
                { status: 500 }
            );
        }

        const { data } = supabaseAdmin.storage
            .from(BUCKET_NAME)
            .getPublicUrl(storagePath);

        if (!data?.publicUrl) {
            return NextResponse.json(
                { error: "Could not create public image URL." },
                { status: 500 }
            );
        }

        return NextResponse.json({
            imageUrl: data.publicUrl,
            storagePath,
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
        });
    } catch (error) {
        console.error("Upload sample error:", error);

        return NextResponse.json(
            { error: "Failed to upload sample." },
            { status: 500 }
        );
    }
}