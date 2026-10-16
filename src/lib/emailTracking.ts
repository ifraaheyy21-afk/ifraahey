import { prisma } from "./prisma";

export function getAppUrl() {
    return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function trackingPixelUrl(scheduledEmailId: string) {
    return `${getAppUrl()}/api/email-agent/track/open?sid=${encodeURIComponent(
        scheduledEmailId
    )}`;
}

export function appendOpenTracking(html: string, scheduledEmailId: string) {
    const pixel = `<img src="${trackingPixelUrl(
        scheduledEmailId
    )}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;" />`;

    if (html.includes("</body>")) {
        return html.replace("</body>", `${pixel}</body>`);
    }

    return `${html}${pixel}`;
}

function shouldTrackUrl(url: string) {
    if (!url) return false;
    if (url.startsWith("#")) return false;
    if (url.startsWith("mailto:")) return false;
    if (url.startsWith("tel:")) return false;
    if (url.startsWith("sms:")) return false;
    if (url.startsWith("javascript:")) return false;
    return true;
}

function buildAbsoluteUrl(url: string) {
    if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
    }

    return `${getAppUrl()}${url.startsWith("/") ? url : `/${url}`}`;
}

export async function rewriteLinksForTracking({
    html,
    workspaceId,
    scheduledEmailId,
    customerId,
}: {
    html: string;
    workspaceId: string;
    scheduledEmailId: string;
    customerId: string;
}) {
    const hrefRegex = /href=(["'])(.*?)\1/g;

    const matches = [...html.matchAll(hrefRegex)];

    if (matches.length === 0) return html;

    let trackedHtml = html;

    for (const match of matches) {
        const quote = match[1];
        const originalHref = match[2];

        if (!shouldTrackUrl(originalHref)) continue;

        const absoluteUrl = buildAbsoluteUrl(originalHref);

        const trackedLink = await prisma.trackedLink.create({
            data: {
                workspaceId,
                scheduledEmailId,
                customerId,
                originalUrl: absoluteUrl,
            },
        });

        const trackingUrl = `${getAppUrl()}/api/email-agent/track/click?lid=${encodeURIComponent(
            trackedLink.id
        )}`;

        trackedHtml = trackedHtml.replace(
            `href=${quote}${originalHref}${quote}`,
            `href=${quote}${trackingUrl}${quote}`
        );
    }

    return trackedHtml;
}

export async function prepareTrackedEmailHtml({
    html,
    workspaceId,
    scheduledEmailId,
    customerId,
}: {
    html: string;
    workspaceId: string;
    scheduledEmailId: string;
    customerId: string;
}) {
    const htmlWithTrackedLinks = await rewriteLinksForTracking({
        html,
        workspaceId,
        scheduledEmailId,
        customerId,
    });

    const htmlWithOpenTracking = appendOpenTracking(
        htmlWithTrackedLinks,
        scheduledEmailId
    );

    return appendUnsubscribeLink(htmlWithOpenTracking, scheduledEmailId);
}


export function unsubscribeUrl(scheduledEmailId: string) {
    return `${getAppUrl()}/api/email-agent/unsubscribe?sid=${encodeURIComponent(
        scheduledEmailId
    )}`;
}

export function appendUnsubscribeLink(html: string, scheduledEmailId: string) {
    const unsubscribe = `
        <div style="padding:24px 16px;text-align:center;font-size:12px;line-height:1.6;color:#9ca3af;">
            <a href="${unsubscribeUrl(
        scheduledEmailId
    )}" style="color:#9ca3af;text-decoration:underline;">
                Unsubscribe
            </a>
        </div>
    `;

    if (html.includes("</body>")) {
        return html.replace("</body>", `${unsubscribe}</body>`);
    }

    return `${html}${unsubscribe}`;
}