import { adminClient } from "@/lib/server/admin";
import { AI_MANAGE, canInProject, openRoute } from "@/lib/server/workspace_auth";
import { errorResponse, jsonResponse, readJsonBody } from "@/lib/server/respond";
import { runProviderTest } from "@/lib/server/provider_test";
import { assignDefaults, inputErrorResponse, loadProviderRow, parseProviderInput, providerVm } from "@/lib/server/ai_providers";
import { isUuid } from "@/lib/engine/secrets";
import { errorFor } from "@/lib/ai/llm_errors";
import { keyRequired } from "@/lib/ai/provider_kinds";

// PATCH  /api/ai/providers/:id — edit any subset of the connection; `apiKey` rotates the key. A base URL or kind change
//        needs the key again (the database clears the stored one regardless), and a key or URL change re-tests.
// DELETE /api/ai/providers/:id — soft delete; the database erases the Vault secret and releases its defaults.
// Both need comms.settings.manage in the provider's own project; anything else answers 404.
export const runtime = "nodejs";
export const maxDuration = 60;

async function guard(request, params) {
  const { session, response } = await openRoute(request, { write: true });
  if (response) return { response };
  const { id } = await params;
  const row = isUuid(id) ? await loadProviderRow(session, id) : null;
  if (!row || !(await canInProject(session, row.project_id, AI_MANAGE))) return { response: errorResponse(404, "not_found") };
  return { session, row };
}

export async function PATCH(request, { params }) {
  const { session, row: current, response } = await guard(request, params);
  if (response) return response;

  const parsed = await parseProviderInput(await readJsonBody(request), current);
  if (!parsed.ok) return inputErrorResponse(parsed);
  const endpointChanged = parsed.fields.provider !== current.provider || parsed.fields.base_url !== (current.base_url ?? null);
  if (endpointChanged && !parsed.apiKey && keyRequired(parsed.fields)) {
    return errorResponse(422, "key_required", errorFor("key_required").message);
  }

  const { data: updated, error } = await session.db.from("model_providers").update(parsed.fields).eq("id", current.id).select("*").single();
  if (error) {
    if (error.code === "23505") return errorResponse(409, "name_taken");
    console.error("[api.ai.providers.update]", error.code || "update_failed");
    return errorResponse(500, "write_failed");
  }

  const admin = adminClient();
  let row = updated;
  if (parsed.apiKey) {
    const { data: saved, error: rpcError } = await admin.rpc("set_provider_secret", { p_provider: row.id, p_project: row.project_id, p_secret: parsed.apiKey });
    if (rpcError || !saved) {
      console.error("[api.ai.providers.secret]", rpcError?.code || "no_row");
      return errorResponse(503, "service_unavailable", errorFor("service_unavailable").message);
    }
    row = saved;
  }

  let defaultsAssigned = { chat: false, embed: false };
  if (parsed.apiKey || endpointChanged) {
    try {
      row = await runProviderTest({ admin, provider: row, userId: session.user.id });
    } catch (err) {
      console.error("[api.ai.providers.test]", err?.code || "test_failed");
    }
    if (row.status === "ok") defaultsAssigned = await assignDefaults({ session, admin, row });
  }
  return jsonResponse({ provider: providerVm(row), defaultsAssigned });
}

export async function DELETE(request, { params }) {
  const { session, row, response } = await guard(request, params);
  if (response) return response;
  const { error } = await session.db.from("model_providers").update({ deleted_at: new Date().toISOString() }).eq("id", row.id);
  if (error) {
    console.error("[api.ai.providers.delete]", error.code || "update_failed");
    return errorResponse(500, "write_failed");
  }
  return new Response(null, { status: 204 });
}
