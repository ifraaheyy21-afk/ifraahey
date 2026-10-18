"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Play, Plus, Zap, Clock3 } from "lucide-react";

import type { StepCopy, StepNode } from "./step-copy";
import styles from "./flow-builder.module.css";

type Branch = "YES" | "NO";

export type FlowConnection = {
    id: string;
    from: string;
    to: string;
    label?: string;
};

export type InsertTarget = { fromId: string | null; branch: Branch | null };

export type ZoomControls = {
    zoom: number;
    autoFit: boolean;
    zoomIn: () => void;
    zoomOut: () => void;
    fit: () => void;
};

type Props = {
    name: string;
    onRename: (name: string) => void;
    status: "draft" | "active" | "paused";
    saveState: "idle" | "saving" | "saved" | "error";

    nodes: StepNode[];
    connections: FlowConnection[];
    branchOf: (connection: FlowConnection) => Branch | null;
    describe: (node: StepNode) => StepCopy;
    issuesFor: (node: StepNode) => string[];
    iconFor: (node: StepNode) => ReactNode;
    selectedNodeId: string | null;
    onSelectNode: (id: string) => void;
    onInsert: (target: InsertTarget) => void;
    /** The selected step, expanded in place. */
    renderEditor: (node: StepNode) => ReactNode;

    onTest: () => void;
    onPrimary: () => void;
    primaryBusy: boolean;

    /** The sidebar, given the canvas zoom so it can show the controls. */
    renderSidebar: (zoom: ZoomControls) => ReactNode;
    /** Full settings panel, shown on the right when asked for. */
    panel: ReactNode;
};

const STATUS_LABEL = { draft: "Draft", active: "Live", paused: "Paused" } as const;
const PRIMARY_LABEL = { draft: "Publish", active: "Pause", paused: "Resume" } as const;
const SAVE_LABEL = { idle: "", saving: "Saving…", saved: "Saved", error: "Couldn't save" } as const;

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.5;
/** Fitting the height never shrinks below this; taller flows scroll instead. */
const FIT_HEIGHT_FLOOR = 0.7;
/** Auto-fit never goes below this, so cards stay readable; wider flows scroll. */
const FIT_FLOOR = 0.6;
/** Breathing room kept around a fitted flow. */
const FIT_MARGIN = 24;
/** Space the settings panel covers on the right of the canvas. */
const PANEL_SPACE = 384;

const roundZoom = (value: number) => Math.round(value * 100) / 100;

