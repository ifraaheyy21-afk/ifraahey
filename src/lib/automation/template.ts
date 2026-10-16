function getPath(source: unknown, path: string): unknown {
    return path
        .split(".")
        .filter(Boolean)
        .reduce<unknown>((value, key) => {
            if (!value || typeof value !== "object" || Array.isArray(value)) {
                return undefined;
            }
            return (value as Record<string, unknown>)[key];
        }, source);
}

export function renderTemplate(template: string, context: Record<string, unknown>) {
    return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (full, rawPath: string) => {
        const value = getPath(context, rawPath);
        if (value === null || value === undefined) return full;
        return String(value);
    });
}

export function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export function plainTextToHtml(value: string) {
    return `<p>${escapeHtml(value).replaceAll("\n", "<br />")}</p>`;
}
