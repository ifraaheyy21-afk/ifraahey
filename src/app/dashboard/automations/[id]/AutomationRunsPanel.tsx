"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    Clock3,
    Loader2,
    Play,
    RefreshCw,
    Search,
    X,
    XCircle,
} from "lucide-react";

import {
    getAutomationRun,
    listAutomationRuns,
    startTestRun,
    type AutomationRunDetail,
    type AutomationRunStatus,
    type AutomationRunStep,
    type AutomationRunSummary,
} from "../../../../lib/automation/client";
import styles from "./runs-panel.module.css";

export type RunsPanelTab = "test" | "history";

type Contact = { id: string; name: string; email: string; company: string };

type Props = {
    workflowId: string;
    workflowStatus: "draft" | "active" | "paused";
    nodeTitles: Record<string, string>;
    tab: RunsPanelTab;
    onTabChange: (tab: RunsPanelTab) => void;
    onClose: () => void;
    onPublish: () => void;
};

const HISTORY_REFRESH_MS = 10_000;

const STATUS_LABEL: Record<AutomationRunStatus, string> = {
    queued: "Queued",
    running: "Running",
    waiting: "Waiting",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
};

const TRIGGER_LABEL: Record<string, string> = {
    customer_created: "Contact added",
    tag_added: "Tag added",
    email_opened: "Email opened",
    email_clicked: "Link clicked",
    email_replied: "Reply received",
    email_bounced: "Email bounced",
    renewal_upcoming: "Renewal coming up",
    custom_event: "Event received",
};

function relativeTime(iso: string | null) {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const future = diff < 0;
    const minutes = Math.round(Math.abs(diff) / 60_000);
    let text: string;
    if (minutes < 1) text = "just now";
    else if (minutes < 60) text = `${minutes}m`;
    else if (minutes < 60 * 24) text = `${Math.round(minutes / 60)}h`;
    else text = `${Math.round(minutes / (60 * 24))}d`;
    if (text === "just now") return text;
    return future ? `in ${text}` : `${text} ago`;
}

function absoluteTime(iso: string | null) {
    return iso
        ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
        : "";
}

function StatusBadge({ status }: { status: AutomationRunStatus }) {
    return <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>{STATUS_LABEL[status]}</span>;
}

function StepIcon({ status }: { status: AutomationRunStep["status"] }) {
    if (status === "completed") return <CheckCircle2 size={15} className={styles.iconDone} />;
    if (status === "failed") return <XCircle size={15} className={styles.iconFailed} />;
    if (status === "waiting") return <Clock3 size={15} className={styles.iconWaiting} />;
    if (status === "running") return <Loader2 size={15} className={styles.iconSpin} />;
    return <span className={styles.iconPending} />;
}

function stepNote(step: AutomationRunStep) {
    const output = step.output && typeof step.output === "object" ? step.output as Record<string, unknown> : {};
    if (step.nodeType === "email" && step.status === "completed") {
        return output.reused ? "Email was already queued" : "Email queued; it sends within about a minute";
    }
    if (step.nodeType === "delay" && typeof output.resumeAt === "string") {
        return `Continues ${relativeTime(output.resumeAt)} (${absoluteTime(output.resumeAt)})`;
    }
    if (step.nodeType === "condition" && typeof output.result === "boolean") {
        return output.result ? "Went down the Yes branch" : "Went down the No branch";
    }
    return "";
}

