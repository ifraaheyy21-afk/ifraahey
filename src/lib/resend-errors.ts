// Plain-language messages for Resend problems. Kept free of Prisma and the
// Resend SDK so the inbox sender and tests can use it.

/**
 * Free mailbox providers. Resend can only send from a domain you own and have
 * verified, so these can never be a sender address.
 */
const FREE_EMAIL_DOMAINS = new Set([
    "gmail.com", "googlemail.com",
    "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "live.co.uk", "msn.com",
    "yahoo.com", "yahoo.co.uk", "yahoo.fr", "ymail.com", "rocketmail.com",
    "icloud.com", "me.com", "mac.com",
    "aol.com", "proton.me", "protonmail.com", "pm.me",
    "gmx.com", "gmx.de", "gmx.net", "web.de", "mail.com",
    "zoho.com", "yandex.com", "yandex.ru", "mail.ru",
    "fastmail.com", "hey.com", "tutanota.com", "qq.com", "163.com",
]);

export function isFreeEmailDomain(email: string) {
    const domain = email.trim().toLowerCase().split("@").at(-1) ?? "";
    return FREE_EMAIL_DOMAINS.has(domain);
}

export const FREE_SENDER_MESSAGE =
    "Resend can't send from Gmail, Outlook, Yahoo or other free email addresses. " +
    "Use an address on a domain you own and have verified in Resend, such as hello@yourcompany.com.";

export const INVALID_KEY_MESSAGE =
    "Resend says this API key is invalid. It may have been deleted, revoked or copied incompletely. " +
    "Create a new key in Resend under API Keys and paste the whole key here.";

const SAVED_KEY_INVALID_MESSAGE =
    "Resend rejected the saved API key. It may have been deleted or revoked. " +
    "Reconnect Resend in Integrations with a current key.";

type ResendLikeError = { name?: unknown; message?: unknown; statusCode?: unknown };

/**
 * Turn an error returned by Resend into a message the user can act on.
 * `context` says whether the key is being entered now or was saved earlier.
 */
export function friendlyResendError(error: unknown, context: "connect" | "send" = "send"): string {
    const value = error && typeof error === "object" ? (error as ResendLikeError) : {};
    const name = typeof value.name === "string" ? value.name : "";
    const message = typeof value.message === "string" ? value.message.trim() : "";

    if (name === "missing_api_key" || name === "invalid_api_key" || /api key is invalid/i.test(message)) {
        return context === "connect" ? INVALID_KEY_MESSAGE : SAVED_KEY_INVALID_MESSAGE;
    }
    const unverified = message.match(/the (\S+) domain is not verified/i);
    if (unverified) {
        return `The sender domain ${unverified[1]} isn't verified in Resend. ` +
            "Verify it under Domains in Resend, or reconnect Resend with a sender address on a verified domain.";
    }
    if (/only send testing emails to your own email/i.test(message)) {
        return "Resend's test sender (resend.dev) can only email the address you signed up to Resend with. " +
            "Verify your own domain in Resend to email anyone else.";
    }
    if (name === "restricted_api_key") {
        return "This Resend API key isn't allowed to do that. Check its permission and domain in Resend under API Keys.";
    }
    if (name === "rate_limit_exceeded" || value.statusCode === 429) {
        return "Resend is limiting how fast emails can be sent. Wait a moment and try again.";
    }
    return message || "Resend could not process this request.";
}
