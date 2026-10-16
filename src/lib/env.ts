// Server configuration checks, run once at startup from src/instrumentation.ts.
// `.env.example` documents every variable listed here.

type Check = {
    names: string[];
    // Satisfied when any one of `names` is set (for example APP_URL or NEXT_PUBLIC_APP_URL).
    anyOf?: boolean;
    purpose: string;
    validate?: (value: string) => string | null;
};

function read(name: string) {
    return process.env[name]?.trim() ?? "";
}

const REQUIRED: Check[] = [
    { names: ["DATABASE_URL"], purpose: "Postgres connection" },
    { names: ["FIREBASE_PROJECT_ID"], purpose: "verifying sign-ins" },
    { names: ["FIREBASE_CLIENT_EMAIL"], purpose: "verifying sign-ins" },
    { names: ["FIREBASE_PRIVATE_KEY"], purpose: "verifying sign-ins" },
    {
        names: ["INTEGRATION_ENCRYPTION_KEY"],
        purpose: "encrypting integration credentials",
        validate: (value) => /^[a-fA-F0-9]{64}$/.test(value)
            ? null
            : "must be 64 hex characters (generate with: openssl rand -hex 32)",
    },
    {
        names: ["CRON_SECRET"],
        purpose: "authenticating the send and automation crons",
        validate: (value) => value.length >= 16 ? null : "must be at least 16 characters",
    },
    {
        names: ["APP_URL", "NEXT_PUBLIC_APP_URL"],
        anyOf: true,
        purpose: "links in emails (tracking, unsubscribe) and webhooks",
        validate: (value) => {
            try {
                const url = new URL(value);
                const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
                return process.env.NODE_ENV === "production" && url.protocol !== "https:" && !local
                    ? "must be an https:// URL in production"
                    : null;
            } catch {
                return "must be a full URL, for example https://app.example.com";
            }
        },
    },
];

const OPTIONAL: Check[] = [
    { names: ["OPENAI_API_KEY"], purpose: "AI email generation, insights and the AI workflow builder" },
    { names: ["UNSUBSCRIBE_SECRET"], purpose: "signing unsubscribe links (falls back to CRON_SECRET)" },
    { names: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], purpose: "uploading email sample images" },
    { names: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"], purpose: "the Google Calendar integration" },
    { names: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "SLACK_REDIRECT_URI"], purpose: "the Slack integration" },
    { names: ["SALESFORCE_CLIENT_ID", "SALESFORCE_CLIENT_SECRET", "SALESFORCE_REDIRECT_URI"], purpose: "the Salesforce integration" },
    { names: ["PIPEDRIVE_CLIENT_ID", "PIPEDRIVE_CLIENT_SECRET", "PIPEDRIVE_REDIRECT_URI"], purpose: "the Pipedrive integration" },
    { names: ["INTERCOM_CLIENT_ID", "INTERCOM_CLIENT_SECRET"], purpose: "the Intercom integration" },
    { names: ["ZAPIER_OAUTH_CLIENT_ID", "ZAPIER_OAUTH_CLIENT_SECRET", "ZAPIER_OAUTH_REDIRECT_URI"], purpose: "the Zapier app" },
];

export function checkEnvironment() {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const check of REQUIRED) {
        const values = check.names.map((name) => [name, read(name)] as const);
        const present = values.filter(([, value]) => value);

        if (check.anyOf ? present.length === 0 : present.length !== values.length) {
            const missing = check.anyOf
                ? check.names.join(" or ")
                : values.filter(([, value]) => !value).map(([name]) => name).join(", ");
            errors.push(`${missing} is not set (needed for ${check.purpose}).`);
            continue;
        }

        for (const [name, value] of present) {
            const problem = check.validate?.(value);
            if (problem) errors.push(`${name} ${problem}.`);
        }
    }

    for (const check of OPTIONAL) {
        const missing = check.names.filter((name) => !read(name));
        if (missing.length > 0) {
            warnings.push(`${missing.join(", ")} not set: ${check.purpose} will be unavailable.`);
        }
    }

    return { errors, warnings };
}
