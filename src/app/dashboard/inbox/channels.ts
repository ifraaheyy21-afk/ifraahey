import type { InboxChannel } from "../../../lib/inbox-data";

/** Display names and logos for inbox channels. */
export const CHANNEL_META: Record<InboxChannel, { label: string; logo: string | null }> = {
    email: { label: "Email", logo: null },
    whatsapp: { label: "WhatsApp", logo: "https://cdn.simpleicons.org/whatsapp/25D366" },
    telegram: { label: "Telegram", logo: "https://cdn.simpleicons.org/telegram/26A5E4" },
    instagram: { label: "Instagram", logo: "https://cdn.simpleicons.org/instagram/E4405F" },
    messenger: { label: "Messenger", logo: "https://cdn.simpleicons.org/messenger/00B2FF" },
};

/**
 * Connected apps that could become channels but don't sync into the inbox
 * yet, keyed by integration provider id.
 */
export const UPCOMING_CHANNELS: Record<string, { label: string; logo: string }> = {
    gmail: { label: "Gmail", logo: "https://cdn.simpleicons.org/gmail/EA4335" },
    outlook: { label: "Outlook", logo: "https://cdn.simpleicons.org/microsoftoutlook/0078D4" },
    microsoft_outlook: { label: "Outlook", logo: "https://cdn.simpleicons.org/microsoftoutlook/0078D4" },
    intercom: { label: "Intercom", logo: "https://cdn.simpleicons.org/intercom/1F8DED" },
    slack: { label: "Slack", logo: "https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/slack.svg" },
};

export function channelOf(thread: { channel?: InboxChannel }): InboxChannel {
    return thread.channel ?? "email";
}
