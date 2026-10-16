export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    const { checkEnvironment } = await import("./lib/env");
    const { errors, warnings } = checkEnvironment();

    for (const warning of warnings) {
        console.warn(`[config] ${warning}`);
    }

    if (errors.length === 0) return;

    const message = `Server configuration is incomplete:\n- ${errors.join("\n- ")}\nSee .env.example.`;

    // Fail fast in production rather than on a customer's first request.
    if (process.env.NODE_ENV === "production") {
        throw new Error(message);
    }
    console.error(`[config] ${message}`);
}
