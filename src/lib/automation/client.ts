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