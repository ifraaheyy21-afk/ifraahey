"use client";

import { useRef, type ReactNode } from "react";
import { Clock3, GitBranch, Settings2, Trash2, X } from "lucide-react";

import { isTerminalAutomationAction } from "../../../../lib/automation/action-capabilities";
import { describeStep, triggerTypeOf, type StepNode } from "./step-copy";
import styles from "./step-editor.module.css";

type Config = Record<string, unknown>;

export type TriggerOption = { id: string; title: string; config: Config };

type Props = {
    node: StepNode;
    nodes: StepNode[];
    icon: ReactNode;
    /** Tool the step runs through, e.g. the email provider. */
    appName?: string;
    issues: string[];
    triggerOptions: TriggerOption[];
    onChange: (patch: { title?: string; config?: Config }) => void;
    onClose: () => void;
    onDelete: () => void;
    onAddAfter: (type: "delay" | "condition") => void;
    onMoreSettings: () => void;
};

const VARIABLES = [
    { label: "First name", token: "{{first_name}}" },
    { label: "Full name", token: "{{customer_name}}" },
    { label: "Company", token: "{{customer_company}}" },
    { label: "Your company", token: "{{company_name}}" },
];

const CONDITIONS = [
    { value: "Email was opened", label: "opened" },
    { value: "Email was clicked", label: "clicked a link in" },
    { value: "Recipient replied", label: "replied to" },
    { value: "Recipient did not reply", label: "did not reply to" },
    { value: "Email bounced", label: "bounced on" },
];

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** A step card expanded in place for editing. */
export default function StepEditor({
    node, nodes, icon, appName, issues, triggerOptions,
    onChange, onClose, onDelete, onAddAfter, onMoreSettings,
}: Props) {
    const bodyRef = useRef<HTMLTextAreaElement | null>(null);
    const config = node.config ?? {};
    const copy = describeStep(node, (id) => nodes.find((item) => item.id === id)?.title ?? null);
    const set = (patch: Config) => onChange({ config: patch });

    function insertVariable(token: string) {
        const area = bodyRef.current;
        const current = text(config.body);
        if (!area) {
            set({ body: `${current}${token}` });
            return;
        }
        const start = area.selectionStart ?? current.length;
        const end = area.selectionEnd ?? current.length;
        const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
        set({ body: next });
        requestAnimationFrame(() => {
            area.focus();
            area.setSelectionRange(start + token.length, start + token.length);
        });
    }

    const emailSteps = nodes.filter((item) => item.type === "email" && item.id !== node.id);
    const triggerType = triggerTypeOf(config);
    const selectedTrigger =
        triggerOptions.find((option) =>
            text(option.config.triggerType) === triggerType &&
            (triggerType !== "custom_event" || !text(option.config.triggerEventName) || text(option.config.triggerEventName) === text(config.triggerEventName)),
        ) ?? null;

    return (
        <div className={styles.editor} data-type={node.type} onClick={(event) => event.stopPropagation()}>
            <div className={styles.head}>
                <span className={styles.icon} aria-hidden="true">{icon}</span>
                <div className={styles.headCopy}>
                    <input
                        className={styles.titleInput}
                        value={node.title}
                        onChange={(event) => onChange({ title: event.target.value })}
                        aria-label="Step name"
                    />
                    <span className={styles.appLine}>{appName ?? copy.app ?? copy.pill}</span>
                </div>
                <span className={issues.length ? styles.badgeWarn : styles.badgeOk} title={issues.join(" ")}>
                    {issues.length ? "Needs setup" : "Ready"}
                </span>
                <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close editor">
                    <X size={15} />
                </button>
            </div>

            <div className={styles.body}>
                {node.type === "trigger" && (
                    <>
                        <label className={styles.field}>
                            <span>Starts when</span>
                            <select
                                value={selectedTrigger?.id ?? ""}
                                onChange={(event) => {
                                    const option = triggerOptions.find((item) => item.id === event.target.value);
                                    if (!option) return;
                                    onChange({
                                        title: option.title,
                                        config: { triggerTag: undefined, triggerDaysBefore: undefined, triggerEventName: undefined, ...option.config },
                                    });
                                }}
                            >
                                {!selectedTrigger && <option value="">{copy.subtitle}</option>}
                                {triggerOptions.map((option) => (
                                    <option key={option.id} value={option.id}>{option.title}</option>
                                ))}
                            </select>
                        </label>
                        {triggerType === "tag_added" && (
                            <label className={styles.field}>
                                <span>Tag</span>
                                <input value={text(config.triggerTag)} placeholder="at-risk" onChange={(event) => set({ triggerTag: event.target.value })} />
                            </label>
                        )}
                        {triggerType === "renewal_upcoming" && (
                            <label className={styles.field}>
                                <span>Days before renewal</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={365}
                                    value={String(config.triggerDaysBefore ?? "")}
                                    onChange={(event) => set({ triggerDaysBefore: event.target.value === "" ? undefined : Number(event.target.value) })}
                                />
                            </label>
                        )}
                        {triggerType === "custom_event" && (
                            <label className={styles.field}>
                                <span>Event name</span>
                                <input value={text(config.triggerEventName)} placeholder="payment_failed" onChange={(event) => set({ triggerEventName: event.target.value })} />
                                <small>Send it from Zapier or your app to POST /api/automations/events with the contact&apos;s email.</small>
                            </label>
                        )}
                        <p className={styles.note}>{copy.description}</p>
                    </>
                )}

                {node.type === "email" && (
                    <>
                        <div className={styles.field}>
                            <span>To</span>
                            <div className={styles.readOnly}>The contact in this workflow</div>
                        </div>
                        <label className={styles.field}>
                            <span>Subject</span>
                            <input value={text(config.subject)} placeholder="Welcome to {{company_name}}" onChange={(event) => set({ subject: event.target.value })} />
                        </label>
                        <label className={styles.field}>
                            <span>Message</span>
                            <textarea
                                ref={bodyRef}
                                rows={6}
                                value={text(config.body)}
                                placeholder={"Hi {{first_name}},\n\nThanks for joining…"}
                                onChange={(event) => set({ body: event.target.value })}
                            />
                        </label>
                        <div className={styles.variables}>
                            <span>Insert</span>
                            {VARIABLES.map((variable) => (
                                <button key={variable.token} type="button" onClick={() => insertVariable(variable.token)}>
                                    {variable.label}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {node.type === "delay" && (
                    <div className={styles.row}>
                        <label className={styles.field}>
                            <span>Wait for</span>
                            <input
                                type="number"
                                min={1}
                                value={String(config.delayValue ?? 1)}
                                onChange={(event) => {
                                    const value = Math.max(1, Number(event.target.value) || 1);
                                    const unit = text(config.delayUnit) || "days";
                                    onChange({ title: `Wait ${value} ${value === 1 ? unit.replace(/s$/, "") : unit}`, config: { delayValue: value } });
                                }}
                            />
                        </label>
                        <label className={styles.field}>
                            <span>&nbsp;</span>
                            <select
                                value={text(config.delayUnit) || "days"}
                                onChange={(event) => {
                                    const value = Number(config.delayValue) || 1;
                                    const unit = event.target.value;
                                    onChange({ title: `Wait ${value} ${value === 1 ? unit.replace(/s$/, "") : unit}`, config: { delayUnit: unit } });
                                }}
                            >
                                <option value="minutes">minutes</option>
                                <option value="hours">hours</option>
                                <option value="days">days</option>
                            </select>
                        </label>
                    </div>
                )}

                {node.type === "condition" && (
                    <>
                        <label className={styles.field}>
                            <span>Check if the contact</span>
                            <select
                                value={CONDITIONS.some((item) => item.value === text(config.condition)) ? text(config.condition) : ""}
                                onChange={(event) => onChange({
                                    title: `${CONDITIONS.find((item) => item.value === event.target.value)?.label ?? "Checked"} the email?`.replace(/^./, (c) => c.toUpperCase()),
                                    config: { condition: event.target.value, conditionRules: undefined, conditionMatch: undefined },
                                })}
                            >
                                <option value="" disabled>Choose…</option>
                                {CONDITIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                            </select>
                        </label>
                        <label className={styles.field}>
                            <span>Email</span>
                            <select value={text(config.sourceEmailNodeId)} onChange={(event) => set({ sourceEmailNodeId: event.target.value })}>
                                <option value="" disabled>{emailSteps.length ? "Choose an email step…" : "Add an email step first"}</option>
                                {emailSteps.map((item) => <option key={item.id} value={item.id}>{item.title || "Send email"}</option>)}
                            </select>
                        </label>
                        <p className={styles.note}>{copy.description}</p>
                    </>
                )}

                {node.type === "action" && (
                    <>
                        <label className={styles.field}>
                            <span>Action</span>
                            <select
                                value={isTerminalAutomationAction(config.actionType) ? "stop_sequence" : "add_contact_tag"}
                                onChange={(event) => onChange({
                                    title: event.target.value === "stop_sequence" ? "End workflow" : "Add a tag",
                                    config: { actionType: event.target.value },
                                })}
                            >
                                <option value="add_contact_tag">Add a tag to the contact</option>
                                <option value="stop_sequence">End the workflow</option>
                            </select>
                        </label>
                        {!isTerminalAutomationAction(config.actionType) && (
                            <label className={styles.field}>
                                <span>Tag</span>
                                <input value={text(config.actionValue)} placeholder="engaged" onChange={(event) => set({ actionValue: event.target.value })} />
                            </label>
                        )}
                        <p className={styles.note}>{copy.description}</p>
                    </>
                )}

                {issues.length > 0 && (
                    <ul className={styles.issues}>
                        {issues.map((issue) => <li key={issue}>{issue}</li>)}
                    </ul>
                )}
            </div>

            <div className={styles.foot}>
                {node.type !== "condition" && (
                    <>
                        <button type="button" className={styles.chip} onClick={() => onAddAfter("delay")}>
                            <Clock3 size={13} aria-hidden="true" />
                            Add delay
                        </button>
                        <button type="button" className={styles.chip} onClick={() => onAddAfter("condition")}>
                            <GitBranch size={13} aria-hidden="true" />
                            Add condition
                        </button>
                    </>
                )}
                <span className={styles.spacer} />
                <button type="button" className={styles.ghost} onClick={onMoreSettings} title="All settings, including who enters this workflow">
                    <Settings2 size={13} aria-hidden="true" />
                    Settings
                </button>
                <button type="button" className={styles.danger} onClick={onDelete} aria-label="Delete step" title="Delete step">
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    );
}
