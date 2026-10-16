"use client";

import {
    onAuthStateChanged,
    type User,
} from "firebase/auth";

import { auth } from "../firebase";

export type VersionedWorkflow<T> = T & {
    version?: number;
};

export class AutomationApiError extends Error {
    status: number;
    code?: string;

    constructor(
        message: string,
        status: number,
        code?: string,
    ) {
        super(message);

        this.name = "AutomationApiError";
        this.status = status;
        this.code = code;
    }
}

function waitForFirebaseUser() {
    const existingUser =
        auth.currentUser;

    if (existingUser) {
        return Promise.resolve(
            existingUser,
        );
    }

    return new Promise<User>(
        (
            resolve,
            reject,
        ) => {
            const unsubscribe =
                onAuthStateChanged(
                    auth,

                    (user) => {
                        unsubscribe();

                        if (user) {
                            resolve(user);
                            return;
                        }

                        reject(
                            new AutomationApiError(
                                "You must be signed in.",
                                401,
                                "AUTH_REQUIRED",
                            ),
                        );
                    },

                    (error) => {
                        unsubscribe();

                        reject(
                            new AutomationApiError(
                                error.message ||
                                "Unable to restore your authentication session.",
                                401,
                                "AUTH_REQUIRED",
                            ),
                        );
                    },
                );
        },
    );
}

async function getAuthenticatedHeaders(
    headers?: HeadersInit,
) {
    const result =
        new Headers(headers);

    const user =
        await waitForFirebaseUser();

    const idToken =
        await user.getIdToken();

    result.set(
        "Authorization",
        `Bearer ${idToken}`,
    );

    return result;
}

async function authenticatedFetch(
    input: RequestInfo | URL,
    init: RequestInit = {},
) {
    const headers =
        await getAuthenticatedHeaders(
            init.headers,
        );

    return fetch(
        input,
        {
            ...init,

            headers,

            credentials:
                "include",
        },
    );
}

async function jsonOrThrow(
    response: Response,
) {
    const payload: unknown =
        await response
            .json()
            .catch(
                () => ({}),
            );

    if (!response.ok) {
        const record =
            payload &&
                typeof payload ===
                "object"
                ? (
                    payload as Record<
                        string,
                        unknown
                    >
                )
                : {};

        throw new AutomationApiError(
            typeof record.error ===
                "string"
                ? record.error
                : "Automation request failed.",

            response.status,

            typeof record.code ===
                "string"
                ? record.code
                : undefined,
        );
    }

    return payload as Record<
        string,
        unknown
    >;
}

export async function getAutomation<T>(
    workspaceId: string,
    workflowId: string,
) {
    const response =
        await authenticatedFetch(
            `/api/email-agent/automations/${encodeURIComponent(
                workflowId,
            )}?workspaceId=${encodeURIComponent(
                workspaceId,
            )}`,
            {
                method: "GET",
                cache: "no-store",
            },
        );

    const payload =
        await jsonOrThrow(
            response,
        );

    return payload.workflow as
        VersionedWorkflow<T>;
}

export async function saveAutomation<
    T extends {
        id: string;
        name: string;
        description: string;
        status: string;
        nodes: unknown[];
        connections: unknown[];
    },
>(
    workspaceId: string,
    workflow:
        VersionedWorkflow<T>,
) {
    const response =
        await authenticatedFetch(
            `/api/email-agent/automations/${encodeURIComponent(
                workflow.id,
            )}`,
            {
                method: "PUT",

                headers: {
                    "Content-Type":
                        "application/json",
                },

                body:
                    JSON.stringify({
                        workspaceId,

                        name:
                            workflow.name,

                        description:
                            workflow.description,

                        status:
                            workflow.status,

                        nodes:
                            workflow.nodes,

                        connections:
                            workflow.connections,

                        version:
                            workflow.version,
                    }),
            },
        );

    const payload =
        await jsonOrThrow(
            response,
        );

    return payload.workflow as
        VersionedWorkflow<T>;
}

export async function executeAutomation({
    workspaceId,
    workflowId,
    customerId,
    context,
}: {
    workspaceId: string;
    workflowId: string;
    customerId?: string;
    context?: Record<
        string,
        unknown
    >;
}) {
    const response =
        await authenticatedFetch(
            `/api/email-agent/automations/${encodeURIComponent(
                workflowId,
            )}/execute`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "Idempotency-Key":
                        crypto.randomUUID(),
                },

                body:
                    JSON.stringify({
                        workspaceId,
                        customerId,
                        context,
                    }),
            },
        );

    return jsonOrThrow(
        response,
    );
}
export type AutomationRunStatus =
    | "queued"
    | "running"
    | "waiting"
    | "completed"
    | "failed"
    | "cancelled";

export type AutomationRunSummary = {
    id: string;
    status: AutomationRunStatus;
    currentNodeId: string | null;
    resumeAt: string | null;
    error: string | null;
    source: "test" | "trigger" | "manual";
    triggerType: string | null;
    startedAt: string;
    completedAt: string | null;
    createdAt: string;
    customer: { id: string; name: string; email: string; company: string } | null;
};

export type AutomationRunStep = {
    id: string;
    nodeId: string;
    nodeType: string;
    title: string;
    status: "pending" | "running" | "waiting" | "completed" | "skipped" | "failed";
    attempt: number;
    error: string | null;
    startedAt: string;
    completedAt: string | null;
    output: unknown;
};

export type AutomationRunDetail = Omit<AutomationRunSummary, "source" | "triggerType"> & {
    steps: AutomationRunStep[];
};

/** Archive an automation: hidden from the list, unfinished runs cancelled. */
export async function archiveAutomation(workflowId: string) {
    const response = await authenticatedFetch(
        `/api/email-agent/automations/${encodeURIComponent(workflowId)}`,
        { method: "DELETE" },
    );

    return jsonOrThrow(response) as Promise<{ archived: true; cancelledRuns: number }>;
}

export async function listAutomationRuns(workflowId: string, limit = 25) {
    const response = await authenticatedFetch(
        `/api/email-agent/automations/${encodeURIComponent(workflowId)}/runs?limit=${limit}`,
        { method: "GET", cache: "no-store" },
    );

    const payload = await jsonOrThrow(response);

    return {
        runs: (payload.runs ?? []) as AutomationRunSummary[],
        counts: (payload.counts ?? {}) as Partial<Record<AutomationRunStatus, number>>,
    };
}

export async function getAutomationRun(runId: string) {
    const response = await authenticatedFetch(
        `/api/email-agent/automation-runs/${encodeURIComponent(runId)}`,
        { method: "GET", cache: "no-store" },
    );

    const payload = await jsonOrThrow(response);
    return payload.run as AutomationRunDetail;
}

/**
 * Run a published automation now for one contact. Real steps execute:
 * emails are queued and sent by the send worker within about a minute.
 */
export async function startTestRun(workflowId: string, customerId: string) {
    const response = await authenticatedFetch(
        `/api/email-agent/automations/${encodeURIComponent(workflowId)}/test-run`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customerId }),
        },
    );

    const payload = await jsonOrThrow(response);
    return payload.run as AutomationRunDetail;
}
