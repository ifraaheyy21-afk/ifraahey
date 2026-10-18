"use client";

import Link from "next/link";
import { useRef, type ReactNode, type RefObject } from "react";
import { ArrowUp, ChevronDown, ChevronRight, GitBranch, Paperclip, Plug, Plus, Share2, Sparkles, X } from "lucide-react";

import styles from "./ai-chat-panel.module.css";

export type ChatMessage = {
    id: string;
    role: "assistant" | "user";
    text: string;
    toolNames?: string[];
    isError?: boolean;
};

type HistoryItem = { id: string; name: string; updatedAt: string };
type Attachment = { id: string; name: string };

type Props = {
    workflowName: string;
    statusLabel: string;
    historyOpen: boolean;
    onToggleHistory: () => void;
    historyRef: RefObject<HTMLDivElement | null>;
    history: HistoryItem[];
    currentWorkflowId: string;
    onNewWorkflow: () => void;
    onOpenWorkflow: (id: string) => void;
    onShare: () => void;
    onClose: () => void;

    messages: ChatMessage[];
    timeOf: (message: ChatMessage) => string;
    building: boolean;
    suggestions: readonly string[];
    endRef: RefObject<HTMLDivElement | null>;

    prompt: string;
    onPromptChange: (value: string) => void;
    onSend: () => void;
    attachments: Attachment[];
    onRemoveAttachment: (id: string) => void;
    onFiles: (files: FileList | null) => void;
    modelLogo: ReactNode;
};

const BULLET = /^(?:[✓✔•*-]|\d+[.)])\s*/;

/** Assistant text rendered as plain prose and a bullet list, no bubble. */
function AssistantText({ text }: { text: string }) {
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const intro = lines.filter((line) => !BULLET.test(line));
    const bullets = lines.filter((line) => BULLET.test(line));
    return (
        <>
            {intro.length > 0 && <p>{intro.join(" ")}</p>}
            {bullets.length > 0 && (
                <ul>
                    {bullets.map((line, index) => <li key={index}>{line.replace(BULLET, "")}</li>)}
                </ul>
            )}
            {intro.length === 0 && bullets.length === 0 && <p>{text}</p>}
        </>
    );
}

