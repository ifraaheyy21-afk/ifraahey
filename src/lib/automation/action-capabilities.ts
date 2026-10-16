export type AutomationActionCapability = {
    key: string;
    aliases: readonly string[];
    terminal: boolean;
    requiresCustomer: boolean;
    requiresValue: boolean;
};
function normalizeCapabilityKey(value: unknown) {
    return typeof value === "string"
        ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
        : "";
}
const ACTION_CAPABILITIES: readonly AutomationActionCapability[] = [
    { key: "stop_sequence", aliases: ["stop_sequence", "end_workflow"], terminal: true, requiresCustomer: false, requiresValue: false },
    { key: "add_contact_tag", aliases: ["add_contact_tag", "add_tag", "tag_contact"], terminal: false, requiresCustomer: true, requiresValue: true },
];
const CAPABILITY_BY_ALIAS = new Map<string, AutomationActionCapability>();
for (const capability of ACTION_CAPABILITIES) {
    for (const alias of capability.aliases) {
        CAPABILITY_BY_ALIAS.set(normalizeCapabilityKey(alias), capability);
    }
}
export function normalizeAutomationAction(value: unknown) {
    return normalizeCapabilityKey(value);
}
export function getAutomationActionCapability(value: unknown): AutomationActionCapability | null {
    return CAPABILITY_BY_ALIAS.get(normalizeAutomationAction(value)) ?? null;
}
export function isSupportedAutomationAction(value: unknown) {
    return getAutomationActionCapability(value) !== null;
}
export function isTerminalAutomationAction(value: unknown) {
    return getAutomationActionCapability(value)?.terminal === true;
}
