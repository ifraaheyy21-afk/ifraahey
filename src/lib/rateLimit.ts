import { prisma } from "./prisma";

type Window = { limit: number; windowMs: number; label: string };

// AI calls cost money per request, so limit each workspace per minute (bursts)
// and per day (sustained spend). Override with AI_RATE_LIMIT_PER_MINUTE and
// AI_RATE_LIMIT_PER_DAY.
function positiveInt(name: string, fallback: number) {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
}

const AI_WINDOWS: Window[] = [
    { limit: positiveInt("AI_RATE_LIMIT_PER_MINUTE", 20), windowMs: 60_000, label: "minute" },
    { limit: positiveInt("AI_RATE_LIMIT_PER_DAY", 500), windowMs: 24 * 60 * 60_000, label: "day" },
];

// Sending from the inbox goes to real recipients and spends the workspace's
// Resend quota and sender reputation. Override with
// INBOX_SEND_RATE_LIMIT_PER_MINUTE and INBOX_SEND_RATE_LIMIT_PER_DAY.
const INBOX_SEND_WINDOWS: Window[] = [
    { limit: positiveInt("INBOX_SEND_RATE_LIMIT_PER_MINUTE", 10), windowMs: 60_000, label: "minute" },
    { limit: positiveInt("INBOX_SEND_RATE_LIMIT_PER_DAY", 300), windowMs: 24 * 60 * 60_000, label: "day" },
];

const warnedUnavailable = new Set<string>();

/**
 * Count one request against `key` in a fixed window and report whether it
 * is allowed. Counters live in Postgres so every serverless instance shares
 * them; the upsert is atomic, so concurrent requests cannot both slip in.
 */
export async function rateLimit(key: string, limit: number, windowMs: number) {
    const resetAt = new Date(Date.now() + windowMs);

    const rows = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>`
        INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
        VALUES (${key}, 1, ${resetAt})
        ON CONFLICT ("key") DO UPDATE SET
            "count" = CASE WHEN "RateLimitBucket"."resetAt" <= NOW() THEN 1
                           ELSE "RateLimitBucket"."count" + 1 END,
            "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= NOW() THEN EXCLUDED."resetAt"
                             ELSE "RateLimitBucket"."resetAt" END
        RETURNING "count", "resetAt"
    `;

    const row = rows[0];
    return {
        allowed: row.count <= limit,
        retryAfterSeconds: Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000)),
    };
}

type Counter = (key: string, limit: number, windowMs: number) => Promise<{ allowed: boolean; retryAfterSeconds: number }>;

/**
 * Check every window for one workspace. Returns a 429 response to send, or
 * null when the request may proceed.
 *
 * Fails open if the counter table is unavailable (for example before the
 * migration is applied) so the feature keeps working; the problem is logged.
 */
export async function limitWorkspaceRequests(
    scope: string,
    workspaceId: string,
    windows: Window[],
    message: (window: Window) => string,
    counter: Counter = rateLimit,
): Promise<Response | null> {
    try {
        for (const window of windows) {
            const result = await counter(`${scope}:${window.label}:${workspaceId}`, window.limit, window.windowMs);
            if (!result.allowed) {
                return Response.json(
                    { error: message(window), code: "RATE_LIMITED" },
                    {
                        status: 429,
                        headers: {
                            "Retry-After": String(result.retryAfterSeconds),
                            "Cache-Control": "no-store",
                        },
                    },
                );
            }
        }
        return null;
    } catch (error) {
        if (!warnedUnavailable.has(scope)) {
            warnedUnavailable.add(scope);
            console.error(`Rate limiting for ${scope} is unavailable; requests are not being limited.`, error);
        }
        return null;
    }
}

/** Enforce the AI limits for a workspace. */
export function limitAiRequest(workspaceId: string): Promise<Response | null> {
    return limitWorkspaceRequests("ai", workspaceId, AI_WINDOWS,
        (window) => `AI request limit reached (${window.limit} per ${window.label}). Try again shortly.`);
}

/** Enforce the inbox sending limits for a workspace. */
export function limitInboxSend(workspaceId: string, counter?: Counter): Promise<Response | null> {
    return limitWorkspaceRequests("inbox-send", workspaceId, INBOX_SEND_WINDOWS,
        (window) => `You've reached the sending limit (${window.limit} emails per ${window.label}). Try again ${window.label === "minute" ? "in a minute" : "tomorrow"}.`,
        counter);
}
