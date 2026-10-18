"use client";

import { useMemo, useState } from "react";

import styles from "./workflow-status-chart.module.css";

type Status = "Active" | "Paused" | "Draft";
type Period = "weeks" | "months";

export type ChartWorkflow = { status: Status; createdAt: string };

type Bucket = { label: string; fullLabel: string; end: Date; Active: number; Paused: number; Draft: number; total: number };

const SERIES: Array<{ key: Status; label: string }> = [
    { key: "Active", label: "Active" },
    { key: "Paused", label: "Paused" },
    { key: "Draft", label: "Draft" },
];

function startOfWeek(date: Date) {
    const start = new Date(date);
    const offset = (start.getDay() + 6) % 7; // Monday
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - offset);
    return start;
}

/**
 * Bucket end dates, oldest first. Each bar counts the workflows that existed
 * by the end of that bucket, split by their current status, so the last bar
 * is today's totals.
 */
function buildBuckets(period: Period, now: Date): Array<Pick<Bucket, "label" | "fullLabel" | "end">> {
    const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
    if (period === "weeks") {
        const thisWeek = startOfWeek(now);
        return Array.from({ length: 8 }, (_, index) => {
            const start = new Date(thisWeek);
            start.setDate(start.getDate() - (7 - index) * 7);
            const end = new Date(start);
            end.setDate(end.getDate() + 7);
            return {
                label: index === 7 ? "This week" : day.format(start),
                fullLabel: `Week of ${day.format(start)}`,
                end: index === 7 ? now : end,
            };
        });
    }
    const month = new Intl.DateTimeFormat("en-GB", { month: "short" });
    const monthYear = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
    return Array.from({ length: 12 }, (_, index) => {
        const start = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
        return { label: month.format(start), fullLabel: monthYear.format(start), end: index === 11 ? now : end };
    });
}

function niceMax(value: number) {
    if (value <= 4) return 4;
    const magnitude = 10 ** Math.floor(Math.log10(value));
    const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate * 4 >= value) ?? magnitude * 10;
    return step * 4;
}

/** Stacked bar chart of workflows by status (modelled on the "Total Customers" card). */
export default function WorkflowStatusChart({ workflows, loading }: { workflows: ChartWorkflow[]; loading: boolean }) {
    const [period, setPeriod] = useState<Period>("weeks");
    const [hovered, setHovered] = useState<number | null>(null);

    const buckets = useMemo<Bucket[]>(() => {
        const now = new Date();
        const created = workflows.map((workflow) => ({ ...workflow, time: new Date(workflow.createdAt).getTime() }));
        return buildBuckets(period, now).map((bucket) => {
            const counts = { Active: 0, Paused: 0, Draft: 0 };
            for (const workflow of created) {
                // A missing or unreadable date still counts in today's bar.
                if (!Number.isFinite(workflow.time) || workflow.time < bucket.end.getTime()) counts[workflow.status] += 1;
            }
            return { ...bucket, ...counts, total: counts.Active + counts.Paused + counts.Draft };
        });
    }, [workflows, period]);

    const latest = buckets[buckets.length - 1];
    const previous = buckets[buckets.length - 2];
    const change = latest && previous ? latest.total - previous.total : 0;
    const max = niceMax(Math.max(...buckets.map((bucket) => bucket.total), 0));
    const ticks = [4, 3, 2, 1, 0].map((step) => (max / 4) * step);

    return (
        <section className={styles.card} aria-label="Workflows by status">
            <header className={styles.head}>
                <div>
                    <h2>Total automations</h2>
                    <div className={styles.headline}>
                        <strong>{loading ? "–" : latest?.total ?? 0}</strong>
                        <span className={styles.delta}>
                            <span className={change > 0 ? styles.deltaUp : styles.deltaFlat}>
                                {change > 0 ? `+${change}` : change}
                            </span>
                            vs last {period === "weeks" ? "week" : "month"}
                        </span>
                    </div>
                </div>

                <div className={styles.summary}>
                    {SERIES.map((series) => (
                        <div key={series.key} className={styles.summaryItem}>
                            <span className={styles.dot} data-series={series.key} aria-hidden="true" />
                            <span>{series.label}</span>
                            <strong>{latest?.[series.key] ?? 0}</strong>
                        </div>
                    ))}
                </div>

                <div className={styles.toggle} role="tablist" aria-label="Chart period">
                    {(["weeks", "months"] as const).map((value) => (
                        <button
                            key={value}
                            type="button"
                            role="tab"
                            aria-selected={period === value}
                            className={period === value ? styles.toggleActive : styles.toggleButton}
                            onClick={() => setPeriod(value)}
                        >
                            {value === "weeks" ? "Weeks" : "Months"}
                        </button>
                    ))}
                </div>
            </header>

            <div className={styles.plot}>
                <div className={styles.axis} aria-hidden="true">
                    {ticks.map((tick) => <span key={tick}>{Number.isInteger(tick) ? tick : tick.toFixed(1)}</span>)}
                </div>

                <div className={styles.bars} onMouseLeave={() => setHovered(null)}>
                    <div className={styles.grid} aria-hidden="true">
                        {ticks.map((tick) => <span key={tick} />)}
                    </div>

                    {buckets.map((bucket, index) => (
                        <div
                            key={bucket.fullLabel}
                            className={styles.column}
                            onMouseEnter={() => setHovered(index)}
                            onFocus={() => setHovered(index)}
                            tabIndex={0}
                            aria-label={`${bucket.fullLabel}: ${bucket.Active} active, ${bucket.Paused} paused, ${bucket.Draft} draft`}
                        >
                            <div className={styles.track}>
                                <div className={styles.stack} style={{ height: `${(bucket.total / max) * 100}%` }}>
                                    {(["Draft", "Paused", "Active"] as const).map((key) =>
                                        bucket[key] > 0 ? (
                                            <span key={key} className={styles.segment} data-series={key} style={{ flexGrow: bucket[key] }} />
                                        ) : null)}
                                </div>
                                {hovered === index && (
                                    <div className={styles.tooltip} role="tooltip">
                                        <strong>{bucket.fullLabel}</strong>
                                        {SERIES.map((series) => (
                                            <span key={series.key}>
                                                <i className={styles.dot} data-series={series.key} />
                                                {series.label}
                                                <b>{bucket[series.key]}</b>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <span className={index === buckets.length - 1 ? styles.labelCurrent : styles.label}>{bucket.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
