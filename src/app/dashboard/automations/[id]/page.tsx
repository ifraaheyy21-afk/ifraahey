"use client";

import {
    AlertCircle,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleDot,
    Clock3,
    GitBranch,
    GripVertical,
    Mail,
    MoreHorizontal,
    Maximize2,
    Minus,
    Pencil,
    Play,
    Plug,
    Plus,
    Save,
    Search,
    Share2,
    Sparkles,
    Tag,
    Trash2,
    Users,
    X,
    Zap,
    ArrowUp,
    Paperclip,
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Link2,
    AlignLeft,
    AlignCenter,
    AlignRight,
    List,
    ListOrdered,
    History,
} from "lucide-react";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
    onAuthStateChanged,
    type User,
} from "firebase/auth";
import {
    PointerEvent as ReactPointerEvent,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import {
    NODE_LIBRARY,
    createNode,
    readWorkflows,
    saveWorkflow,
    validateWorkflow,
    validateWorkflowNode,
    getUpstreamEmailNodes,
    EMAIL_EVENT_CONDITIONS,
    type DelayUnit,
    type NodeType,
    type Workflow,
    type WorkflowNode,
    type WorkflowStatus,
} from "../../../../lib/workflows";

import { DEMO_INTEGRATIONS, DEMO_STEP_TOOL_DEFAULTS } from "../../../../lib/demo-integrations";

import { integrations as integrationCatalog } from "../../../../lib/integrationsData";

import {
    AutomationApiError,
    getAutomation,
    saveAutomation,
} from "../../../../lib/automation/client";
import AutomationRunsPanel, { type RunsPanelTab } from "./AutomationRunsPanel";

import { auth } from "../../../../lib/firebase";
import { getAutomationActionCapability } from "../../../../lib/automation/action-capabilities";

import styles from "../workflow-builder.module.css";

const NODE_WIDTH = 250;
const NODE_HEIGHT = 76;
const CANVAS_WIDTH = 1800;
const CANVAS_HEIGHT = 1800;

type DragState = {
    nodeId: string;
    pointerId: number;
    offsetX: number;
    offsetY: number;
};

type PanState = {
    pointerId: number;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
};


type AudienceMode = "all" | "conditions" | "specific";
type AudienceMatchMode = "all" | "any";
type AudienceOperator =
    | "equals"
    | "not_equals"
    | "contains"
    | "not_contains"
    | "greater_than"
    | "less_than"
    | "is_true"
    | "is_false";

type AudienceRule = {
    id: string;
    field: string;
    operator: AudienceOperator;
    value: string;
};

type TriggerAudienceConfig = {
    mode: AudienceMode;
    matchMode: AudienceMatchMode;
    rules: AudienceRule[];
    accountIds: string[];
    allowReentry: boolean;
};

type TriggerNodeConfig = WorkflowNode["config"] & {
    audience?: TriggerAudienceConfig;
};

type AccountRecord = Record<string, unknown>;

type FieldOption = {
    key: string;
    label: string;
    sample: unknown;
};

type IntegrationRecord = {
    id: string;
    name: string;
    description: string;
    connected: boolean;
    iconUrl?: string;
};


type AiChatMessage = {
    id: string;
    role: "assistant" | "user";
    text: string;
    toolNames?: string[];
    isError?: boolean;
    createdAt?: string;
};

function createInitialAiMessages(): AiChatMessage[] {
    return [];
}



const STARTER_GREETINGS = [
    "Hello, what would you like to automate?",
    "Hi there, what can I help you build?",
    "Welcome back, what are we creating today?",
    "What would you like to automate today?",
    "Ready to build something?",
    "What can I help you automate?",
] as const;

const STARTER_GREETING_STORAGE_KEY = "workflow-ai-starter-greeting";

type StoredStarterGreeting = {
    index: number;
    pageLoadId: string;
};

type StarterAiProvider = "openclaw";

function StarterAiProviderLogo({
    provider,
    size = 18,
}: {
    provider: StarterAiProvider;
    size?: number;
}) {
    const logoSourcesByProvider: Record<StarterAiProvider, string[]> = {
        openclaw: [
            "https://raw.githubusercontent.com/openclaw/openclaw/main/ui/public/favicon.svg",
        ],
    };

    const fallbackLabel: Record<StarterAiProvider, string> = {
        openclaw: "O",
    };

    const [sourceIndex, setSourceIndex] = useState(0);
    const sources = logoSourcesByProvider[provider];
    const src = sources[sourceIndex];

    useEffect(() => {
        setSourceIndex(0);
    }, [provider]);

    if (!src) {
        return (
            <span
                aria-hidden="true"
                style={{
                    width: size,
                    height: size,
                    minWidth: size,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: Math.max(5, Math.round(size * 0.28)),
                    background: "#f4f5f7",
                    color: "#666d77",
                    fontSize: Math.max(7, Math.round(size * 0.44)),
                    fontWeight: 700,
                    lineHeight: 1,
                    flex: "0 0 auto",
                    marginRight: 8,

                }}
            >
                {fallbackLabel[provider]}
            </span>
        );
    }

    return (
        <img
            src={src}
            alt=""
            aria-hidden="true"
            width={size}
            height={size}
            draggable={false}
            onError={() => {
                setSourceIndex((current) => current + 1);
            }}
            style={{
                display: "block",
                width: size,
                height: size,
                minWidth: size,
                objectFit: "contain",
                flex: "0 0 auto",
            }}
        />
    );
}


type StarterConnectedIntegration = {
    provider: string;
    status: string;
};

type StarterIntegrationPickerItem = {
    provider: string;
    name: string;
    domain: string;
    description: string;
    status: string;
    connected: boolean;
    iconUrl?: string;
};

function normaliseStarterIntegrationProvider(name: string) {
    return name.toLowerCase().trim().replace(/\s+/g, "_");
}

function StarterIntegrationLogo({
    integration,
    size = 18,
}: {
    integration: StarterIntegrationPickerItem;
    size?: number;
}) {
    const sources = [
        integration.iconUrl,
        `https://www.google.com/s2/favicons?domain=${encodeURIComponent(integration.domain)}&sz=128`,
        `https://${integration.domain}/favicon.ico`,
    ].filter((value): value is string => Boolean(value));

    const [sourceIndex, setSourceIndex] = useState(0);
    const src = sources[sourceIndex];

    if (!src) {
        return (
            <span
                aria-hidden="true"
                style={{
                    width: size,
                    height: size,
                    minWidth: size,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: Math.max(5, Math.round(size * 0.28)),
                    background: "#f4f5f7",
                    color: "#7d838d",
                    fontSize: Math.max(8, Math.round(size * 0.5)),
                    fontWeight: 700,
                    lineHeight: 1,
                    flex: "0 0 auto",
                }}
            >
                {integration.name.trim().slice(0, 1).toUpperCase() || "I"}
            </span>
        );
    }

    return (
        <img
            src={src}
            alt={`${integration.name} logo`}
            width={size}
            height={size}
            draggable={false}
            onError={() => {
                if (sourceIndex < sources.length - 1) {
                    setSourceIndex((current) => current + 1);
                } else {
                    setSourceIndex(sources.length);
                }
            }}
            style={{
                display: "block",
                width: size,
                height: size,
                minWidth: size,
                objectFit: "contain",
                flex: "0 0 auto",
            }}
        />
    );
}

function WorkflowAiOrb({ size = 28, hero = false }: { size?: number; hero?: boolean }) {
    return (
        <span
            aria-hidden="true"
            className={`${styles.miloOrb} ${hero ? styles.miloOrbHero : styles.miloOrbSmall}`}
            style={{
                width: size,
                height: size,
                minWidth: size,
            }}
        >
            <span className={styles.miloOrbCloudBlue} />
            <span className={styles.miloOrbCloudPink} />
            <span className={styles.miloOrbCloudPearl} />
            <span className={styles.miloOrbShine} />
            <span className={styles.miloOrbRim} />
        </span>
    );
}


type StarterAttachment = {
    id: string;
    name: string;
    size: number;
    content: string;
};

const STARTER_ATTACHMENT_MAX_FILES = 5;
const STARTER_ATTACHMENT_MAX_BYTES = 1024 * 1024;
const STARTER_ATTACHMENT_MAX_CHARS = 12000;
const STARTER_ATTACHMENT_EXTENSIONS = new Set([
    "txt",
    "md",
    "csv",
    "json",
    "html",
    "css",
    "js",
    "jsx",
    "ts",
    "tsx",
    "xml",
    "yaml",
    "yml",
]);

function formatStarterAttachmentSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}


function SlackLogo() {
    return (
        <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            style={{
                display: "block",
                width: "100%",
                height: "100%",
            }}
        >
            {/* Blue */}
            <rect
                x="9"
                y="2"
                width="3"
                height="8"
                rx="1.5"
                fill="#36C5F0"
            />
            <circle
                cx="7.5"
                cy="8.5"
                r="1.5"
                fill="#36C5F0"
            />

            {/* Green */}
            <rect
                x="14"
                y="9"
                width="8"
                height="3"
                rx="1.5"
                fill="#2EB67D"
            />
            <circle
                cx="15.5"
                cy="7.5"
                r="1.5"
                fill="#2EB67D"
            />

            {/* Yellow */}
            <rect
                x="12"
                y="14"
                width="3"
                height="8"
                rx="1.5"
                fill="#ECB22E"
            />
            <circle
                cx="16.5"
                cy="15.5"
                r="1.5"
                fill="#ECB22E"
            />

            {/* Red */}
            <rect
                x="2"
                y="12"
                width="8"
                height="3"
                rx="1.5"
                fill="#E01E5A"
            />
            <circle
                cx="8.5"
                cy="16.5"
                r="1.5"
                fill="#E01E5A"
            />
        </svg>
    );
}

function getAiMessageTimestamp(message: AiChatMessage) {
    if (message.createdAt) {
        const explicit = new Date(message.createdAt);
        if (!Number.isNaN(explicit.getTime())) {
            return explicit;
        }
    }

    const legacyTimestamp = message.id.match(/(\d{13})$/)?.[1];
    if (!legacyTimestamp) return null;

    const parsed = new Date(Number(legacyTimestamp));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatAiMessageTime(message: AiChatMessage) {
    const timestamp = getAiMessageTimestamp(message);
    if (!timestamp) return "";

    return timestamp.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
}

type UnfinishedWorkflowSummary = {
    id: string;
    name: string;
    stepCount: number;
    updatedAt: string;
};

function unfinishedWorkflowStorageKey(workspaceId: string) {
    return `unfinished-workflow:${workspaceId}`;
}


function waitForFirebaseUser() {
    const existingUser = auth.currentUser;

    if (existingUser) {
        return Promise.resolve(existingUser);
    }

    return new Promise<User>((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(
            auth,
            (user) => {
                unsubscribe();

                if (user) {
                    resolve(user);
                    return;
                }

                reject(new Error("You must be signed in."));
            },
            (error) => {
                unsubscribe();
                reject(error);
            },
        );
    });
}

type ToolAwareNodeConfig = WorkflowNode["config"] & {
    integrationId?: string;
};

function normalizeIntegration(value: unknown, index: number): IntegrationRecord | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const record = value as Record<string, unknown>;

    const rawName =
        typeof record.name === "string"
            ? record.name
            : typeof record.title === "string"
                ? record.title
                : typeof record.provider === "string"
                    ? record.provider
                    : typeof record.label === "string"
                        ? record.label
                        : "";

    const name = rawName.trim();

    if (!name) {
        return null;
    }

    const rawId = record.id ?? record.key ?? record.slug ?? record.provider ?? name;
    const id = String(rawId || `integration-${index}`);

    const description =
        typeof record.description === "string"
            ? record.description.trim()
            : typeof record.subtitle === "string"
                ? record.subtitle.trim()
                : "";

    const status =
        typeof record.status === "string" ? record.status.toLowerCase() : "";

    const connected =
        record.connected === true ||
        record.isConnected === true ||
        record.enabled === true ||
        status === "connected" ||
        status === "active";

    const rawIconUrl =
        typeof record.iconUrl === "string"
            ? record.iconUrl
            : typeof record.logoUrl === "string"
                ? record.logoUrl
                : typeof record.logo === "string"
                    ? record.logo
                    : typeof record.icon === "string"
                        ? record.icon
                        : typeof record.image === "string"
                            ? record.image
                            : typeof record.avatarUrl === "string"
                                ? record.avatarUrl
                                : "";

    const iconUrl = rawIconUrl.trim() || undefined;

    return { id, name, description, connected, iconUrl };
}

const EMPTY_AUDIENCE: TriggerAudienceConfig = {
    mode: "all",
    matchMode: "all",
    rules: [],
    accountIds: [],
    allowReentry: false,
};

function titleCase(value: string) {
    return value
        .replace(/\./g, " / ")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function flattenRecord(
    value: unknown,
    prefix = "",
    depth = 0,
    output: Record<string, unknown> = {},
) {
    if (
        value === null ||
        value === undefined ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        depth > 2
    ) {
        if (prefix) {
            output[prefix] = value;
        }
        return output;
    }

    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
        const path = prefix ? `${prefix}.${key}` : key;

        if (
            child === null ||
            child === undefined ||
            typeof child !== "object" ||
            Array.isArray(child)
        ) {
            output[path] = child;
            return;
        }

        flattenRecord(child, path, depth + 1, output);
    });

    return output;
}

function accountIdentity(account: AccountRecord, index: number) {
    const candidates = [
        account.id,
        account.customerId,
        account.accountId,
        account.email,
    ];

    const found = candidates.find(
        (value) =>
            typeof value === "string" ||
            typeof value === "number",
    );

    return found !== undefined ? String(found) : `account-${index}`;
}

function accountDisplayName(account: AccountRecord, index: number) {
    const candidates = [
        account.name,
        account.contactName,
        account.company,
        account.companyName,
        account.email,
    ];

    const found = candidates.find(
        (value) => typeof value === "string" && value.trim().length > 0,
    );

    return found ? String(found) : accountIdentity(account, index);
}

function getAudienceConfig(node: WorkflowNode | null): TriggerAudienceConfig {
    if (!node || node.type !== "trigger") {
        return EMPTY_AUDIENCE;
    }

    const config = node.config as TriggerNodeConfig;

    return {
        ...EMPTY_AUDIENCE,
        ...config.audience,
        rules: Array.isArray(config.audience?.rules)
            ? config.audience.rules
            : [],
        accountIds: Array.isArray(config.audience?.accountIds)
            ? config.audience.accountIds
            : [],
    };
}

function operatorOptions(sample: unknown): Array<{
    value: AudienceOperator;
    label: string;
}> {
    if (typeof sample === "number") {
        return [
            { value: "equals", label: "Equals" },
            { value: "not_equals", label: "Does not equal" },
            { value: "greater_than", label: "Greater than" },
            { value: "less_than", label: "Less than" },
        ];
    }

    if (typeof sample === "boolean") {
        return [
            { value: "is_true", label: "Is true" },
            { value: "is_false", label: "Is false" },
        ];
    }

    return [
        { value: "equals", label: "Equals" },
        { value: "not_equals", label: "Does not equal" },
        { value: "contains", label: "Contains" },
        { value: "not_contains", label: "Does not contain" },
    ];
}

function matchesRule(account: AccountRecord, rule: AudienceRule) {
    if (!rule.field) {
        return false;
    }

    const flat = flattenRecord(account);
    const actual = flat[rule.field];

    if (rule.operator === "is_true") {
        return actual === true;
    }

    if (rule.operator === "is_false") {
        return actual === false;
    }

    if (actual === null || actual === undefined) {
        return false;
    }

    if (
        rule.operator === "greater_than" ||
        rule.operator === "less_than"
    ) {
        const actualNumber = Number(actual);
        const expectedNumber = Number(rule.value);

        if (
            Number.isNaN(actualNumber) ||
            Number.isNaN(expectedNumber)
        ) {
            return false;
        }

        return rule.operator === "greater_than"
            ? actualNumber > expectedNumber
            : actualNumber < expectedNumber;
    }

    const actualText = String(actual).toLowerCase();
    const expectedText = rule.value.toLowerCase();

    if (rule.operator === "equals") {
        return actualText === expectedText;
    }

    if (rule.operator === "not_equals") {
        return actualText !== expectedText;
    }

    if (rule.operator === "contains") {
        return actualText.includes(expectedText);
    }

    return !actualText.includes(expectedText);
}

const iconByType: Record<NodeType, typeof Mail> = {
    trigger: Zap,
    email: Mail,
    delay: Clock3,
    condition: GitBranch,
    action: Tag,
};

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

type ConditionBranch = "YES" | "NO";

function getConditionBranch(
    connection: string | { id: string; label?: string },
): ConditionBranch | null {
    const connectionId =
        typeof connection === "string" ? connection : connection.id;
    const label =
        typeof connection === "string"
            ? ""
            : connection.label?.trim().toUpperCase() ?? "";

    if (label === "YES" || label === "NO") {
        return label;
    }

    if (connectionId.includes("edge-yes-")) return "YES";
    if (connectionId.includes("edge-no-")) return "NO";
    return null;
}

function makeConnectionId(branch?: ConditionBranch | null) {
    const prefix = branch ? `edge-${branch.toLowerCase()}-` : "edge-";
    return `${prefix}${crypto.randomUUID()}`;
}

function normalizeConditionBranches(input: Workflow): Workflow {
    let changed = false;
    const nextConnections = [...input.connections];

    input.nodes
        .filter((node) => node.type === "condition")
        .forEach((conditionNode) => {
            const outgoingIndexes = nextConnections
                .map((connection, index) =>
                    connection.from === conditionNode.id ? index : -1,
                )
                .filter((index) => index >= 0);

            if (outgoingIndexes.length === 0) return;

            const used = new Set<ConditionBranch>();
            outgoingIndexes.forEach((index) => {
                const branch = getConditionBranch(nextConnections[index].id);
                if (branch) used.add(branch);
            });

            const available = (["YES", "NO"] as ConditionBranch[]).filter(
                (branch) => !used.has(branch),
            );

            outgoingIndexes.forEach((index) => {
                const connection = nextConnections[index];
                if (getConditionBranch(connection.id)) return;

                const branch = available.shift();
                if (!branch) return;

                nextConnections[index] = {
                    ...connection,
                    id: makeConnectionId(branch),
                };
                changed = true;
            });
        });

    return changed ? { ...input, connections: nextConnections } : input;
}

type EmailEditorFormatState = {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikeThrough: boolean;
    justifyLeft: boolean;
    justifyCenter: boolean;
    justifyRight: boolean;
    insertUnorderedList: boolean;
    insertOrderedList: boolean;
    createLink: boolean;
};

const EMPTY_EMAIL_EDITOR_FORMAT_STATE: EmailEditorFormatState = {
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    justifyLeft: true,
    justifyCenter: false,
    justifyRight: false,
    insertUnorderedList: false,
    insertOrderedList: false,
    createLink: false,
};

