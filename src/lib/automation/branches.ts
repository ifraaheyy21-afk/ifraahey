import type { WorkflowConnection } from "./types";

export type ConditionBranch = "YES" | "NO";

/**
 * Which Yes/No branch a condition connection represents. The label is the
 * source of truth ("Yes"/"No", or the older "true"/"false"); the builder
 * historically stored the branch only in the id ("edge-yes-…"), so that is
 * read too.
 */
export function connectionBranch(connection: Pick<WorkflowConnection, "id" | "label">): ConditionBranch | null {
    const label = connection.label?.trim().toLowerCase() ?? "";
    if (label === "yes" || label === "true") return "YES";
    if (label === "no" || label === "false") return "NO";

    const id = connection.id ?? "";
    if (id.includes("edge-yes-")) return "YES";
    if (id.includes("edge-no-")) return "NO";
    return null;
}

export function branchLabel(branch: ConditionBranch) {
    return branch === "YES" ? "Yes" : "No";
}
