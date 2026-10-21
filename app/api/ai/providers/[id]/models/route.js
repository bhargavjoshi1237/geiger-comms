import { adminClient } from "@/lib/server/admin";
import { AI_MANAGE, canInProject, openRoute } from "@/lib/server/workspace_auth";
import { aiErrorResponse, errorResponse, jsonResponse } from "@/lib/server/respond";
import { listProviderModels } from "@/lib/server/provider_models";
import { loadProviderRow } from "@/lib/server/ai_providers";
import { isUuid } from "@/lib/engine/secrets";
import { errorFor } from "@/lib/ai/llm_errors";
import { keyRequired } from "@/lib/ai/provider_kinds";

// GET /api/ai/providers/:id/models — the provider's model catalogue, only once its key is saved (spec §5.7).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request, { params }) {
  const { session, response } = await openRoute(request);
  if (response) return response;
  const { id } = await params;
  const row = isUuid(id) ? await loadProviderRow(session, id) : null;
  if (!row || !(await canInProject(session, row.project_id, AI_MANAGE))) return errorResponse(404, "not_found");
  if (keyRequired(row) && !row.has_key) return errorResponse(422, "no_key", errorFor("no_key").message);
  try {
    return jsonResponse(await listProviderModels({ admin: adminClient(), provider: row, userId: session.user.id }));
  } catch (err) {
    return aiErrorResponse(err);
  }
}
