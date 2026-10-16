const store = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 30, windowMs = 60_000) {
    const now = Date.now();
    const current = store.get(key);

    if (!current || current.resetAt < now) {
        store.set(key, {
            count: 1,
            resetAt: now + windowMs,
        });

        return { allowed: true };
    }

    if (current.count >= limit) {
        return { allowed: false };
    }

    current.count += 1;
    store.set(key, current);

    return { allowed: true };
}