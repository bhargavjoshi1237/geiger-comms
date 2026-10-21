import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { isUuid } from "@/lib/widget/apps";
import { canInProject, workspaceSession } from "@/lib/widget/workspace_auth";
import { isEmailConfigured } from "@/lib/email/client";

// GET /api/email/status?projectId=… — what email can actually do for this project right now (needs comms.channels.view):
// { configured: the suite email API key is set, outboxReady: the outbox migration is live, stalled: replies queued > 5 min }.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNELS_VIEW = "comms.channels.view";
const STALL_MS = 5 * 60_000;

export async function GET(request) {
  const session = await workspaceSession();
  if (!session) return errorResponse(401, "unauthorized");
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!isUuid(projectId)) return errorResponse(400, "bad_request");
  if (!(await canInProject(session, projectId, CHANNELS_VIEW))) return errorResponse(403, "forbidden");

  // Read as the user: the outbox's RLS scopes it to their project, and a missing table means the migration isn't pushed.
  const { count, error } = await session.db
    .from("email_outbox")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "queued")
    .lt("created_at", new Date(Date.now() - STALL_MS).toISOString());
  if (error) console.error("[email.status]", error.message);

  return jsonResponse({ configured: isEmailConfigured(), outboxReady: !error, stalled: error ? 0 : count ?? 0 });
}
