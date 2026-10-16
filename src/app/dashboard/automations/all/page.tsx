"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";
import {
    Activity,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CirclePause,
    Clock3,
    MoreHorizontal,
    Pause,
    Play,
    Search,
    SlidersHorizontal,
    UsersRound,
    Workflow,
} from "lucide-react";

import {
    createBlankWorkflow,
    readWorkflows,
    saveWorkflow,
    type Workflow as WorkflowRecord,
} from "../../../../lib/workflows";
import {
    AutomationApiError,
    saveAutomation,
} from "../../../../lib/automation/client";

import styles from "./automations-table.module.css";

type AutomationStatus = "Active" | "Inactive" | "Draft";
type AutomationView =
    | "all"
    | "active"
    | "inactive"
    | "draft"
    | "recent"
    | "old";
type ChartPeriod = "W" | "12M";

type AutomationRow = {
    id: string;
    name: string;
    description: string;
    trigger: string;
    status: AutomationStatus;
    totalRuns: number;
    successRate: number;
    lastRun: string;
    workflow: WorkflowRecord & { version?: number };
};

type ChartPoint = {
    key: string;
    label: string;
    fullLabel: string;
    runs: number;
    successful: number;
    unsuccessful: number;
    successRate: number;
};

type AnalyticsPayload = {
    points?: Array<{
        key?: unknown;
        runs?: unknown;
        successful?: unknown;
        unsuccessful?: unknown;
        successRate?: unknown;
    }>;
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
    if (status === "paused") return "Inactive";
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

function getTriggerClass(trigger: string) {
    switch (trigger.toLowerCase()) {
        case "new contact":
            return styles.triggerBlue;
        case "email opened":
            return styles.triggerPurple;
        case "email clicked":
            return styles.triggerAmber;
        case "reply received":
            return styles.triggerGreen;
        case "no reply":
            return styles.triggerPink;
        case "scheduled":
            return styles.triggerTeal;
        default:
            return styles.triggerNeutral;
    }
}

function startOfCurrentWeek(referenceDate: Date) {
    const day = referenceDate.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(referenceDate);

    monday.setHours(12, 0, 0, 0);
    monday.setDate(referenceDate.getDate() + mondayOffset);

    return monday;
}

function dateBucketMetadata(period: ChartPeriod, referenceDate: Date) {
    if (period === "W") {
        const monday = startOfCurrentWeek(referenceDate);

        return Array.from({ length: 7 }, (_, index) => {
            const date = new Date(monday);
            date.setDate(monday.getDate() + index);

            return {
                key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
                label: new Intl.DateTimeFormat("en-GB", {
                    weekday: "short",
                }).format(date),
                fullLabel: new Intl.DateTimeFormat("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                }).format(date),
            };
        });
    }

    const currentMonth = new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        1,
        12,
        0,
        0,
        0,
    );

    return Array.from({ length: 12 }, (_, index) => {
        const date = new Date(currentMonth);
        date.setMonth(currentMonth.getMonth() - (11 - index));

        return {
            key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
            label: new Intl.DateTimeFormat("en-GB", {
                month: "short",
            }).format(date),
            fullLabel: new Intl.DateTimeFormat("en-GB", {
                month: "long",
                year: "numeric",
            }).format(date),
        };
    });
}

function mergeAnalyticsPoints(
    payload: AnalyticsPayload | null,
    period: ChartPeriod,
    referenceDate: Date,
): ChartPoint[] {
    const metadata = dateBucketMetadata(period, referenceDate);
    const byKey = new Map(
        (payload?.points ?? [])
            .filter((point) => typeof point?.key === "string")
            .map((point) => [String(point.key), point]),
    );

    return metadata.map((bucket) => {
        const point = byKey.get(bucket.key);

        const runs = Number(point?.runs ?? 0);
        const successful = Number(point?.successful ?? 0);
        const unsuccessful = Number(point?.unsuccessful ?? 0);
        const successRate = Number(point?.successRate ?? 0);

        return {
            ...bucket,
            runs: Number.isFinite(runs) ? Math.max(0, runs) : 0,
            successful: Number.isFinite(successful)
                ? Math.max(0, successful)
                : 0,
            unsuccessful: Number.isFinite(unsuccessful)
                ? Math.max(0, unsuccessful)
                : 0,
            successRate: Number.isFinite(successRate)
                ? Math.max(0, Math.min(100, Math.round(successRate)))
                : 0,
        };
    });
}

function AutomationRunsCard({
    rows,
    summary,
    workspaceId,
}: {
    rows: AutomationRow[];
    summary: {
        total: number;
        active: number;
        enrolled: number;
        inactive: number;
    };
    workspaceId: string;
}) {
    const [period, setPeriod] = useState<ChartPeriod>("W");
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [clientNow, setClientNow] = useState<Date | null>(null);
    const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);

    useEffect(() => {
        const updateNow = () => setClientNow(new Date());
        updateNow();

        const interval = window.setInterval(updateNow, 60_000);
        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!workspaceId || workspaceId === "demo-workspace") {
            setAnalytics(null);
            return;
        }

        let cancelled = false;

        async function loadAnalytics() {
            setAnalyticsLoading(true);

            try {
                const response = await fetch(
                    `/api/email-agent/automations/analytics?workspaceId=${encodeURIComponent(
                        workspaceId,
                    )}&period=${period}`,
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
                            typeof (payload as { error?: unknown }).error === "string"
                            ? (payload as { error: string }).error
                            : "Unable to load automation analytics.",
                    );
                }

                if (!cancelled) {
                    setAnalytics(
                        payload && typeof payload === "object"
                            ? (payload as AnalyticsPayload)
                            : null,
                    );
                }
            } catch (error) {
                console.error("Automation analytics load error:", error);

                if (!cancelled) {
                    setAnalytics(null);
                }
            } finally {
                if (!cancelled) {
                    setAnalyticsLoading(false);
                }
            }
        }

        void loadAnalytics();

        return () => {
            cancelled = true;
        };
    }, [period, workspaceId]);

    const chartData = useMemo(
        () =>
            mergeAnalyticsPoints(
                analytics,
                period,
                clientNow ?? new Date(),
            ),
        [analytics, clientNow, period],
    );

    const totalRuns = useMemo(
        () => rows.reduce((sum, row) => sum + row.totalRuns, 0),
        [rows],
    );

    const overallSuccess = useMemo(() => {
        if (!totalRuns) return 0;

        const successfulRuns = rows.reduce(
            (sum, row) =>
                sum + row.totalRuns * (row.successRate / 100),
            0,
        );

        return Math.round((successfulRuns / totalRuns) * 100);
    }, [rows, totalRuns]);

    const chartDateRange = useMemo(() => {
        if (!clientNow) return "";

        if (period === "W") {
            const monday = startOfCurrentWeek(clientNow);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);

            const start = new Intl.DateTimeFormat("en-GB", {
                day: "numeric",
                month: "short",
            }).format(monday);

            const end = new Intl.DateTimeFormat("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
            }).format(sunday);

            return `${start} – ${end}`;
        }

        const buckets = dateBucketMetadata("12M", clientNow);

        return `${buckets[0]?.fullLabel ?? ""} – ${buckets[11]?.fullLabel ?? ""
            }`;
    }, [clientNow, period]);

    const maxRuns = Math.max(
        1,
        ...chartData.map((point) => point.runs),
    );

    const axisMax = Math.max(
        10,
        Math.ceil(maxRuns / 10) * 10,
    );

    const yTicks = [1, 0.8, 0.6, 0.4, 0.2, 0].map((ratio) =>
        Math.round(axisMax * ratio),
    );

    const hoveredPoint =
        hoveredIndex !== null ? chartData[hoveredIndex] : null;

    return (
        <section className={styles.overviewGrid}>
            <article className={styles.kpiCard}>
                <div className={styles.kpiStatsGrid}>
                    <div className={styles.kpiStat}>
                        <div className={styles.kpiStatTop}>
                            <span>Total Workflows</span>
                            <span className={styles.kpiIcon} aria-hidden="true">
                                <Workflow size={14} strokeWidth={1.8} />
                            </span>
                        </div>
                        <strong>{summary.total}</strong>
                        <small>Saved workflows</small>
                    </div>

                    <div className={styles.kpiStat}>
                        <div className={styles.kpiStatTop}>
                            <span>Active</span>
                            <span className={styles.kpiIcon} aria-hidden="true">
                                <Activity size={14} strokeWidth={1.8} />
                            </span>
                        </div>
                        <strong>{summary.active}</strong>
                        <small>Running workflows</small>
                    </div>

                    <div className={styles.kpiStat}>
                        <div className={styles.kpiStatTop}>
                            <span>Total Enrolled</span>
                            <span className={styles.kpiIcon} aria-hidden="true">
                                <UsersRound size={14} strokeWidth={1.8} />
                            </span>
                        </div>
                        <strong>{summary.enrolled.toLocaleString("en-GB")}</strong>
                        <small>Real workflow runs</small>
                    </div>

                    <div className={styles.kpiStat}>
                        <div className={styles.kpiStatTop}>
                            <span>Inactive</span>
                            <span className={styles.kpiIcon} aria-hidden="true">
                                <CirclePause size={14} strokeWidth={1.8} />
                            </span>
                        </div>
                        <strong>{summary.inactive}</strong>
                        <small>Paused workflows</small>
                    </div>
                </div>
            </article>

            <article className={styles.chartCard}>
                <div className={styles.performanceHeader}>
                    <div>
                        <div className={styles.performanceEyebrow}>
                            Automation runs
                        </div>

                        <div className={styles.chartValueRow}>
                            <strong>
                                {totalRuns.toLocaleString("en-GB")}
                            </strong>

                            <div className={styles.performanceChange}>
                                <span>{overallSuccess}%</span>
                                <small>success rate</small>
                            </div>
                        </div>

                        <div className={styles.performanceMeta}>
                            {analyticsLoading
                                ? "Loading run history…"
                                : chartDateRange || " "}
                        </div>
                    </div>

                    <div
                        className={styles.periodControl}
                        aria-label="Automation runs period"
                    >
                        <button
                            type="button"
                            className={
                                period === "W"
                                    ? styles.periodButtonActive
                                    : ""
                            }
                            onClick={() => {
                                setPeriod("W");
                                setHoveredIndex(null);
                            }}
                        >
                            Week
                        </button>

                        <button
                            type="button"
                            className={
                                period === "12M"
                                    ? styles.periodButtonActive
                                    : ""
                            }
                            onClick={() => {
                                setPeriod("12M");
                                setHoveredIndex(null);
                            }}
                        >
                            12 Months
                        </button>
                    </div>
                </div>

                <div className={styles.chartCanvas}>
                    <div
                        className={styles.barChart}
                        role="img"
                        aria-label={
                            period === "W"
                                ? "Real automation runs from Monday to Sunday"
                                : "Real automation runs across the latest 12 months"
                        }
                    >
                        <div
                            className={styles.barChartScale}
                            aria-hidden="true"
                        >
                            {yTicks.map((tick, index) => (
                                <span key={`${tick}-${index}`}>
                                    {tick.toLocaleString("en-GB")}
                                </span>
                            ))}
                        </div>

                        <div className={styles.barChartPlot}>
                            <div
                                className={styles.barChartGrid}
                                aria-hidden="true"
                            >
                                {yTicks.map((tick, index) => (
                                    <span key={`${tick}-${index}`} />
                                ))}
                            </div>

                            <div
                                className={`${styles.barChartBars} ${period === "12M"
                                        ? styles.barChartBarsTwelveMonths
                                        : ""
                                    }`}
                            >
                                {chartData.map((point, index) => {
                                    const totalHeight =
                                        axisMax > 0
                                            ? (point.runs / axisMax) * 100
                                            : 0;

                                    const successfulHeight =
                                        axisMax > 0
                                            ? (point.successful / axisMax) * 100
                                            : 0;

                                    const unsuccessfulHeight =
                                        axisMax > 0
                                            ? (point.unsuccessful / axisMax) * 100
                                            : 0;

                                    const currentDate =
                                        clientNow ?? new Date();

                                    const currentKey =
                                        period === "W"
                                            ? `${currentDate.getFullYear()}-${String(
                                                currentDate.getMonth() + 1,
                                            ).padStart(2, "0")}-${String(
                                                currentDate.getDate(),
                                            ).padStart(2, "0")}`
                                            : `${currentDate.getFullYear()}-${String(
                                                currentDate.getMonth() + 1,
                                            ).padStart(2, "0")}`;

                                    const isCurrent =
                                        point.key === currentKey;

                                    return (
                                        <div
                                            className={`${styles.barChartColumn} ${isCurrent
                                                    ? styles.barChartColumnCurrent
                                                    : ""
                                                }`}
                                            key={point.key}
                                        >
                                            <div
                                                className={styles.barChartTrack}
                                                tabIndex={0}
                                                onMouseEnter={() =>
                                                    setHoveredIndex(index)
                                                }
                                                onMouseLeave={() =>
                                                    setHoveredIndex(null)
                                                }
                                                onFocus={() =>
                                                    setHoveredIndex(index)
                                                }
                                                onBlur={() =>
                                                    setHoveredIndex(null)
                                                }
                                            >
                                                <div
                                                    className={
                                                        styles.barChartTotal
                                                    }
                                                    style={{
                                                        height: `${totalHeight}%`,
                                                    }}
                                                />

                                                <div
                                                    className={
                                                        styles.barChartActualStack
                                                    }
                                                >
                                                    <div
                                                        className={`${styles.barChartSegment} ${styles.barChartSuccessful}`}
                                                        style={{
                                                            height: `${successfulHeight}%`,
                                                        }}
                                                    />

                                                    <div
                                                        className={`${styles.barChartSegment} ${styles.barChartUnsuccessful}`}
                                                        style={{
                                                            height: `${unsuccessfulHeight}%`,
                                                        }}
                                                    />
                                                </div>

                                                {hoveredPoint &&
                                                    hoveredIndex === index && (
                                                        <div
                                                            className={
                                                                styles.barChartTooltip
                                                            }
                                                            role="tooltip"
                                                        >
                                                            <strong>
                                                                {
                                                                    point.fullLabel
                                                                }
                                                            </strong>

                                                            <span>
                                                                <i
                                                                    className={
                                                                        styles.legendTotal
                                                                    }
                                                                />
                                                                Total Runs
                                                                <b>
                                                                    {point.runs.toLocaleString(
                                                                        "en-GB",
                                                                    )}
                                                                </b>
                                                            </span>

                                                            <span>
                                                                <i
                                                                    className={
                                                                        styles.legendSuccessful
                                                                    }
                                                                />
                                                                Successful
                                                                <b>
                                                                    {point.successful.toLocaleString(
                                                                        "en-GB",
                                                                    )}
                                                                </b>
                                                            </span>

                                                            <span>
                                                                <i
                                                                    className={
                                                                        styles.legendUnsuccessful
                                                                    }
                                                                />
                                                                Unsuccessful
                                                                <b>
                                                                    {point.unsuccessful.toLocaleString(
                                                                        "en-GB",
                                                                    )}
                                                                </b>
                                                            </span>

                                                            <span>
                                                                <i
                                                                    className={
                                                                        styles.legendRate
                                                                    }
                                                                />
                                                                Success Rate
                                                                <b>
                                                                    {
                                                                        point.successRate
                                                                    }
                                                                    %
                                                                </b>
                                                            </span>
                                                        </div>
                                                    )}
                                            </div>

                                            <span>{point.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div
                        className={styles.barChartLegend}
                        aria-label="Chart legend"
                    >
                        <span>
                            <i className={styles.legendTotal} />
                            Total Runs
                        </span>
                        <span>
                            <i className={styles.legendSuccessful} />
                            Successful
                        </span>
                        <span>
                            <i className={styles.legendUnsuccessful} />
                            Unsuccessful
                        </span>
                        <span>
                            <i className={styles.legendRate} />
                            Success Rate
                        </span>
                    </div>
                </div>
            </article>
        </section>
    );
}

export default function AutomationsTablePage() {
    const router = useRouter();

    const [workspaceId, setWorkspaceId] = useState("");
    const [rows, setRows] = useState<AutomationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);

    const [search, setSearch] = useState("");
    const [view, setView] = useState<AutomationView>("active");
    const [filterOpen, setFilterOpen] = useState(false);
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
                    : status === "Inactive"
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

    const summary = useMemo(() => {
        const active = rows.filter(
            (row) => row.status === "Active",
        ).length;

        const inactive = rows.filter(
            (row) => row.status === "Inactive",
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

        const filtered = rows.filter((row) => {
            const matchesView =
                view === "all" ||
                view === "recent" ||
                view === "old" ||
                (view === "active" && row.status === "Active") ||
                (view === "inactive" && row.status === "Inactive") ||
                (view === "draft" && row.status === "Draft");

            const matchesSearch =
                !query ||
                row.name.toLowerCase().includes(query) ||
                row.description.toLowerCase().includes(query) ||
                row.trigger.toLowerCase().includes(query);

            return matchesView && matchesSearch;
        });

        if (view !== "recent" && view !== "old") {
            return filtered;
        }

        return [...filtered].sort((a, b) => {
            const aTime = new Date(a.workflow.updatedAt).getTime();
            const bTime = new Date(b.workflow.updatedAt).getTime();

            const safeATime = Number.isFinite(aTime) ? aTime : 0;
            const safeBTime = Number.isFinite(bTime) ? bTime : 0;

            return view === "recent"
                ? safeBTime - safeATime
                : safeATime - safeBTime;
        });
    }, [rows, search, view]);

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

    return (
        <main className={styles.page}>
            <header className={styles.pageHeader}>
                <div>
                    <div className={styles.breadcrumb}>
                        Dashboard / Automations
                    </div>

                    <h1>Automations</h1>

                    <p>
                        Build, monitor and manage your workflow
                        automations.
                    </p>
                </div>

                <button
                    type="button"
                    className={styles.createButton}
                    onClick={() => void createWorkflow()}
                    disabled={creating}
                >
                    {creating ? "Creating…" : "Create workflow"}
                </button>
            </header>

            {error && (
                <div
                    role="alert"
                    style={{
                        marginBottom: 14,
                        padding: "10px 12px",
                        border: "1px solid #fecaca",
                        borderRadius: 10,
                        background: "#fff7f7",
                        color: "#991b1b",
                        fontSize: 13,
                    }}
                >
                    {error}
                </div>
            )}

            <AutomationRunsCard
                rows={rows}
                summary={summary}
                workspaceId={workspaceId}
            />

            <section className={styles.tableSection}>
                <div className={styles.tableTopline}>
                    <h2>
                        {view === "active"
                            ? "Active workflows"
                            : view === "inactive"
                                ? "Inactive workflows"
                                : view === "draft"
                                    ? "Draft workflows"
                                    : view === "recent"
                                        ? "Recent workflows"
                                        : view === "old"
                                            ? "Old workflows"
                                            : "All automations"}
                    </h2>

                    <span>
                        {filteredRows.length} workflow
                        {filteredRows.length === 1 ? "" : "s"}
                    </span>
                </div>

                <div className={styles.toolbar}>
                    <label className={styles.searchBox}>
                        <Search size={15} />

                        <input
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setPage(1);
                            }}
                            placeholder="Search workflows..."
                        />
                    </label>

                    <div className={styles.filterWrap}>
                        <button
                            type="button"
                            className={`${styles.filterButton} ${view !== "all"
                                    ? styles.filterButtonActive
                                    : ""
                                }`}
                            aria-expanded={filterOpen}
                            aria-haspopup="menu"
                            onClick={() =>
                                setFilterOpen((current) => !current)
                            }
                        >
                            <SlidersHorizontal size={14} />
                            Filter
                        </button>

                        {filterOpen && (
                            <div
                                className={styles.filterMenu}
                                role="menu"
                            >
                                <button
                                    type="button"
                                    className={
                                        view === "all"
                                            ? styles.filterOptionActive
                                            : ""
                                    }
                                    aria-pressed={view === "all"}
                                    onClick={() => {
                                        setView("all");
                                        setFilterOpen(false);
                                        setPage(1);
                                    }}
                                >
                                    All workflows
                                </button>

                                <button
                                    type="button"
                                    className={
                                        view === "active"
                                            ? styles.filterOptionActive
                                            : ""
                                    }
                                    aria-pressed={view === "active"}
                                    onClick={() => {
                                        setView("active");
                                        setFilterOpen(false);
                                        setPage(1);
                                    }}
                                >
                                    Active
                                </button>

                                <button
                                    type="button"
                                    className={
                                        view === "inactive"
                                            ? styles.filterOptionActive
                                            : ""
                                    }
                                    aria-pressed={view === "inactive"}
                                    onClick={() => {
                                        setView("inactive");
                                        setFilterOpen(false);
                                        setPage(1);
                                    }}
                                >
                                    Inactive
                                </button>

                                <button
                                    type="button"
                                    className={
                                        view === "draft"
                                            ? styles.filterOptionActive
                                            : ""
                                    }
                                    aria-pressed={view === "draft"}
                                    onClick={() => {
                                        setView("draft");
                                        setFilterOpen(false);
                                        setPage(1);
                                    }}
                                >
                                    Drafts
                                </button>

                                <button
                                    type="button"
                                    className={
                                        view === "recent"
                                            ? styles.filterOptionActive
                                            : ""
                                    }
                                    aria-pressed={view === "recent"}
                                    onClick={() => {
                                        setView("recent");
                                        setFilterOpen(false);
                                        setPage(1);
                                    }}
                                >
                                    Recent
                                </button>

                                <button
                                    type="button"
                                    className={
                                        view === "old"
                                            ? styles.filterOptionActive
                                            : ""
                                    }
                                    aria-pressed={view === "old"}
                                    onClick={() => {
                                        setView("old");
                                        setFilterOpen(false);
                                        setPage(1);
                                    }}
                                >
                                    Old
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <colgroup>
                            <col className={styles.colName} />
                            <col className={styles.colTrigger} />
                            <col className={styles.colRuns} />
                            <col className={styles.colSuccess} />
                            <col className={styles.colLastRun} />
                            <col className={styles.colStatus} />
                            <col className={styles.colAction} />
                        </colgroup>

                        <thead>
                            <tr>
                                <th>Workflow Name</th>
                                <th>Trigger</th>
                                <th>Total Runs</th>
                                <th>Success</th>
                                <th>Last Run</th>
                                <th>Status</th>
                                <th className={styles.actionColumn}>
                                    Action
                                </th>
                            </tr>
                        </thead>

                        <tbody>
                            {loading ? (
                                <tr>
                                    <td
                                        colSpan={7}
                                        style={{
                                            padding: "36px 20px",
                                            textAlign: "center",
                                            color: "#64748b",
                                        }}
                                    >
                                        Loading automations…
                                    </td>
                                </tr>
                            ) : visibleRows.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={7}
                                        style={{
                                            padding: "42px 20px",
                                            textAlign: "center",
                                            color: "#64748b",
                                        }}
                                    >
                                        {rows.length === 0
                                            ? "No workflows yet. Create your first workflow to get started."
                                            : "No workflows match this filter."}
                                    </td>
                                </tr>
                            ) : (
                                visibleRows.map((automation) => {
                                    const active =
                                        automation.status === "Active";
                                    const draft =
                                        automation.status === "Draft";
                                    const rowBusy =
                                        busyId === automation.id;

                                    return (
                                        <tr key={automation.id}>
                                            <td>
                                                <Link
                                                    href={`/dashboard/automations/${automation.id}`}
                                                    className={
                                                        styles.workflowCell
                                                    }
                                                >
                                                    <span
                                                        className={
                                                            styles.workflowCopy
                                                        }
                                                    >
                                                        <strong>
                                                            {
                                                                automation.name
                                                            }
                                                        </strong>
                                                        <small>
                                                            {
                                                                automation.description
                                                            }
                                                        </small>
                                                    </span>
                                                </Link>
                                            </td>

                                            <td
                                                className={
                                                    styles.triggerCell
                                                }
                                            >
                                                <span
                                                    className={`${styles.triggerBadge} ${getTriggerClass(
                                                        automation.trigger,
                                                    )}`}
                                                >
                                                    {automation.trigger}
                                                </span>
                                            </td>

                                            <td>
                                                {automation.totalRuns.toLocaleString(
                                                    "en-GB",
                                                )}
                                            </td>

                                            <td>
                                                <span
                                                    className={
                                                        automation.successRate >
                                                            0
                                                            ? styles.successRate
                                                            : styles.zeroRate
                                                    }
                                                >
                                                    {
                                                        automation.successRate
                                                    }
                                                    %
                                                </span>
                                            </td>

                                            <td>
                                                <span
                                                    className={
                                                        styles.lastRun
                                                    }
                                                >
                                                    <Clock3 size={13} />
                                                    {automation.lastRun}
                                                </span>
                                            </td>

                                            <td>
                                                <span
                                                    className={`${styles.statusPill} ${active
                                                            ? styles.statusActive
                                                            : draft
                                                                ? styles.statusDraft
                                                                : styles.statusInactive
                                                        }`}
                                                >
                                                    {automation.status}
                                                </span>
                                            </td>

                                            <td
                                                className={
                                                    styles.actionsCell
                                                }
                                            >
                                                <Link
                                                    href={`/dashboard/automations/${automation.id}`}
                                                    className={
                                                        styles.textAction
                                                    }
                                                >
                                                    {draft
                                                        ? "Continue building workflow"
                                                        : "View"}
                                                </Link>

                                                {!draft && (
                                                    <Link
                                                        href={`/dashboard/automations/${automation.id}`}
                                                        className={
                                                            styles.textAction
                                                        }
                                                    >
                                                        Edit
                                                    </Link>
                                                )}

                                                {!draft && (
                                                    <button
                                                        type="button"
                                                        className={
                                                            styles.iconAction
                                                        }
                                                        disabled={rowBusy}
                                                        aria-label={
                                                            active
                                                                ? "Pause automation"
                                                                : "Activate automation"
                                                        }
                                                        onClick={() =>
                                                            void setStatus(
                                                                automation,
                                                                active
                                                                    ? "Inactive"
                                                                    : "Active",
                                                            )
                                                        }
                                                    >
                                                        {active ? (
                                                            <Pause
                                                                size={14}
                                                            />
                                                        ) : (
                                                            <Play
                                                                size={14}
                                                            />
                                                        )}
                                                    </button>
                                                )}

                                                <div
                                                    className={
                                                        styles.moreWrap
                                                    }
                                                >
                                                    <button
                                                        type="button"
                                                        className={
                                                            styles.moreButton
                                                        }
                                                        onClick={() =>
                                                            setMenuOpenId(
                                                                (
                                                                    current,
                                                                ) =>
                                                                    current ===
                                                                        automation.id
                                                                        ? null
                                                                        : automation.id,
                                                            )
                                                        }
                                                        aria-label={`More actions for ${automation.name}`}
                                                    >
                                                        <MoreHorizontal
                                                            size={15}
                                                        />
                                                    </button>

                                                    {menuOpenId ===
                                                        automation.id && (
                                                            <div
                                                                className={
                                                                    styles.rowMenu
                                                                }
                                                            >
                                                                <Link
                                                                    href={`/dashboard/automations/${automation.id}`}
                                                                >
                                                                    {draft
                                                                        ? "Continue building workflow"
                                                                        : "Open workflow"}
                                                                </Link>

                                                                {!draft && (
                                                                    <button
                                                                        type="button"
                                                                        disabled={
                                                                            rowBusy
                                                                        }
                                                                        onClick={() =>
                                                                            void setStatus(
                                                                                automation,
                                                                                active
                                                                                    ? "Inactive"
                                                                                    : "Active",
                                                                            )
                                                                        }
                                                                    >
                                                                        {active
                                                                            ? "Deactivate"
                                                                            : "Activate"}
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

                <footer className={styles.tableFooter}>
                    <div className={styles.pagination}>
                        <button
                            type="button"
                            className={styles.paginationArrow}
                            disabled={safePage === 1}
                            onClick={() =>
                                setPage((current) =>
                                    Math.max(1, current - 1),
                                )
                            }
                        >
                            <ChevronLeft size={15} />
                        </button>

                        {Array.from(
                            { length: totalPages },
                            (_, index) => index + 1,
                        ).map((pageNumber) => (
                            <button
                                type="button"
                                key={pageNumber}
                                className={
                                    safePage === pageNumber
                                        ? styles.pageButtonActive
                                        : ""
                                }
                                onClick={() =>
                                    setPage(pageNumber)
                                }
                            >
                                {pageNumber}
                            </button>
                        ))}

                        <button
                            type="button"
                            className={styles.paginationArrow}
                            disabled={safePage === totalPages}
                            onClick={() =>
                                setPage((current) =>
                                    Math.min(
                                        totalPages,
                                        current + 1,
                                    ),
                                )
                            }
                        >
                            <ChevronRight size={15} />
                        </button>
                    </div>

                    <div className={styles.pageSize}>
                        <span>Show:</span>
                        <button type="button">
                            10
                            <ChevronDown size={13} />
                        </button>
                        <span>Per Page</span>
                        <span>
                            {(safePage - 1) * PAGE_SIZE +
                                (visibleRows.length ? 1 : 0)}
                            -
                            {Math.min(
                                safePage * PAGE_SIZE,
                                filteredRows.length,
                            )}{" "}
                            of {filteredRows.length}
                        </span>
                    </div>
                </footer>
            </section>
        </main>
    );
}
