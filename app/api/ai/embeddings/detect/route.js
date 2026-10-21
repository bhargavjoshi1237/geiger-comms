import { adminClient } from "@/lib/server/admin";
import { AI_MANAGE, canInProject, openRoute } from "@/lib/server/workspace_auth";
import { aiErrorResponse, errorResponse, jsonResponse, readJsonBody } from "@/lib/server/respond";
import { detectDims, loadProviderRow } from "@/lib/server/ai_providers";
import { isUuid } from "@/lib/engine/secrets";

// POST /api/ai/embeddings/detect { providerId, model } -> { dims } — embeds "ping" once and reads the vector length.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  const { session, response } = await openRoute(request, { write: true });
  if (response) return response;
  const body = await readJsonBody(request);
  const row = isUuid(body?.providerId) ? await loadProviderRow(session, body.providerId) : null;
  if (!row || !(await canInProject(session, row.project_id, AI_MANAGE))) return errorResponse(404, "not_found");
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model || model.length > 200) return errorResponse(400, "invalid_model");
  try {
    return jsonResponse(await detectDims({ admin: adminClient(), projectId: row.project_id, providerId: row.id, model, userId: session.user.id }));
  } catch (err) {
    return aiErrorResponse(err);
  }
}
