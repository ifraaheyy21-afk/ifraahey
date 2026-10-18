"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ArrowUpDown,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Download,
    MoreVertical,
    Plus,
    Search,
} from "lucide-react";

import {
    createBlankWorkflow,
    readWorkflows,
    saveWorkflow,
    type Workflow as WorkflowRecord,
} from "../../../../lib/workflows";
import {
    AutomationApiError,
    archiveAutomation,
    saveAutomation,
} from "../../../../lib/automation/client";

import WorkflowStatusChart from "./WorkflowStatusChart";
import styles from "./workflows-page.module.css";

type AutomationStatus = "Active" | "Paused" | "Draft";
type AutomationView = "all" | "active" | "inactive" | "draft";

type AutomationRow = {
    id: string;
    name: string;
    description: string;
    trigger: string;
    status: AutomationStatus;
    totalRuns: number;
    successRate: number;
    // Runs that reached completed or failed; success rate is meaningless until one has.
    finishedRuns: number;
    lastRun: string;
    workflow: WorkflowRecord & { version?: number };
};

const PAGE_SIZE = 10;

function formatStoredLastRun(value?: string) {
    if (!value) return "Never";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Never";

    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.max(0, Math.floor(diffMs / 60_000));

    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes} min ago`;

    const diffHours = Math.floor(diffMinutes / 60);

    if (diffHours < 24) {
        return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
    }

    const diffDays = Math.floor(diffHours / 24);

    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;

    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(date);
}

function rowStatus(status: WorkflowRecord["status"]): AutomationStatus {
    if (status === "active") return "Active";
    if (status === "paused") return "Paused";
    return "Draft";
}

function toRow(workflow: WorkflowRecord & { version?: number }): AutomationRow {
    const trigger =
        workflow.nodes.find((node) => node.type === "trigger")?.title ??
        "No trigger";

    return {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description || "No description",
        trigger,
        status: rowStatus(workflow.status),
        totalRuns: Number(workflow.metrics?.enrolled ?? 0),
        successRate: Number(workflow.metrics?.successRate ?? 0),
        finishedRuns: Number(workflow.metrics?.completed ?? 0),
        lastRun: formatStoredLastRun(workflow.lastRunAt),
        workflow,
    };
}

function normalizeWorkflowList(payload: unknown): Array<WorkflowRecord & { version?: number }> {
    if (Array.isArray(payload)) {
        return payload.filter(
            (item): item is WorkflowRecord & { version?: number } =>
                Boolean(item) && typeof item === "object",
        );
    }

    if (!payload || typeof payload !== "object") return [];

    const record = payload as Record<string, unknown>;
    const candidate =
        record.workflows ??
        record.automations ??
        record.items ??
        record.data;

    if (!Array.isArray(candidate)) return [];

    return candidate.filter(
        (item): item is WorkflowRecord & { version?: number } =>
            Boolean(item) && typeof item === "object",
    );
}

/** Steps after the trigger. */
function stepCount(row: AutomationRow) {
    return row.workflow.nodes.filter((node) => node.type !== "trigger").length;
}

type SortMode = "recent" | "oldest" | "name";

const SORT_LABELS: Record<SortMode, string> = {
    recent: "Recently updated",
    oldest: "Oldest first",
    name: "Name A–Z",
};

export default function AutomationsTablePage() {
    const router = useRouter();

    const [workspaceId, setWorkspaceId] = useState("");
    const [rows, setRows] = useState<AutomationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);

    const [search, setSearch] = useState("");
    const [view, setView] = useState<AutomationView>("all");
    const [sort, setSort] = useState<SortMode>("recent");
    const [sortOpen, setSortOpen] = useState(false);
    const searchRef = useRef<HTMLInputElement | null>(null);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(
        null,
    );
    const [page, setPage] = useState(1);

    const resolveWorkspaceId = useCallback(async () => {
        const stored = window.localStorage.getItem("workspaceId");

        if (stored) {
            setWorkspaceId(stored);
            return stored;
        }

        const response = await fetch("/api/email-agent/bootstrap", {
            method: "GET",
            credentials: "include",
            cache: "no-store",
        });

        const payload: unknown = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                payload &&
                    typeof payload === "object" &&
                    "error" in payload &&
                    typeof (payload as { error?: unknown }).error ===
                    "string"
                    ? (payload as { error: string }).error
                    : "Unable to resolve workspace.",
            );
        }

        const record =
            payload && typeof payload === "object"
                ? (payload as Record<string, unknown>)
                : {};

        const nestedWorkspace =
            record.workspace &&
                typeof record.workspace === "object" &&
                !Array.isArray(record.workspace)
                ? (record.workspace as Record<string, unknown>)
                : null;

        const id =
            typeof record.workspaceId === "string"
                ? record.workspaceId
                : typeof nestedWorkspace?.id === "string"
                    ? nestedWorkspace.id
                    : "";

        if (!id) {
            throw new Error("Workspace ID missing.");
        }

        window.localStorage.setItem("workspaceId", id);
        setWorkspaceId(id);

        return id;
    }, []);

    const loadWorkflows = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const id = workspaceId || (await resolveWorkspaceId());

            if (id === "demo-workspace") {
                setRows(readWorkflows().map(toRow));
                return;
            }

            const response = await fetch(
                `/api/email-agent/automations?workspaceId=${encodeURIComponent(
                    id,
                )}`,
                {
                    method: "GET",
                    credentials: "include",
                    cache: "no-store",
                },
            );

            const payload: unknown = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    payload &&
                        typeof payload === "object" &&
                        "error" in payload &&
                        typeof (payload as { error?: unknown }).error ===
                        "string"
                        ? (payload as { error: string }).error
                        : "Unable to load automations.",
                );
            }

            setRows(normalizeWorkflowList(payload).map(toRow));
        } catch (loadError) {
            console.error("Automation list load error:", loadError);
            setRows([]);
            setError(
                loadError instanceof Error
                    ? loadError.message
                    : "Unable to load automations.",
            );
        } finally {
            setLoading(false);
        }
    }, [resolveWorkspaceId, workspaceId]);

    useEffect(() => {
        void loadWorkflows();
    }, [loadWorkflows]);

    const createWorkflow = useCallback(async () => {
        if (creating) return;

        setCreating(true);
        setError("");

        try {
            const id = workspaceId || (await resolveWorkspaceId());
            const workflow = createBlankWorkflow();

            if (id === "demo-workspace") {
                saveWorkflow(workflow);
                router.push(`/dashboard/automations/${workflow.id}`);
                return;
            }

            const saved = await saveAutomation<WorkflowRecord>(
                id,
                workflow,
            );

            router.push(`/dashboard/automations/${saved.id}`);
        } catch (createError) {
            console.error("Automation create error:", createError);

            setError(
                createError instanceof Error
                    ? createError.message
                    : "Unable to create automation.",
            );
        } finally {
            setCreating(false);
        }
    }, [creating, resolveWorkspaceId, router, workspaceId]);

    const setStatus = useCallback(
        async (row: AutomationRow, status: AutomationStatus) => {
            if (busyId) return;

            const targetStatus: WorkflowRecord["status"] =
                status === "Active"
                    ? "active"
                    : status === "Paused"
                        ? "paused"
                        : "draft";

            const previousRows = rows;
            const optimisticWorkflow = {
                ...row.workflow,
                status: targetStatus,
            };

            setBusyId(row.id);
            setMenuOpenId(null);
            setError("");

            setRows((current) =>
                current.map((item) =>
                    item.id === row.id
                        ? toRow(optimisticWorkflow)
                        : item,
                ),
            );

            try {
                const id =
                    workspaceId || (await resolveWorkspaceId());

                let saved: WorkflowRecord & { version?: number };

                if (id === "demo-workspace") {
                    saved = saveWorkflow(optimisticWorkflow);
                } else {
                    saved = await saveAutomation<WorkflowRecord>(
                        id,
                        optimisticWorkflow,
                    );
                }

                setRows((current) =>
                    current.map((item) =>
                        item.id === row.id ? toRow(saved) : item,
                    ),
                );
            } catch (statusError) {
                console.error(
                    "Automation status update error:",
                    statusError,
                );

                setRows(previousRows);

                if (
                    statusError instanceof AutomationApiError &&
                    statusError.code === "VERSION_CONFLICT"
                ) {
                    setError(
                        "This automation changed in another tab. The list has been refreshed.",
                    );
                    await loadWorkflows();
                } else {
                    setError(
                        statusError instanceof Error
                            ? statusError.message
                            : "Unable to update automation status.",
                    );
                }
            } finally {
                setBusyId(null);
            }
        },
        [
            busyId,
            loadWorkflows,
            resolveWorkspaceId,
            rows,
            workspaceId,
        ],
    );

    const archiveRow = useCallback(
        async (row: AutomationRow) => {
            if (busyId) return;

            setBusyId(row.id);
            setError("");

            try {
                await archiveAutomation(row.id);
                setRows((current) => current.filter((item) => item.id !== row.id));
                setMenuOpenId(null);
                setConfirmArchiveId(null);
            } catch (archiveError) {
                console.error("Automation archive error:", archiveError);
                setError(
                    archiveError instanceof Error
                        ? archiveError.message
                        : "Unable to archive automation.",
                );
            } finally {
                setBusyId(null);
            }
        },
        [busyId],
    );

    const summary = useMemo(() => {
        const active = rows.filter(
            (row) => row.status === "Active",
        ).length;

        const inactive = rows.filter(
            (row) => row.status === "Paused",
        ).length;

        const enrolled = rows.reduce(
            (sum, row) => sum + row.totalRuns,
            0,
        );

        return {
            total: rows.length,
            active,
            enrolled,
            inactive,
        };
    }, [rows]);

    const filteredRows = useMemo(() => {
        const query = search.trim().toLowerCase();
        const time = (row: AutomationRow) => {
            const value = new Date(row.workflow.updatedAt).getTime();
            return Number.isFinite(value) ? value : 0;
        };

        return rows
            .filter((row) =>
                (view === "all" ||
                    (view === "active" && row.status === "Active") ||
                    (view === "inactive" && row.status === "Paused") ||
                    (view === "draft" && row.status === "Draft")) &&
                (!query ||
                    row.name.toLowerCase().includes(query) ||
                    row.description.toLowerCase().includes(query) ||
                    row.trigger.toLowerCase().includes(query)))
            .sort((a, b) =>
                sort === "name"
                    ? a.name.localeCompare(b.name)
                    : sort === "oldest"
                        ? time(a) - time(b)
                        : time(b) - time(a));
    }, [rows, search, sort, view]);

    // ⌘K / Ctrl+K jumps to search, as the hint in the header says.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                searchRef.current?.focus();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const totalPages = Math.max(
        1,
        Math.ceil(filteredRows.length / PAGE_SIZE),
    );

    const safePage = Math.min(page, totalPages);

    const visibleRows = filteredRows.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE,
    );

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    const tabs: Array<{ view: AutomationView; label: string; count: number }> = [
        { view: "all", label: "All", count: rows.length },
        { view: "active", label: "Active", count: summary.active },
        { view: "inactive", label: "Paused", count: summary.inactive },
        { view: "draft", label: "Drafts", count: rows.length - summary.active - summary.inactive },
    ];

    const exportCsv = () => {
        const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
        const lines = [
            ["Name", "Status", "Trigger", "Enrolled", "Completed", "Success rate", "Steps", "Last run"],
            ...filteredRows.map((row) => [
                row.name,
                row.status,
                row.trigger,
                row.totalRuns,
                row.finishedRuns,
                row.finishedRuns ? `${row.successRate}%` : "",
                stepCount(row),
                row.lastRun,
            ]),
        ].map((line) => line.map(escape).join(","));
        const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "workflows.csv";
        link.click();
        URL.revokeObjectURL(url);
    };

    const firstShown = filteredRows.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
    const lastShown = Math.min(safePage * PAGE_SIZE, filteredRows.length);

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <h1>Automations</h1>

                <label className={styles.headerSearch}>
                    <Search size={15} aria-hidden="true" />
                    <input
                        ref={searchRef}
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setPage(1);
                        }}
                        placeholder="Search automations…"
                        aria-label="Search automations"
                    />
                    <kbd>⌘K</kbd>
                </label>

                <span className={styles.headerSpacer} />

                <button
                    type="button"
                    className={styles.createButton}
                    onClick={() => void createWorkflow()}
                    disabled={creating}
                >
                    <Plus size={15} aria-hidden="true" />
                    {creating ? "Creating…" : "Create workflow"}
                </button>
            </header>

            {error && <div className={styles.error} role="alert">{error}</div>}

            <WorkflowStatusChart
                loading={loading}
                workflows={rows.map((row) => ({ status: row.status, createdAt: row.workflow.createdAt }))}
            />

            <section className={styles.tableCard}>
                <nav className={styles.tabs} aria-label="Workflow status">
                    {tabs.map((tab) => (
                        <button
                            key={tab.view}
                            type="button"
                            className={view === tab.view ? styles.tabActive : styles.tab}
                            aria-pressed={view === tab.view}
                            onClick={() => {
                                setView(tab.view);
                                setPage(1);
                            }}
                        >
                            {tab.label}
                            <span className={styles.tabCount}>{tab.count}</span>
                        </button>
                    ))}
                </nav>

                <div className={styles.toolbar}>
                    <div className={styles.sortWrap}>
                        <button
                            type="button"
                            className={styles.toolButton}
                            aria-expanded={sortOpen}
                            aria-haspopup="menu"
                            onClick={() => setSortOpen((open) => !open)}
                        >
                            <ArrowUpDown size={14} aria-hidden="true" />
                            {SORT_LABELS[sort]}
                            <ChevronDown size={13} aria-hidden="true" />
                        </button>
                        {sortOpen && (
                            <div className={styles.menu} role="menu">
                                {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        role="menuitemradio"
                                        aria-checked={sort === mode}
                                        className={sort === mode ? styles.menuItemActive : styles.menuItem}
                                        onClick={() => {
                                            setSort(mode);
                                            setSortOpen(false);
                                        }}
                                    >
                                        {SORT_LABELS[mode]}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <span className={styles.headerSpacer} />

                    <button type="button" className={styles.toolButton} onClick={exportCsv} disabled={!filteredRows.length}>
                        <Download size={14} aria-hidden="true" />
                        Export
                    </button>
                </div>

                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th className={styles.colToggle}>Off/On</th>
                                <th>Name</th>
                                <th>Trigger</th>
                                <th className={styles.num}>Enrolled</th>
                                <th className={styles.num}>Completed</th>
                                <th className={styles.num}>Success rate</th>
                                <th className={styles.num}>Steps</th>
                                <th>Last run</th>
                                <th className={styles.colMenu}><span className={styles.srOnly}>Actions</span></th>
                            </tr>
                        </thead>

                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={9} className={styles.emptyCell}>Loading workflows…</td>
                                </tr>
                            ) : visibleRows.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className={styles.emptyCell}>
                                        {rows.length === 0
                                            ? "No workflows yet. Create your first workflow to get started."
                                            : "No workflows match this view."}
                                    </td>
                                </tr>
                            ) : (
                                visibleRows.map((automation) => {
                                    const active = automation.status === "Active";
                                    const draft = automation.status === "Draft";
                                    const rowBusy = busyId === automation.id;

                                    return (
                                        <tr key={automation.id}>
                                            <td className={styles.colToggle}>
                                                <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={active}
                                                    aria-label={active ? `Pause ${automation.name}` : `Turn on ${automation.name}`}
                                                    title={draft ? "Turn on to publish this workflow" : active ? "Pause" : "Resume"}
                                                    className={active ? styles.switchOn : styles.switchOff}
                                                    disabled={rowBusy}
                                                    onClick={() => void setStatus(automation, active ? "Paused" : "Active")}
                                                >
                                                    <span />
                                                </button>
                                            </td>

                                            <td className={styles.nameCell}>
                                                <Link href={`/dashboard/automations/${automation.id}`} className={styles.nameLink}>
                                                    <span className={styles.nameLine}>
                                                        <strong>{automation.name}</strong>
                                                        <span className={styles[`status${automation.status}`]}>
                                                            {automation.status}
                                                        </span>
                                                    </span>
                                                    <small>{automation.description}</small>
                                                </Link>
                                            </td>

                                            <td><span className={styles.trigger}>{automation.trigger}</span></td>

                                            <td className={styles.num}>
                                                <span className={styles.countChip}>{automation.totalRuns.toLocaleString("en-GB")}</span>
                                            </td>

                                            <td className={styles.num}>
                                                {automation.finishedRuns ? automation.finishedRuns.toLocaleString("en-GB") : <span className={styles.muted}>—</span>}
                                            </td>

                                            <td className={styles.num}>
                                                {automation.finishedRuns ? (
                                                    <span className={styles.rate}>{automation.successRate}%</span>
                                                ) : (
                                                    <span className={styles.muted} title="No runs have finished yet">—</span>
                                                )}
                                            </td>

                                            <td className={styles.num}>{stepCount(automation)}</td>

                                            <td className={styles.lastRun}>{automation.lastRun}</td>

                                            <td className={styles.colMenu}>
                                                <div className={styles.moreWrap}>
                                                    <button
                                                        type="button"
                                                        className={styles.moreButton}
                                                        onClick={() => {
                                                            setConfirmArchiveId(null);
                                                            setMenuOpenId((current) => (current === automation.id ? null : automation.id));
                                                        }}
                                                        aria-label={`More actions for ${automation.name}`}
                                                        aria-expanded={menuOpenId === automation.id}
                                                    >
                                                        <MoreVertical size={16} />
                                                    </button>

                                                    {menuOpenId === automation.id && (
                                                        <div className={styles.rowMenu} role="menu">
                                                            <Link href={`/dashboard/automations/${automation.id}`} className={styles.menuItem}>
                                                                {draft ? "Continue building" : "Open workflow"}
                                                            </Link>
                                                            {!draft && (
                                                                <button
                                                                    type="button"
                                                                    className={styles.menuItem}
                                                                    disabled={rowBusy}
                                                                    onClick={() => void setStatus(automation, active ? "Paused" : "Active")}
                                                                >
                                                                    {active ? "Pause" : "Resume"}
                                                                </button>
                                                            )}
                                                            {confirmArchiveId === automation.id ? (
                                                                <div className={styles.archiveConfirm}>
                                                                    <p>Archive this workflow? It stops enrolling and cancels runs in progress.</p>
                                                                    <div>
                                                                        <button
                                                                            type="button"
                                                                            className={styles.archiveDanger}
                                                                            disabled={rowBusy}
                                                                            onClick={() => void archiveRow(automation)}
                                                                        >
                                                                            {rowBusy ? "Archiving…" : "Archive"}
                                                                        </button>
                                                                        <button type="button" className={styles.archiveKeep} disabled={rowBusy} onClick={() => setConfirmArchiveId(null)}>
                                                                            Keep
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    className={styles.menuDanger}
                                                                    disabled={rowBusy}
                                                                    onClick={() => setConfirmArchiveId(automation.id)}
                                                                >
                                                                    Archive
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                <footer className={styles.footer}>
                    <div className={styles.pagination}>
                        <button
                            type="button"
                            className={styles.pageArrow}
                            disabled={safePage === 1}
                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                            aria-label="Previous page"
                        >
                            <ChevronLeft size={15} />
                        </button>
                        {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                            <button
                                type="button"
                                key={pageNumber}
                                className={safePage === pageNumber ? styles.pageActive : styles.pageButton}
                                aria-current={safePage === pageNumber ? "page" : undefined}
                                onClick={() => setPage(pageNumber)}
                            >
                                {pageNumber}
                            </button>
                        ))}
                        <button
                            type="button"
                            className={styles.pageArrow}
                            disabled={safePage === totalPages}
                            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                            aria-label="Next page"
                        >
                            <ChevronRight size={15} />
                        </button>
                    </div>
                    <span className={styles.range}>
                        {firstShown}–{lastShown} of {filteredRows.length}
                    </span>
                </footer>
            </section>
        </main>
    );
}
