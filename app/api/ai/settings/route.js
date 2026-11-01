import { adminClient } from "@/lib/server/admin";
import { AI_MANAGE, canAccessProject, canInProject, openRoute } from "@/lib/server/workspace_auth";
import { aiErrorResponse, errorResponse, jsonResponse, readJsonBody } from "@/lib/server/respond";
import { aiStatus, readAiSettings } from "@/lib/server/ai";
import { ensureSettingsRow, loadProviderRow, updateSettings } from "@/lib/server/ai_providers";
import { isUuid } from "@/lib/engine/secrets";
import { AI_FEATURES, MAX_DAILY_LIMIT, isFeatureKey } from "@/lib/ai/features";
import { errorFor } from "@/lib/ai/llm_errors";
import { hasCapability } from "@/lib/ai/provider_kinds";
import { isValidDims } from "@/lib/ai/embedding_models";

// GET /api/ai/settings?projectId= -> AiStatusVm, for any project member (every KB screen reads it).
// PUT /api/ai/settings — defaults, switches, daily limits and the data-sharing acknowledgement (comms.settings.manage).
//     Changing the embedding while chunks exist answers 409 embedding_in_use until `confirmReindex`, which clears the
//     chunks and queues every article for re-indexing; the client then drives POST /api/kb/index in bounded batches.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PER_MINUTE = 1000;

export async function GET(request) {
  const { session, response } = await openRoute(request);
  if (response) return response;
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!isUuid(projectId) || !(await canAccessProject(session, projectId))) return errorResponse(404, "not_found");
  return jsonResponse(await aiStatus(projectId, { session }));
}

// A default must be a live provider of this project that serves the capability.
async function checkDefault(session, projectId, providerId, capability) {
  if (providerId === null) return null;
  const row = isUuid(providerId) ? await loadProviderRow(session, providerId) : null;
  if (!row || row.project_id !== projectId) return "provider_not_found";
  return hasCapability(row, capability) ? null : "capability_missing";
}

// A model id from the body: a trimmed id or null; undefined when it isn't one.
function modelField(value) {
  if (value === null) return null;
  if (typeof value !== "string" || value.trim().length > 200) return undefined;
  return value.trim() || null;
}

function mergeLimits(current, input) {
  const next = { ...current };
  for (const [key, value] of Object.entries(input)) {
    const n = Number(value);
    if (isFeatureKey(key) && Number.isInteger(n) && n >= 0 && n <= MAX_DAILY_LIMIT) next[key] = n;
    else if (key === "perUserPerMinute" && Number.isInteger(n) && n >= 1 && n <= MAX_PER_MINUTE) next[key] = n;
    else return null;
  }
  return next;
}

export async function PUT(request) {
  const { session, response } = await openRoute(request, { write: true });
  if (response) return response;
  const body = await readJsonBody(request);
  const projectId = body?.projectId;
  if (!isUuid(projectId) || !(await canInProject(session, projectId, AI_MANAGE))) return errorResponse(404, "not_found");

  let current;
  try {
    current = await readAiSettings(adminClient(), projectId);
  } catch (err) {
    return aiErrorResponse(err);
  }

  const patch = {};
  for (const [key, capability, column] of [["chatProviderId", "chat", "chat_provider_id"], ["embedProviderId", "embed", "embed_provider_id"]]) {
    if (!(key in body)) continue;
    const refusal = await checkDefault(session, projectId, body[key], capability);
    if (refusal) return errorResponse(422, refusal, errorFor(refusal).message);
    patch[column] = body[key];
  }
  for (const [key, column] of [["chatModel", "chat_model"], ["embedModel", "embed_model"]]) {
    if (!(key in body)) continue;
    const value = modelField(body[key]);
    if (value === undefined) return errorResponse(400, "invalid_model");
    patch[column] = value;
  }
  if ("embedDims" in body) {
    if (body.embedDims !== null && !isValidDims(body.embedDims)) return errorResponse(400, "invalid_dims");
    patch.embed_dims = body.embedDims;
  }
  // Clearing a default clears what only made sense with it.
  if (patch.chat_provider_id === null) patch.chat_model = null;
  if (patch.embed_provider_id === null) Object.assign(patch, { embed_model: null, embed_dims: null });

  let features = current.features;
  if (body.features && typeof body.features === "object") {
    features = { ...features };
    for (const [key, value] of Object.entries(body.features)) {
      if (!isFeatureKey(key) || typeof value !== "boolean") return errorResponse(400, "invalid_features");
      features[key] = value;
    }
    patch.features = Object.fromEntries(Object.keys(AI_FEATURES).map((key) => [key, Boolean(features[key])]));
  }
  let limits = current.limits;
  if (body.limits && typeof body.limits === "object") {
    limits = mergeLimits(limits, body.limits);
    if (!limits) return errorResponse(400, "invalid_limits");
    patch.limits = limits;
  }
  if (features.messengerAnswers && !(limits.messengerAnswers > 0)) {
    return errorResponse(422, "limit_required", errorFor("limit_required").message);
  }
  if ("acknowledgeDataSharing" in body) {
    // The trigger stamps the time and the acknowledging user; only on/off is taken from here.
    patch.data_sharing_ack_at = body.acknowledgeDataSharing === true ? new Date().toISOString() : null;
  }
  if (!Object.keys(patch).length) return errorResponse(400, "nothing_to_update");

  const embedChanged =
    (patch.embed_provider_id ?? current.embedProviderId) !== null &&
    [["embed_provider_id", current.embedProviderId], ["embed_model", current.embedModel], ["embed_dims", current.embedDims]].some(
      ([column, value]) => column in patch && patch[column] !== value,
    );
  if (embedChanged) {
    const { count, error } = await session.db
      .from("knowledge_chunks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("deleted_at", null);
    if (error) {
      console.error("[api.ai.settings.chunks]", error.code || "query_failed");
      return errorResponse(500, "read_failed");
    }
    if (count > 0 && body.confirmReindex !== true) return jsonResponse({ error: "embedding_in_use", chunks: count }, 409);
    if (count > 0) {
      const now = new Date().toISOString();
      const cleared = await session.db.from("knowledge_chunks").update({ deleted_at: now }).eq("project_id", projectId).is("deleted_at", null);
      const queued = await session.db
        .from("knowledge_sources")
        .update({ sync_state: "stale" })
        .eq("project_id", projectId)
        .eq("kind", "article")
        .is("deleted_at", null);
      if (cleared.error || queued.error) {
        console.error("[api.ai.settings.reindex]", cleared.error?.code || queued.error?.code);
        return errorResponse(500, "write_failed");
      }
    }
  }

  if (!(await ensureSettingsRow(session.db, projectId, session.user.id))) return errorResponse(500, "write_failed");
  const saved = await updateSettings(session.db, projectId, patch);
  if (!saved.ok) return saved.code === "embedding_in_use" ? jsonResponse({ error: "embedding_in_use" }, 409) : errorResponse(500, "write_failed");
  return jsonResponse(await aiStatus(projectId, { session }));
}
