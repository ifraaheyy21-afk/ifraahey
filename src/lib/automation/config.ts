function readPositiveInteger(
    name: string,
    fallback: number,
) {
    const raw = process.env[name]?.trim();

    if (!raw) {
        return fallback;
    }

    const value = Number(raw);

    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(
            `${name} must be a positive integer.`,
        );
    }

    return value;
}

const staleRunAfterMs = readPositiveInteger(
    "AUTOMATION_STALE_RUN_AFTER_MS",
    15 * 60 * 1000,
);

const runHeartbeatMs = readPositiveInteger(
    "AUTOMATION_RUN_HEARTBEAT_MS",
    60 * 1000,
);

if (runHeartbeatMs >= staleRunAfterMs) {
    throw new Error(
        "AUTOMATION_RUN_HEARTBEAT_MS must be lower than AUTOMATION_STALE_RUN_AFTER_MS.",
    );
}

export const automationConfig = {
    maxNodes: readPositiveInteger(
        "AUTOMATION_MAX_NODES",
        100,
    ),
    maxConnections: readPositiveInteger(
        "AUTOMATION_MAX_CONNECTIONS",
        200,
    ),
    maxStepsPerRun: readPositiveInteger(
        "AUTOMATION_MAX_STEPS_PER_RUN",
        100,
    ),
    workerBatchSize: readPositiveInteger(
        "AUTOMATION_WORKER_BATCH_SIZE",
        25,
    ),
    maxTagLength: readPositiveInteger(
        "AUTOMATION_MAX_TAG_LENGTH",
        80,
    ),
    aiMaxPromptLength: readPositiveInteger(
        "AUTOMATION_AI_MAX_PROMPT_LENGTH",
        4000,
    ),
    aiMaxOperations: readPositiveInteger(
        "AUTOMATION_AI_MAX_OPERATIONS",
        50,
    ),
    staleRunAfterMs,
    runHeartbeatMs,

    workerSecret() {
        return (
            process.env.AUTOMATION_WORKER_SECRET?.trim() ||
            process.env.CRON_SECRET?.trim() ||
            ""
        );
    },

    builderModel() {
        return (
            process.env.AUTOMATION_BUILDER_MODEL?.trim() ||
            "gpt-4.1-mini"
        );
    },
} as const;