export default function WorkflowBuilderPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const workflowId = params.id;

    const [workflow, setWorkflow] = useState<Workflow | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState("");
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [isSavingInspector, setIsSavingInspector] = useState(false);
    const inspectorSavingRef = useRef(false);
    const [isEditingWorkflowName, setIsEditingWorkflowName] = useState(false);
    const [librarySearch, setLibrarySearch] = useState("");
    const [librarySections, setLibrarySections] = useState({
        triggers: true,
        flow: true,
        actions: true,
        integrations: true,
    });
    const [zoom, setZoom] = useState(1);
    const [addFromNodeId, setAddFromNodeId] = useState<string | null>(null);
    const [notice, setNotice] = useState("");
    const [statusSaving, setStatusSaving] = useState(false);
    const [runsPanel, setRunsPanel] = useState<RunsPanelTab | null>(null);
    const [emailEditorFormats, setEmailEditorFormats] = useState<EmailEditorFormatState>(
        EMPTY_EMAIL_EDITOR_FORMAT_STATE,
    );
    const [isDragging, setIsDragging] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const [audienceAccounts, setAudienceAccounts] = useState<AccountRecord[]>([]);
    const [audienceLoading, setAudienceLoading] = useState(false);
    const [audienceError, setAudienceError] = useState("");
    const [audienceSearch, setAudienceSearch] = useState("");
    const [aiPrompt, setAiPrompt] = useState("");
    const [isAiBuilding, setIsAiBuilding] = useState(false);
    const [aiMessages, setAiMessages] = useState<AiChatMessage[]>(
        createInitialAiMessages,
    );
    const [chatHydrated, setChatHydrated] = useState(false);
    const [showCanvasStart, setShowCanvasStart] = useState(false);
    const [availableIntegrations, setAvailableIntegrations] = useState<IntegrationRecord[]>([]);
    const [integrationsLoading, setIntegrationsLoading] = useState(true);
    const [aiPanelCollapsed, setAiPanelCollapsed] = useState(true);
    const [unfinishedWorkflow, setUnfinishedWorkflow] =
        useState<UnfinishedWorkflowSummary | null>(null);
    const [starterGreeting, setStarterGreeting] = useState<string>(STARTER_GREETINGS[0]);
    const [starterIntegrationsMenuOpen, setStarterIntegrationsMenuOpen] = useState(false);
    const [starterIntegrationStatuses, setStarterIntegrationStatuses] = useState<StarterConnectedIntegration[]>([]);
    const [starterIntegrationLoadingProvider, setStarterIntegrationLoadingProvider] = useState<string | null>(null);
    const [starterAttachments, setStarterAttachments] = useState<StarterAttachment[]>([]);
    const [workflowHistoryMenuOpen, setWorkflowHistoryMenuOpen] = useState(false);
    const [workflowHistory, setWorkflowHistory] = useState<Workflow[]>([]);

    const workflowNameRef = useRef<HTMLInputElement | null>(null);
    const pageRef = useRef<HTMLElement | null>(null);
    const canvasShellRef = useRef<HTMLDivElement | null>(null);
    const canvasCenterNodesRef = useRef<WorkflowNode[]>([]);
    const aiPanelRef = useRef<HTMLElement | null>(null);
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<DragState | null>(null);
    const panRef = useRef<PanState | null>(null);
    const noticeTimer = useRef<number | null>(null);
    const autosaveTimer = useRef<number | null>(null);
    const chatEndRef = useRef<HTMLDivElement | null>(null);
    const emailEditorRef = useRef<HTMLDivElement | null>(null);
    const emailEditorSelectionRef = useRef<Range | null>(null);
    const chatHydratedRef = useRef(false);
    const workflowVersionRef = useRef<number | undefined>(undefined);
    const saveChainRef = useRef<Promise<void>>(Promise.resolve());
    const starterIntegrationsMenuRef = useRef<HTMLSpanElement | null>(null);
    const starterFileInputRef = useRef<HTMLInputElement | null>(null);
    const workflowHistoryMenuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        canvasCenterNodesRef.current = workflow?.nodes ?? [];
    }, [workflow]);

    useEffect(() => {
        const shell = canvasShellRef.current;
        if (!shell || showCanvasStart) return;

        let frame = 0;
        const recenter = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => {
                const nodes = canvasCenterNodesRef.current;
                if (!nodes.length || !shell.clientWidth || !shell.clientHeight) return;

                const minX = Math.min(...nodes.map((node) => node.position.x));
                const maxX = Math.max(...nodes.map((node) => node.position.x + NODE_WIDTH));
                const minY = Math.min(...nodes.map((node) => node.position.y));
                const maxY = Math.max(...nodes.map((node) => node.position.y + NODE_HEIGHT));
                const shellRect = shell.getBoundingClientRect();
                const panelRect = !aiPanelCollapsed
                    ? aiPanelRef.current?.getBoundingClientRect()
                    : undefined;
                let visibleRight = shell.clientWidth;

                if (panelRect && panelRect.width > 0 &&
                    panelRect.bottom > shellRect.top && panelRect.top < shellRect.bottom &&
                    panelRect.left < shellRect.right && panelRect.right > shellRect.left) {
                    visibleRight = Math.max(0, Math.min(shell.clientWidth,
                        panelRect.left - shellRect.left - 24));
                }

                // On narrow screens the chat can cover the canvas; retain its centre.
                const visibleWidth = visibleRight >= NODE_WIDTH * zoom + 48
                    ? visibleRight
                    : shell.clientWidth;

                shell.scrollTo({
                    left: Math.max(0, ((minX + maxX) / 2) * zoom - visibleWidth / 2),
                    top: Math.max(0, ((minY + maxY) / 2) * zoom - shell.clientHeight / 2),
                    behavior: "auto",
                });
            });
        };

        const observer = new ResizeObserver(recenter);
        observer.observe(shell);
        if (aiPanelRef.current) observer.observe(aiPanelRef.current);
        recenter();

        return () => {
            observer.disconnect();
            window.cancelAnimationFrame(frame);
        };
    }, [workflow?.id, workflow?.nodes.length, showCanvasStart, zoom, aiPanelCollapsed]);

    useEffect(() => {
        const pageLoadId = String(window.performance.timeOrigin);
        let previousIndex = -1;

        try {
            const storedValue = window.sessionStorage.getItem(STARTER_GREETING_STORAGE_KEY);
            if (storedValue) {
                const stored = JSON.parse(storedValue) as Partial<StoredStarterGreeting>;

                if (
                    typeof stored.index === "number" &&
                    stored.index >= 0 &&
                    stored.index < STARTER_GREETINGS.length
                ) {
                    if (stored.pageLoadId === pageLoadId) {
                        setStarterGreeting(STARTER_GREETINGS[stored.index]);
                        return;
                    }

                    previousIndex = stored.index;
                }
            }
        } catch {
            window.sessionStorage.removeItem(STARTER_GREETING_STORAGE_KEY);
        }

        const availableIndexes = STARTER_GREETINGS.map((_, index) => index).filter(
            (index) => index !== previousIndex,
        );
        const nextIndex =
            availableIndexes[Math.floor(Math.random() * availableIndexes.length)] ?? 0;

        setStarterGreeting(STARTER_GREETINGS[nextIndex]);

        try {
            window.sessionStorage.setItem(
                STARTER_GREETING_STORAGE_KEY,
                JSON.stringify({ index: nextIndex, pageLoadId } satisfies StoredStarterGreeting),
            );
        } catch {
            // The greeting can still rotate even when session storage is unavailable.
        }
    }, []);

    useEffect(() => {
        function handleStarterIntegrationsOutsideClick(event: MouseEvent) {
            const menu = starterIntegrationsMenuRef.current;
            if (!menu || menu.contains(event.target as Node)) return;
            setStarterIntegrationsMenuOpen(false);
        }

        document.addEventListener("mousedown", handleStarterIntegrationsOutsideClick);
        return () => {
            document.removeEventListener("mousedown", handleStarterIntegrationsOutsideClick);
        };
    }, []);

    useEffect(() => {
        function handleWorkflowHistoryOutsideClick(event: MouseEvent) {
            const menu = workflowHistoryMenuRef.current;
            if (!menu || menu.contains(event.target as Node)) return;
            setWorkflowHistoryMenuOpen(false);
        }

        document.addEventListener("mousedown", handleWorkflowHistoryOutsideClick);
        return () => {
            document.removeEventListener("mousedown", handleWorkflowHistoryOutsideClick);
        };
    }, []);

    useEffect(() => {
        void loadStarterIntegrationStatus();
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function loadWorkflow() {
            const workspaceId =
                window.localStorage.getItem("workspaceId") || "demo-workspace";

            let found: Workflow | null = null;

            try {
                const remote = await getAutomation<Workflow>(
                    workspaceId,
                    workflowId,
                );

                found = remote;
                workflowVersionRef.current = remote.version;
            } catch (error) {
                if (
                    !(error instanceof AutomationApiError) ||
                    error.status !== 404
                ) {
                    console.error(
                        "Unable to load automation:",
                        error,
                    );

                    if (!cancelled) {
                        showNotice(
                            error instanceof Error
                                ? error.message
                                : "Unable to load automation.",
                        );
                    }

                    return;
                }

                /*
                 * One-time migration path for workflows that were
                 * created before database persistence was enabled.
                 */
                const local =
                    readWorkflows().find(
                        (item) =>
                            item.id === workflowId,
                    ) ?? null;

                if (local) {
                    try {
                        /*
                         * Legacy browser workflows may pre-date the
                         * production validation rules used by the
                         * database-backed automation engine.
                         *
                         * Migrate them as drafts so their graph and
                         * configuration are preserved without activating
                         * potentially incomplete legacy conditions.
                         */
                        const migrationCandidate: Workflow = {
                            ...local,
                            status: "draft",
                        };

                        const migrated =
                            await saveAutomation<Workflow>(
                                workspaceId,
                                migrationCandidate,
                            );

                        found = migrated;

                        workflowVersionRef.current =
                            migrated.version;
                    } catch (migrationError) {
                        console.error(
                            "Unable to migrate local automation:",
                            migrationError,
                        );

                        if (!cancelled) {
                            showNotice(
                                migrationError instanceof Error
                                    ? migrationError.message
                                    : "Unable to migrate automation.",
                            );
                        }

                        return;
                    }
                }
            }

            if (cancelled) return;

            if (!found) {
                router.replace("/dashboard/automations");
                return;
            }

            const isUntouchedStarter =
                found.status === "draft" &&
                found.nodes.length === 1 &&
                found.nodes[0]?.type === "trigger" &&
                found.connections.length === 0;

            const initialWorkflow = normalizeConditionBranches(
                isUntouchedStarter
                    ? { ...found, nodes: [], connections: [] }
                    : found,
            );

            setWorkflow(initialWorkflow);

            if (initialWorkflow !== found && !isUntouchedStarter) {
                scheduleAutosave(initialWorkflow);
            }
            setSelectedNodeId(initialWorkflow.nodes[0]?.id ?? "");
            setShowCanvasStart(initialWorkflow.nodes.length === 0);
            setLibraryOpen(false);

            window.requestAnimationFrame(() => {
                const shell = canvasShellRef.current;
                if (!shell) return;

                if (initialWorkflow.nodes.length === 0) {
                    window.requestAnimationFrame(() => {
                        centerEmptyCanvas("auto");
                    });
                    return;
                }

                window.requestAnimationFrame(() => {
                    centerWorkflow(initialWorkflow.nodes);
                });
            });
        }

        void loadWorkflow();

        return () => {
            cancelled = true;
        };
    }, [router, workflowId]);

    useEffect(() => {
        if (!workflow) return;

        const workspaceId =
            window.localStorage.getItem("workspaceId") || "demo-workspace";
        const storageKey = unfinishedWorkflowStorageKey(workspaceId);

        if (workflow.status === "draft" && workflow.nodes.length > 0) {
            const summary: UnfinishedWorkflowSummary = {
                id: workflow.id,
                name: workflow.name,
                stepCount: workflow.nodes.length,
                updatedAt: workflow.updatedAt,
            };

            window.localStorage.setItem(storageKey, JSON.stringify(summary));
            setUnfinishedWorkflow(null);
            return;
        }

        if (workflow.nodes.length === 0) {
            try {
                const stored = window.localStorage.getItem(storageKey);
                if (!stored) {
                    setUnfinishedWorkflow(null);
                    return;
                }

                const parsed = JSON.parse(stored) as Partial<UnfinishedWorkflowSummary>;
                if (
                    typeof parsed.id === "string" &&
                    parsed.id !== workflow.id &&
                    typeof parsed.name === "string" &&
                    typeof parsed.stepCount === "number" &&
                    typeof parsed.updatedAt === "string"
                ) {
                    setUnfinishedWorkflow(parsed as UnfinishedWorkflowSummary);
                } else {
                    setUnfinishedWorkflow(null);
                }
            } catch {
                window.localStorage.removeItem(storageKey);
                setUnfinishedWorkflow(null);
            }
            return;
        }

        if (workflow.status === "active") {
            try {
                const stored = window.localStorage.getItem(storageKey);
                if (!stored) return;
                const parsed = JSON.parse(stored) as Partial<UnfinishedWorkflowSummary>;
                if (parsed.id === workflow.id) {
                    window.localStorage.removeItem(storageKey);
                }
            } catch {
                window.localStorage.removeItem(storageKey);
            }
        }
    }, [workflow]);

    useEffect(() => {
        const page = pageRef.current;
        if (!page) return;

        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;

        const scrollParents: Array<{
            element: HTMLElement;
            overflow: string;
        }> = [];

        let parent = page.parentElement;

        while (parent) {
            const styles = window.getComputedStyle(parent);
            const canScroll =
                /(auto|scroll|overlay)/.test(styles.overflowY) ||
                parent.scrollHeight > parent.clientHeight;

            if (canScroll) {
                scrollParents.push({
                    element: parent,
                    overflow: parent.style.overflow,
                });
                parent.style.overflow = "hidden";
            }

            parent = parent.parentElement;
        }

        const fitToViewport = () => {
            const rect = page.getBoundingClientRect();
            const top = Math.max(0, rect.top);
            const left = Math.max(0, rect.left);
            const width = Math.max(0, Math.min(rect.width, window.innerWidth - left));
            const height = Math.max(0, window.innerHeight - top);

            page.style.setProperty("--workflow-page-top", `${top}px`);
            page.style.setProperty("--workflow-page-left", `${left}px`);
            page.style.setProperty("--workflow-page-width", `${width}px`);
            page.style.setProperty("--workflow-page-height", `${height}px`);
        };

        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";

        fitToViewport();
        window.addEventListener("resize", fitToViewport);

        return () => {
            window.removeEventListener("resize", fitToViewport);
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;

            scrollParents.forEach(({ element, overflow }) => {
                element.style.overflow = overflow;
            });
        };
    }, []);

    useEffect(() => {
        return () => {
            if (noticeTimer.current) {
                window.clearTimeout(noticeTimer.current);
            }

            if (autosaveTimer.current) {
                window.clearTimeout(autosaveTimer.current);
            }
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function loadIntegrations() {
            setIntegrationsLoading(true);

            try {
                const workspaceId =
                    window.localStorage.getItem("workspaceId") || "demo-workspace";

                const response = await fetch(
                    "/api/integrations/status",
                    {
                        method: "GET",
                        credentials: "include",
                        cache: "no-store",
                    },
                );

                if (!response.ok) {
                    throw new Error("Unable to load integrations.");
                }

                const payload: unknown = await response.json();

                let rows: unknown[] = [];

                if (Array.isArray(payload)) {
                    rows = payload;
                } else if (payload && typeof payload === "object") {
                    const record = payload as Record<string, unknown>;
                    const candidate = record.integrations ?? record.providers ?? record.items;

                    if (Array.isArray(candidate)) {
                        rows = candidate;
                    }
                }

                const normalized = rows
                    .map((item, index) => normalizeIntegration(item, index))
                    .filter((item): item is IntegrationRecord => item !== null);

                const integrationsForWorkspace =
                    workspaceId === "demo-workspace"
                        ? Array.from(
                            new Map(
                                [
                                    ...normalized,
                                    ...DEMO_INTEGRATIONS,
                                ].map((integration) => [
                                    integration.id,
                                    integration,
                                ]),
                            ).values(),
                        )
                        : normalized;

                if (!cancelled) {
                    setAvailableIntegrations(integrationsForWorkspace);
                }
            } catch {
                if (!cancelled) {
                    const workspaceId =
                        window.localStorage.getItem("workspaceId") || "demo-workspace";

                    setAvailableIntegrations(
                        workspaceId === "demo-workspace"
                            ? DEMO_INTEGRATIONS
                            : [],
                    );
                }
            } finally {
                if (!cancelled) {
                    setIntegrationsLoading(false);
                }
            }
        }

        void loadIntegrations();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!workflow || workflow.nodes.length === 0) {
            return;
        }

        const selectedStillExists = workflow.nodes.some(
            (node) => node.id === selectedNodeId,
        );

        if (!selectedStillExists) {
            setSelectedNodeId(workflow.nodes[0]?.id ?? "");
        }
    }, [selectedNodeId, workflow]);

    const selectedNode = useMemo(
        () =>
            workflow?.nodes.find((node) => node.id === selectedNodeId) ?? null,
        [selectedNodeId, workflow],
    );

    useEffect(() => {
        if (!selectedNode || selectedNode.type !== "email") return;

        const editor = emailEditorRef.current;
        if (!editor) return;

        const body = selectedNode.config.body ?? "";
        if (editor.innerHTML !== body) {
            editor.innerHTML = body;
        }

        emailEditorSelectionRef.current = null;
        setEmailEditorFormats(EMPTY_EMAIL_EDITOR_FORMAT_STATE);

        window.requestAnimationFrame(() => {
            updateEmailEditorFormatState();
        });
    }, [selectedNodeId]);


    const filteredNodeLibrary = useMemo(() => {
        const query = librarySearch.trim().toLowerCase();

        const supported = NODE_LIBRARY.filter((item) => item.type !== "action" || getAutomationActionCapability(item.defaults?.config?.actionType ?? item.title));
        if (!query) return supported;

        return supported.filter((item) =>
            `${item.title} ${item.description} ${item.type}`
                .toLowerCase()
                .includes(query),
        );
    }, [librarySearch]);

    const filteredAvailableIntegrations = useMemo(() => {
        const query = librarySearch.trim().toLowerCase();

        if (!query) {
            return availableIntegrations;
        }

        return availableIntegrations.filter((integration) =>
            `${integration.name} ${integration.description}`
                .toLowerCase()
                .includes(query),
        );
    }, [availableIntegrations, librarySearch]);

    const starterConnectedProviders = useMemo(() => {
        return new Set(
            starterIntegrationStatuses
                .filter((item) => item.status === "connected")
                .map((item) => normaliseStarterIntegrationProvider(item.provider)),
        );
    }, [starterIntegrationStatuses]);

    const starterVisibleIntegrations = useMemo<StarterIntegrationPickerItem[]>(() => {
        const backendByProvider = new Map(
            availableIntegrations.map((integration) => [
                normaliseStarterIntegrationProvider(integration.name || integration.id),
                integration,
            ]),
        );

        const seenProviders = new Set<string>();
        const uniqueCatalog = integrationCatalog.filter((item) => {
            const provider = normaliseStarterIntegrationProvider(item.name);

            if (seenProviders.has(provider)) {
                return false;
            }

            seenProviders.add(provider);
            return true;
        });

        return uniqueCatalog.map((item) => {
            const provider = normaliseStarterIntegrationProvider(item.name);
            const backendIntegration =
                backendByProvider.get(provider) ??
                availableIntegrations.find(
                    (integration) =>
                        normaliseStarterIntegrationProvider(integration.id) === provider,
                );

            return {
                provider,
                name: item.name,
                domain: item.domain,
                description: item.description,
                status: item.status,
                connected: starterConnectedProviders.has(provider),
                iconUrl: backendIntegration?.iconUrl,
            };
        });
    }, [availableIntegrations, starterConnectedProviders]);

    const starterConnectedIntegrationCount = useMemo(
        () => starterVisibleIntegrations.filter((integration) => integration.connected).length,
        [starterVisibleIntegrations],
    );


    const starterVisibleIntegrationsSorted = useMemo(() => {
        return [...starterVisibleIntegrations].sort((a, b) => {
            if (a.connected !== b.connected) {
                return a.connected ? -1 : 1;
            }

            const aAvailable = a.status === "Available";
            const bAvailable = b.status === "Available";

            if (aAvailable !== bAvailable) {
                return aAvailable ? -1 : 1;
            }

            return a.name.localeCompare(b.name);
        });
    }, [starterVisibleIntegrations]);


    const starterSuggestions = useMemo(() => {
        const demoTemplates = [
            {
                id: "gmail-slack-email-received",
                title: "Gmail to Slack",
                description: "Get notified on Slack for new emails",
                prompt: "When an email is received in Gmail, send a message in Slack.",
                tools: ["gmail", "slack"],
            },
            {
                id: "sheets-gmail-slack-row-updated",
                title: "Sheets update",
                description: "Email and Slack when a row changes",
                prompt: "When a row is updated in Google Sheets, send an email in Gmail, then send a message in Slack.",
                tools: ["googlesheets", "gmail", "slack"],
            },
            {
                id: "forms-gmail-new-submission",
                title: "New form submission",
                description: "Send an email for every new response",
                prompt: "Send an email in Gmail for every new Google Forms submission.",
                tools: ["googleforms", "gmail"],
            },
        ];

        const normalized = (value: string) =>
            value.toLowerCase().replace(/[^a-z0-9]+/g, "");

        const providerAliases: Record<string, string[]> = {
            gmail: ["gmail", "googlemail"],
            slack: ["slack"],
            googlesheets: ["googlesheets", "sheets"],
            googleforms: ["googleforms", "forms"],
            youtube: ["youtube"],
            discord: ["discord"],
            googledrive: ["googledrive", "drive"],
        };

        const findIntegration = (provider: string) => {
            const aliases = providerAliases[provider] ?? [provider];
            return (
                availableIntegrations.find((integration) => {
                    const candidates = [integration.id, integration.name].map(normalized);
                    return aliases.some((alias) => candidates.includes(normalized(alias)));
                }) ?? null
            );
        };

        return demoTemplates.map((template) => ({
            ...template,
            integrations: template.tools.map(findIntegration),
        }));
    }, [availableIntegrations]);

    function providerLogoUrl(provider: string, integration?: IntegrationRecord | null) {
        if (integration?.iconUrl) return integration.iconUrl;

        const providerLogos: Record<string, string> = {
            gmail: "https://cdn.simpleicons.org/gmail/EA4335",
            slack: "https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/slack.svg",
            googlesheets: "https://cdn.simpleicons.org/googlesheets/34A853",
            googleforms: "https://cdn.simpleicons.org/googleforms/7248B9",
            youtube: "https://cdn.simpleicons.org/youtube/FF0000",
            discord: "https://cdn.simpleicons.org/discord/5865F2",
            googledrive: "https://cdn.simpleicons.org/googledrive/4285F4",
        };

        return providerLogos[provider] ?? "";
    }

    function integrationIdForNode(node: WorkflowNode) {
        const config = node.config as ToolAwareNodeConfig;

        return (
            config.integrationId ||
            (node.type === "email" ? config.sendingAccount : undefined) ||
            (node.type === "action" ? config.actionType : undefined) ||
            null
        );
    }

    const workflowTools = useMemo(() => {
        if (!workflow) return [];

        const usedIntegrationIds = new Set(
            workflow.nodes
                .map((node) => integrationIdForNode(node))
                .filter(
                    (value): value is string =>
                        Boolean(value) && value !== "primary",
                ),
        );

        return availableIntegrations.filter((integration) =>
            usedIntegrationIds.has(integration.id),
        );
    }, [availableIntegrations, workflow]);

    function integrationForNode(node: WorkflowNode) {
        const integrationId = integrationIdForNode(node);
        const normalize = (value: string) =>
            value.toLowerCase().replace(/[^a-z0-9]+/g, "");

        if (integrationId && integrationId !== "primary") {
            const normalizedIntegrationId = normalize(integrationId);

            const exactOrAliasMatch = availableIntegrations.find(
                (integration) =>
                    normalize(integration.id) === normalizedIntegrationId ||
                    normalize(integration.name) === normalizedIntegrationId,
            );

            if (exactOrAliasMatch) {
                return exactOrAliasMatch;
            }
        }

        if (node.type !== "email") {
            return null;
        }

        /*
         * A legacy/primary email step can store `sendingAccount: "primary"`
         * instead of the provider id. Resolve the provider from the real
         * integrations already loaded for this workspace rather than
         * hardcoding a provider into the node.
         */
        const description = (node.description ?? "").toLowerCase();

        const descriptionMatch = availableIntegrations.find((integration) => {
            const integrationName = integration.name.trim().toLowerCase();
            const integrationIdText = integration.id.trim().toLowerCase();

            return (
                integrationName.length > 0 &&
                (description.includes(integrationName) ||
                    description.includes(integrationIdText))
            );
        });

        if (descriptionMatch) {
            return descriptionMatch;
        }

        const emailProviderPattern =
            /(gmail|googlemail|outlook|office365|microsoft365|sendgrid|mailgun|resend|smtp|email)/i;

        return (
            availableIntegrations.find(
                (integration) =>
                    integration.connected &&
                    emailProviderPattern.test(
                        `${integration.id} ${integration.name} ${integration.description}`,
                    ),
            ) ?? null
        );
    }

    function nodeDisplayLabel(node: WorkflowNode) {
        if (node.type === "trigger") return "Trigger";
        if (node.type === "condition") return "Condition";
        if (node.type === "delay") return "Wait";
        return "Action";
    }

    function compactStepText(value: string) {
        const cleaned = value
            .replace(/[_-]+/g, " ")
            .replace(/\s+/g, " ")
            .replace(/\.$/, "")
            .trim();

        if (!cleaned) return "";
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    function nodeDisplayCopy(
        node: WorkflowNode,
        integration: IntegrationRecord | null,
    ) {
        const nodeTitle = node.title?.trim() || "Untitled step";
        const integrationName = integration?.name?.trim() || "";
        const normalise = (value: string) =>
            value.toLowerCase().replace(/[^a-z0-9]+/g, "");

        if (node.type === "delay") {
            const value = node.config.delayValue ?? 1;
            const unit = node.config.delayUnit ?? "days";
            const readableUnit =
                value === 1 ? String(unit).replace(/s$/, "") : String(unit);

            return {
                title: nodeTitle,
                subtitle: `Pause for ${value} ${readableUnit}`,
            };
        }

        if (node.type === "condition") {
            return {
                title: nodeTitle,
                subtitle: `Check if ${nodeTitle.charAt(0).toLowerCase()}${nodeTitle.slice(1)}`,
            };
        }

        const displayTitle = integrationName || nodeTitle;
        const actionValue =
            typeof node.config.actionValue === "string"
                ? node.config.actionValue.trim()
                : "";

        if (
            integrationName &&
            normalise(nodeTitle) !== normalise(integrationName)
        ) {
            return {
                title: displayTitle,
                subtitle: compactStepText(nodeTitle),
            };
        }

        if (actionValue) {
            return {
                title: displayTitle,
                subtitle: compactStepText(actionValue),
            };
        }

        const description = compactStepText(node.description?.trim() || "");

        return {
            title: displayTitle,
            subtitle:
                description ||
                (node.type === "trigger"
                    ? `Starts from ${displayTitle}`
                    : node.type === "email"
                        ? "Send email"
                        : `Run ${displayTitle} action`),
        };
    }

    function librarySection(type: NodeType) {
        if (type === "trigger") return "Triggers";
        if (type === "condition" || type === "delay") return "Flow & logic";
        return "Actions";
    }

    function toggleLibrarySection(
        section: keyof typeof librarySections,
    ) {
        setLibrarySections((current) => ({
            ...current,
            [section]: !current[section],
        }));
    }

    function librarySectionIsOpen(
        section: keyof typeof librarySections,
    ) {
        return librarySearch.trim().length > 0 || librarySections[section];
    }


    useEffect(() => {
        chatHydratedRef.current = false;
        setChatHydrated(false);
        setAiMessages(createInitialAiMessages());

        try {
            const stored = window.localStorage.getItem(
                `workflow-ai-chat:${workflowId}`,
            );

            if (stored) {
                const parsed: unknown = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    const validMessages = parsed.filter(
                        (message): message is AiChatMessage =>
                            Boolean(message) &&
                            typeof message === "object" &&
                            ((message as AiChatMessage).role === "assistant" ||
                                (message as AiChatMessage).role === "user") &&
                            typeof (message as AiChatMessage).id === "string" &&
                            (message as AiChatMessage).id !== "assistant-welcome" &&
                            typeof (message as AiChatMessage).text === "string",
                    );

                    if (validMessages.length > 0) {
                        setAiMessages(validMessages);
                    }
                }
            }
        } catch (error) {
            console.error("Unable to restore workflow AI chat:", error);
        } finally {
            chatHydratedRef.current = true;
            setChatHydrated(true);
        }
    }, [workflowId]);

    useEffect(() => {
        if (!chatHydrated || !chatHydratedRef.current) return;

        try {
            window.localStorage.setItem(
                `workflow-ai-chat:${workflowId}`,
                JSON.stringify(aiMessages),
            );
        } catch (error) {
            console.error("Unable to save workflow AI chat:", error);
        }
    }, [aiMessages, workflowId, chatHydrated]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "end",
        });
    }, [aiMessages, isAiBuilding]);

    useEffect(() => {
        if (selectedNode?.type !== "trigger") {
            return;
        }

        let cancelled = false;

        async function loadAccounts() {
            setAudienceLoading(true);
            setAudienceError("");

            try {
                const workspaceId =
                    window.localStorage.getItem("workspaceId") || "demo-workspace";

                const response = await fetch(
                    `/api/dashboard/customers?workspaceId=${encodeURIComponent(
                        workspaceId,
                    )}`,
                    {
                        method: "GET",
                        credentials: "include",
                        cache: "no-store",
                    },
                );

                const payload: unknown = await response.json();

                if (!response.ok) {
                    const message =
                        payload &&
                            typeof payload === "object" &&
                            "error" in payload &&
                            typeof (payload as { error?: unknown }).error === "string"
                            ? (payload as { error: string }).error
                            : "Failed to load accounts.";

                    throw new Error(message);
                }

                const rows =
                    payload &&
                        typeof payload === "object" &&
                        Array.isArray((payload as { customers?: unknown[] }).customers)
                        ? (payload as { customers: unknown[] }).customers
                        : [];

                if (!cancelled) {
                    setAudienceAccounts(
                        rows.filter(
                            (item): item is AccountRecord =>
                                Boolean(item) &&
                                typeof item === "object" &&
                                !Array.isArray(item),
                        ),
                    );
                }
            } catch (error) {
                if (!cancelled) {
                    setAudienceAccounts([]);
                    setAudienceError(
                        error instanceof Error
                            ? error.message
                            : "Unable to load accounts.",
                    );
                }
            } finally {
                if (!cancelled) {
                    setAudienceLoading(false);
                }
            }
        }

        void loadAccounts();

        return () => {
            cancelled = true;
        };
    }, [selectedNode?.id, selectedNode?.type]);

    const validationIssues = useMemo(() => {
        if (!workflow) {
            return [];
        }

        const issues = validateWorkflow(workflow);

        workflow.nodes
            .filter((node) => node.type === "trigger")
            .forEach((node) => {
                const audience = getAudienceConfig(node);

                if (
                    audience.mode === "conditions" &&
                    (
                        audience.rules.length === 0 ||
                        audience.rules.some(
                            (rule) =>
                                !rule.field ||
                                (
                                    rule.operator !== "is_true" &&
                                    rule.operator !== "is_false" &&
                                    !rule.value.trim()
                                ),
                        )
                    )
                ) {
                    issues.push("Complete the trigger enrollment conditions.");
                }

                if (
                    audience.mode === "specific" &&
                    audience.accountIds.length === 0
                ) {
                    issues.push("Select at least one account for this workflow.");
                }
            });

        return [...new Set(issues)];
    }, [workflow]);

    const connections = useMemo(() => {
        if (!workflow) return [];

        return workflow.connections
            .map((connection) => {
                const from = workflow.nodes.find(
                    (node) => node.id === connection.from,
                );
                const to = workflow.nodes.find((node) => node.id === connection.to);

                if (!from || !to) return null;

                return {
                    ...connection,
                    fromNode: from,
                    toNode: to,
                };
            })
            .filter(
                (
                    connection,
                ): connection is NonNullable<typeof connection> =>
                    connection !== null,
            );
    }, [workflow]);

    async function loadStarterIntegrationStatus() {
        try {
            const response = await fetch("/api/integrations/status", {
                cache: "no-store",
            });

            if (!response.ok) {
                return;
            }

            const data = (await response.json()) as {
                integrations?: StarterConnectedIntegration[];
            };

            setStarterIntegrationStatuses(
                Array.isArray(data.integrations) ? data.integrations : [],
            );
        } catch (error) {
            console.error("Failed to load starter integration status:", error);
        }
    }

    function starterIntegrationConnectRoute(provider: string) {
        const oauthRoutes: Record<string, string> = {
            salesforce: "/api/integrations/salesforce/connect",
            pipedrive: "/api/integrations/pipedrive/connect",
            intercom: "/api/integrations/intercom/connect",
            google_calendar: "/api/integrations/google-calendar/connect",
            slack: "/api/integrations/slack/connect",
        };

        const dashboardRoutes: Record<string, string> = {
            resend: "/dashboard/integrations/resend",
        };

        return oauthRoutes[provider] ?? dashboardRoutes[provider] ?? null;
    }

    async function toggleStarterIntegration(integration: StarterIntegrationPickerItem) {
        if (starterIntegrationLoadingProvider) return;

        const provider = integration.provider;

        if (!integration.connected) {
            const route = starterIntegrationConnectRoute(provider);

            setStarterIntegrationsMenuOpen(false);

            if (route) {
                window.location.href = route;
                return;
            }

            router.push("/dashboard/integrations");
            return;
        }

        const confirmed = window.confirm(`Disconnect ${integration.name}?`);
        if (!confirmed) return;

        try {
            setStarterIntegrationLoadingProvider(provider);

            const response = await fetch("/api/integrations/disconnect", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ provider }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(
                    data?.error || `Failed to disconnect ${integration.name}.`,
                );
            }

            await loadStarterIntegrationStatus();

            setAvailableIntegrations((current) =>
                current.map((item) => {
                    const itemProvider = normaliseStarterIntegrationProvider(
                        item.name || item.id,
                    );

                    return itemProvider === provider
                        ? { ...item, connected: false }
                        : item;
                }),
            );
        } catch (error) {
            console.error(`Failed to disconnect ${provider}:`, error);
            showNotice(
                error instanceof Error
                    ? error.message
                    : `Failed to disconnect ${integration.name}.`,
            );
        } finally {
            setStarterIntegrationLoadingProvider(null);
        }
    }

    function showNotice(message: string) {
        setNotice(message);

        if (noticeTimer.current) {
            window.clearTimeout(noticeTimer.current);
        }

        noticeTimer.current = window.setTimeout(() => {
            setNotice("");
        }, 2200);
    }

    function persistWorkflowToStorage(
        nextWorkflow: Workflow,
    ) {
        const workspaceId =
            window.localStorage.getItem(
                "workspaceId",
            ) || "demo-workspace";

        let resolved: Workflow =
            nextWorkflow;

        saveChainRef.current =
            saveChainRef.current
                .catch(
                    () => undefined,
                )
                .then(
                    async () => {
                        const saved =
                            await saveAutomation<Workflow>(
                                workspaceId,
                                {
                                    ...nextWorkflow,

                                    version:
                                        workflowVersionRef.current,
                                },
                            );

                        workflowVersionRef.current =
                            saved.version;

                        resolved =
                            saved;
                    },
                );

        return saveChainRef.current.then(
            () => resolved,
        );
    }

    function scheduleAutosave(nextWorkflow: Workflow) {
        if (autosaveTimer.current) {
            window.clearTimeout(autosaveTimer.current);
        }

        autosaveTimer.current = window.setTimeout(() => {
            void persistWorkflowToStorage(nextWorkflow).catch((error) => {
                console.error("Automation autosave error:", error);
                showNotice(
                    error instanceof Error
                        ? error.message
                        : "Unable to save automation.",
                );
            });
        }, 450);
    }

    function setWorkflowAndAutosave(nextWorkflow: Workflow) {
        setWorkflow(nextWorkflow);
        scheduleAutosave(nextWorkflow);
    }

    useEffect(() => {
        if (!workflow || availableIntegrations.length === 0) return;

        const normalize = (value: string) =>
            value.toLowerCase().replace(/[^a-z0-9]+/g, "");

        let changed = false;

        const nextNodes = workflow.nodes.map((node) => {
            if (node.type !== "action") return node;

            const integration = integrationForNode(node);
            if (!integration) return node;

            const currentTitle = normalize(node.title);
            const integrationTitle = normalize(integration.name);

            if (currentTitle === integrationTitle) return node;

            // Only repair stale generated integration names. Custom step names stay untouched.
            const titleIsAnotherIntegration = availableIntegrations.some((candidate) => {
                const candidateName = normalize(candidate.name);
                const candidateId = normalize(candidate.id);
                return currentTitle === candidateName || currentTitle === candidateId;
            });

            if (!titleIsAnotherIntegration) return node;

            changed = true;
            return {
                ...node,
                title: integration.name,
            };
        });

        if (!changed) return;

        setWorkflowAndAutosave({
            ...workflow,
            nodes: nextNodes,
        });
    }, [availableIntegrations, workflow]);

    function updateSelectedNode(updates: Partial<WorkflowNode>) {
        if (!workflow || !selectedNode) return;

        const nextWorkflow = {
            ...workflow,
            nodes: workflow.nodes.map((node) =>
                node.id === selectedNode.id
                    ? {
                        ...node,
                        ...updates,
                        config: updates.config
                            ? { ...node.config, ...updates.config }
                            : node.config,
                    }
                    : node,
            ),
        };

        setWorkflowAndAutosave(nextWorkflow);
    }


    function syncEmailEditorBody() {
        if (!selectedNode || selectedNode.type !== "email") return;

        const editor = emailEditorRef.current;
        if (!editor) return;

        updateSelectedNode({
            config: {
                body: editor.innerHTML,
            },
        });
    }

    function updateEmailEditorFormatState() {
        const editor = emailEditorRef.current;
        const selection = window.getSelection();

        if (!editor || !selection || selection.rangeCount === 0) {
            setEmailEditorFormats(EMPTY_EMAIL_EDITOR_FORMAT_STATE);
            return;
        }

        const range = selection.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) {
            return;
        }

        const commandState = (command: string) => {
            try {
                return document.queryCommandState(command);
            } catch {
                return false;
            }
        };

        let node: Node | null = range.commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) {
            node = node.parentNode;
        }

        const element = node instanceof Element ? node : null;
        const insideLink = Boolean(element?.closest("a"));
        const centered = commandState("justifyCenter");
        const right = commandState("justifyRight");
        const left = commandState("justifyLeft") || (!centered && !right);

        setEmailEditorFormats({
            bold: commandState("bold"),
            italic: commandState("italic"),
            underline: commandState("underline"),
            strikeThrough: commandState("strikeThrough"),
            justifyLeft: left,
            justifyCenter: centered,
            justifyRight: right,
            insertUnorderedList: commandState("insertUnorderedList"),
            insertOrderedList: commandState("insertOrderedList"),
            createLink: insideLink,
        });
    }

    function rememberEmailEditorSelection() {
        const editor = emailEditorRef.current;
        const selection = window.getSelection();

        if (!editor || !selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) return;

        emailEditorSelectionRef.current = range.cloneRange();
        updateEmailEditorFormatState();
    }

    function restoreEmailEditorSelection() {
        const editor = emailEditorRef.current;
        const range = emailEditorSelectionRef.current;
        const selection = window.getSelection();

        if (!editor || !selection) return;

        editor.focus({ preventScroll: true });

        if (range) {
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

    function runEmailEditorCommand(command: string, value?: string) {
        if (!selectedNode || selectedNode.type !== "email") return;

        restoreEmailEditorSelection();
        document.execCommand(command, false, value);
        rememberEmailEditorSelection();
        syncEmailEditorBody();
        window.requestAnimationFrame(updateEmailEditorFormatState);
    }

    function addEmailEditorLink() {
        if (!selectedNode || selectedNode.type !== "email") return;

        restoreEmailEditorSelection();

        const selection = window.getSelection();
        const selectedText = selection?.toString().trim() ?? "";
        const url = window.prompt("Paste a link", "https://");

        if (!url?.trim()) {
            return;
        }

        if (selectedText) {
            document.execCommand("createLink", false, url.trim());
        } else {
            const safeUrl = url.trim();
            const anchor = `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a>`;
            document.execCommand("insertHTML", false, anchor);
        }

        rememberEmailEditorSelection();
        syncEmailEditorBody();
        window.requestAnimationFrame(updateEmailEditorFormatState);
    }

    useEffect(() => {
        function handleSelectionChange() {
            const editor = emailEditorRef.current;
            const selection = window.getSelection();
            if (!editor || !selection || selection.rangeCount === 0) return;

            const range = selection.getRangeAt(0);
            if (!editor.contains(range.commonAncestorContainer)) return;

            rememberEmailEditorSelection();
        }

        document.addEventListener("selectionchange", handleSelectionChange);
        return () => {
            document.removeEventListener("selectionchange", handleSelectionChange);
        };
    }, [selectedNodeId]);

    const selectedAudience = useMemo(
        () => getAudienceConfig(selectedNode),
        [selectedNode],
    );

    const audienceFields = useMemo<FieldOption[]>(() => {
        const samples = new Map<string, unknown>();

        audienceAccounts.forEach((account) => {
            Object.entries(flattenRecord(account)).forEach(([key, value]) => {
                if (
                    !samples.has(key) &&
                    value !== null &&
                    value !== undefined &&
                    (
                        typeof value === "string" ||
                        typeof value === "number" ||
                        typeof value === "boolean"
                    )
                ) {
                    samples.set(key, value);
                }
            });
        });

        return Array.from(samples.entries())
            .map(([key, sample]) => ({
                key,
                label: titleCase(key),
                sample,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [audienceAccounts]);

    const filteredAudienceAccounts = useMemo(() => {
        const query = audienceSearch.trim().toLowerCase();

        if (!query) {
            return audienceAccounts;
        }

        return audienceAccounts.filter((account, index) => {
            const flatText = Object.values(flattenRecord(account))
                .filter(
                    (value) =>
                        typeof value === "string" ||
                        typeof value === "number",
                )
                .join(" ")
                .toLowerCase();

            return (
                accountDisplayName(account, index)
                    .toLowerCase()
                    .includes(query) ||
                flatText.includes(query)
            );
        });
    }, [audienceAccounts, audienceSearch]);

    const estimatedAudience = useMemo(() => {
        if (selectedNode?.type !== "trigger") {
            return 0;
        }

        if (selectedAudience.mode === "all") {
            return audienceAccounts.length;
        }

        if (selectedAudience.mode === "specific") {
            const availableIds = new Set(
                audienceAccounts.map((account, index) =>
                    accountIdentity(account, index),
                ),
            );

            return selectedAudience.accountIds.filter((id) =>
                availableIds.has(id),
            ).length;
        }

        const validRules = selectedAudience.rules.filter(
            (rule) =>
                rule.field &&
                (
                    rule.operator === "is_true" ||
                    rule.operator === "is_false" ||
                    rule.value.trim()
                ),
        );

        if (validRules.length === 0) {
            return 0;
        }

        return audienceAccounts.filter((account) => {
            const results = validRules.map((rule) =>
                matchesRule(account, rule),
            );

            return selectedAudience.matchMode === "all"
                ? results.every(Boolean)
                : results.some(Boolean);
        }).length;
    }, [audienceAccounts, selectedAudience, selectedNode?.type]);

    function updateAudience(
        updates: Partial<TriggerAudienceConfig>,
    ) {
        if (!selectedNode || selectedNode.type !== "trigger") {
            return;
        }

        const nextAudience: TriggerAudienceConfig = {
            ...selectedAudience,
            ...updates,
        };

        updateSelectedNode({
            config: {
                audience: nextAudience,
            } as unknown as WorkflowNode["config"],
        });
    }

    function addAudienceRule() {
        const firstField = audienceFields[0];

        updateAudience({
            rules: [
                ...selectedAudience.rules,
                {
                    id: crypto.randomUUID(),
                    field: firstField?.key ?? "",
                    operator: operatorOptions(firstField?.sample)[0]?.value ?? "equals",
                    value: "",
                },
            ],
        });
    }

    function updateAudienceRule(
        ruleId: string,
        updates: Partial<AudienceRule>,
    ) {
        updateAudience({
            rules: selectedAudience.rules.map((rule) =>
                rule.id === ruleId
                    ? { ...rule, ...updates }
                    : rule,
            ),
        });
    }

    function removeAudienceRule(ruleId: string) {
        updateAudience({
            rules: selectedAudience.rules.filter(
                (rule) => rule.id !== ruleId,
            ),
        });
    }

    function toggleSpecificAccount(accountId: string) {
        const selected = selectedAudience.accountIds.includes(accountId);

        updateAudience({
            accountIds: selected
                ? selectedAudience.accountIds.filter(
                    (id) => id !== accountId,
                )
                : [...selectedAudience.accountIds, accountId],
        });
    }

    function rectanglesOverlap(
        aX: number,
        aY: number,
        bX: number,
        bY: number,
        gap = 28,
    ) {
        return !(
            aX + NODE_WIDTH + gap <= bX ||
            bX + NODE_WIDTH + gap <= aX ||
            aY + NODE_HEIGHT + gap <= bY ||
            bY + NODE_HEIGHT + gap <= aY
        );
    }

    function findOpenPosition(preferredX: number, preferredY: number) {
        if (!workflow) {
            return { x: preferredX, y: preferredY };
        }

        const candidates = [
            { x: preferredX, y: preferredY },
            { x: preferredX + 300, y: preferredY },
            { x: preferredX - 300, y: preferredY },
            { x: preferredX + 150, y: preferredY + 140 },
            { x: preferredX - 150, y: preferredY + 140 },
            { x: preferredX, y: preferredY + 160 },
            { x: preferredX + 300, y: preferredY + 160 },
            { x: preferredX - 300, y: preferredY + 160 },
        ];

        for (const candidate of candidates) {
            const x = clamp(
                candidate.x,
                20,
                CANVAS_WIDTH - NODE_WIDTH - 20,
            );
            const y = clamp(
                candidate.y,
                20,
                CANVAS_HEIGHT - NODE_HEIGHT - 20,
            );

            const collides = workflow.nodes.some((node) =>
                rectanglesOverlap(
                    x,
                    y,
                    node.position.x,
                    node.position.y,
                ),
            );

            if (!collides) {
                return { x, y };
            }
        }

        return {
            x: clamp(preferredX, 20, CANVAS_WIDTH - NODE_WIDTH - 20),
            y: clamp(preferredY + 180, 20, CANVAS_HEIGHT - NODE_HEIGHT - 20),
        };
    }

    function getNewChildPosition(parent: WorkflowNode) {
        if (!workflow) {
            return { x: 120, y: 120 };
        }

        const siblings = workflow.connections
            .filter((connection) => connection.from === parent.id)
            .map((connection) =>
                workflow.nodes.find((node) => node.id === connection.to),
            )
            .filter((node): node is WorkflowNode => Boolean(node));

        const horizontalOffset =
            siblings.length === 0
                ? 0
                : siblings.length % 2 === 1
                    ? 300 * Math.ceil(siblings.length / 2)
                    : -300 * Math.ceil(siblings.length / 2);

        return findOpenPosition(
            parent.position.x + horizontalOffset,
            parent.position.y + 150,
        );
    }

    function getConditionChildPosition(
        parent: WorkflowNode,
        branch: ConditionBranch,
    ) {
        const branchOffset = branch === "YES" ? -320 : 320;

        return findOpenPosition(
            parent.position.x + branchOffset,
            parent.position.y + 165,
        );
    }

    function addNode(type: NodeType, parentId?: string | null, presetId?: string) {
        if (!workflow) return;

        if (
            type === "trigger" &&
            workflow.nodes.some((node) => node.type === "trigger")
        ) {
            showNotice("This workflow already has a trigger.");
            return;
        }

        const node = createNode(type, workflow.nodes.length, presetId);
        const parent =
            workflow.nodes.find((item) => item.id === parentId) ??
            selectedNode ??
            workflow.nodes[workflow.nodes.length - 1];

        let branch: ConditionBranch | null = null;

        if (parent?.type === "condition") {
            const usedBranches = new Set(
                workflow.connections
                    .filter((connection) => connection.from === parent.id)
                    .map((connection) => getConditionBranch(connection.id))
                    .filter((value): value is ConditionBranch => Boolean(value)),
            );

            branch = !usedBranches.has("YES")
                ? "YES"
                : !usedBranches.has("NO")
                    ? "NO"
                    : null;

            if (!branch) {
                showNotice("This condition already has YES and NO branches.");
                return;
            }
        }

        if (parent) {
            node.position =
                parent.type === "condition" && branch
                    ? getConditionChildPosition(parent, branch)
                    : getNewChildPosition(parent);
        } else {
            node.position = {
                x: Math.round(CANVAS_WIDTH / 2 - NODE_WIDTH / 2),
                y: Math.round(CANVAS_HEIGHT / 2 - NODE_HEIGHT / 2),
            };
        }

        const nextConnections = parent
            ? [
                ...workflow.connections,
                {
                    id: makeConnectionId(branch),
                    from: parent.id,
                    to: node.id,
                },
            ]
            : workflow.connections;

        const nextWorkflow = {
            ...workflow,
            nodes: [...workflow.nodes, node],
            connections: nextConnections,
        };

        setWorkflowAndAutosave(nextWorkflow);
        setSelectedNodeId(node.id);
        setShowCanvasStart(false);
        setInspectorOpen(true);
        setAddFromNodeId(null);
        showNotice(parent ? `Step added after ${parent.title}` : "Step added");

        window.requestAnimationFrame(() => {
            centerOnNode(node);
        });
    }

    function openStarterFilePicker() {
        starterFileInputRef.current?.click();
    }

    async function addStarterAttachments(files: FileList | null) {
        if (!files || files.length === 0) return;

        const remainingSlots = Math.max(
            0,
            STARTER_ATTACHMENT_MAX_FILES - starterAttachments.length,
        );

        if (remainingSlots === 0) {
            showNotice(`You can attach up to ${STARTER_ATTACHMENT_MAX_FILES} files.`);
            return;
        }

        const accepted: StarterAttachment[] = [];
        const selectedFiles = Array.from(files).slice(0, remainingSlots);

        for (const file of selectedFiles) {
            const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
            const textLike =
                file.type.startsWith("text/") ||
                file.type === "application/json" ||
                file.type === "application/xml" ||
                STARTER_ATTACHMENT_EXTENSIONS.has(extension);

            if (!textLike) {
                showNotice(`${file.name} is not a supported text file.`);
                continue;
            }

            if (file.size > STARTER_ATTACHMENT_MAX_BYTES) {
                showNotice(`${file.name} is larger than 1 MB.`);
                continue;
            }

            try {
                const content = (await file.text()).slice(
                    0,
                    STARTER_ATTACHMENT_MAX_CHARS,
                );

                accepted.push({
                    id: `${file.name}-${file.size}-${file.lastModified}`,
                    name: file.name,
                    size: file.size,
                    content,
                });
            } catch {
                showNotice(`Unable to read ${file.name}.`);
            }
        }

        if (accepted.length > 0) {
            setStarterAttachments((current) => {
                const byId = new Map(
                    [...current, ...accepted].map((attachment) => [
                        attachment.id,
                        attachment,
                    ]),
                );

                return Array.from(byId.values()).slice(
                    0,
                    STARTER_ATTACHMENT_MAX_FILES,
                );
            });
        }

        if (files.length > remainingSlots) {
            showNotice(`Only ${STARTER_ATTACHMENT_MAX_FILES} files can be attached at once.`);
        }

        if (starterFileInputRef.current) {
            starterFileInputRef.current.value = "";
        }
    }

    function removeStarterAttachment(attachmentId: string) {
        setStarterAttachments((current) =>
            current.filter((attachment) => attachment.id !== attachmentId),
        );
    }

    function scrollToStarterTemplates() {
        document
            .querySelector(`.${styles.starterTemplates}`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function refreshWorkflowHistory() {
        const storedWorkflows = readWorkflows();
        const byId = new Map<string, Workflow>();

        if (workflow) {
            byId.set(workflow.id, workflow);
        }

        storedWorkflows.forEach((item) => {
            if (!byId.has(item.id)) {
                byId.set(item.id, item);
            }
        });

        setWorkflowHistory(
            Array.from(byId.values())
                .sort(
                    (a, b) =>
                        new Date(b.updatedAt).getTime() -
                        new Date(a.updatedAt).getTime(),
                )
                .slice(0, 8),
        );
    }

    function toggleWorkflowHistoryMenu() {
        setWorkflowHistoryMenuOpen((current) => {
            const next = !current;
            if (next) {
                refreshWorkflowHistory();
            }
            return next;
        });
    }

    async function shareWorkflowLink() {
        if (typeof window === "undefined") return;

        const shareUrl = window.location.href;
        const shareTitle = workflow?.name || "Workflow";

        try {
            if (navigator.share) {
                await navigator.share({
                    title: shareTitle,
                    text: `Open ${shareTitle}`,
                    url: shareUrl,
                });
                return;
            }

            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(shareUrl);
                showNotice("Workflow link copied");
                return;
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return;
            }
        }

        showNotice("Sharing is not available in this browser.");
    }

    async function buildWorkflowWithAI() {
        const typedPrompt = aiPrompt.trim();

        if (
            !workflow ||
            (!typedPrompt && starterAttachments.length === 0) ||
            isAiBuilding
        ) {
            return;
        }

        const prompt =
            typedPrompt ||
            "Use the attached context to build or update this workflow.";

        const attachmentContext = starterAttachments
            .map(
                (attachment) =>
                    `--- ${attachment.name} ---\n${attachment.content}`,
            )
            .join("\n\n");

        const promptForAi = attachmentContext
            ? `${prompt}\n\nAttached context:\n${attachmentContext}`
            : prompt;

        const userMessage: AiChatMessage = {
            id: `user-${Date.now()}`,
            role: "user",
            text: starterAttachments.length
                ? `${prompt}\n\nAttached: ${starterAttachments
                    .map((attachment) => attachment.name)
                    .join(", ")}`
                : prompt,
            createdAt: new Date().toISOString(),
        };

        setAiMessages((current) => [...current, userMessage]);
        setAiPrompt("");
        setIsAiBuilding(true);

        try {
            const firebaseUser = await waitForFirebaseUser();
            const idToken = await firebaseUser.getIdToken();

            const response = await fetch("/api/email-agent/automation-builder", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`,
                },
                credentials: "include",
                body: JSON.stringify({
                    prompt: promptForAi,
                    availableSteps: [
                        ...NODE_LIBRARY.filter((item) => item.type !== "action" || getAutomationActionCapability(item.defaults?.config?.actionType ?? item.title)).map((item) => ({
                            id: item.id,
                            type: item.type,
                            title: item.title,
                            description: item.description,
                            actionType: item.defaults?.config?.actionType,
                        })),
                    ],
                    currentSteps: workflow.nodes.map((node, index) => ({
                        index,
                        id: node.id,
                        type: node.type,
                        title: node.title,
                        description: node.description,
                        config: node.config,
                    })),
                    currentConnections: workflow.connections
                        .map((connection) => {
                            const fromIndex = workflow.nodes.findIndex(
                                (node) => node.id === connection.from,
                            );
                            const toIndex = workflow.nodes.findIndex(
                                (node) => node.id === connection.to,
                            );

                            if (fromIndex < 0 || toIndex < 0) {
                                return null;
                            }

                            return {
                                fromIndex,
                                toIndex,
                                branch: getConditionBranch(connection),
                                label:
                                    typeof connection.label === "string"
                                        ? connection.label
                                        : null,
                            };
                        })
                        .filter(
                            (
                                connection,
                            ): connection is {
                                fromIndex: number;
                                toIndex: number;
                                branch: ConditionBranch | null;
                                label: string | null;
                            } => connection !== null,
                        ),
                    conversation: aiMessages.slice(-8).map((message) => ({
                        role: message.role,
                        text: message.text,
                    })),
                }),
            });

            const payload: unknown = await response.json();

            if (!response.ok) {
                const message =
                    payload &&
                        typeof payload === "object" &&
                        "error" in payload &&
                        typeof (payload as { error?: unknown }).error === "string"
                        ? (payload as { error: string }).error
                        : "Unable to update the workflow with AI.";

                throw new Error(message);
            }

            type AiOperation = {
                action: "add" | "update" | "remove";
                operationId: string | null;
                targetIndex: number | null;
                afterIndex: number | null;
                parentIndex: number | null;
                parentOperationId: string | null;
                branch: ConditionBranch | null;
                stepId: string | null;
                integrationStepId: string | null;
                actionValue: string | null;
                condition: string | null;
                sourceEmailIndex: number | null;
                sourceEmailOperationId: string | null;
                delayValue: number | null;
                delayUnit: DelayUnit | null;
            };

            const operations =
                payload &&
                    typeof payload === "object" &&
                    Array.isArray((payload as { operations?: unknown[] }).operations)
                    ? (payload as { operations: unknown[] }).operations.filter(
                        (item): item is AiOperation => {
                            if (!item || typeof item !== "object") return false;

                            const operation = item as Record<string, unknown>;

                            return (
                                (operation.action === "add" ||
                                    operation.action === "update" ||
                                    operation.action === "remove") &&
                                (operation.operationId === null ||
                                    typeof operation.operationId === "string") &&
                                (operation.targetIndex === null ||
                                    typeof operation.targetIndex === "number") &&
                                (operation.afterIndex === null ||
                                    typeof operation.afterIndex === "number") &&
                                (operation.parentIndex === null ||
                                    typeof operation.parentIndex === "number") &&
                                (operation.parentOperationId === null ||
                                    typeof operation.parentOperationId === "string") &&
                                (operation.branch === null ||
                                    operation.branch === "YES" ||
                                    operation.branch === "NO") &&
                                (operation.stepId === null ||
                                    typeof operation.stepId === "string") &&
                                (operation.integrationStepId === null ||
                                    typeof operation.integrationStepId === "string") &&
                                (operation.actionValue === null ||
                                    typeof operation.actionValue === "string") &&
                                (operation.condition === null ||
                                    typeof operation.condition === "string") &&
                                (operation.sourceEmailIndex === null ||
                                    typeof operation.sourceEmailIndex === "number") &&
                                (operation.sourceEmailOperationId === null ||
                                    typeof operation.sourceEmailOperationId === "string") &&
                                (operation.delayValue === null ||
                                    typeof operation.delayValue === "number") &&
                                (operation.delayUnit === null ||
                                    operation.delayUnit === "minutes" ||
                                    operation.delayUnit === "hours" ||
                                    operation.delayUnit === "days")
                            );
                        },
                    )
                    : [];

            const assistantMessage =
                payload &&
                    typeof payload === "object" &&
                    "message" in payload &&
                    typeof (payload as { message?: unknown }).message === "string"
                    ? (payload as { message: string }).message
                    : "Done — I updated the workflow.";

            if (operations.length === 0) {
                setAiMessages((current) => [
                    ...current,
                    {
                        id: crypto.randomUUID(),
                        role: "assistant",
                        text: assistantMessage,
                        createdAt: new Date().toISOString(),
                    },
                ]);
                showNotice(assistantMessage);
                return;
            }

            const libraryById = new Map(
                NODE_LIBRARY.map((item) => [item.id, item] as const),
            );

            const integrationByStepId = new Map<string, IntegrationRecord>(
                availableIntegrations
                    .filter((integration) => integration.connected)
                    .map(
                        (integration) =>
                            [`integration:${integration.id}`, integration] as const,
                    ),
            );

            const integrationById = new Map<string, IntegrationRecord>(
                availableIntegrations.map(
                    (integration) => [integration.id, integration] as const,
                ),
            );

            const isDemoWorkspace =
                (window.localStorage.getItem("workspaceId") || "demo-workspace") ===
                "demo-workspace";

            let nextNodes = [...workflow.nodes];

            // Apply removals first, from highest index to lowest so indexes stay stable.
            operations
                .filter(
                    (operation) =>
                        operation.action === "remove" &&
                        operation.targetIndex !== null,
                )
                .sort(
                    (a, b) =>
                        (b.targetIndex ?? -1) - (a.targetIndex ?? -1),
                )
                .forEach((operation) => {
                    const index = operation.targetIndex ?? -1;

                    if (index >= 0 && index < nextNodes.length) {
                        nextNodes.splice(index, 1);
                    }
                });

            // Apply updates without replacing the existing node.
            operations
                .filter(
                    (operation) =>
                        operation.action === "update" &&
                        operation.targetIndex !== null,
                )
                .forEach((operation) => {
                    const targetId = operation.targetIndex === null ? undefined : workflow.nodes[operation.targetIndex]?.id;
                    const index = nextNodes.findIndex((node) => node.id === targetId);
                    const currentNode = nextNodes[index];

                    if (!currentNode) return;

                    const updatedNode: WorkflowNode = {
                        ...currentNode,
                        config: {
                            ...currentNode.config,
                        },
                    };

                    if (operation.integrationStepId !== null) {
                        const integration =
                            integrationByStepId.get(operation.integrationStepId);

                        if (integration) {
                            (
                                updatedNode.config as ToolAwareNodeConfig
                            ).integrationId = integration.id;

                            if (currentNode.type === "email") {
                                updatedNode.config.sendingAccount = integration.id;
                                updatedNode.description = `Send email using ${integration.name}.`;
                            } else if (currentNode.type === "action") {
                                updatedNode.config.actionType = integration.id;
                                updatedNode.title = integration.name;
                                updatedNode.description =
                                    integration.description ||
                                    `Run an action with ${integration.name}.`;
                            } else if (currentNode.type === "trigger") {
                                updatedNode.description =
                                    `Start this workflow from ${integration.name}.`;
                            }
                        }
                    }

                    if (
                        currentNode.type === "action" &&
                        operation.actionValue !== null
                    ) {
                        updatedNode.config.actionValue =
                            operation.actionValue;
                    }

                    if (
                        currentNode.type === "condition" &&
                        operation.condition !== null
                    ) {
                        updatedNode.config.condition = operation.condition;
                        updatedNode.title = operation.condition;
                    }

                    if (
                        currentNode.type === "delay" &&
                        operation.delayValue !== null
                    ) {
                        updatedNode.config.delayValue = Math.max(
                            1,
                            operation.delayValue,
                        );
                    }

                    if (
                        currentNode.type === "delay" &&
                        operation.delayUnit !== null
                    ) {
                        updatedNode.config.delayUnit = operation.delayUnit;
                    }

                    if (
                        currentNode.type === "delay" &&
                        (operation.delayValue !== null ||
                            operation.delayUnit !== null)
                    ) {
                        const value =
                            updatedNode.config.delayValue ?? 1;
                        const unit =
                            updatedNode.config.delayUnit ?? "days";
                        const singular =
                            value === 1
                                ? unit.replace(/s$/, "")
                                : unit;

                        updatedNode.title = `Wait ${value} ${singular}`;
                    }

                    nextNodes[index] = updatedNode;
                });

            const addedNodeIdByOperationId = new Map<string, string>();

            // Apply additions in the order returned by the assistant.
            operations
                .filter(
                    (operation) =>
                        operation.action === "add" &&
                        operation.stepId !== null,
                )
                .forEach((operation) => {
                    const stepId = operation.stepId;

                    if (!stepId) return;

                    const definition = libraryById.get(stepId);
                    const integration = integrationByStepId.get(stepId);

                    if (!definition && !integration) return;

                    const node = integration
                        ? createNode("action", nextNodes.length)
                        : createNode(
                            definition!.type,
                            nextNodes.length,
                            definition!.id,
                        );

                    if (integration) {
                        node.title = integration.name;
                        node.label = "Tool";
                        node.description =
                            integration.description ||
                            `Run an action with ${integration.name}.`;
                        node.config = {
                            ...node.config,
                            actionType: integration.id,
                            integrationId: integration.id,
                        } as ToolAwareNodeConfig;
                    } else {
                        const explicitlySelectedIntegration =
                            operation.integrationStepId
                                ? integrationByStepId.get(
                                    operation.integrationStepId,
                                )
                                : undefined;

                        const demoDefaultIntegration =
                            isDemoWorkspace && definition
                                ? integrationById.get(
                                    DEMO_STEP_TOOL_DEFAULTS[definition.id] ?? "",
                                )
                                : undefined;

                        const stepIntegration =
                            explicitlySelectedIntegration ||
                            demoDefaultIntegration;

                        if (stepIntegration) {
                            (
                                node.config as ToolAwareNodeConfig
                            ).integrationId = stepIntegration.id;

                            if (node.type === "email") {
                                node.config.sendingAccount = stepIntegration.id;
                                node.description =
                                    `Send email using ${stepIntegration.name}.`;
                            } else if (node.type === "trigger") {
                                node.description =
                                    `Start this workflow from ${stepIntegration.name}.`;
                            } else if (node.type === "action") {
                                node.config.actionType = stepIntegration.id;
                            }
                        }
                    }

                    if (
                        node.type === "action" &&
                        operation.actionValue !== null
                    ) {
                        node.config.actionValue =
                            operation.actionValue;
                    }

                    if (
                        node.type === "condition" &&
                        operation.condition !== null
                    ) {
                        node.config.condition = operation.condition;
                        node.title = operation.condition;
                    }

                    if (
                        node.type === "delay" &&
                        operation.delayValue !== null
                    ) {
                        node.config.delayValue = Math.max(
                            1,
                            operation.delayValue,
                        );
                    }

                    if (
                        node.type === "delay" &&
                        operation.delayUnit !== null
                    ) {
                        node.config.delayUnit = operation.delayUnit;
                    }

                    if (
                        node.type === "delay" &&
                        (operation.delayValue !== null ||
                            operation.delayUnit !== null)
                    ) {
                        const value = node.config.delayValue ?? 1;
                        const unit = node.config.delayUnit ?? "days";
                        const singular =
                            value === 1 ? unit.replace(/s$/, "") : unit;
                        node.title = `Wait ${value} ${singular}`;
                    }

                    const requestedAfter =
                        operation.afterIndex === null
                            ? nextNodes.length - 1
                            : operation.afterIndex;

                    const insertAt = Math.min(
                        nextNodes.length,
                        Math.max(0, requestedAfter + 1),
                    );

                    nextNodes.splice(insertAt, 0, node);

                    if (operation.operationId) {
                        addedNodeIdByOperationId.set(
                            operation.operationId,
                            node.id,
                        );
                    }
                });

            // Keep graph meaning separate from visual position. Existing condition
            // branches are preserved, and new condition children receive a stable
            // YES/NO branch instead of deriving logic from where a node is dragged.
            for (const operation of operations) {
                if (operation.action === "remove") continue;
                const nodeId = operation.action === "add"
                    ? addedNodeIdByOperationId.get(operation.operationId ?? "")
                    : operation.targetIndex === null ? undefined : workflow.nodes[operation.targetIndex]?.id;
                const node = nextNodes.find((item) => item.id === nodeId);
                if (!node || node.type !== "condition") continue;
                const sourceId = operation.sourceEmailIndex !== null
                    ? workflow.nodes[operation.sourceEmailIndex]?.id
                    : operation.sourceEmailOperationId
                        ? addedNodeIdByOperationId.get(operation.sourceEmailOperationId)
                        : undefined;
                if (sourceId) {
                    if (!nextNodes.some((item) => item.id === sourceId && item.type === "email")) {
                        throw new Error("The condition references an email step that was removed.");
                    }
                    node.config.sourceEmailNodeId = sourceId;
                }
                if (operation.condition !== null) {
                    node.config.conditionRules = undefined;
                    node.config.conditionMatch = undefined;
                }
            }

            const survivingNodeIds = new Set(nextNodes.map((node) => node.id));
            const nextConnections = workflow.connections.filter(
                (connection) =>
                    survivingNodeIds.has(connection.from) &&
                    survivingNodeIds.has(connection.to),
            );

            const connectedTo = new Set(
                nextConnections.map((connection) => connection.to),
            );

            // Use the semantic parent/branch returned by the AI. afterIndex is only
            // for list/display ordering; it must not decide workflow meaning.
            operations
                .filter(
                    (operation) =>
                        operation.action === "add" &&
                        operation.operationId !== null,
                )
                .forEach((operation) => {
                    if (!operation.operationId) return;

                    const childId = addedNodeIdByOperationId.get(
                        operation.operationId,
                    );
                    if (!childId || connectedTo.has(childId)) return;

                    const parentId =
                        operation.parentIndex !== null
                            ? workflow.nodes[operation.parentIndex]?.id
                            : operation.parentOperationId
                                ? addedNodeIdByOperationId.get(
                                    operation.parentOperationId,
                                )
                                : undefined;

                    if (
                        !parentId ||
                        !survivingNodeIds.has(parentId) ||
                        !survivingNodeIds.has(childId)
                    ) {
                        return;
                    }

                    nextConnections.push({
                        id: makeConnectionId(operation.branch),
                        from: parentId,
                        to: childId,
                        ...(operation.branch
                            ? {
                                label:
                                    operation.branch === "YES"
                                        ? "Yes"
                                        : "No",
                            }
                            : {}),
                    });
                    connectedTo.add(childId);
                });

            // Fallback only for older/underspecified AI edits that did not include
            // semantic parent metadata.
            for (let index = 0; index < nextNodes.length - 1; index += 1) {
                const parent = nextNodes[index];
                const child = nextNodes[index + 1];

                if (connectedTo.has(child.id)) continue;

                let branch: ConditionBranch | null = null;

                if (parent.type === "condition") {
                    const usedBranches = new Set(
                        nextConnections
                            .filter((connection) => connection.from === parent.id)
                            .map((connection) => getConditionBranch(connection.id))
                            .filter(
                                (value): value is ConditionBranch => Boolean(value),
                            ),
                    );

                    branch = !usedBranches.has("YES")
                        ? "YES"
                        : !usedBranches.has("NO")
                            ? "NO"
                            : null;
                }

                nextConnections.push({
                    id: makeConnectionId(branch),
                    from: parent.id,
                    to: child.id,
                });
                connectedTo.add(child.id);
            }

            const incomingByNode = new Map<string, string>();
            nextConnections.forEach((connection) => {
                if (!incomingByNode.has(connection.to)) {
                    incomingByNode.set(connection.to, connection.from);
                }
            });

            const roots = nextNodes.filter((node) => !incomingByNode.has(node.id));
            const root =
                roots.find((node) => node.type === "trigger") ?? roots[0] ?? nextNodes[0];
            const positioned = new Map<string, { x: number; y: number }>();

            if (root) {
                const startX = Math.round(CANVAS_WIDTH / 2 - NODE_WIDTH / 2);
                const startY = 180;
                const verticalGap = 155;
                const branchGap = 340;
                const queue: Array<{ id: string; depth: number; x: number }> = [
                    { id: root.id, depth: 0, x: startX },
                ];

                while (queue.length > 0) {
                    const current = queue.shift()!;
                    if (positioned.has(current.id)) continue;

                    positioned.set(current.id, {
                        x: clamp(current.x, 30, CANVAS_WIDTH - NODE_WIDTH - 30),
                        y: clamp(
                            startY + current.depth * verticalGap,
                            30,
                            CANVAS_HEIGHT - NODE_HEIGHT - 30,
                        ),
                    });

                    const parentNode = nextNodes.find((node) => node.id === current.id);
                    const outgoing = nextConnections.filter(
                        (connection) => connection.from === current.id,
                    );

                    outgoing.forEach((connection, childIndex) => {
                        let childX = current.x;

                        if (parentNode?.type === "condition") {
                            const branch = getConditionBranch(connection.id);
                            childX =
                                branch === "YES"
                                    ? current.x - branchGap
                                    : branch === "NO"
                                        ? current.x + branchGap
                                        : current.x +
                                        (childIndex % 2 === 0 ? -branchGap : branchGap);
                        } else if (outgoing.length > 1) {
                            childX =
                                current.x +
                                (childIndex - (outgoing.length - 1) / 2) * branchGap;
                        }

                        queue.push({
                            id: connection.to,
                            depth: current.depth + 1,
                            x: childX,
                        });
                    });
                }
            }

            nextNodes = nextNodes.map((node, index) => ({
                ...node,
                position:
                    positioned.get(node.id) ??
                    node.position ?? {
                        x: Math.round(CANVAS_WIDTH / 2 - NODE_WIDTH / 2),
                        y: 180 + index * 155,
                    },
            }));

            const nextWorkflow: Workflow = normalizeConditionBranches({
                ...workflow,
                nodes: nextNodes,
                connections: nextConnections,
            });

            const usedToolNames = Array.from(
                new Set(
                    nextNodes
                        .map((node) => integrationIdForNode(node))
                        .filter(
                            (value): value is string =>
                                Boolean(value) && value !== "primary",
                        )
                        .map(
                            (integrationId) =>
                                availableIntegrations.find(
                                    (integration) =>
                                        integration.id === integrationId,
                                )?.name,
                        )
                        .filter((name): name is string => Boolean(name)),
                ),
            );

            setWorkflowAndAutosave(nextWorkflow);
            setSelectedNodeId(nextNodes[0]?.id ?? "");
            setShowCanvasStart(nextNodes.length === 0);
            if (nextNodes.length > 0) {
                setAiPanelCollapsed(false);
            }
            setLibraryOpen(false);
            setInspectorOpen(false);

            setAiMessages((current) => [
                ...current,
                {
                    id: `assistant-${Date.now()}`,
                    role: "assistant",
                    text: assistantMessage,
                    toolNames: usedToolNames,
                    createdAt: new Date().toISOString(),
                },
            ]);

            setStarterAttachments([]);
            showNotice("Workflow updated");

            window.requestAnimationFrame(() => centerWorkflow(nextNodes));
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Unable to update the workflow with AI.";

            setAiMessages((current) => [
                ...current,
                {
                    id: `assistant-error-${Date.now()}`,
                    role: "assistant",
                    text: message,
                    isError: true,
                    createdAt: new Date().toISOString(),
                },
            ]);

            showNotice(message);
        } finally {
            setIsAiBuilding(false);
        }
    }

    function addIntegrationNode(integration: IntegrationRecord) {
        if (!workflow) return;

        if (!integration.connected) {
            router.push("/dashboard/integrations");
            return;
        }

        const node = createNode("action", workflow.nodes.length);
        const parent =
            workflow.nodes.find((item) => item.id === selectedNodeId) ??
            workflow.nodes[workflow.nodes.length - 1];

        node.title = integration.name;
        node.label = "Integration";
        node.description =
            integration.description || `Run an action with ${integration.name}.`;
        node.config = {
            ...node.config,
            actionType: integration.id,
        };

        if (parent) {
            node.position = getNewChildPosition(parent);
        }

        let branch: ConditionBranch | null = null;

        if (parent?.type === "condition") {
            const usedBranches = new Set(
                workflow.connections
                    .filter((connection) => connection.from === parent.id)
                    .map((connection) => getConditionBranch(connection.id))
                    .filter((value): value is ConditionBranch => Boolean(value)),
            );

            branch = !usedBranches.has("YES")
                ? "YES"
                : !usedBranches.has("NO")
                    ? "NO"
                    : null;

            if (!branch) {
                showNotice("This condition already has YES and NO branches.");
                return;
            }
        }

        const nextWorkflow: Workflow = {
            ...workflow,
            nodes: [...workflow.nodes, node],
            connections: parent
                ? [
                    ...workflow.connections,
                    {
                        id: makeConnectionId(branch),
                        from: parent.id,
                        to: node.id,
                    },
                ]
                : workflow.connections,
        };

        setWorkflowAndAutosave(nextWorkflow);
        setSelectedNodeId(node.id);
        setShowCanvasStart(false);
        setInspectorOpen(true);
        showNotice(`${integration.name} step added`);
    }

    function deleteNodeById(nodeId: string) {
        if (!workflow) {
            return;
        }

        const nextWorkflow = {
            ...workflow,
            nodes: workflow.nodes.filter((node) => node.id !== nodeId),
            connections: workflow.connections.filter(
                (connection) =>
                    connection.from !== nodeId &&
                    connection.to !== nodeId,
            ),
        };

        setWorkflowAndAutosave(nextWorkflow);

        const fallback = nextWorkflow.nodes[0] ?? null;

        setSelectedNodeId(fallback?.id ?? "");
        setShowCanvasStart(nextWorkflow.nodes.length === 0);

        if (nextWorkflow.nodes.length === 0) {
            setLibraryOpen(true);
            setInspectorOpen(true);
        }

        showNotice("Step deleted");
    }

    function deleteSelectedNode() {
        if (!selectedNode) {
            return;
        }

        deleteNodeById(selectedNode.id);
    }

    function editNode(nodeId: string) {
        setSelectedNodeId(nodeId);
        setInspectorOpen(true);
        setAiPanelCollapsed(true);
    }

    async function startNewWorkflow() {
        if (!workflow) return;

        if (autosaveTimer.current) {
            window.clearTimeout(autosaveTimer.current);
            autosaveTimer.current = null;
        }

        const now = new Date().toISOString();
        const nextWorkflow: Workflow = {
            ...workflow,
            id: crypto.randomUUID(),
            name: "Untitled workflow",
            status: "draft",
            nodes: [],
            connections: [],
            createdAt: now,
            updatedAt: now,
        };

        workflowVersionRef.current = undefined;
        setSelectedNodeId("");
        setShowCanvasStart(true);
        setLibraryOpen(false);
        setInspectorOpen(false);
        setAiPanelCollapsed(false);
        setAiPrompt("");
        setAiMessages(createInitialAiMessages());
        setChatHydrated(false);
        chatHydratedRef.current = false;

        try {
            const saved = await persistWorkflowToStorage(nextWorkflow);
            router.push(`/dashboard/automations/${saved.id}`);
        } catch (error) {
            console.error("Unable to create workflow:", error);
            showNotice(
                error instanceof Error
                    ? error.message
                    : "Unable to create workflow.",
            );
        }
    }

    async function persistWorkflow() {
        if (!workflow) return false;

        const editor = emailEditorRef.current;
        const latestWorkflow =
            selectedNode?.type === "email" && editor
                ? {
                    ...workflow,
                    nodes: workflow.nodes.map((node) =>
                        node.id === selectedNode.id
                            ? {
                                ...node,
                                config: {
                                    ...node.config,
                                    body: editor.innerHTML,
                                },
                            }
                            : node,
                    ),
                }
                : workflow;

        try {
            if (autosaveTimer.current) {
                window.clearTimeout(autosaveTimer.current);
                autosaveTimer.current = null;
            }

            const saved = await persistWorkflowToStorage(latestWorkflow);
            setWorkflow((current) =>
                current?.id === saved.id
                    ? {
                        ...current,
                        nodes: latestWorkflow.nodes,
                        updatedAt: saved.updatedAt,
                    }
                    : current,
            );

            const workspaceId =
                window.localStorage.getItem("workspaceId") || "demo-workspace";
            const storageKey = unfinishedWorkflowStorageKey(workspaceId);
            try {
                const stored = window.localStorage.getItem(storageKey);
                const parsed = stored
                    ? (JSON.parse(stored) as Partial<UnfinishedWorkflowSummary>)
                    : null;
                if (parsed?.id === workflow.id) {
                    window.localStorage.removeItem(storageKey);
                }
            } catch {
                window.localStorage.removeItem(storageKey);
            }

            showNotice("Automation saved");
            return true;
        } catch (error) {
            console.error("Automation save error:", error);
            showNotice(
                error instanceof Error ? error.message : "Unable to save automation.",
            );
            return false;
        }
    }


    // Publish (draft -> active), Pause (active -> paused), Resume (paused -> active).
    // Pausing holds in-progress runs at their current step until resumed.
    async function setWorkflowStatus(nextStatus: WorkflowStatus) {
        if (!workflow || workflow.status === nextStatus || statusSaving) return;

        if (nextStatus === "active" && validationIssues.length > 0) {
            showNotice(validationIssues[0]);
            return;
        }

        setStatusSaving(true);

        try {
            const saved = await persistWorkflowToStorage({
                ...workflow,
                status: nextStatus,
            });

            setWorkflow(saved);
            showNotice(
                nextStatus === "paused"
                    ? "Automation paused. Runs in progress will wait until you resume."
                    : workflow.status === "paused"
                        ? "Automation resumed"
                        : "Automation published. New contacts that match the trigger will be enrolled.",
            );
        } catch (error) {
            console.error("Automation status update error:", error);
            showNotice(
                error instanceof Error
                    ? error.message
                    : "Unable to update automation status.",
            );
        } finally {
            setStatusSaving(false);
        }
    }

    function centerOnNode(node: WorkflowNode, behavior: ScrollBehavior = "smooth") {
        const shell = canvasShellRef.current;
        if (!shell) return;

        const centerX = (node.position.x + NODE_WIDTH / 2) * zoom;
        const centerY = (node.position.y + NODE_HEIGHT / 2) * zoom;

        shell.scrollTo({
            left: Math.max(0, centerX - shell.clientWidth / 2),
            top: Math.max(0, centerY - shell.clientHeight / 2),
            behavior,
        });
    }

    function centerEmptyCanvas(behavior: ScrollBehavior = "auto") {
        const shell = canvasShellRef.current;
        if (!shell) return;

        const centerX = (CANVAS_WIDTH * zoom) / 2;
        const centerY = (CANVAS_HEIGHT * zoom) / 2;

        shell.scrollTo({
            left: Math.max(0, centerX - shell.clientWidth / 2),
            top: Math.max(0, centerY - shell.clientHeight / 2),
            behavior,
        });
    }

    function recenterWorkflow() {
        const shell = canvasShellRef.current;
        const nodes = workflow?.nodes ?? [];
        if (!shell || !nodes.length) return;

        const minX = Math.min(...nodes.map((node) => node.position.x));
        const maxX = Math.max(...nodes.map((node) => node.position.x + NODE_WIDTH));
        const minY = Math.min(...nodes.map((node) => node.position.y));
        const maxY = Math.max(...nodes.map((node) => node.position.y + NODE_HEIGHT));
        const shellRect = shell.getBoundingClientRect();
        const panelRect = !aiPanelCollapsed
            ? aiPanelRef.current?.getBoundingClientRect()
            : undefined;
        let visibleRight = shell.clientWidth;

        if (panelRect && panelRect.width > 0 &&
            panelRect.bottom > shellRect.top && panelRect.top < shellRect.bottom &&
            panelRect.left < shellRect.right && panelRect.right > shellRect.left) {
            visibleRight = Math.max(0, Math.min(shell.clientWidth,
                panelRect.left - shellRect.left - 24));
        }

        const visibleWidth = visibleRight >= NODE_WIDTH * zoom + 48
            ? visibleRight
            : shell.clientWidth;

        shell.scrollTo({
            left: Math.max(0, ((minX + maxX) / 2) * zoom - visibleWidth / 2),
            top: Math.max(0, ((minY + maxY) / 2) * zoom - shell.clientHeight / 2),
            behavior: "smooth",
        });
    }

    function centerWorkflow(
        nodes: WorkflowNode[] = workflow?.nodes ?? [],
        behavior: ScrollBehavior = "smooth",
    ) {
        const shell = canvasShellRef.current;
        if (!shell || nodes.length === 0) {
            return;
        }

        const minX = Math.min(...nodes.map((node) => node.position.x));
        const maxX = Math.max(
            ...nodes.map((node) => node.position.x + NODE_WIDTH),
        );
        const minY = Math.min(...nodes.map((node) => node.position.y));
        const maxY = Math.max(
            ...nodes.map((node) => node.position.y + NODE_HEIGHT),
        );

        const contentWidth = Math.max(1, maxX - minX);
        const contentHeight = Math.max(1, maxY - minY);
        const horizontalPadding = 64;
        const verticalPadding = 56;

        const shellRect = shell.getBoundingClientRect();
        const panelRect =
            !aiPanelCollapsed && aiPanelRef.current
                ? aiPanelRef.current.getBoundingClientRect()
                : null;

        let coveredWidth = 0;
        let visibleCenterOffset = 0;

        if (panelRect) {
            const overlapLeft = Math.max(shellRect.left, panelRect.left);
            const overlapRight = Math.min(shellRect.right, panelRect.right);
            const overlapTop = Math.max(shellRect.top, panelRect.top);
            const overlapBottom = Math.min(shellRect.bottom, panelRect.bottom);

            const overlapsCanvas =
                overlapRight > overlapLeft &&
                overlapBottom > overlapTop;

            if (overlapsCanvas) {
                coveredWidth = Math.max(0, overlapRight - overlapLeft);

                const panelIsOnRight =
                    panelRect.left + panelRect.width / 2 >=
                    shellRect.left + shellRect.width / 2;

                visibleCenterOffset = panelIsOnRight
                    ? -coveredWidth / 2
                    : coveredWidth / 2;
            }
        }

        const visibleWidth = Math.max(
            NODE_WIDTH,
            shell.clientWidth - coveredWidth,
        );
        const visibleHeight = Math.max(
            NODE_HEIGHT,
            shell.clientHeight,
        );

        const widthZoom =
            (visibleWidth - horizontalPadding * 2) / contentWidth;
        const heightZoom =
            (visibleHeight - verticalPadding * 2) / contentHeight;

        const fitZoom = clamp(
            Math.min(widthZoom, heightZoom, 1),
            0.35,
            1,
        );

        setZoom(fitZoom);

        window.requestAnimationFrame(() => {
            const centerX = ((minX + maxX) / 2) * fitZoom;
            const centerY = ((minY + maxY) / 2) * fitZoom;
            const visibleCenterX =
                shell.clientWidth / 2 + visibleCenterOffset;

            shell.scrollTo({
                left: Math.max(0, centerX - visibleCenterX),
                top: Math.max(0, centerY - visibleHeight / 2),
                behavior,
            });
        });
    }

    function handleCanvasPointerDown(
        event: ReactPointerEvent<HTMLDivElement>,
    ) {
        const shell = canvasShellRef.current;
        if (!shell) return;

        const target = event.target as HTMLElement;

        if (
            target.closest("button") ||
            target.closest("input") ||
            target.closest("textarea") ||
            target.closest("select")
        ) {
            return;
        }

        panRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startScrollLeft: shell.scrollLeft,
            startScrollTop: shell.scrollTop,
        };

        event.currentTarget.setPointerCapture(event.pointerId);
        setIsPanning(true);
    }

    function handleCanvasPointerMove(
        event: ReactPointerEvent<HTMLDivElement>,
    ) {
        const shell = canvasShellRef.current;
        const pan = panRef.current;

        if (!shell || !pan || pan.pointerId !== event.pointerId) {
            return;
        }

        shell.scrollLeft = pan.startScrollLeft - (event.clientX - pan.startX);
        shell.scrollTop = pan.startScrollTop - (event.clientY - pan.startY);
    }

    function handleCanvasPointerUp(
        event: ReactPointerEvent<HTMLDivElement>,
    ) {
        const pan = panRef.current;

        if (!pan || pan.pointerId !== event.pointerId) {
            return;
        }

        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
            // Pointer capture may already have been released.
        }

        panRef.current = null;
        setIsPanning(false);
    }

    function handleDragPointerDown(
        event: ReactPointerEvent<HTMLButtonElement>,
        node: WorkflowNode,
    ) {
        if (!canvasRef.current) return;

        event.preventDefault();
        event.stopPropagation();

        const canvasBounds = canvasRef.current.getBoundingClientRect();
        const scaleX = CANVAS_WIDTH / canvasBounds.width;
        const scaleY = CANVAS_HEIGHT / canvasBounds.height;

        const pointerX = (event.clientX - canvasBounds.left) * scaleX;
        const pointerY = (event.clientY - canvasBounds.top) * scaleY;

        dragRef.current = {
            nodeId: node.id,
            pointerId: event.pointerId,
            offsetX: pointerX - node.position.x,
            offsetY: pointerY - node.position.y,
        };

        event.currentTarget.setPointerCapture(event.pointerId);
        setSelectedNodeId(node.id);
        setIsDragging(true);
    }

    function handleDragPointerMove(
        event: ReactPointerEvent<HTMLButtonElement>,
    ) {
        if (!workflow || !dragRef.current || !canvasRef.current) return;

        event.preventDefault();
        if (dragRef.current.pointerId !== event.pointerId) return;

        const canvasBounds = canvasRef.current.getBoundingClientRect();
        const scaleX = CANVAS_WIDTH / canvasBounds.width;
        const scaleY = CANVAS_HEIGHT / canvasBounds.height;

        const pointerX = (event.clientX - canvasBounds.left) * scaleX;
        const pointerY = (event.clientY - canvasBounds.top) * scaleY;

        const nextX = clamp(
            pointerX - dragRef.current.offsetX,
            12,
            CANVAS_WIDTH - NODE_WIDTH - 12,
        );

        const nextY = clamp(
            pointerY - dragRef.current.offsetY,
            12,
            CANVAS_HEIGHT - NODE_HEIGHT - 12,
        );

        setWorkflow((current) => {
            if (!current) return current;

            return {
                ...current,
                nodes: current.nodes.map((node) =>
                    node.id === dragRef.current?.nodeId
                        ? {
                            ...node,
                            position: {
                                x: Math.round(nextX),
                                y: Math.round(nextY),
                            },
                        }
                        : node,
                ),
            };
        });
    }

    function handleDragPointerUp(
        event: ReactPointerEvent<HTMLButtonElement>,
    ) {
        if (!workflow || !dragRef.current) return;

        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
            // Browser may already have released pointer capture.
        }

        dragRef.current = null;
        setIsDragging(false);

        void persistWorkflowToStorage(workflow).catch((error) => {
            console.error("Automation position save error:", error);
            showNotice(
                error instanceof Error
                    ? error.message
                    : "Unable to save step position.",
            );
        });

        showNotice("Position saved");
    }

    if (!workflow) {
        return null;
    }

    const triggerDefinitions = NODE_LIBRARY.filter((item) => item.type === "trigger");
    // Match on the structured trigger first; older workflows only have a label.
    const selectedTriggerDefinition =
        selectedNode?.type === "trigger"
            ? triggerDefinitions.find((item) => {
                const defaults = item.defaults?.config ?? {};
                const config = selectedNode.config;
                if (config.triggerType) {
                    if (defaults.triggerType !== config.triggerType) return false;
                    return config.triggerType !== "custom_event" ||
                        !defaults.triggerEventName ||
                        defaults.triggerEventName === config.triggerEventName;
                }
                return defaults.condition === config.condition;
            }) ?? null
            : null;
    const actionDefinitions = NODE_LIBRARY.filter((item) => item.type === "action" && getAutomationActionCapability(item.defaults?.config?.actionType ?? item.title));
    const starterActive = showCanvasStart && workflow.nodes.length === 0;

    return (
        <>
            <style>{`
                @keyframes miloOrbFloat {
                    0%, 100% { transform: translateY(0) scale(1); }
                    50% { transform: translateY(-1px) scale(1.035); }
                }
                @keyframes miloOrbGlow {
                    0%, 100% { opacity: 0.65; transform: rotate(0deg) scale(1); }
                    50% { opacity: 1; transform: rotate(10deg) scale(1.08); }
                }
                @keyframes miloHeroOrbFloat {
                    0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
                    50% { transform: translate3d(0, -8px, 0) scale(1.018); }
                }
                @keyframes miloHeroOrbGlow {
                    0%, 100% { opacity: 0.72; transform: rotate(0deg) scale(1); }
                    50% { opacity: 1; transform: rotate(12deg) scale(1.08); }
                }
            `}</style>
            <main
                ref={pageRef}
                className={`${styles.page} ${starterActive ? styles.pageStarter : styles.pageCanvas}`}
            >
                <div
                    className={`${styles.pageInner} ${starterActive ? styles.pageInnerStarter : styles.pageInnerCanvas}`}
                >
                    {!starterActive && (
                        <header className={styles.topbar}>
                            <div className={styles.titleGroup}>
                                <div className={styles.eyebrow}>AUTOMATION</div>
                                <div className={styles.workflowNameEditor}>
                                    <input
                                        ref={workflowNameRef}
                                        className={styles.workflowNameInput}
                                        value={workflow.name}
                                        readOnly={!isEditingWorkflowName}
                                        size={Math.max(workflow.name.length, 1)}
                                        onChange={(event) =>
                                            setWorkflowAndAutosave({
                                                ...workflow,
                                                name: event.target.value,
                                            })
                                        }
                                        onBlur={() => setIsEditingWorkflowName(false)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === "Escape") {
                                                event.currentTarget.blur();
                                            }
                                        }}
                                        aria-label="Workflow name"
                                    />
                                    <button
                                        type="button"
                                        className={styles.workflowNameEditButton}
                                        aria-label="Edit workflow name"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => {
                                            setIsEditingWorkflowName(true);
                                            window.requestAnimationFrame(() => {
                                                workflowNameRef.current?.focus();
                                                workflowNameRef.current?.select();
                                            });
                                        }}
                                    >
                                        <Pencil size={12} />
                                    </button>
                                </div>
                            </div>

                            <div className={styles.topActions}>
                                <button
                                    type="button"
                                    className={styles.newWorkflowButton}
                                    onClick={() => void startNewWorkflow()}
                                >
                                    <Plus size={13} />
                                    New workflow
                                </button>

                                <Link href="/dashboard/automations/all" className={styles.backButton}>
                                    All automations
                                </Link>

                                {validationIssues.length > 0 && (
                                    <span className={styles.warningSummary}>
                                        <AlertCircle size={13} />
                                        {validationIssues.length} {validationIssues.length === 1 ? "issue" : "issues"}
                                    </span>
                                )}

                                <span
                                    className={`${styles.statusBadge} ${workflow.status === "active" ? styles.statusActive : styles.statusDraft
                                        }`}
                                >
                                    <CircleDot size={12} />
                                    {workflow.status === "active"
                                        ? "Active"
                                        : workflow.status === "paused"
                                            ? "Paused"
                                            : "Draft"}
                                </span>

                                <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    disabled={statusSaving}
                                    onClick={() =>
                                        void setWorkflowStatus(
                                            workflow.status === "active" ? "paused" : "active",
                                        )
                                    }
                                >
                                    {workflow.status === "active"
                                        ? "Pause"
                                        : workflow.status === "paused"
                                            ? "Resume"
                                            : "Publish"}
                                </button>

                                <button
                                    type="button"
                                    className={styles.primaryButton}
                                    onClick={persistWorkflow}
                                >
                                    <Save size={14} />
                                    Save
                                </button>
                            </div>
                        </header>
                    )}

                    {notice && (
                        <div className={styles.notice} role="status">
                            <Check size={14} />
                            {notice}
                        </div>
                    )}

                    {runsPanel && (
                        <AutomationRunsPanel
                            workflowId={workflow.id}
                            workflowStatus={workflow.status === "active" || workflow.status === "paused" ? workflow.status : "draft"}
                            nodeTitles={Object.fromEntries(workflow.nodes.map((node) => [node.id, node.title]))}
                            tab={runsPanel}
                            onTabChange={setRunsPanel}
                            onClose={() => setRunsPanel(null)}
                            onPublish={() => void setWorkflowStatus("active")}
                        />
                    )}

                    <section
                        className={`${styles.builderCard} ${aiPanelCollapsed ? styles.builderCardAiCollapsed : ""
                            } ${starterActive ? styles.builderCardStarter : ""
                            }`}
                    >
                        {!starterActive && (
                            <>
                                <div className={styles.canvasBreadcrumb}>
                                    <Link href="/dashboard/automations/all">Workflows</Link>
                                    <ChevronRight size={14} />
                                    <input
                                        className={styles.canvasBreadcrumbNameInput}
                                        value={workflow.name}
                                        onChange={(event) =>
                                            setWorkflowAndAutosave({
                                                ...workflow,
                                                name: event.target.value,
                                            })
                                        }
                                        onBlur={(event) => {
                                            if (!event.currentTarget.value.trim()) {
                                                setWorkflowAndAutosave({
                                                    ...workflow,
                                                    name: "Untitled workflow",
                                                });
                                            }
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                                event.currentTarget.blur();
                                            }
                                        }}
                                        aria-label="Workflow name"
                                    />
                                </div>

                                <div className={styles.canvasTopActions}>
                                    <button
                                        type="button"
                                        className={styles.aiToolbarLauncher}
                                        aria-label={aiPanelCollapsed ? "Open OpenClaw assistant" : "Close OpenClaw assistant"}
                                        title={aiPanelCollapsed ? "Open OpenClaw assistant" : "Close OpenClaw assistant"}
                                        aria-controls="workflow-ai-chat"
                                        aria-expanded={!aiPanelCollapsed}
                                        onClick={() => setAiPanelCollapsed((collapsed) => !collapsed)}
                                    >
                                        <StarterAiProviderLogo provider="openclaw" size={30} />
                                    </button>
                                    <span
                                        className={`${styles.canvasStatusChip} ${styles[`canvasStatus_${workflow.status}`] ?? ""}`}
                                        title={
                                            workflow.status === "active"
                                                ? "Live: the trigger is enrolling contacts"
                                                : workflow.status === "paused"
                                                    ? "Paused: no new enrollments; runs in progress are on hold"
                                                    : "Draft: not running"
                                        }
                                    >
                                        <CircleDot size={12} />
                                        {workflow.status === "active"
                                            ? "Live"
                                            : workflow.status === "paused"
                                                ? "Paused"
                                                : "Draft"}
                                    </span>
                                    <button
                                        type="button"
                                        className={styles.canvasTestButton}
                                        aria-pressed={runsPanel === "history"}
                                        aria-label="Runs"
                                        onClick={() => setRunsPanel((open) => open === "history" ? null : "history")}
                                    >
                                        <History size={14} />
                                        <span className={styles.canvasButtonLabel}>Runs</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.canvasTestButton}
                                        aria-pressed={runsPanel === "test"}
                                        aria-label="Test"
                                        onClick={() => {
                                            if (validationIssues.length > 0) {
                                                showNotice(validationIssues[0]);
                                                return;
                                            }
                                            setRunsPanel((open) => open === "test" ? null : "test");
                                        }}
                                    >
                                        <Play size={14} />
                                        <span className={styles.canvasButtonLabel}>Test</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.canvasPublishButton}
                                        disabled={statusSaving}
                                        onClick={() =>
                                            void setWorkflowStatus(
                                                workflow.status === "active" ? "paused" : "active",
                                            )
                                        }
                                    >
                                        {workflow.status === "active"
                                            ? "Pause"
                                            : workflow.status === "paused"
                                                ? "Resume"
                                                : "Publish"}
                                    </button>
                                </div>
                            </>
                        )}
                        {starterActive && (
                            <div className={styles.workflowStarter}>
                                <div className={styles.workflowStarterInner}>
                                    {isAiBuilding ? (
                                        <div className={styles.starterBuilding} aria-live="polite">
                                            <div className={styles.starterOrb} aria-hidden="true">
                                                <WorkflowAiOrb size={176} hero />
                                            </div>

                                            <div className={styles.starterBuildingHeading}>
                                                <h1>Creating your workflow</h1>
                                                <p>OpenClaw is turning your request into connected steps.</p>
                                            </div>

                                            <div className={styles.starterBuildingPrompt}>
                                                <span>{aiMessages[aiMessages.length - 1]?.text || "Creating workflow..."}</span>
                                                <span className={styles.starterBuildingDots} aria-hidden="true">
                                                    <span />
                                                    <span />
                                                    <span />
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div
                                                style={{
                                                    position: "fixed",
                                                    top: 22,
                                                    right: 28,
                                                    zIndex: 90,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 8,
                                                }}
                                            >
                                                <span
                                                    ref={starterIntegrationsMenuRef}
                                                    style={{
                                                        position: "relative",
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                    }}
                                                >
                                                    <button
                                                        type="button"
                                                        aria-haspopup="menu"
                                                        aria-expanded={starterIntegrationsMenuOpen}
                                                        aria-label="Choose integrations"
                                                        title="Choose integrations"
                                                        onClick={() => {
                                                            setStarterIntegrationsMenuOpen((current) => !current);
                                                        }}
                                                        style={{
                                                            height: 34,
                                                            padding: "0 11px",
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            gap: 7,
                                                            border: "1px solid #e4e7eb",
                                                            borderRadius: 9,
                                                            background: "#ffffff",
                                                            color: "#666d77",
                                                            font: "inherit",
                                                            fontSize: 10.5,
                                                            fontWeight: 500,
                                                            cursor: "pointer",
                                                            boxShadow: "0 2px 8px rgba(24, 30, 40, 0.03)",
                                                        }}
                                                    >
                                                        <Plug size={14} aria-hidden="true" />
                                                        <strong
                                                            style={{
                                                                color: "#555c66",
                                                                fontSize: 10.5,
                                                                fontWeight: 600,
                                                            }}
                                                        >

                                                        </strong>
                                                        {starterConnectedIntegrationCount > 0 ? (
                                                            <span
                                                                aria-label={`${starterConnectedIntegrationCount} connected integrations`}
                                                                style={{
                                                                    minWidth: 18,
                                                                    height: 18,
                                                                    padding: "0 5px",
                                                                    display: "inline-flex",
                                                                    alignItems: "center",
                                                                    justifyContent: "center",
                                                                    borderRadius: 999,
                                                                    background: "#f3f5f7",
                                                                    color: "#7b818b",
                                                                    fontSize: 8.5,
                                                                    fontWeight: 700,
                                                                }}
                                                            >
                                                                {starterConnectedIntegrationCount}
                                                            </span>
                                                        ) : null}
                                                        <ChevronDown
                                                            size={12}
                                                            aria-hidden="true"
                                                            style={{
                                                                transition: "transform 140ms ease",
                                                                transform: starterIntegrationsMenuOpen
                                                                    ? "rotate(180deg)"
                                                                    : "rotate(0deg)",
                                                            }}
                                                        />
                                                    </button>

                                                    {starterIntegrationsMenuOpen && (
                                                        <div
                                                            role="menu"
                                                            aria-label="Integrations"
                                                            style={{
                                                                position: "fixed",
                                                                top: 64,
                                                                right: 28,
                                                                zIndex: 100,
                                                                width: 340,
                                                                maxHeight: "calc(100vh - 84px)",
                                                                padding: 7,
                                                                overflow: "hidden",
                                                                border: "1px solid #e6e8ec",
                                                                borderRadius: 14,
                                                                background: "#ffffff",
                                                                boxShadow: "0 14px 36px rgba(24, 30, 40, 0.10)",
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    padding: "4px 6px 5px",
                                                                }}
                                                            >
                                                                <strong
                                                                    style={{
                                                                        display: "block",
                                                                        color: "#30343a",
                                                                        fontSize: 10.8,
                                                                        lineHeight: 1.2,
                                                                        fontWeight: 550,
                                                                    }}
                                                                >
                                                                    Connect all your tools
                                                                </strong>
                                                                <span
                                                                    style={{
                                                                        display: "block",
                                                                        marginTop: 2,
                                                                        color: "#9aa0a8",
                                                                        fontSize: 8.4,
                                                                        lineHeight: 1.3,
                                                                    }}
                                                                >

                                                                </span>
                                                            </div>

                                                            <div
                                                                style={{
                                                                    maxHeight: "calc(100vh - 160px)",
                                                                    overflowY: "auto",
                                                                    overscrollBehavior: "contain",
                                                                    padding: "1px 0",
                                                                }}
                                                            >
                                                                {starterVisibleIntegrationsSorted.map((integration) => {
                                                                    const isLoading =
                                                                        starterIntegrationLoadingProvider === integration.provider;
                                                                    const isAvailable =
                                                                        integration.connected ||
                                                                        integration.status === "Available";

                                                                    return (
                                                                        <button
                                                                            key={integration.provider}
                                                                            type="button"
                                                                            role="menuitem"
                                                                            disabled={isLoading || !isAvailable}
                                                                            onClick={() => {
                                                                                void toggleStarterIntegration(integration);
                                                                            }}
                                                                            style={{
                                                                                width: "100%",
                                                                                minHeight: 56,
                                                                                padding: "9px 10px",
                                                                                display: "flex",
                                                                                alignItems: "center",
                                                                                justifyContent: "space-between",
                                                                                gap: 10,
                                                                                border: 0,
                                                                                borderRadius: 8,
                                                                                background: "transparent",
                                                                                color: "#343840",
                                                                                font: "inherit",
                                                                                textAlign: "left",
                                                                                cursor:
                                                                                    isLoading || !isAvailable
                                                                                        ? "default"
                                                                                        : "pointer",
                                                                                opacity: !isAvailable ? 0.5 : 1,
                                                                            }}
                                                                        >
                                                                            <span
                                                                                style={{
                                                                                    minWidth: 0,
                                                                                    display: "flex",
                                                                                    alignItems: "center",
                                                                                    gap: 8,
                                                                                }}
                                                                            >
                                                                                <span
                                                                                    style={{
                                                                                        width: 36,
                                                                                        height: 36,
                                                                                        flex: "0 0 36px",
                                                                                        display: "inline-flex",
                                                                                        alignItems: "center",
                                                                                        justifyContent: "center",
                                                                                        border: "1px solid #eceef1",
                                                                                        borderRadius: 10,
                                                                                        background: "#fff",
                                                                                    }}
                                                                                >
                                                                                    <StarterIntegrationLogo
                                                                                        integration={integration}
                                                                                        size={22}
                                                                                    />
                                                                                </span>

                                                                                <span
                                                                                    style={{
                                                                                        minWidth: 0,
                                                                                        display: "flex",
                                                                                        flexDirection: "column",
                                                                                        gap: 2,
                                                                                    }}
                                                                                >
                                                                                    <strong
                                                                                        style={{
                                                                                            overflow: "hidden",
                                                                                            color: "#343840",
                                                                                            fontSize: 12,
                                                                                            lineHeight: 1.2,
                                                                                            fontWeight: 500,
                                                                                            whiteSpace: "nowrap",
                                                                                            textOverflow: "ellipsis",
                                                                                        }}
                                                                                    >
                                                                                        {integration.name}
                                                                                    </strong>
                                                                                </span>
                                                                            </span>

                                                                            <span
                                                                                aria-hidden="true"
                                                                                style={{
                                                                                    position: "relative",
                                                                                    width: 38,
                                                                                    height: 22,
                                                                                    flex: "0 0 38px",
                                                                                    borderRadius: 999,
                                                                                    background: integration.connected
                                                                                        ? "#22c55e"
                                                                                        : "#e2e5e9",
                                                                                    boxShadow: integration.connected
                                                                                        ? "inset 0 0 0 1px rgba(21,128,61,.10)"
                                                                                        : "inset 0 0 0 1px rgba(114,121,132,.08)",
                                                                                    transition: "background 140ms ease",
                                                                                }}
                                                                            >
                                                                                <span
                                                                                    style={{
                                                                                        position: "absolute",
                                                                                        top: 2,
                                                                                        left: integration.connected ? 18 : 2,
                                                                                        width: 18,
                                                                                        height: 18,
                                                                                        borderRadius: "50%",
                                                                                        background: "#fff",
                                                                                        boxShadow: "0 1px 3px rgba(24,30,40,.18)",
                                                                                        transition: "left 140ms ease",
                                                                                    }}
                                                                                />
                                                                            </span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setStarterIntegrationsMenuOpen(false);
                                                                    router.push("/dashboard/integrations");
                                                                }}
                                                                style={{
                                                                    width: "100%",
                                                                    height: 34,
                                                                    marginTop: 6,
                                                                    display: "inline-flex",
                                                                    alignItems: "center",
                                                                    justifyContent: "center",
                                                                    gap: 6,
                                                                    border: "1px solid #e6e8ec",
                                                                    borderRadius: 9,
                                                                    background: "#fff",
                                                                    color: "#676e78",
                                                                    font: "inherit",
                                                                    fontSize: 9.5,
                                                                    fontWeight: 600,
                                                                    cursor: "pointer",
                                                                }}
                                                            >
                                                                <Plug size={12} aria-hidden="true" />
                                                                Manage integrations
                                                            </button>
                                                        </div>
                                                    )}
                                                </span>

                                            </div>

                                            <div
                                                style={{
                                                    width: "100%",
                                                    maxWidth: starterIntegrationsMenuOpen ? 620 : 940,
                                                    margin: "0 auto",
                                                    transform: starterIntegrationsMenuOpen
                                                        ? "translateX(-150px)"
                                                        : "translateX(0)",
                                                    transition:
                                                        "max-width 180ms ease, transform 180ms ease",
                                                }}
                                            >
                                                <div className={styles.starterOrb} aria-hidden="true">
                                                    <WorkflowAiOrb size={176} hero />
                                                </div>

                                                <div className={styles.starterHeading}>
                                                    <h1>{starterGreeting}</h1>
                                                </div>

                                                <div className={styles.starterComposer}>
                                                    <textarea
                                                        aria-label="Describe what you want to automate"
                                                        value={aiPrompt}
                                                        onChange={(event) => setAiPrompt(event.target.value)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === "Enter" && !event.shiftKey) {
                                                                event.preventDefault();
                                                                void buildWorkflowWithAI();
                                                            }
                                                        }}
                                                        placeholder="Describe what you want to automate..."
                                                        rows={2}
                                                        autoFocus
                                                    />

                                                    {starterAttachments.length > 0 && (
                                                        <div
                                                            aria-label="Attached files"
                                                            className={styles.starterAttachmentRow}
                                                        >
                                                            {starterAttachments.map((attachment) => (
                                                                <span
                                                                    key={attachment.id}
                                                                    style={{
                                                                        maxWidth: 190,
                                                                        height: 28,
                                                                        padding: "0 8px",
                                                                        display: "inline-flex",
                                                                        alignItems: "center",
                                                                        gap: 6,
                                                                        flex: "0 0 auto",
                                                                        border: "1px solid #e6e8ec",
                                                                        borderRadius: 8,
                                                                        background: "#fff",
                                                                        color: "#666d77",
                                                                        fontSize: 10.5,
                                                                        lineHeight: 1,
                                                                    }}
                                                                >
                                                                    <Paperclip size={11} aria-hidden="true" />
                                                                    <span
                                                                        style={{
                                                                            overflow: "hidden",
                                                                            textOverflow: "ellipsis",
                                                                            whiteSpace: "nowrap",
                                                                        }}
                                                                    >
                                                                        {attachment.name}
                                                                    </span>
                                                                    <span style={{ color: "#a1a6ae" }}>
                                                                        {formatStarterAttachmentSize(attachment.size)}
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        aria-label={`Remove ${attachment.name}`}
                                                                        title={`Remove ${attachment.name}`}
                                                                        onClick={() =>
                                                                            removeStarterAttachment(attachment.id)
                                                                        }
                                                                        style={{
                                                                            width: 16,
                                                                            height: 16,
                                                                            padding: 0,
                                                                            display: "inline-flex",
                                                                            alignItems: "center",
                                                                            justifyContent: "center",
                                                                            border: 0,
                                                                            background: "transparent",
                                                                            color: "#9aa0a8",
                                                                            cursor: "pointer",
                                                                        }}
                                                                    >
                                                                        <X size={11} />
                                                                    </button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}

                                                    <input
                                                        ref={starterFileInputRef}
                                                        type="file"
                                                        multiple
                                                        accept=".txt,.md,.csv,.json,.html,.css,.js,.jsx,.ts,.tsx,.xml,.yaml,.yml,text/*,application/json,application/xml"
                                                        onChange={(event) => {
                                                            void addStarterAttachments(event.target.files);
                                                        }}
                                                        style={{ display: "none" }}
                                                    />

                                                    <div className={styles.starterComposerFooter}>
                                                        <div className={styles.starterComposerActions}>
                                                            <button
                                                                type="button"
                                                                className={styles.starterComposerActionButton}
                                                                aria-label="Attach files"
                                                                title="Attach files"
                                                                onClick={openStarterFilePicker}
                                                            >
                                                                <Paperclip size={18} aria-hidden="true" />
                                                            </button>

                                                            <span
                                                                className={styles.starterOpenClawBadge}
                                                                aria-label="Powered by OpenClaw"
                                                            >
                                                                <StarterAiProviderLogo provider="openclaw" size={18} />
                                                                <span>OpenClaw</span>
                                                            </span>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            className={styles.starterComposerSendButton}
                                                            aria-label="Send prompt"
                                                            title="Send prompt"
                                                            onClick={() => {
                                                                void buildWorkflowWithAI();
                                                            }}
                                                            disabled={
                                                                (!aiPrompt.trim() && starterAttachments.length === 0) ||
                                                                isAiBuilding
                                                            }
                                                        >
                                                            {isAiBuilding ? (
                                                                <span className={styles.loadingDot} />
                                                            ) : (
                                                                <ArrowUp size={16} />
                                                            )}
                                                        </button>
                                                    </div>

                                                </div>

                                                {unfinishedWorkflow && (
                                                    <div className={styles.continueWorkflowCard}>
                                                        <div className={styles.continueWorkflowCardHeader}>
                                                            <span className={styles.continueWorkflowIcon}>
                                                                <GitBranch size={15} />
                                                            </span>
                                                            <div className={styles.continueWorkflowCopy}>
                                                                <strong>Continue building your workflow</strong>
                                                                <span>
                                                                    Last edited {new Date(unfinishedWorkflow.updatedAt).toLocaleDateString([], {
                                                                        day: "numeric",
                                                                        month: "short",
                                                                    })}
                                                                    {" · "}
                                                                    {unfinishedWorkflow.stepCount} {unfinishedWorkflow.stepCount === 1 ? "step" : "steps"}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            className={styles.continueWorkflowButton}
                                                            onClick={() =>
                                                                router.push(
                                                                    `/dashboard/automations/${unfinishedWorkflow.id}`,
                                                                )
                                                            }
                                                        >
                                                            Continue building
                                                            <ChevronRight size={14} />
                                                        </button>
                                                    </div>
                                                )}

                                                {starterSuggestions.length > 0 && (
                                                    <div className={styles.starterTemplates}>
                                                        <div className={styles.starterTemplatesHeader}>
                                                            <span>Start with a popular template ✧</span>
                                                        </div>

                                                        <div className={styles.starterTemplateGrid}>
                                                            {starterSuggestions.map((suggestion) => (
                                                                <button
                                                                    key={suggestion.id}
                                                                    type="button"
                                                                    className={styles.starterTemplateCard}
                                                                    onClick={() => setAiPrompt(suggestion.prompt)}
                                                                >
                                                                    <span className={styles.starterTemplateIcons}>
                                                                        {suggestion.tools.map((provider, index) => {
                                                                            const integration = suggestion.integrations[index];
                                                                            const logo = providerLogoUrl(provider, integration);

                                                                            return (
                                                                                <span
                                                                                    key={`${suggestion.id}-${provider}-${index}`}
                                                                                    className={styles.starterTemplateIcon}
                                                                                >
                                                                                    {provider === "slack" ? (
                                                                                        <SlackLogo />
                                                                                    ) : logo ? (
                                                                                        <img
                                                                                            src={logo}
                                                                                            alt={integration?.name ?? provider}
                                                                                            className={styles.starterTemplateLogo}
                                                                                        />
                                                                                    ) : (
                                                                                        <Plug size={14} />
                                                                                    )}
                                                                                </span>
                                                                            );
                                                                        })}
                                                                    </span>
                                                                    <span className={styles.starterTemplateCopy}>
                                                                        <strong>{suggestion.title}</strong>
                                                                        <span>{suggestion.description}</span>
                                                                    </span>
                                                                    <ChevronRight
                                                                        size={14}
                                                                        className={styles.starterTemplateArrow}
                                                                        aria-hidden="true"
                                                                    />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        <aside
                            id="workflow-ai-chat"
                            aria-label="OpenClaw assistant"
                            ref={aiPanelRef}
                            className={`${styles.aiPanel} ${aiPanelCollapsed ? styles.aiPanelCollapsed : ""}`}
                        >
                            <div className={styles.aiChatHeader}>
                                <div
                                    ref={workflowHistoryMenuRef}
                                    className={styles.aiWorkflowMenuWrap}
                                >
                                    <button
                                        type="button"
                                        onClick={toggleWorkflowHistoryMenu}
                                        className={styles.aiNewWorkflowButton}
                                        aria-haspopup="menu"
                                        aria-expanded={workflowHistoryMenuOpen}
                                    >
                                        <span>{workflow?.name || "Untitled workflow"}</span>
                                        <ChevronDown
                                            size={14}
                                            strokeWidth={2}
                                            className={workflowHistoryMenuOpen ? styles.aiWorkflowChevronOpen : ""}
                                        />
                                    </button>

                                    {workflowHistoryMenuOpen && (
                                        <div
                                            className={styles.aiWorkflowHistoryMenu}
                                            role="menu"
                                            aria-label="Workflow history"
                                        >
                                            <button
                                                type="button"
                                                className={styles.aiWorkflowCreateItem}
                                                onClick={() => {
                                                    setWorkflowHistoryMenuOpen(false);
                                                    void startNewWorkflow();
                                                }}
                                            >
                                                <span className={styles.aiWorkflowCreateIcon}>
                                                    <Plus size={14} />
                                                </span>
                                                <span>New workflow</span>
                                            </button>

                                            <div className={styles.aiWorkflowMenuDivider} />
                                            <div className={styles.aiWorkflowMenuLabel}>Recent workflows</div>

                                            <div className={styles.aiWorkflowHistoryList}>
                                                {workflowHistory.length > 0 ? (
                                                    workflowHistory.map((item) => {
                                                        const isCurrent = item.id === workflowId;

                                                        return (
                                                            <button
                                                                key={item.id}
                                                                type="button"
                                                                className={`${styles.aiWorkflowHistoryItem} ${isCurrent ? styles.aiWorkflowHistoryItemCurrent : ""}`}
                                                                onClick={() => {
                                                                    setWorkflowHistoryMenuOpen(false);
                                                                    if (!isCurrent) {
                                                                        router.push(`/dashboard/automations/${item.id}`);
                                                                    }
                                                                }}
                                                            >
                                                                <span className={styles.aiWorkflowHistoryIcon}>
                                                                    <GitBranch size={13} />
                                                                </span>
                                                                <span className={styles.aiWorkflowHistoryCopy}>
                                                                    <strong>{item.name || "Untitled workflow"}</strong>
                                                                    <small>
                                                                        {new Date(item.updatedAt).toLocaleDateString([], {
                                                                            day: "numeric",
                                                                            month: "short",
                                                                            year: "numeric",
                                                                        })}
                                                                    </small>
                                                                </span>
                                                                {isCurrent && (
                                                                    <span className={styles.aiWorkflowCurrentBadge}>Current</span>
                                                                )}
                                                            </button>
                                                        );
                                                    })
                                                ) : (
                                                    <div className={styles.aiWorkflowHistoryEmpty}>
                                                        No previous workflows yet.
                                                    </div>
                                                )}
                                            </div>

                                            <Link
                                                href="/dashboard/automations/all"
                                                className={styles.aiWorkflowLibraryLink}
                                                onClick={() => setWorkflowHistoryMenuOpen(false)}
                                            >
                                                <span>View workflow library</span>
                                                <ChevronRight size={14} />
                                            </Link>
                                        </div>
                                    )}
                                </div>

                                <div className={styles.aiChatHeaderActions}>
                                    <button
                                        type="button"
                                        aria-label="Share workflow"
                                        title="Share workflow"
                                        onClick={() => {
                                            void shareWorkflowLink();
                                        }}
                                        className={styles.aiShareLabel}
                                    >
                                        <Share2 size={15} />
                                        <span>Share</span>
                                    </button>

                                    <button
                                        type="button"
                                        className={styles.aiCloseButton}
                                        aria-label="Collapse AI assistant"
                                        title="Collapse AI assistant"
                                        onClick={() => {
                                            setAiPanelCollapsed(true);
                                        }}
                                    >
                                        <X size={18} strokeWidth={2.1} />
                                    </button>
                                </div>
                            </div>

                            <div className={styles.chatArea}>
                                <div className={styles.chatTranscript}>
                                    {aiMessages.map((message) => (
                                        <div
                                            key={message.id}
                                            className={`${styles.chatMessageRow} ${message.role === "user"
                                                ? styles.chatMessageRowUser
                                                : styles.chatMessageRowAssistant
                                                }`}
                                        >
                                            <div
                                                className={`${styles.chatBubble} ${message.role === "user"
                                                    ? styles.userBubble
                                                    : styles.assistantBubble
                                                    } ${message.isError
                                                        ? styles.errorBubble
                                                        : ""
                                                    }`}
                                            >
                                                {message.role === "assistant" ? (() => {
                                                    const lines = message.text
                                                        .split("\n")
                                                        .map((line) => line.trim())
                                                        .filter(Boolean);
                                                    const bulletLines = lines.filter((line) =>
                                                        /^(?:[✓✔•*-]|\d+[.)])\s*/.test(line),
                                                    );
                                                    const introLines = lines.filter(
                                                        (line) => !/^(?:[✓✔•*-]|\d+[.)])\s*/.test(line),
                                                    );

                                                    return (
                                                        <div className={styles.assistantStructuredMessage}>
                                                            {introLines.length > 0 && (
                                                                <p>{introLines.join(" ")}</p>
                                                            )}

                                                            {bulletLines.length > 0 && (
                                                                <div className={styles.assistantStepList}>
                                                                    {bulletLines.map((line, index) => (
                                                                        <div
                                                                            key={`${message.id}-bullet-${index}`}
                                                                            className={styles.assistantStepRow}
                                                                        >
                                                                            <span className={styles.assistantStepCheck}>
                                                                                <Check size={12} />
                                                                            </span>
                                                                            <span>
                                                                                {line.replace(/^(?:[✓✔•*-]|\d+[.)])\s*/, "")}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {introLines.length === 0 && bulletLines.length === 0 && (
                                                                <p>{message.text}</p>
                                                            )}
                                                        </div>
                                                    );
                                                })() : (
                                                    <p>{message.text}</p>
                                                )}

                                                {message.toolNames &&
                                                    message.toolNames.length > 0 && (
                                                        <div className={styles.messageTools}>
                                                            {message.toolNames.map(
                                                                (toolName) => (
                                                                    <span
                                                                        key={toolName}
                                                                        className={styles.messageToolChip}
                                                                    >
                                                                        <Plug size={12} />
                                                                        {toolName}
                                                                    </span>
                                                                ),
                                                            )}
                                                        </div>
                                                    )}

                                                {formatAiMessageTime(message) && (
                                                    <time
                                                        className={styles.chatMessageTime}
                                                        dateTime={
                                                            getAiMessageTimestamp(message)?.toISOString()
                                                        }
                                                    >
                                                        {formatAiMessageTime(message)}
                                                    </time>
                                                )}
                                            </div>
                                        </div>
                                    ))}

                                    {isAiBuilding && (
                                        <div
                                            className={`${styles.chatMessageRow} ${styles.chatMessageRowAssistant}`}
                                        >
                                            <div
                                                className={`${styles.chatBubble} ${styles.assistantBubble}`}
                                            >
                                                <div className={styles.typingIndicator}>
                                                    <span />
                                                    <span />
                                                    <span />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div ref={chatEndRef} />
                                </div>
                            </div>

                            <div className={styles.aiComposerWrap}>
                                <div className={styles.promptComposer}>
                                    <textarea
                                        value={aiPrompt}
                                        onChange={(event) => setAiPrompt(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" && !event.shiftKey) {
                                                event.preventDefault();
                                                void buildWorkflowWithAI();
                                            }
                                        }}
                                        placeholder="Ask AI anything"
                                        rows={3}
                                    />

                                    {starterAttachments.length > 0 && (
                                        <div
                                            aria-label="Attached files"
                                            className={styles.aiAttachedFiles}
                                        >
                                            {starterAttachments.map((attachment) => (
                                                <span
                                                    key={attachment.id}
                                                    className={styles.aiAttachedFileChip}
                                                >
                                                    <Paperclip size={11} aria-hidden="true" />
                                                    <span className={styles.aiAttachedFileName}>
                                                        {attachment.name}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        aria-label={`Remove ${attachment.name}`}
                                                        title={`Remove ${attachment.name}`}
                                                        onClick={() => removeStarterAttachment(attachment.id)}
                                                        className={styles.aiAttachedFileRemove}
                                                    >
                                                        <X size={11} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    <input
                                        ref={starterFileInputRef}
                                        type="file"
                                        multiple
                                        accept=".txt,.md,.csv,.json,.html,.css,.js,.jsx,.ts,.tsx,.xml,.yaml,.yml,text/*,application/json,application/xml"
                                        onChange={(event) => {
                                            void addStarterAttachments(event.target.files);
                                        }}
                                        style={{ display: "none" }}
                                    />

                                    <div className={styles.aiComposerToolbar}>
                                        <div className={styles.aiComposerTools}>
                                            <button
                                                type="button"
                                                onClick={openStarterFilePicker}
                                                aria-label="Attach files"
                                                title="Attach files"
                                                className={styles.aiComposerIcon}
                                            >
                                                <Paperclip size={15} />
                                            </button>

                                        </div>

                                        <button
                                            type="button"
                                            className={styles.promptSendButton}
                                            onClick={() => void buildWorkflowWithAI()}
                                            disabled={(!aiPrompt.trim() && starterAttachments.length === 0) || isAiBuilding}
                                            aria-label="Send message"
                                        >
                                            {isAiBuilding
                                                ? <span className={styles.loadingDot} />
                                                : <ArrowUp size={16} />}
                                        </button>
                                    </div>
                                </div>

                                <p className={styles.aiDisclaimer}>
                                    AI can make mistakes. Please review workflow changes before publishing.
                                </p>
                            </div>
                        </aside>

                        <section className={styles.previewPanel}>
                            <div className={styles.previewHeader}>
                                <div>
                                    <span>WORKFLOW CANVAS</span>
                                    <h2>Your automation</h2>
                                </div>

                                <div className={styles.previewActions}>
                                    <button
                                        type="button"
                                        className={styles.iconButton}
                                        aria-label="Recenter workflow"
                                        title="Recenter workflow"
                                        onClick={recenterWorkflow}
                                    >
                                        <Maximize2 size={14} />
                                    </button>
                                </div>
                            </div>

                            <div className={styles.workflowToolbar}>
                                <button
                                    type="button"
                                    className={styles.workflowToolbarButton}
                                    onClick={() => {
                                        const triggerDefinition = triggerDefinitions[0];
                                        addNode("trigger", null, triggerDefinition?.id);
                                    }}
                                >
                                    <Zap size={12} />
                                    Trigger
                                </button>
                                <button
                                    type="button"
                                    className={styles.workflowToolbarButton}
                                    onClick={() => addNode("action", selectedNodeId || null)}
                                >
                                    <Tag size={12} />
                                    Action
                                </button>
                                <button
                                    type="button"
                                    className={styles.workflowToolbarButton}
                                    onClick={() => addNode("condition", selectedNodeId || null)}
                                >
                                    <GitBranch size={12} />
                                    Condition
                                </button>
                                <button
                                    type="button"
                                    className={styles.workflowToolbarButton}
                                    onClick={() => addNode("delay", selectedNodeId || null)}
                                >
                                    <Clock3 size={12} />
                                    Wait
                                </button>
                                <button
                                    type="button"
                                    className={styles.workflowToolbarButton}
                                    onClick={() => {
                                        setAddFromNodeId(selectedNodeId || workflow.nodes[workflow.nodes.length - 1]?.id || null);
                                        setInspectorOpen(false);
                                        setLibraryOpen(true);
                                    }}
                                >
                                    <Plus size={12} />
                                    More
                                </button>
                            </div>

                            <div className={styles.toolsRail}>
                                <div className={styles.toolsRailLabel}>
                                    <Plug size={12} />
                                    <span>Tools</span>
                                </div>

                                <div className={styles.toolsRailItems}>
                                    {workflowTools.length > 0 ? (
                                        workflowTools.map((tool) => (
                                            <span
                                                key={tool.id}
                                                className={styles.toolPill}
                                                title={tool.description || tool.name}
                                            >
                                                <span className={styles.toolPillLogoWrap}>
                                                    {tool.iconUrl ? (
                                                        <img
                                                            src={tool.iconUrl}
                                                            alt={`${tool.name} logo`}
                                                            className={styles.toolPillLogo}
                                                        />
                                                    ) : (
                                                        <span
                                                            className={styles.toolPillFallback}
                                                            aria-label={tool.name}
                                                        >
                                                            {tool.name
                                                                .trim()
                                                                .charAt(0)
                                                                .toUpperCase()}
                                                        </span>
                                                    )}
                                                </span>
                                                {tool.name}
                                            </span>
                                        ))
                                    ) : (
                                        <span className={styles.noToolsText}>
                                            No connected tools used yet
                                        </span>
                                    )}

                                    <button
                                        type="button"
                                        className={styles.addToolButton}
                                        onClick={() => {
                                            setAddFromNodeId(
                                                workflow.nodes[
                                                    workflow.nodes.length - 1
                                                ]?.id ?? null,
                                            );
                                            setLibrarySearch("");
                                            setInspectorOpen(false);
                                            setLibraryOpen(true);
                                        }}
                                    >
                                        <Plus size={11} />
                                        Add tool
                                    </button>
                                </div>
                            </div>

                            <div className={styles.previewBody}>
                                <div
                                    ref={canvasShellRef}
                                    className={styles.canvasShell}
                                    onWheel={(event) => {
                                        const shell = canvasShellRef.current;
                                        if (!shell) return;

                                        if (event.shiftKey) {
                                            shell.scrollLeft += event.deltaY;
                                            return;
                                        }

                                        shell.scrollTop += event.deltaY;
                                        shell.scrollLeft += event.deltaX;
                                    }}
                                >
                                    <div
                                        className={styles.canvasViewport}
                                        style={{
                                            width: CANVAS_WIDTH * zoom,
                                            height: CANVAS_HEIGHT * zoom,
                                            backgroundColor: "#ffffff",
                                            backgroundImage:
                                                "radial-gradient(circle, rgba(148, 163, 184, 0.28) 1px, transparent 1px)",
                                            backgroundSize: "20px 20px",
                                        }}
                                    >
                                        <div
                                            ref={canvasRef}
                                            className={`${styles.canvas} ${isDragging ? styles.canvasDragging : ""
                                                } ${isPanning ? styles.canvasPanning : ""}`}
                                            style={{
                                                transform: `scale(${zoom})`,
                                                backgroundColor: "transparent",
                                                backgroundImage: "none",
                                            }}
                                            onPointerDown={handleCanvasPointerDown}
                                            onPointerMove={handleCanvasPointerMove}
                                            onPointerUp={handleCanvasPointerUp}
                                            onPointerCancel={handleCanvasPointerUp}
                                        >
                                            {workflow.nodes.length === 0 && (
                                                <div className={styles.emptyWorkflowState}>
                                                    <span className={styles.emptyWorkflowIcon}>
                                                        <Sparkles size={22} />
                                                    </span>
                                                    <strong>Your workflow will appear here</strong>
                                                    <p>
                                                        Describe an automation in the AI assistant on the left and it will appear here.
                                                    </p>

                                                </div>
                                            )}

                                            <svg
                                                className={styles.connections}
                                                viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
                                                preserveAspectRatio="none"
                                                aria-hidden="true"
                                            >
                                                {connections.map((connection) => {
                                                    const { fromNode, toNode } = connection;
                                                    const fromX = fromNode.position.x + NODE_WIDTH / 2;
                                                    const fromY = fromNode.position.y + NODE_HEIGHT;
                                                    const toX = toNode.position.x + NODE_WIDTH / 2;
                                                    const toY = toNode.position.y;
                                                    const curve = Math.max(70, Math.abs(toY - fromY) * 0.45);
                                                    const direction = toY >= fromY ? 1 : -1;

                                                    const branchLabel =
                                                        fromNode.type === "condition"
                                                            ? getConditionBranch(connection.id)
                                                            : null;
                                                    const labelX = fromX + (toX - fromX) * 0.5;
                                                    const labelY = fromY + (toY - fromY) * 0.32;

                                                    return (
                                                        <g key={connection.id}>
                                                            <path
                                                                className={
                                                                    branchLabel === "YES"
                                                                        ? styles.branchPathYes
                                                                        : branchLabel === "NO"
                                                                            ? styles.branchPathNo
                                                                            : undefined
                                                                }
                                                                d={`M ${fromX} ${fromY} C ${fromX} ${fromY + curve * direction
                                                                    }, ${toX} ${toY - curve * direction
                                                                    }, ${toX} ${toY}`}
                                                            />
                                                            {branchLabel && (
                                                                <g
                                                                    className={
                                                                        branchLabel === "YES"
                                                                            ? styles.branchBadgeYes
                                                                            : styles.branchBadgeNo
                                                                    }
                                                                >
                                                                    <rect
                                                                        x={labelX - 21}
                                                                        y={labelY - 11}
                                                                        width="42"
                                                                        height="22"
                                                                        rx="8"
                                                                    />
                                                                    <text
                                                                        x={labelX}
                                                                        y={labelY + 3.5}
                                                                        textAnchor="middle"
                                                                    >
                                                                        {branchLabel}
                                                                    </text>
                                                                </g>
                                                            )}
                                                        </g>
                                                    );
                                                })}
                                            </svg>

                                            {workflow.nodes.map((node, index) => {
                                                const Icon = iconByType[node.type];
                                                const integration = integrationForNode(node);
                                                const displayCopy = nodeDisplayCopy(node, integration);
                                                const selected = selectedNodeId === node.id;
                                                const nodeIssues = validateWorkflowNode(node);
                                                const hasWarning = node.status === "warning" || nodeIssues.length > 0;

                                                return (
                                                    <div
                                                        key={node.id}
                                                        className={styles.nodeWrapper}
                                                        style={{
                                                            left: node.position.x,
                                                            top: node.position.y,
                                                        }}
                                                    >
                                                        <button
                                                            type="button"
                                                            className={`${styles.workflowNode} ${selected ? styles.workflowNodeSelected : ""
                                                                } ${node.type === "condition" ? styles.conditionNode : ""}`}
                                                            onClick={() => editNode(node.id)}
                                                            onPointerDown={(event) =>
                                                                handleDragPointerDown(event, node)
                                                            }
                                                            onPointerMove={handleDragPointerMove}
                                                            onPointerUp={handleDragPointerUp}
                                                            onPointerCancel={handleDragPointerUp}
                                                        >
                                                            <span className={styles.dragHandle}>
                                                                <GripVertical size={13} />
                                                            </span>
                                                            <span className={styles.stepNumber}>{index + 1}</span>
                                                            <span
                                                                className={`${styles.nodeIcon} ${styles[node.type]} ${integration ? styles.integrationNodeIcon : ""
                                                                    }`}
                                                            >
                                                                {integration && /slack/i.test(`${integration.id} ${integration.name}`) ? (
                                                                    <SlackLogo />
                                                                ) : integration?.iconUrl ? (
                                                                    <img
                                                                        src={integration.iconUrl}
                                                                        alt={`${integration.name} logo`}
                                                                        className={styles.integrationLogo}
                                                                    />
                                                                ) : integration ? (
                                                                    <span
                                                                        className={styles.integrationFallback}
                                                                        aria-label={integration.name}
                                                                    >
                                                                        {integration.name
                                                                            .trim()
                                                                            .charAt(0)
                                                                            .toUpperCase()}
                                                                    </span>
                                                                ) : (
                                                                    <Icon size={14} />
                                                                )}
                                                            </span>
                                                            <span className={styles.nodeCopy}>
                                                                <small>{nodeDisplayLabel(node)}</small>
                                                                <strong title={displayCopy.title}>
                                                                    {displayCopy.title}
                                                                </strong>
                                                                {displayCopy.subtitle && (
                                                                    <span
                                                                        className={styles.nodeDescription}
                                                                        title={displayCopy.subtitle}
                                                                    >
                                                                        {displayCopy.subtitle}
                                                                    </span>
                                                                )}
                                                            </span>
                                                            <span
                                                                className={
                                                                    hasWarning
                                                                        ? styles.nodeWarning
                                                                        : styles.nodeReady
                                                                }
                                                                title={nodeIssues.join(" ") || node.warningText || "Configure step"}
                                                            >
                                                                {hasWarning ? (
                                                                    <AlertCircle size={12} />
                                                                ) : (
                                                                    <MoreHorizontal size={15} />
                                                                )}
                                                            </span>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            className={styles.addChildButton}
                                                            aria-label={`Add next step after ${node.title}`}
                                                            onPointerDown={(event) => event.stopPropagation()}
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                setSelectedNodeId(node.id);
                                                                setAddFromNodeId(node.id);
                                                                setInspectorOpen(false);
                                                                setLibraryOpen(true);
                                                            }}
                                                        >
                                                            <Plus size={12} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.canvasControls}>
                                    <button
                                        type="button"
                                        aria-label="Recenter workflow"
                                        title="Recenter workflow"
                                        onClick={recenterWorkflow}
                                    >
                                        <Maximize2 size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label="Zoom out"
                                        onClick={() =>
                                            setZoom((current) =>
                                                Math.max(0.7, Math.round((current - 0.1) * 10) / 10),
                                            )
                                        }
                                    >
                                        <Minus size={13} />
                                    </button>
                                    <span>{Math.round(zoom * 100)}%</span>
                                    <button
                                        type="button"
                                        aria-label="Zoom in"
                                        onClick={() =>
                                            setZoom((current) =>
                                                Math.min(1.3, Math.round((current + 0.1) * 10) / 10),
                                            )
                                        }
                                    >
                                        <Plus size={13} />
                                    </button>
                                </div>

                                {libraryOpen && (
                                    <div className={styles.drawerBackdrop} onMouseDown={() => setLibraryOpen(false)}>
                                        <aside className={styles.stepDrawer} onMouseDown={(event) => event.stopPropagation()}>
                                            <div className={styles.drawerHeader}>
                                                <div>
                                                    <span>ADD STEP</span>
                                                    <h3>Choose a step</h3>
                                                </div>
                                                <button
                                                    type="button"
                                                    className={styles.iconButton}
                                                    aria-label="Close step library"
                                                    onClick={() => setLibraryOpen(false)}
                                                >
                                                    <X size={15} />
                                                </button>
                                            </div>

                                            <label className={styles.stepLibrarySearch}>
                                                <Search size={14} />
                                                <input
                                                    value={librarySearch}
                                                    onChange={(event) => setLibrarySearch(event.target.value)}
                                                    placeholder="Search steps..."
                                                    autoFocus
                                                />
                                            </label>

                                            <div className={styles.stepLibraryCompact}>
                                                {filteredNodeLibrary.map((item) => {
                                                    const Icon = iconByType[item.type];

                                                    return (
                                                        <button
                                                            type="button"
                                                            key={item.id}
                                                            className={styles.stepLibraryItem}
                                                            onClick={() => {
                                                                addNode(item.type, addFromNodeId, item.id);
                                                                setLibraryOpen(false);
                                                            }}
                                                        >
                                                            <span className={`${styles.libraryIcon} ${styles[item.type]}`}>
                                                                <Icon size={14} />
                                                            </span>
                                                            <span>
                                                                <strong>{item.title}</strong>
                                                                <small>{item.description}</small>
                                                            </span>
                                                            <Plus size={13} />
                                                        </button>
                                                    );
                                                })}

                                                {filteredAvailableIntegrations.map((integration) => (
                                                    <button
                                                        type="button"
                                                        key={integration.id}
                                                        className={styles.stepLibraryItem}
                                                        onClick={() => {
                                                            addIntegrationNode(integration);
                                                            setLibraryOpen(false);
                                                        }}
                                                    >
                                                        <span
                                                            className={`${styles.libraryIcon} ${styles.action} ${styles.integrationNodeIcon}`}
                                                        >
                                                            {integration.iconUrl ? (
                                                                <img
                                                                    src={integration.iconUrl}
                                                                    alt={`${integration.name} logo`}
                                                                    className={styles.integrationLogo}
                                                                />
                                                            ) : (
                                                                <span
                                                                    className={styles.integrationFallback}
                                                                    aria-label={integration.name}
                                                                >
                                                                    {integration.name
                                                                        .trim()
                                                                        .charAt(0)
                                                                        .toUpperCase()}
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span>
                                                            <strong>{integration.name}</strong>
                                                            <small>
                                                                {integration.connected
                                                                    ? integration.description || "Run an integration action."
                                                                    : "Connect this integration first."}
                                                            </small>
                                                        </span>
                                                        {integration.connected ? (
                                                            <Plus size={13} />
                                                        ) : (
                                                            <span className={styles.connectLabel}>Connect</span>
                                                        )}
                                                    </button>
                                                ))}

                                                {filteredNodeLibrary.length === 0 &&
                                                    filteredAvailableIntegrations.length === 0 && (
                                                        <div className={styles.drawerEmpty}>No matching steps.</div>
                                                    )}
                                            </div>
                                        </aside>
                                    </div>
                                )}

                                {inspectorOpen && selectedNode && (
                                    <div
                                        className={styles.drawerBackdrop}
                                        onMouseDown={() => setInspectorOpen(false)}
                                    >
                                        <aside
                                            className={`${styles.settingsDrawer} ${styles.compactSettingsDrawer}`}
                                            onMouseDown={(event) => event.stopPropagation()}
                                        >
                                            <div className={styles.drawerHeader}>
                                                <div className={styles.settingsTitle}>
                                                    <span className={`${styles.inspectorNodeIcon} ${styles[selectedNode.type]}`}>
                                                        {(() => {
                                                            const Icon = iconByType[selectedNode.type];
                                                            return <Icon size={14} />;
                                                        })()}
                                                    </span>
                                                    <div>
                                                        <span>STEP TYPE</span>
                                                        <h3>{selectedNode.label}</h3>
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    className={styles.iconButton}
                                                    aria-label="Close settings"
                                                    onClick={() => setInspectorOpen(false)}
                                                >
                                                    <X size={15} />
                                                </button>
                                            </div>

                                            <div className={styles.settingsBody}>
                                                <div className={styles.stepOverviewCard}>
                                                    <label className={styles.field}>
                                                        <span>Step name</span>
                                                        <input
                                                            value={selectedNode.title}
                                                            onChange={(event) =>
                                                                updateSelectedNode({ title: event.target.value })
                                                            }
                                                        />
                                                    </label>
                                                </div>

                                                {selectedNode.type === "trigger" && (
                                                    <>
                                                        <label className={styles.field}>
                                                            <span>Trigger rule</span>
                                                            <select
                                                                value={selectedTriggerDefinition?.id ?? "__current__"}
                                                                onChange={(event) => {
                                                                    const definition = triggerDefinitions.find(
                                                                        (item) => item.id === event.target.value,
                                                                    );
                                                                    if (!definition) return;

                                                                    updateSelectedNode({
                                                                        title:
                                                                            definition.defaults?.title ??
                                                                            definition.title,
                                                                        description: definition.description,
                                                                        // Merged into the existing config, so the
                                                                        // audience is kept; clear the old trigger's
                                                                        // parameters before applying the new ones.
                                                                        config: {
                                                                            triggerTag: undefined,
                                                                            triggerDaysBefore: undefined,
                                                                            triggerEventName: undefined,
                                                                            ...(definition.defaults?.config ?? {}),
                                                                        },
                                                                    });
                                                                }}
                                                            >
                                                                {!selectedTriggerDefinition && (
                                                                    <option value="__current__">
                                                                        {selectedNode.config.condition || selectedNode.title}
                                                                    </option>
                                                                )}
                                                                {triggerDefinitions.map((item) => (
                                                                    <option key={item.id} value={item.id}>
                                                                        {item.title}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </label>

                                                        {selectedNode.config.triggerType === "tag_added" && (
                                                            <label className={styles.field}>
                                                                <span>Tag</span>
                                                                <input
                                                                    value={String(selectedNode.config.triggerTag ?? "")}
                                                                    placeholder="e.g. at-risk"
                                                                    onChange={(event) =>
                                                                        updateSelectedNode({
                                                                            config: { triggerTag: event.target.value },
                                                                        })
                                                                    }
                                                                />
                                                            </label>
                                                        )}

                                                        {selectedNode.config.triggerType === "renewal_upcoming" && (
                                                            <label className={styles.field}>
                                                                <span>Days before renewal</span>
                                                                <input
                                                                    type="number"
                                                                    min={1}
                                                                    max={365}
                                                                    value={String(selectedNode.config.triggerDaysBefore ?? "")}
                                                                    onChange={(event) =>
                                                                        updateSelectedNode({
                                                                            config: {
                                                                                triggerDaysBefore:
                                                                                    event.target.value === ""
                                                                                        ? undefined
                                                                                        : Number(event.target.value),
                                                                            },
                                                                        })
                                                                    }
                                                                />
                                                            </label>
                                                        )}

                                                        {selectedNode.config.triggerType === "custom_event" && (
                                                            <label className={styles.field}>
                                                                <span>Event name</span>
                                                                <input
                                                                    value={String(selectedNode.config.triggerEventName ?? "")}
                                                                    placeholder="e.g. payment_failed"
                                                                    onChange={(event) =>
                                                                        updateSelectedNode({
                                                                            config: { triggerEventName: event.target.value },
                                                                        })
                                                                    }
                                                                />
                                                                <small>
                                                                    Send it from Zapier or your app with POST /api/automations/events
                                                                    and the contact&apos;s email.
                                                                </small>
                                                            </label>
                                                        )}

                                                        <div className={styles.settingsSection}>
                                                            <div className={styles.settingsSectionHeading}>
                                                                <Users size={14} />
                                                                <div>
                                                                    <strong>Who enters this workflow?</strong>
                                                                    <small>Choose who should be enrolled.</small>
                                                                </div>
                                                            </div>

                                                            <div className={styles.segmentedStack}>
                                                                {(
                                                                    [
                                                                        ["all", "All accounts", "Every matching account"],
                                                                        ["conditions", "Matching conditions", "Only accounts matching rules"],
                                                                        ["specific", "Specific accounts", "Choose accounts manually"],
                                                                    ] as const
                                                                ).map(([mode, label, help]) => (
                                                                    <button
                                                                        type="button"
                                                                        key={mode}
                                                                        className={`${styles.segmentOption} ${selectedAudience.mode === mode
                                                                            ? styles.segmentOptionActive
                                                                            : ""
                                                                            }`}
                                                                        onClick={() => updateAudience({ mode })}
                                                                    >
                                                                        <span>
                                                                            <strong>{label}</strong>
                                                                            <small>{help}</small>
                                                                        </span>
                                                                        <span className={styles.radioMark} />
                                                                    </button>
                                                                ))}
                                                            </div>

                                                            {selectedAudience.mode === "conditions" && (
                                                                <div className={styles.conditionalArea}>
                                                                    <div className={styles.ruleToolbar}>
                                                                        <strong>Enrollment conditions</strong>
                                                                        <select
                                                                            value={selectedAudience.matchMode}
                                                                            onChange={(event) =>
                                                                                updateAudience({
                                                                                    matchMode:
                                                                                        event.target.value as AudienceMatchMode,
                                                                                })
                                                                            }
                                                                        >
                                                                            <option value="all">Match all</option>
                                                                            <option value="any">Match any</option>
                                                                        </select>
                                                                    </div>

                                                                    {selectedAudience.rules.map((rule) => {
                                                                        const field = audienceFields.find(
                                                                            (item) => item.key === rule.field,
                                                                        );
                                                                        const operators = operatorOptions(field?.sample);
                                                                        const booleanOperator =
                                                                            rule.operator === "is_true" ||
                                                                            rule.operator === "is_false";

                                                                        return (
                                                                            <div className={styles.ruleRow} key={rule.id}>
                                                                                <select
                                                                                    value={rule.field}
                                                                                    onChange={(event) => {
                                                                                        const nextField =
                                                                                            audienceFields.find(
                                                                                                (item) =>
                                                                                                    item.key ===
                                                                                                    event.target.value,
                                                                                            );
                                                                                        updateAudienceRule(rule.id, {
                                                                                            field: event.target.value,
                                                                                            operator:
                                                                                                operatorOptions(
                                                                                                    nextField?.sample,
                                                                                                )[0]?.value ?? "equals",
                                                                                            value: "",
                                                                                        });
                                                                                    }}
                                                                                >
                                                                                    {audienceFields.map((item) => (
                                                                                        <option key={item.key} value={item.key}>
                                                                                            {item.label}
                                                                                        </option>
                                                                                    ))}
                                                                                </select>

                                                                                <select
                                                                                    value={rule.operator}
                                                                                    onChange={(event) =>
                                                                                        updateAudienceRule(rule.id, {
                                                                                            operator:
                                                                                                event.target
                                                                                                    .value as AudienceOperator,
                                                                                            value: "",
                                                                                        })
                                                                                    }
                                                                                >
                                                                                    {operators.map((operator) => (
                                                                                        <option
                                                                                            key={operator.value}
                                                                                            value={operator.value}
                                                                                        >
                                                                                            {operator.label}
                                                                                        </option>
                                                                                    ))}
                                                                                </select>

                                                                                {!booleanOperator && (
                                                                                    <input
                                                                                        type={
                                                                                            typeof field?.sample === "number"
                                                                                                ? "number"
                                                                                                : "text"
                                                                                        }
                                                                                        value={rule.value}
                                                                                        onChange={(event) =>
                                                                                            updateAudienceRule(rule.id, {
                                                                                                value: event.target.value,
                                                                                            })
                                                                                        }
                                                                                        placeholder="Value"
                                                                                    />
                                                                                )}

                                                                                <button
                                                                                    type="button"
                                                                                    className={styles.ruleDeleteButton}
                                                                                    onClick={() => removeAudienceRule(rule.id)}
                                                                                >
                                                                                    <Trash2 size={13} />
                                                                                </button>
                                                                            </div>
                                                                        );
                                                                    })}

                                                                    <button
                                                                        type="button"
                                                                        className={styles.addRuleButton}
                                                                        onClick={addAudienceRule}
                                                                        disabled={
                                                                            audienceLoading ||
                                                                            audienceFields.length === 0
                                                                        }
                                                                    >
                                                                        <Plus size={13} />
                                                                        Add condition
                                                                    </button>
                                                                </div>
                                                            )}

                                                            {selectedAudience.mode === "specific" && (
                                                                <div className={styles.specificAccounts}>
                                                                    <input
                                                                        className={styles.accountSearch}
                                                                        value={audienceSearch}
                                                                        onChange={(event) =>
                                                                            setAudienceSearch(event.target.value)
                                                                        }
                                                                        placeholder="Search accounts..."
                                                                    />

                                                                    <div className={styles.accountList}>
                                                                        {audienceLoading ? (
                                                                            <div className={styles.accountListMessage}>
                                                                                Loading accounts...
                                                                            </div>
                                                                        ) : filteredAudienceAccounts.length === 0 ? (
                                                                            <div className={styles.accountListMessage}>
                                                                                No accounts found.
                                                                            </div>
                                                                        ) : (
                                                                            filteredAudienceAccounts.map((account, index) => {
                                                                                const id = accountIdentity(account, index);
                                                                                const label = accountDisplayName(account, index);

                                                                                return (
                                                                                    <label
                                                                                        key={id}
                                                                                        className={styles.accountOption}
                                                                                    >
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={selectedAudience.accountIds.includes(id)}
                                                                                            onChange={() => toggleSpecificAccount(id)}
                                                                                        />
                                                                                        <span>{label}</span>
                                                                                    </label>
                                                                                );
                                                                            })
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <div className={styles.audienceSummary}>
                                                                <span>Estimated audience</span>
                                                                <strong>
                                                                    {audienceLoading
                                                                        ? "—"
                                                                        : estimatedAudience.toLocaleString("en-GB")}
                                                                </strong>
                                                            </div>

                                                            <label className={styles.toggleRow}>
                                                                <span>
                                                                    <strong>Allow re-enrollment</strong>
                                                                    <small>
                                                                        Accounts can enter again after completion.
                                                                    </small>
                                                                </span>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedAudience.allowReentry}
                                                                    onChange={(event) =>
                                                                        updateAudience({
                                                                            allowReentry: event.target.checked,
                                                                        })
                                                                    }
                                                                />
                                                            </label>
                                                        </div>
                                                    </>
                                                )}

                                                {selectedNode.type === "email" && (
                                                    <>
                                                        <label className={styles.field}>
                                                            <span>Sending account</span>
                                                            <select
                                                                value={selectedNode.config.sendingAccount ?? "primary"}
                                                                onChange={(event) =>
                                                                    updateSelectedNode({
                                                                        config: {
                                                                            sendingAccount: event.target.value,
                                                                        },
                                                                    })
                                                                }
                                                            >
                                                                <option value="primary">
                                                                    Primary sending account
                                                                </option>
                                                            </select>
                                                        </label>

                                                        <label className={styles.field}>
                                                            <span>Subject</span>
                                                            <input
                                                                value={selectedNode.config.subject ?? ""}
                                                                onChange={(event) =>
                                                                    updateSelectedNode({
                                                                        config: {
                                                                            subject: event.target.value,
                                                                        },
                                                                    })
                                                                }
                                                                placeholder="Email subject"
                                                            />
                                                        </label>

                                                        <div className={styles.field}>
                                                            <span>Message</span>
                                                            <div className={styles.emailEditorShell}>
                                                                <div
                                                                    key={selectedNode.id}
                                                                    ref={emailEditorRef}
                                                                    className={styles.emailEditor}
                                                                    contentEditable
                                                                    suppressContentEditableWarning
                                                                    data-placeholder="Write your email..."
                                                                    onInput={(event) => {
                                                                        updateSelectedNode({
                                                                            config: {
                                                                                body: event.currentTarget.innerHTML,
                                                                            },
                                                                        });
                                                                        rememberEmailEditorSelection();
                                                                    }}
                                                                    onKeyUp={rememberEmailEditorSelection}
                                                                    onMouseUp={rememberEmailEditorSelection}
                                                                    onFocus={rememberEmailEditorSelection}
                                                                    onBlur={syncEmailEditorBody}
                                                                />

                                                                <div
                                                                    className={styles.emailEditorToolbar}
                                                                    role="toolbar"
                                                                    aria-label="Email formatting"
                                                                >
                                                                    <button
                                                                        type="button"
                                                                        onMouseDown={(event) => {
                                                                            event.preventDefault();
                                                                            rememberEmailEditorSelection();
                                                                        }}
                                                                        onClick={() => runEmailEditorCommand("bold")}
                                                                        title="Bold"
                                                                        aria-label="Bold"
                                                                        aria-pressed={emailEditorFormats.bold}
                                                                        className={
                                                                            emailEditorFormats.bold
                                                                                ? styles.emailToolbarButtonActive
                                                                                : undefined
                                                                        }
                                                                    >
                                                                        <Bold size={14} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onMouseDown={(event) => {
                                                                            event.preventDefault();
                                                                            rememberEmailEditorSelection();
                                                                        }}
                                                                        onClick={() => runEmailEditorCommand("italic")}
                                                                        title="Italic"
                                                                        aria-label="Italic"
                                                                        aria-pressed={emailEditorFormats.italic}
                                                                        className={
                                                                            emailEditorFormats.italic
                                                                                ? styles.emailToolbarButtonActive
                                                                                : undefined
                                                                        }
                                                                    >
                                                                        <Italic size={14} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onMouseDown={(event) => {
                                                                            event.preventDefault();
                                                                            rememberEmailEditorSelection();
                                                                        }}
                                                                        onClick={() => runEmailEditorCommand("underline")}
                                                                        title="Underline"
                                                                        aria-label="Underline"
                                                                        aria-pressed={emailEditorFormats.underline}
                                                                        className={
                                                                            emailEditorFormats.underline
                                                                                ? styles.emailToolbarButtonActive
                                                                                : undefined
                                                                        }
                                                                    >
                                                                        <Underline size={14} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onMouseDown={(event) => {
                                                                            event.preventDefault();
                                                                            rememberEmailEditorSelection();
                                                                        }}
                                                                        onClick={() => runEmailEditorCommand("strikeThrough")}
                                                                        title="Strikethrough"
                                                                        aria-label="Strikethrough"
                                                                        aria-pressed={emailEditorFormats.strikeThrough}
                                                                        className={
                                                                            emailEditorFormats.strikeThrough
                                                                                ? styles.emailToolbarButtonActive
                                                                                : undefined
                                                                        }
                                                                    >
                                                                        <Strikethrough size={14} />
                                                                    </button>

                                                                    <span className={styles.emailToolbarDivider} />

                                                                    <button
                                                                        type="button"
                                                                        onMouseDown={(event) => {
                                                                            event.preventDefault();
                                                                            rememberEmailEditorSelection();
                                                                        }}
                                                                        onClick={() => runEmailEditorCommand("justifyLeft")}
                                                                        title="Align left"
                                                                        aria-label="Align left"
                                                                        aria-pressed={emailEditorFormats.justifyLeft}
                                                                        className={
                                                                            emailEditorFormats.justifyLeft
                                                                                ? styles.emailToolbarButtonActive
                                                                                : undefined
                                                                        }
                                                                    >
                                                                        <AlignLeft size={14} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onMouseDown={(event) => {
                                                                            event.preventDefault();
                                                                            rememberEmailEditorSelection();
                                                                        }}
                                                                        onClick={() => runEmailEditorCommand("justifyCenter")}
                                                                        title="Align center"
                                                                        aria-label="Align center"
                                                                        aria-pressed={emailEditorFormats.justifyCenter}
                                                                        className={
                                                                            emailEditorFormats.justifyCenter
                                                                                ? styles.emailToolbarButtonActive
                                                                                : undefined
                                                                        }
                                                                    >
                                                                        <AlignCenter size={14} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onMouseDown={(event) => {
                                                                            event.preventDefault();
                                                                            rememberEmailEditorSelection();
                                                                        }}
                                                                        onClick={() => runEmailEditorCommand("justifyRight")}
                                                                        title="Align right"
                                                                        aria-label="Align right"
                                                                        aria-pressed={emailEditorFormats.justifyRight}
                                                                        className={
                                                                            emailEditorFormats.justifyRight
                                                                                ? styles.emailToolbarButtonActive
                                                                                : undefined
                                                                        }
                                                                    >
                                                                        <AlignRight size={14} />
                                                                    </button>

                                                                    <span className={styles.emailToolbarDivider} />

                                                                    <button
                                                                        type="button"
                                                                        onMouseDown={(event) => {
                                                                            event.preventDefault();
                                                                            rememberEmailEditorSelection();
                                                                        }}
                                                                        onClick={() => runEmailEditorCommand("insertUnorderedList")}
                                                                        title="Bulleted list"
                                                                        aria-label="Bulleted list"
                                                                        aria-pressed={emailEditorFormats.insertUnorderedList}
                                                                        className={
                                                                            emailEditorFormats.insertUnorderedList
                                                                                ? styles.emailToolbarButtonActive
                                                                                : undefined
                                                                        }
                                                                    >
                                                                        <List size={14} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onMouseDown={(event) => {
                                                                            event.preventDefault();
                                                                            rememberEmailEditorSelection();
                                                                        }}
                                                                        onClick={() => runEmailEditorCommand("insertOrderedList")}
                                                                        title="Numbered list"
                                                                        aria-label="Numbered list"
                                                                        aria-pressed={emailEditorFormats.insertOrderedList}
                                                                        className={
                                                                            emailEditorFormats.insertOrderedList
                                                                                ? styles.emailToolbarButtonActive
                                                                                : undefined
                                                                        }
                                                                    >
                                                                        <ListOrdered size={14} />
                                                                    </button>
                                                                    <button
                                                                        disabled={isSavingInspector}
                                                                        aria-busy={isSavingInspector}
                                                                        type="button"
                                                                        onMouseDown={(event) => {
                                                                            event.preventDefault();
                                                                            rememberEmailEditorSelection();
                                                                        }}
                                                                        onClick={addEmailEditorLink}
                                                                        title="Add link"
                                                                        aria-label="Add link"
                                                                        aria-pressed={emailEditorFormats.createLink}
                                                                        className={
                                                                            emailEditorFormats.createLink
                                                                                ? styles.emailToolbarButtonActive
                                                                                : undefined
                                                                        }
                                                                    >
                                                                        <Link2 size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </>
                                                )}

                                                {selectedNode.type === "delay" && (
                                                    <div className={styles.inlineFields}>
                                                        <label className={styles.field}>
                                                            <span>Wait for</span>
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                value={selectedNode.config.delayValue ?? 1}
                                                                onChange={(event) =>
                                                                    updateSelectedNode({
                                                                        config: {
                                                                            delayValue: Math.max(
                                                                                1,
                                                                                Number(event.target.value) || 1,
                                                                            ),
                                                                        },
                                                                    })
                                                                }
                                                            />
                                                        </label>

                                                        <label className={styles.field}>
                                                            <span>Unit</span>
                                                            <select
                                                                value={selectedNode.config.delayUnit ?? "days"}
                                                                onChange={(event) =>
                                                                    updateSelectedNode({
                                                                        config: {
                                                                            delayUnit:
                                                                                event.target.value as DelayUnit,
                                                                        },
                                                                    })
                                                                }
                                                            >
                                                                <option value="minutes">Minutes</option>
                                                                <option value="hours">Hours</option>
                                                                <option value="days">Days</option>
                                                            </select>
                                                        </label>
                                                    </div>
                                                )}

                                                {selectedNode.type === "condition" && (
                                                    <>
                                                        <label className={styles.field}>
                                                            <span>Condition</span>
                                                            <select
                                                                value={selectedNode.config.conditionRules?.length ? "__structured__" : selectedNode.config.condition ?? ""}
                                                                onChange={(event) => updateSelectedNode({
                                                                    config: { condition: event.target.value, conditionRules: undefined, conditionMatch: undefined },
                                                                })}
                                                            >
                                                                {selectedNode.config.conditionRules?.length ? <option value="__structured__">Existing custom rules</option> : null}
                                                                {!selectedNode.config.conditionRules?.length && !EMAIL_EVENT_CONDITIONS.some((value) => value === selectedNode.config.condition) && (
                                                                    <option value={selectedNode.config.condition ?? ""} disabled>Choose a supported condition</option>
                                                                )}
                                                                {EMAIL_EVENT_CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
                                                            </select>
                                                        </label>
                                                        {!selectedNode.config.conditionRules?.length && (
                                                            <label className={styles.field}>
                                                                <span>Email step to check</span>
                                                                <select
                                                                    value={selectedNode.config.sourceEmailNodeId ?? ""}
                                                                    onChange={(event) => updateSelectedNode({ config: { sourceEmailNodeId: event.target.value } })}
                                                                >
                                                                    <option value="">Choose an earlier email step</option>
                                                                    {getUpstreamEmailNodes(workflow, selectedNode.id).map((email) => <option key={email.id} value={email.id}>{email.title}</option>)}
                                                                </select>
                                                                <small className={styles.nodeEditorHint}>Checks events from this email only. Both YES and NO paths need a connected step.</small>
                                                            </label>
                                                        )}
                                                    </>
                                                )}

                                                {selectedNode.type === "action" && (
                                                    <>
                                                        <label className={styles.field}>
                                                            <span>Action</span>
                                                            <select
                                                                value={selectedNode.config.actionType ?? ""}
                                                                onChange={(event) => {
                                                                    const definition = actionDefinitions.find((item) => (item.defaults?.config?.actionType ?? item.title) === event.target.value);
                                                                    updateSelectedNode({
                                                                        title: definition?.defaults?.title ?? definition?.title ?? selectedNode.title,
                                                                        description: definition?.description ?? selectedNode.description,
                                                                        config: { actionType: event.target.value, actionValue: "", integrationId: undefined },
                                                                    });
                                                                }}
                                                            >
                                                                {!actionDefinitions.some((item) => (item.defaults?.config?.actionType ?? item.title) === selectedNode.config.actionType) && (
                                                                    <option value={selectedNode.config.actionType ?? ""} disabled>
                                                                        {selectedNode.config.actionType ? `${selectedNode.title} — not supported yet` : "Choose an action"}
                                                                    </option>
                                                                )}
                                                                {actionDefinitions.map((item) => <option key={item.id} value={item.defaults?.config?.actionType ?? item.title}>{item.title}</option>)}
                                                            </select>
                                                        </label>
                                                        {getAutomationActionCapability(selectedNode.config.actionType)?.requiresValue && (
                                                            <label className={styles.field}>
                                                                <span>Tag name</span>
                                                                <input
                                                                    value={selectedNode.config.actionValue ?? ""}
                                                                    onChange={(event) => updateSelectedNode({ config: { actionValue: event.target.value } })}
                                                                    placeholder="Enter the contact tag"
                                                                    required
                                                                />
                                                                <small className={styles.nodeEditorHint}>Adds this tag to the enrolled customer's record.</small>
                                                            </label>
                                                        )}
                                                    </>
                                                )}
                                                {validateWorkflowNode(selectedNode).length > 0 && (
                                                    <div className={styles.nodeEditorIssues} role="status">
                                                        <AlertCircle size={15} aria-hidden="true" />
                                                        <ul>{validateWorkflowNode(selectedNode).map((issue) => <li key={issue}>{issue}</li>)}</ul>
                                                    </div>
                                                )}
                                            </div>

                                            <div className={styles.drawerFooter}>
                                                <button
                                                    type="button"
                                                    className={styles.deleteButton}
                                                    onClick={() => {
                                                        deleteSelectedNode();
                                                        setInspectorOpen(false);
                                                    }}
                                                >
                                                    <Trash2 size={14} />
                                                    Delete step
                                                </button>

                                                <button
                                                    type="button"
                                                    className={styles.primaryButton}
                                                    onClick={async () => {
                                                        if (inspectorSavingRef.current) return;
                                                        inspectorSavingRef.current = true;
                                                        setIsSavingInspector(true);
                                                        try {
                                                            const saved = await persistWorkflow();
                                                            if (saved) setInspectorOpen(false);
                                                        } finally {
                                                            inspectorSavingRef.current = false;
                                                            setIsSavingInspector(false);
                                                        }
                                                    }}
                                                >
                                                    {isSavingInspector ? "Saving…" : "Save changes"}
                                                </button>
                                            </div>
                                        </aside>
                                    </div>
                                )}
                            </div>

                            <div className={styles.previewFooter}>
                                <p>Click a step to edit it. Use + to extend the workflow.</p>
                            </div>
                        </section>
                    </section>
                </div>
            </main>
        </>
    );
}