/** OpenClaw chat, laid out like the "AI chat in light theme" inspiration. */
export default function AiChatPanel(props: Props) {
    const {
        workflowName, statusLabel, historyOpen, onToggleHistory, historyRef, history, currentWorkflowId,
        onNewWorkflow, onOpenWorkflow, onShare, onClose,
        messages, timeOf, building, suggestions, endRef,
        prompt, onPromptChange, onSend, attachments, onRemoveAttachment, onFiles, modelLogo,
    } = props;

    const fileRef = useRef<HTMLInputElement | null>(null);
    const canSend = (prompt.trim().length > 0 || attachments.length > 0) && !building;

    return (
        <section id="workflow-ai-chat" className={styles.panel} aria-label="OpenClaw assistant">
            <header className={styles.header}>
                <div className={styles.titleWrap} ref={historyRef}>
                    <button type="button" className={styles.title} onClick={onToggleHistory} aria-haspopup="menu" aria-expanded={historyOpen}>
                        <span>{workflowName || "Untitled workflow"}</span>
                        <ChevronDown size={14} aria-hidden="true" />
                    </button>
                    <span className={styles.status}>{statusLabel}</span>

                    {historyOpen && (
                        <div className={styles.menu} role="menu" aria-label="Workflows">
                            <button type="button" className={styles.menuItem} onClick={onNewWorkflow}>
                                <Plus size={14} aria-hidden="true" />
                                New workflow
                            </button>
                            <div className={styles.menuLabel}>Recent</div>
                            <div className={styles.menuList}>
                                {history.length ? history.map((item) => (
                                    <button key={item.id} type="button" className={styles.menuItem} onClick={() => onOpenWorkflow(item.id)}>
                                        <GitBranch size={13} aria-hidden="true" />
                                        <span className={styles.menuName}>{item.name || "Untitled workflow"}</span>
                                        {item.id === currentWorkflowId && <span className={styles.menuCurrent}>Current</span>}
                                    </button>
                                )) : <p className={styles.menuEmpty}>No previous workflows yet.</p>}
                            </div>
                            <Link href="/dashboard/automations/all" className={styles.menuLink}>
                                All automations
                                <ChevronRight size={14} aria-hidden="true" />
                            </Link>
                        </div>
                    )}
                </div>

                <button type="button" className={styles.share} onClick={onShare}>
                    <Share2 size={14} aria-hidden="true" />
                    Share
                </button>
                <button type="button" className={styles.round} onClick={onClose} aria-label="Close assistant" title="Close">
                    <X size={15} />
                </button>
            </header>

            <div className={styles.transcript}>
                {messages.length === 0 && !building && (
                    <div className={styles.empty}>
                        <span className={styles.emptyMark} aria-hidden="true"><Sparkles size={15} /></span>
                        <strong>What should this workflow do?</strong>
                        <p>Describe a change and OpenClaw edits the steps on the canvas.</p>
                        <div className={styles.suggestions}>
                            {suggestions.map((suggestion) => (
                                <button key={suggestion} type="button" onClick={() => onPromptChange(suggestion)}>
                                    {suggestion}
                                    <ArrowUp size={13} aria-hidden="true" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((message) => {
                    const time = timeOf(message);
                    if (message.role === "user") {
                        return (
                            <div key={message.id} className={styles.userRow}>
                                <p className={styles.userPill}>{message.text}</p>
                                {time && <time className={styles.time}>{time}</time>}
                            </div>
                        );
                    }
                    return (
                        <div key={message.id} className={`${styles.reply} ${message.isError ? styles.replyMuted : ""}`}>
                            {message.toolNames && message.toolNames.length > 0 && (
                                <div className={styles.activity}>
                                    {message.toolNames.map((tool) => (
                                        <span key={tool} className={styles.activityRow}>
                                            <Plug size={13} aria-hidden="true" />
                                            Used <strong>{tool}</strong>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <AssistantText text={message.text} />
                            {time && <time className={styles.time}>{time}</time>}
                        </div>
                    );
                })}

                {building && (
                    <div className={styles.working}>
                        <span className={styles.spinner} aria-hidden="true" />
                        Updating your workflow…
                    </div>
                )}
                <div ref={endRef} />
            </div>

            <div className={styles.composerWrap}>
                <div className={styles.composer}>
                    {attachments.length > 0 && (
                        <div className={styles.attachments}>
                            {attachments.map((attachment) => (
                                <span key={attachment.id} className={styles.attachment}>
                                    <Paperclip size={11} aria-hidden="true" />
                                    <span>{attachment.name}</span>
                                    <button type="button" onClick={() => onRemoveAttachment(attachment.id)} aria-label={`Remove ${attachment.name}`}>
                                        <X size={11} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}

                    <textarea
                        value={prompt}
                        onChange={(event) => onPromptChange(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                if (canSend) onSend();
                            }
                        }}
                        placeholder="Ask AI anything"
                        rows={2}
                        aria-label="Message OpenClaw"
                    />

                    <input
                        ref={fileRef}
                        type="file"
                        multiple
                        hidden
                        accept=".txt,.md,.csv,.json,.html,.css,.js,.jsx,.ts,.tsx,.xml,.yaml,.yml,text/*,application/json,application/xml"
                        onChange={(event) => {
                            onFiles(event.target.files);
                            event.target.value = "";
                        }}
                    />

                    <div className={styles.toolbar}>
                        <button type="button" className={styles.plus} onClick={() => fileRef.current?.click()} aria-label="Attach files" title="Attach files">
                            <Plus size={16} />
                        </button>
                        <span className={styles.model}>
                            <span className={styles.modelLogo} aria-hidden="true">{modelLogo}</span>
                            OpenClaw
                        </span>
                        <span className={styles.spacer} />
                        <button type="button" className={styles.send} onClick={onSend} disabled={!canSend} aria-label="Send message">
                            <ArrowUp size={15} />
                        </button>
                    </div>
                </div>
                <p className={styles.disclaimer}>AI can make mistakes. Review changes before publishing.</p>
            </div>
        </section>
    );
}
