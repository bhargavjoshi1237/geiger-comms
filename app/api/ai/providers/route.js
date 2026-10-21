import { adminClient } from "@/lib/server/admin";
import { AI_MANAGE, AI_VIEW, canInProject, openRoute } from "@/lib/server/workspace_auth";
import { errorResponse, jsonResponse, readJsonBody } from "@/lib/server/respond";
import { usageSummary } from "@/lib/server/ai_usage";
import { runProviderTest } from "@/lib/server/provider_test";
import { assignDefaults, inputErrorResponse, parseProviderInput, providerVm } from "@/lib/server/ai_providers";
import { isUuid } from "@/lib/engine/secrets";
import { errorFor } from "@/lib/ai/llm_errors";
import { keyRequired } from "@/lib/ai/provider_kinds";

// GET  /api/ai/providers?projectId= — the project's providers with 30-day request counts (comms.settings.view).
// POST /api/ai/providers — connect one (comms.settings.manage): store the key in Vault, test it, and on a passing test
// fill an empty chat / embedding default (spec §5.2). Misses and denials both answer 404.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const { session, response } = await openRoute(request);
  if (response) return response;
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!isUuid(projectId) || !(await canInProject(session, projectId, AI_VIEW))) return errorResponse(404, "not_found");

  const [{ data, error }, usage] = await Promise.all([
    session.db.from("model_providers").select("*").eq("project_id", projectId).is("deleted_at", null).order("created_at"),
    usageSummary(session.db, projectId, 30),
  ]);
  if (error) {
    console.error("[api.ai.providers.list]", error.code || "query_failed");
    return errorResponse(500, "read_failed");
  }
  const byProvider = new Map();
  for (const row of usage || []) {
    if (!row.provider_id) continue;
    const entry = byProvider.get(row.provider_id) || { requests: 0, errors: 0 };
    entry.requests += row.requests;
    if (!row.ok) entry.errors += row.requests;
    byProvider.set(row.provider_id, entry);
  }
  return jsonResponse((data || []).map((row) => providerVm(row, byProvider.get(row.id) || { requests: 0, errors: 0 })));
}

export async function POST(request) {
  const { session, response } = await openRoute(request, { write: true });
  if (response) return response;
  const body = await readJsonBody(request);
  const projectId = body?.projectId;
  if (!isUuid(projectId) || !(await canInProject(session, projectId, AI_MANAGE))) return errorResponse(404, "not_found");

  const parsed = await parseProviderInput(body);
  if (!parsed.ok) return inputErrorResponse(parsed);
  if (!parsed.apiKey && keyRequired(parsed.fields)) return errorResponse(422, "no_key", errorFor("no_key").message);

  const { data: inserted, error } = await session.db
    .from("model_providers")
    .insert({ ...parsed.fields, project_id: projectId, created_by: session.user.id })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return errorResponse(409, "name_taken");
    console.error("[api.ai.providers.create]", error.code || "insert_failed");
    return errorResponse(500, "write_failed");
  }

  const admin = adminClient();
  let row = inserted;
  if (parsed.apiKey) {
    const { data: saved, error: rpcError } = await admin.rpc("set_provider_secret", { p_provider: row.id, p_project: projectId, p_secret: parsed.apiKey });
    if (rpcError || !saved) {
      console.error("[api.ai.providers.secret]", rpcError?.code || "no_row");
      // A provider whose key couldn't be stored is withdrawn rather than left half-connected.
      await session.db.from("model_providers").update({ deleted_at: new Date().toISOString() }).eq("id", row.id);
      return errorResponse(503, "service_unavailable", errorFor("service_unavailable").message);
    }
    row = saved;
  }

  try {
    row = await runProviderTest({ admin, provider: row, userId: session.user.id });
  } catch (err) {
    console.error("[api.ai.providers.test]", err?.code || "test_failed");
  }
  const defaultsAssigned = row.status === "ok" ? await assignDefaults({ session, admin, row }) : { chat: false, embed: false };
  return jsonResponse({ provider: providerVm(row), defaultsAssigned }, 201);
}
