import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
    const rawKey = process.env.INTEGRATION_ENCRYPTION_KEY;

    if (!rawKey) {
        throw new Error(
            "Missing INTEGRATION_ENCRYPTION_KEY environment variable."
        );
    }

    if (!/^[a-fA-F0-9]{64}$/.test(rawKey)) {
        throw new Error(
            "INTEGRATION_ENCRYPTION_KEY must be exactly 64 hexadecimal characters."
        );
    }

    return Buffer.from(rawKey, "hex");
}

export function encryptIntegrationSecret(value: string): string {
    if (!value) {
        throw new Error("Cannot encrypt an empty integration secret.");
    }

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return [
        "v1",
        iv.toString("base64url"),
        authTag.toString("base64url"),
        encrypted.toString("base64url"),
    ].join(".");
}

export function decryptIntegrationSecret(payload: string): string {
    if (!payload) {
        throw new Error("Missing encrypted integration secret.");
    }

    const [version, ivEncoded, tagEncoded, encryptedEncoded] =
        payload.split(".");

    if (
        version !== "v1" ||
        !ivEncoded ||
        !tagEncoded ||
        !encryptedEncoded
    ) {
        throw new Error("Invalid encrypted integration secret format.");
    }

    const key = getEncryptionKey();
    const iv = Buffer.from(ivEncoded, "base64url");
    const authTag = Buffer.from(tagEncoded, "base64url");
    const encrypted = Buffer.from(encryptedEncoded, "base64url");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });

    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
    ]);

    return decrypted.toString("utf8");
}