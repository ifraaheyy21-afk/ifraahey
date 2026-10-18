/**
 * Helpers for showing email HTML safely.
 *
 * Email HTML is untrusted. It is always shown inside a sandboxed iframe with
 * scripts disabled (see `emailFrameDocument`). `sanitiseEmailHtml` is a second
 * line of defence applied when a message is stored: it removes active content
 * so a later rendering mistake cannot run it.
 */

// Removed together with everything inside them.
const ACTIVE_BLOCKS = /<\s*(script|iframe|frameset|object|applet|noscript|template|svg|math)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
// Any remaining opening or closing tag of an active element (unclosed blocks,
// void elements like <meta>, <base> and <embed>, and form controls' wrapper).
const ACTIVE_TAGS = /<\s*\/?\s*(script|iframe|frame|frameset|object|embed|applet|form|base|meta|link|noscript|template|svg|math)\b[^>]*>/gi;
const EVENT_HANDLERS = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const SCRIPT_URLS = /\s(href|src|action|formaction|xlink:href|background|poster)\s*=\s*(["']?)\s*(?:javascript|vbscript|data:text\/html)[^"'\s>]*\2/gi;
const SRCDOC = /\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const CSS_EXPRESSIONS = /expression\s*\(|javascript\s*:|-moz-binding/gi;

export function sanitiseEmailHtml(html: string): string {
    let result = html;
    // Repeat until stable so nested tricks like <scr<script>ipt> collapse.
    for (let pass = 0; pass < 3; pass += 1) {
        const before = result;
        result = result
            .replace(/<!--[\s\S]*?-->/g, "")
            .replace(ACTIVE_BLOCKS, "")
            .replace(ACTIVE_TAGS, "")
            .replace(EVENT_HANDLERS, "")
            .replace(SCRIPT_URLS, ' $1="#"')
            .replace(SRCDOC, "")
            .replace(CSS_EXPRESSIONS, "");
        if (result === before) break;
    }
    return result;
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** Returns a normalised URL when it is http(s) or mailto, otherwise null. */
export function safeLinkUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed
        : trimmed.includes("@") && !trimmed.includes("/") ? `mailto:${trimmed}` : `https://${trimmed}`;
    try {
        const url = new URL(candidate);
        return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
    } catch {
        return null;
    }
}

/**
 * The full document for a sandboxed email iframe: a strict CSP (no scripts,
 * no forms, no frames), links open in a new tab, and quiet default styles.
 */
export function emailFrameDocument(html: string): string {
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data: cid:; style-src 'unsafe-inline' https:; font-src https: data:; form-action 'none'; frame-src 'none'">
<base target="_blank">
<style>
html,body{margin:0;padding:0;background:#fff;color:#111827;font:13px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;overflow-wrap:anywhere}
body{display:flow-root}
img{max-width:100%;height:auto}
table{max-width:100%}
a{color:#2f6feb}
blockquote{margin:8px 0;padding-left:12px;border-left:2px solid #e5e7eb;color:#6b7280}
p:first-child{margin-top:0}
</style></head><body>${sanitiseEmailHtml(html)}</body></html>`;
}
