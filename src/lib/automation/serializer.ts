import type { Prisma } from "@prisma/client";
import type { WorkflowDefinition, WorkflowDto } from "./types";

export function asWorkflowDefinition(value: Prisma.JsonValue): WorkflowDefinition {
    const record = value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    return {
        nodes: Array.isArray(record.nodes) ? (record.nodes as WorkflowDefinition["nodes"]) : [],
        connections: Array.isArray(record.connections)
            ? (record.connections as WorkflowDefinition["connections"])
            : [],
    };
}

export function serializeWorkflow(row: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    definition: Prisma.JsonValue;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    lastRunAt: Date | null;
    _count?: { runs: number };
    completedRuns?: number;
    successfulRuns?: number;
}): WorkflowDto {
    const definition = asWorkflowDefinition(row.definition);
    const enrolled = row._count?.runs ?? 0;
    const completed = row.completedRuns ?? 0;
    const successRate = completed > 0
        ? Math.round(((row.successfulRuns ?? completed) / completed) * 100)
        : 0;

    return {
        id: row.id,
        name: row.name,
        description: row.description ?? "",
        status: row.status === "active" || row.status === "paused" ? row.status : "draft",
        version: row.version,
        nodes: definition.nodes,
        connections: definition.connections,
        metrics: { enrolled, completed, successRate },
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        lastRunAt: row.lastRunAt?.toISOString(),
    };
}
