import { getWorkspaceFromRequest } from "./auth/getWorkspaceFromRequest";

/**
 * The signed-in user's workspace. Any workspace id the client sends (for
 * example an `x-workspace-id` header) is ignored: the session decides.
 */
export async function getWorkspaceId(
    req: Request,
): Promise<string> {
    const { workspaceId } =
        await getWorkspaceFromRequest(req);

    return workspaceId;
}
