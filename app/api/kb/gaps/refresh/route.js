import { adminClient } from "@/lib/server/admin";
import { KB_VIEW, canInProject, openRoute } from "@/lib/server/workspace_auth";
import { aiErrorResponse, errorResponse, jsonResponse, readJsonBody } from "@/lib/server/respond";
import { readAiSettings } from "@/lib/server/ai";
import { withinUserRate } from "@/lib/server/ai_quota";
import { refreshSlice } from "@/lib/server/kb_gaps";
import { isUuid } from "@/lib/engine/secrets";
import { DEFAULT_LIMITS } from "@/lib/ai/features";
import { errorFor } from "@/lib/ai/llm_errors";

// POST /api/kb/gaps/refresh — one bounded slice of the Knowledge Gaps refresh (KB spec §11.4). The screen calls it
// again while `done` is false. A second concurrent refresh answers 409 busy. Works without AI (keyword clustering).
export const runtime = "nodejs";
export const maxDuration = 60;

const BUDGET_MS = 50_000;

export async function POST(request) {
  const started = Date.now();
  const { session, response } = await openRoute(request, { write: true });
  if (response) return response;

  const body = await readJsonBody(request);
  const projectId = body?.projectId;
  if (!isUuid(projectId)) return errorResponse(422, "invalid_request");
  if (!(await canInProject(session, projectId, KB_VIEW))) return errorResponse(404, "not_found");

  // The per-user minute limit; a project without readable AI settings uses the defaults.
  const limits = await readAiSettings(adminClient(), projectId).then(
    (settings) => settings.limits,
    () => DEFAULT_LIMITS,
  );
  if (!withinUserRate({ projectId, userId: session.user.id, limits })) {
    return errorResponse(429, "ai_quota_exceeded", errorFor("ai_quota_exceeded").message);
  }

  try {
    const result = await refreshSlice({ session, projectId, userId: session.user.id, deadline: started + BUDGET_MS });
    if (result.busy) return errorResponse(409, "busy", errorFor("busy").message);
    return jsonResponse(result);
  } catch (err) {
    console.error("[kb.gaps.refresh]", err?.code || err?.message || "failed");
    return aiErrorResponse(err);
  }
}
