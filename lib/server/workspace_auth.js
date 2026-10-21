import "server-only";
import { isSameOriginRequest, workspaceSession } from "@/lib/widget/workspace_auth";
import { isAdminConfigured } from "./admin";
import { errorResponse } from "./respond";

// Cookie-session auth for the /api/ai/* and /api/kb/* routes; permissions come from comms.can_access_project / comms.rbac_allows.
export { canAccessProject, canInProject, isSameOriginRequest, workspaceSession } from "@/lib/widget/workspace_auth";

export const AI_MANAGE = "comms.settings.manage";
export const AI_VIEW = "comms.settings.view";
export const KB_VIEW = "comms.knowledge_base.view";

// The spec §5.1 request order up to the session: service configured, same-origin writes, signed in.
// -> { session } | { response } (the response to return as-is).
export async function openRoute(request, { write = false } = {}) {
  if (!isAdminConfigured()) return { response: errorResponse(503, "not_configured") };
  if (write && !isSameOriginRequest(request)) return { response: errorResponse(403, "cross_site") };
  const session = await workspaceSession();
  if (!session) return { response: errorResponse(401, "unauthorized") };
  return { session };
}