/** Workflow builder: header, sidebar, descriptive step cards, toolbar. */
export default function FlowBuilder(props: Props) {
    const {
        name, onRename, status, saveState,
        nodes, connections, branchOf, describe, issuesFor, iconFor,
        selectedNodeId, onSelectNode, onInsert, renderEditor,
        onTest, onPrimary, primaryBusy,
        renderSidebar, panel,
    } = props;

    const [zoom, setZoom] = useState(1);
    const [autoFit, setAutoFit] = useState(true);
    const [fitRequest, setFitRequest] = useState(0);
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const flowRef = useRef<HTMLDivElement | null>(null);
    const centerAfterZoom = useRef(false);

    // Scrolls so the trigger sits in the middle of the canvas.
    const centerOnEntry = useCallback(() => {
        const canvas = canvasRef.current;
        const entry = flowRef.current?.querySelector("[data-flow-entry]");
        if (!canvas || !entry) return;
        const box = entry.getBoundingClientRect();
        canvas.scrollLeft += box.left + box.width / 2 - (canvas.getBoundingClientRect().left + canvas.clientWidth / 2);
    }, []);

    // Size the flow to the space it has: always fit the width, fit the height
    // too unless that would make the cards hard to read.
    const fitToCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const flow = flowRef.current;
        if (!canvas || !flow) return;
        const current = Number.parseFloat(flow.style.zoom || "1") || 1;
        const width = flow.getBoundingClientRect().width / current;
        const height = flow.getBoundingClientRect().height / current;
        if (!width || !height) return;

        const availableWidth = canvas.clientWidth - (panel ? PANEL_SPACE : 0) - FIT_MARGIN;
        const widthFit = availableWidth / width;
        const heightFit = canvas.clientHeight / height;
        const next = Math.max(Math.min(1, widthFit, heightFit), Math.min(widthFit, FIT_HEIGHT_FLOOR), FIT_FLOOR);
        const target = Math.floor(Math.min(1, next) * 100) / 100;

        // A flow wider than the canvas opens centred on its trigger, once
        // the new zoom has been laid out.
        if (target === current) {
            centerOnEntry();
        } else {
            centerAfterZoom.current = true;
            setZoom(target);
        }
    }, [panel, centerOnEntry]);

    useEffect(() => {
        if (!centerAfterZoom.current) return;
        centerAfterZoom.current = false;
        centerOnEntry();
    }, [zoom, centerOnEntry]);

    useEffect(() => {
        if (!autoFit) return;
        fitToCanvas();
        const canvas = canvasRef.current;
        if (!canvas || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(() => fitToCanvas());
        observer.observe(canvas);
        return () => observer.disconnect();
    }, [autoFit, fitToCanvas, fitRequest, nodes.length, connections.length]);

    const zoomControls: ZoomControls = {
        zoom,
        autoFit,
        zoomIn: () => {
            setAutoFit(false);
            setZoom((value) => Math.min(ZOOM_MAX, roundZoom(value + 0.1)));
        },
        zoomOut: () => {
            setAutoFit(false);
            setZoom((value) => Math.max(ZOOM_MIN, roundZoom(value - 0.1)));
        },
        fit: () => {
            setAutoFit(true);
            setFitRequest((value) => value + 1);
        },
    };

    const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    const outgoing = useMemo(() => {
        const map = new Map<string, FlowConnection[]>();
        for (const connection of connections) {
            if (!map.has(connection.from)) map.set(connection.from, []);
            map.get(connection.from)!.push(connection);
        }
        return map;
    }, [connections]);

    const trigger = nodes.find((node) => node.type === "trigger") ?? null;

    // Steps are numbered in the order they run, Yes path before No path,
    // matching the order the tree below renders them.
    const stepNumbers = useMemo(() => {
        const numbers = new Map<string, number>();
        const children = (id: string) => {
            const edges = outgoing.get(id) ?? [];
            const node = byId.get(id);
            if (node?.type !== "condition") return edges.map((edge) => edge.to);
            return (["YES", "NO"] as const)
                .map((branch) => edges.find((edge) => branchOf(edge) === branch)?.to)
                .filter((value): value is string => Boolean(value));
        };
        const visit = (id: string) => {
            if (numbers.has(id) || !byId.has(id)) return;
            numbers.set(id, numbers.size + 1);
            children(id).forEach(visit);
        };
        const first = nodes.find((node) => node.type === "trigger");
        if (first) visit(first.id);
        const incoming = new Set(connections.map((connection) => connection.to));
        nodes.filter((node) => !incoming.has(node.id)).forEach((node) => visit(node.id));
        nodes.forEach((node) => visit(node.id));
        return numbers;
    }, [nodes, connections, byId, outgoing, branchOf]);
    const hasIncoming = new Set(connections.map((connection) => connection.to));
    const roots = [
        ...(trigger ? [trigger] : []),
        ...nodes.filter((node) => node !== trigger && !hasIncoming.has(node.id)),
    ];

    const rendered = new Set<string>();

    function insertButton(target: InsertTarget, label: string) {
        return (
            <button type="button" className={styles.insert} aria-label={label} title={label} onClick={() => onInsert(target)}>
                <Plus size={13} />
            </button>
        );
    }

    function renderStep(node: StepNode) {
        const number = stepNumbers.get(node.id) ?? 0;

        if (node.id === selectedNodeId) {
            return <div className={styles.editorSlot}>{renderEditor(node)}</div>;
        }

        const copy = describe(node);
        const issues = issuesFor(node);

        if (node.type === "delay") {
            return (
                <button type="button" className={styles.wait} onClick={() => onSelectNode(node.id)} title={copy.description}>
                    <span className={styles.waitNumber} aria-label={`Step ${number}`}>{number}</span>
                    <Clock3 size={13} aria-hidden="true" />
                    {copy.title}
                </button>
            );
        }

        return (
            <div className={styles.step}>
                <button type="button" className={styles.card} data-type={node.type} onClick={() => onSelectNode(node.id)}>
                    <span className={styles.number} aria-label={`Step ${number}`}>{number}</span>
                    <span className={styles.cardHead}>
                        <span className={styles.icon} aria-hidden="true">{iconFor(node)}</span>
                        <span className={styles.headCopy}>
                            <span className={styles.title}>{copy.title}</span>
                            <span className={styles.subtitle}>{copy.subtitle}</span>
                        </span>
                        <span className={issues.length ? styles.badgeWarn : styles.badgeOk} title={issues.join(" ")}>
                            {issues.length ? "Needs setup" : "Ready"}
                        </span>
                    </span>
                    <span className={styles.description}>{copy.description}</span>
                    {copy.app && <span className={styles.appChip}>{copy.app}</span>}
                </button>
            </div>
        );
    }

    function renderFrom(nodeId: string): ReactNode {
        const node = byId.get(nodeId);
        if (!node) return null;

        if (rendered.has(nodeId)) {
            return <div className={styles.jump}>Continues at “{describe(node).title}”</div>;
        }
        rendered.add(nodeId);

        const edges = outgoing.get(nodeId) ?? [];

        if (node.type === "condition") {
            const yes = edges.find((edge) => branchOf(edge) === "YES");
            const no = edges.find((edge) => branchOf(edge) === "NO");
            return (
                <>
                    {renderStep(node)}
                    <div className={styles.line} />
                    <div className={styles.branches}>
                        {([["YES", yes], ["NO", no]] as const).map(([branch, edge]) => (
                            <div key={branch} className={styles.branch} data-branch={branch}>
                                <span className={`${styles.branchPill} ${branch === "YES" ? styles.yes : styles.no}`}>
                                    {branch === "YES" ? "Yes" : "No"}
                                </span>
                                <div className={styles.line} />
                                {insertButton(
                                    { fromId: node.id, branch },
                                    edge ? `Add a step on the ${branch === "YES" ? "Yes" : "No"} path` : `Add the ${branch === "YES" ? "Yes" : "No"} path`,
                                )}
                                {edge && (
                                    <>
                                        <div className={styles.line} />
                                        {renderFrom(edge.to)}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            );
        }

        return (
            <>
                {renderStep(node)}
                <div className={styles.line} />
                {insertButton(
                    { fromId: node.id, branch: null },
                    edges.length ? `Add a step after ${describe(node).title}` : "Add the next step",
                )}
                {edges.length === 1 && (
                    <>
                        <div className={styles.line} />
                        {renderFrom(edges[0].to)}
                    </>
                )}
                {edges.length > 1 && (
                    <div className={styles.branches}>
                        {edges.map((edge) => (
                            <div key={edge.id} className={styles.branch}>
                                <div className={styles.line} />
                                {renderFrom(edge.to)}
                            </div>
                        ))}
                    </div>
                )}
            </>
        );
    }

    const flow = trigger ? renderFrom(trigger.id) : null;
    const reachedFromTrigger = rendered.size;

    const disconnected: ReactNode[] = [];
    for (const root of roots) {
        if (root === trigger || rendered.has(root.id)) continue;
        disconnected.push(<Fragment key={root.id}>{renderFrom(root.id)}</Fragment>);
    }
    for (const node of nodes) {
        if (rendered.has(node.id)) continue;
        disconnected.push(<Fragment key={node.id}>{renderFrom(node.id)}</Fragment>);
    }
    const hasDisconnected = reachedFromTrigger < nodes.length;

    return (
        <div className={styles.root}>
            <header className={styles.header}>
                <Link href="/dashboard/automations/all" className={styles.crumb}>Automations</Link>
                <span className={styles.crumbSep} aria-hidden="true">/</span>
                <input
                    className={styles.name}
                    value={name}
                    onChange={(event) => onRename(event.target.value)}
                    onBlur={(event) => { if (!event.currentTarget.value.trim()) onRename("Untitled workflow"); }}
                    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                    aria-label="Workflow name"
                />
                <span className={`${styles.status} ${styles[`status_${status}`]}`}>{STATUS_LABEL[status]}</span>
                {SAVE_LABEL[saveState] && (
                    <span className={`${styles.saved} ${saveState === "error" ? styles.savedError : ""}`}>{SAVE_LABEL[saveState]}</span>
                )}
                <span className={styles.spacer} />
                <button type="button" className={styles.secondary} onClick={onTest}>
                    <Play size={14} aria-hidden="true" />
                    Test
                </button>
                <button type="button" className={styles.primary} onClick={onPrimary} disabled={primaryBusy}>
                    {PRIMARY_LABEL[status]}
                </button>
            </header>

            <div className={styles.body}>
                {renderSidebar(zoomControls)}

                <div className={styles.canvasArea}>
                    <div
                        ref={canvasRef}
                        className={`${styles.canvas} ${panel ? styles.canvasWithPanel : ""}`}
                        onClick={(event) => {
                            // Clicking empty canvas closes the open editor.
                            if (selectedNodeId && (event.target === event.currentTarget || (event.target as HTMLElement).dataset.flowBackground)) {
                                onSelectNode("");
                            }
                        }}
                    >
                        <div className={styles.stage} data-flow-background="true">
                        <div ref={flowRef} className={styles.flow} data-flow-background="true" style={{ zoom }}>
                            {nodes.length === 0 && (
                                <div className={styles.empty}>
                                    <span className={styles.emptyIcon} aria-hidden="true"><Zap size={18} /></span>
                                    <strong>Start with a trigger</strong>
                                    <p>Choose what starts this workflow from the Triggers panel, then add steps underneath it.</p>
                                    <button type="button" className={styles.primary} onClick={() => onInsert({ fromId: null, branch: null })}>
                                        Choose a trigger
                                    </button>
                                </div>
                            )}

                            {nodes.length > 0 && !trigger && (
                                <div className={styles.notice}>
                                    This workflow has no trigger yet.
                                    <button type="button" onClick={() => onInsert({ fromId: null, branch: null })}>Add a trigger</button>
                                </div>
                            )}

                            {trigger && (
                                <>
                                    <span className={styles.entry} data-flow-entry>Entry point</span>
                                    <div className={styles.line} />
                                </>
                            )}
                            {flow}

                            {hasDisconnected && (
                                <div className={styles.disconnected}>
                                    <span className={styles.disconnectedLabel}>Not connected to the trigger</span>
                                    {disconnected}
                                </div>
                            )}
                        </div>
                        </div>
                    </div>

                    {panel && <div className={styles.panelSlot}>{panel}</div>}
                </div>
            </div>
        </div>
    );
}