function RunSteps({ run }: { run: AutomationRunDetail }) {
    // A step can have several attempts after recovery; show the latest.
    const steps = useMemo(() => {
        const latest = new Map<string, AutomationRunStep>();
        for (const step of run.steps) {
            const previous = latest.get(step.nodeId);
            if (!previous || step.attempt >= previous.attempt) latest.set(step.nodeId, step);
        }
        return [...latest.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    }, [run.steps]);

    return (
        <div className={styles.steps}>
            {steps.length === 0 && <p className={styles.muted}>No steps have run yet.</p>}
            {steps.map((step) => {
                const note = stepNote(step);
                return (
                    <div key={step.id} className={styles.step}>
                        <StepIcon status={step.status} />
                        <div>
                            <strong>{step.title}</strong>
                            {note && <span>{note}</span>}
                            {step.error && <span className={styles.errorText}>{step.error}</span>}
                        </div>
                    </div>
                );
            })}
            {run.status === "waiting" && run.resumeAt && (
                <p className={styles.muted}>
                    Paused on a wait step. It continues automatically {relativeTime(run.resumeAt)}.
                </p>
            )}
            {run.status === "failed" && run.error && (
                <p className={styles.errorBox}>
                    <AlertCircle size={14} />
                    {run.error}
                </p>
            )}
        </div>
    );
}

function TestTab({
    workflowId,
    workflowStatus,
    onPublish,
    onRunStarted,
}: {
    workflowId: string;
    workflowStatus: Props["workflowStatus"];
    onPublish: () => void;
    onRunStarted: () => void;
}) {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loadingContacts, setLoadingContacts] = useState(true);
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState<Contact | null>(null);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<AutomationRunDetail | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        fetch("/api/dashboard/customers", { credentials: "same-origin", cache: "no-store" })
            .then((response) => response.ok ? response.json() : Promise.reject(new Error("Unable to load contacts.")))
            .then((payload: { customers?: Contact[] }) => {
                if (!cancelled) setContacts(Array.isArray(payload.customers) ? payload.customers : []);
            })
            .catch((loadError: unknown) => {
                if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load contacts.");
            })
            .finally(() => {
                if (!cancelled) setLoadingContacts(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const matches = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const list = needle
            ? contacts.filter((contact) =>
                [contact.name, contact.email, contact.company].some((value) => value?.toLowerCase().includes(needle)))
            : contacts;
        return list.slice(0, 6);
    }, [contacts, query]);

    async function runTest() {
        if (!selected || running) return;
        setRunning(true);
        setError("");
        setResult(null);
        try {
            setResult(await startTestRun(workflowId, selected.id));
            onRunStarted();
        } catch (runError) {
            setError(runError instanceof Error ? runError.message : "The test run could not start.");
        } finally {
            setRunning(false);
        }
    }

    if (workflowStatus !== "active") {
        return (
            <div className={styles.emptyState}>
                <Play size={18} />
                <strong>Publish to run a test</strong>
                <p>
                    Test runs use the published version, so you see exactly what customers will get.
                    {workflowStatus === "paused" ? " Resume the automation to test it." : ""}
                </p>
                <button type="button" className={styles.primaryButton} onClick={onPublish}>
                    {workflowStatus === "paused" ? "Resume" : "Publish"}
                </button>
            </div>
        );
    }

    return (
        <div className={styles.tabBody}>
            <p className={styles.notice}>
                This runs the real workflow for one contact: emails are sent and tags are applied.
                Pick a contact you control, such as yourself.
            </p>

            <label className={styles.searchField}>
                <Search size={14} />
                <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search contacts by name, email or company"
                    aria-label="Search contacts"
                />
            </label>

            <div className={styles.contactList} role="listbox" aria-label="Contacts">
                {loadingContacts && <p className={styles.muted}>Loading contacts…</p>}
                {!loadingContacts && contacts.length === 0 && (
                    <p className={styles.muted}>Add a contact on the Customers page first.</p>
                )}
                {!loadingContacts && contacts.length > 0 && matches.length === 0 && (
                    <p className={styles.muted}>No contacts match “{query}”.</p>
                )}
                {matches.map((contact) => (
                    <button
                        key={contact.id}
                        type="button"
                        role="option"
                        aria-selected={selected?.id === contact.id}
                        className={`${styles.contact} ${selected?.id === contact.id ? styles.contactSelected : ""}`}
                        onClick={() => setSelected(contact)}
                    >
                        <strong>{contact.name}</strong>
                        <span>{contact.email}</span>
                    </button>
                ))}
            </div>

            <button
                type="button"
                className={styles.primaryButton}
                disabled={!selected || running}
                onClick={() => void runTest()}
            >
                {running ? <Loader2 size={14} className={styles.iconSpin} /> : <Play size={14} />}
                {running ? "Running…" : selected ? `Run for ${selected.name}` : "Choose a contact"}
            </button>

            {error && (
                <p className={styles.errorBox}>
                    <AlertCircle size={14} />
                    {error}
                </p>
            )}

            {result && (
                <div className={styles.result}>
                    <div className={styles.resultHeader}>
                        <span>Test run</span>
                        <StatusBadge status={result.status} />
                    </div>
                    <RunSteps run={result} />
                </div>
            )}
        </div>
    );
}

function HistoryTab({ workflowId, nodeTitles, refreshKey }: { workflowId: string; nodeTitles: Record<string, string>; refreshKey: number }) {
    const [runs, setRuns] = useState<AutomationRunSummary[]>([]);
    const [counts, setCounts] = useState<Partial<Record<AutomationRunStatus, number>>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [openRunId, setOpenRunId] = useState<string | null>(null);
    const [detail, setDetail] = useState<AutomationRunDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const load = useCallback(async () => {
        try {
            const result = await listAutomationRuns(workflowId);
            setRuns(result.runs);
            setCounts(result.counts);
            setError("");
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Unable to load runs.");
        } finally {
            setLoading(false);
        }
    }, [workflowId]);

    useEffect(() => {
        // Defer the first load out of the effect body; then refresh while the
        // tab is visible so new enrollments appear without a manual refresh.
        const first = window.setTimeout(() => void load(), 0);
        const timer = window.setInterval(() => {
            if (document.visibilityState === "visible") void load();
        }, HISTORY_REFRESH_MS);
        return () => {
            window.clearTimeout(first);
            window.clearInterval(timer);
        };
    }, [load, refreshKey]);

    async function toggleRun(runId: string) {
        if (openRunId === runId) {
            setOpenRunId(null);
            return;
        }
        setOpenRunId(runId);
        setDetail(null);
        setDetailLoading(true);
        try {
            setDetail(await getAutomationRun(runId));
        } catch {
            setDetail(null);
        } finally {
            setDetailLoading(false);
        }
    }

    const total = Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0);

    return (
        <div className={styles.tabBody}>
            <div className={styles.countRow}>
                {(["running", "waiting", "completed", "failed"] as const).map((status) => (
                    <div key={status} className={styles.countCard}>
                        <strong>{(status === "running" ? (counts.running ?? 0) + (counts.queued ?? 0) : counts[status] ?? 0).toLocaleString("en-GB")}</strong>
                        <span>{status === "running" ? "In progress" : STATUS_LABEL[status]}</span>
                    </div>
                ))}
            </div>

            <div className={styles.historyHeader}>
                <span>{total.toLocaleString("en-GB")} total runs · latest 25</span>
                <button type="button" className={styles.iconButton} onClick={() => void load()} aria-label="Refresh runs">
                    <RefreshCw size={13} />
                </button>
            </div>

            {loading && <p className={styles.muted}>Loading runs…</p>}
            {error && (
                <p className={styles.errorBox}>
                    <AlertCircle size={14} />
                    {error}
                </p>
            )}
            {!loading && !error && runs.length === 0 && (
                <div className={styles.emptyState}>
                    <Clock3 size={18} />
                    <strong>No runs yet</strong>
                    <p>Contacts appear here as soon as the trigger enrolls them, or when you run a test.</p>
                </div>
            )}

            <ul className={styles.runList}>
                {runs.map((run) => {
                    const open = openRunId === run.id;
                    const where = run.status === "waiting" || run.status === "running" || run.status === "queued"
                        ? run.currentNodeId ? nodeTitles[run.currentNodeId] : ""
                        : "";
                    return (
                        <li key={run.id} className={styles.runItem}>
                            <button type="button" className={styles.runRow} aria-expanded={open} onClick={() => void toggleRun(run.id)}>
                                <div className={styles.runWho}>
                                    <strong>{run.customer?.name ?? "Deleted contact"}</strong>
                                    <span>
                                        {run.source === "test" ? "Test run" : run.triggerType ? TRIGGER_LABEL[run.triggerType] ?? "Triggered" : "Started manually"}
                                        {" · "}
                                        <time dateTime={run.createdAt} title={absoluteTime(run.createdAt)}>{relativeTime(run.createdAt)}</time>
                                        {where ? ` · at ${where}` : ""}
                                    </span>
                                </div>
                                <StatusBadge status={run.status} />
                                <ChevronDown size={14} className={open ? styles.chevronOpen : styles.chevron} />
                            </button>
                            {open && (
                                <div className={styles.runDetail}>
                                    {detailLoading && <p className={styles.muted}>Loading steps…</p>}
                                    {!detailLoading && detail && <RunSteps run={detail} />}
                                    {!detailLoading && !detail && <p className={styles.muted}>Unable to load this run.</p>}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** Side panel for testing an automation on a contact and reviewing its runs. */
export default function AutomationRunsPanel({
    workflowId,
    workflowStatus,
    nodeTitles,
    tab,
    onTabChange,
    onClose,
    onPublish,
}: Props) {
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    return (
        <aside className={styles.panel} role="dialog" aria-label="Automation runs">
            <header className={styles.header}>
                <div className={styles.tabs} role="tablist">
                    {(["test", "history"] as const).map((value) => (
                        <button
                            key={value}
                            type="button"
                            role="tab"
                            aria-selected={tab === value}
                            className={tab === value ? styles.tabActive : styles.tab}
                            onClick={() => onTabChange(value)}
                        >
                            {value === "test" ? "Test" : "Runs"}
                        </button>
                    ))}
                </div>
                <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close panel">
                    <X size={15} />
                </button>
            </header>

            {tab === "test" ? (
                <TestTab
                    workflowId={workflowId}
                    workflowStatus={workflowStatus}
                    onPublish={onPublish}
                    onRunStarted={() => setRefreshKey((key) => key + 1)}
                />
            ) : (
                <HistoryTab workflowId={workflowId} nodeTitles={nodeTitles} refreshKey={refreshKey} />
            )}
        </aside>
    );
}
