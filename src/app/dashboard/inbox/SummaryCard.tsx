"use client";

import { useState } from "react";
import { Check, Copy, Loader2, RefreshCw, Sparkles, X } from "lucide-react";

import styles from "./inbox-page.module.css";

export type Summary = {
    summary: string;
    recommendedAction: string;
    sentiment: string;
    urgency: string;
};

type Props = {
    summary: Summary | undefined;
    loading: boolean;
    error: string;
    messageCount: number;
    isChat: boolean;
    onRefresh: () => void;
    onClose: () => void;
};

/** The AI summary as a small card under the reader toolbar. */
export default function SummaryCard({ summary, loading, error, messageCount, isChat, onRefresh, onClose }: Props) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        if (!summary) return;
        await navigator.clipboard?.writeText(`${summary.summary}\n\nNext step: ${summary.recommendedAction}`);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    };

    return (
        <section className={styles.summaryCard} aria-live="polite" aria-label="AI summary">
            <header className={styles.summaryCardHead}>
                <span className={styles.summaryTitle}>
                    <Sparkles size={13} aria-hidden="true" />
                    Summary
                    <small>AI</small>
                </span>
                <span className={styles.spacer} />
                {summary && !loading && (
                    <>
                        <button type="button" className={styles.iconButton} onClick={() => void copy()} aria-label="Copy summary" title={copied ? "Copied" : "Copy"}>
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                        <button type="button" className={styles.iconButton} onClick={onRefresh} aria-label="Summarise again" title="Summarise again">
                            <RefreshCw size={14} />
                        </button>
                    </>
                )}
                <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close summary">
                    <X size={14} />
                </button>
            </header>

            {loading ? (
                <div className={styles.summaryRow}>
                    <Loader2 size={14} className={styles.spinning} />
                    Summarising this {isChat ? "conversation" : "email"}…
                </div>
            ) : error ? (
                <div className={styles.summaryRow}>
                    <span>{error}</span>
                    <button type="button" className={styles.linkButton} onClick={onRefresh}>Try again</button>
                </div>
            ) : summary ? (
                <>
                    <p className={styles.summaryText}>{summary.summary}</p>
                    <p className={styles.summaryNext}><span>Next step</span>{summary.recommendedAction}</p>
                    <footer className={styles.summaryFoot}>
                        <span>AI-generated from {messageCount} {messageCount === 1 ? "message" : "messages"}</span>
                        <span>{summary.sentiment} · {summary.urgency} urgency</span>
                    </footer>
                </>
            ) : null}
        </section>
    );
}
