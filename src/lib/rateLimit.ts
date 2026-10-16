import { NextResponse } from "next/server";

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

let warnedUnavailable = false;

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

/**
 * Enforce the AI limits for a workspace. Returns a 429 response to send, or
 * null when the request may proceed.
 *
 * Fails open if the counter table is unavailable (for example before the
 * migration is applied) so AI features keep working; the problem is logged.
 */
export async function limitAiRequest(workspaceId: string): Promise<NextResponse | null> {
    try {
        for (const window of AI_WINDOWS) {
            const result = await rateLimit(`ai:${window.label}:${workspaceId}`, window.limit, window.windowMs);
            if (!result.allowed) {
                return NextResponse.json(
                    {
                        error: `AI request limit reached (${window.limit} per ${window.label}). Try again shortly.`,
                        code: "RATE_LIMITED",
                    },
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
        if (!warnedUnavailable) {
            warnedUnavailable = true;
            console.error("AI rate limiting is unavailable; requests are not being limited.", error);
        }
        return null;
    }
}
