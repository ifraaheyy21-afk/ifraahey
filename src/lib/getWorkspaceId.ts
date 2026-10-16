import {
    AuthError,
    getWorkspaceFromRequest,
} from "./auth/getWorkspaceFromRequest";

export async function getWorkspaceId(
    req: Request,
): Promise<string> {
    const { workspaceId } =
        await getWorkspaceFromRequest(req);

    const requestedWorkspaceId =
        req.headers.get("x-workspace-id")?.trim();

    if (
        requestedWorkspaceId &&
        requestedWorkspaceId !== workspaceId
    ) {
        throw new AuthError(
            "You do not have access to this workspace.",
            403,
            "WORKSPACE_ACCESS_DENIED",
        );
    }

    return workspaceId;
}