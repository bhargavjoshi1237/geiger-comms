import { adminClient } from "@/lib/server/admin";
import { AI_MANAGE, canInProject, openRoute } from "@/lib/server/workspace_auth";
import { aiErrorResponse, errorResponse, jsonResponse } from "@/lib/server/respond";
import { runProviderTest } from "@/lib/server/provider_test";
import { loadProviderRow, providerVm } from "@/lib/server/ai_providers";
import { isUuid } from "@/lib/engine/secrets";

// POST /api/ai/providers/:id/test — one minimal real call per capability; the outcome is written to the row (spec §5.7).
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, { params }) {
  const { session, response } = await openRoute(request, { write: true });
  if (response) return response;
  const { id } = await params;
  const row = isUuid(id) ? await loadProviderRow(session, id) : null;
  if (!row || !(await canInProject(session, row.project_id, AI_MANAGE))) return errorResponse(404, "not_found");
  try {
    return jsonResponse(providerVm(await runProviderTest({ admin: adminClient(), provider: row, userId: session.user.id })));
  } catch (err) {
    return aiErrorResponse(err);
  }
}
