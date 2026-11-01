import "server-only";
import { detectEmbeddingDims } from "@/lib/engine/embeddings";
import { errorFor, mapLlmError } from "@/lib/ai/llm_errors";
import {
  PROVIDER_KINDS,
  capabilitiesOf,
  hasCapability,
  hasCustomBaseUrl,
  isProviderKind,
  presetById,
  suggestedModelsFor,
} from "@/lib/ai/provider_kinds";
import { assertPublicBaseUrl, localProvidersAllowed } from "@/lib/ai/url_guard";
import { readAiSettings } from "./ai";
import { recordUsage } from "./ai_usage";
import { markProviderError } from "./provider_test";
import { errorResponse } from "./respond";

// Shared by the /api/ai/providers* and /api/ai/settings routes: the ProviderVm they return, input validation for
// provider writes, the session-scoped row lookup, and the ai_settings writes (always as the user, so RLS decides).

const MAX_NAME = 80;
const MAX_MODELS = 50;
const MAX_MODEL_ID = 200;
const MAX_KEY = 4096;

// ProviderVm: camelCase and whitelisted — no key material beyond keyLast4 ever leaves the server.
export function providerVm(row, usage30d) {
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name || "",
    provider: row.provider,
    preset: meta.preset || null,
    baseUrl: row.base_url || null,
    capabilities: capabilitiesOf(row),
    hasKey: Boolean(row.has_key),
    keyLast4: row.key_last4 || null,
    status: row.status || "unverified",
    lastCheckedAt: row.last_checked_at || null,
    models: Array.isArray(row.models) ? row.models : [],
    checks: meta.checks || null,
    lastError: meta.lastError ? { code: meta.lastError.code, message: meta.lastError.message, capability: meta.lastError.capability ?? null, at: meta.lastError.at ?? null } : null,
    // What the pure provider_kinds helpers read on the client.
    metadata: { preset: meta.preset || null, capabilities: Array.isArray(meta.capabilities) ? meta.capabilities : null },
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    ...(usage30d ? { usage30d } : {}),
  };
}

// The caller's view of a provider row (RLS: project access + settings.view), or null.
export async function loadProviderRow(session, id) {
  const { data, error } = await session.db.from("model_providers").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) console.error("[ai.providers.load]", error.code || "query_failed");
  return data || null;
}

const invalid = (status, code) => ({ ok: false, status, code });

// A failed parseProviderInput -> its response; the 422 codes carry their §5.6 message.
export function inputErrorResponse({ status, code }) {
  return errorResponse(status, code, status === 422 ? errorFor(code).message : undefined);
}

function cleanModels(value) {
  if (!Array.isArray(value)) return null;
  const list = [...new Set(value.map((m) => (typeof m === "string" ? m.trim() : "")).filter(Boolean))];
  return list.length <= MAX_MODELS && list.every((m) => m.length <= MAX_MODEL_ID) ? list : null;
}

// Validates a POST body (no `current`) or a PATCH body against the stored row. The API key is returned
// separately and never stored on the row. -> { ok, fields: { provider, name, base_url, models, metadata }, apiKey } | { ok: false, status, code }
export async function parseProviderInput(body, current = null) {
  if (!body || typeof body !== "object") return invalid(400, "invalid_input");
  const provider = body.provider ?? current?.provider;
  if (!isProviderKind(provider)) return invalid(400, "invalid_provider");
  const kind = PROVIDER_KINDS[provider];

  const name = "name" in body || !current ? String(body.name ?? "").trim() : current.name;
  if (!name || name.length > MAX_NAME) return invalid(400, "invalid_name");

  // A kind change drops the old kind's preset unless the body names one.
  const presetId = "preset" in body ? body.preset || null : current?.provider === provider ? current.metadata?.preset || null : null;
  const preset = presetId ? presetById(presetId) : null;
  if (presetId && (!preset || preset.kind !== provider)) return invalid(400, "invalid_preset");
  if (preset?.local && !localProvidersAllowed(process.env)) return invalid(422, "unsafe_base_url");

  let capabilities = null;
  if (kind.capabilities === "user") {
    const picked = "capabilities" in body ? body.capabilities : current?.metadata?.capabilities;
    capabilities = Array.isArray(picked) ? kind.userCapabilities.filter((c) => picked.includes(c)) : ["chat"];
    if (!capabilities.length) return invalid(400, "capabilities_required");
  }

  let baseUrl = null;
  if (kind.baseUrlMode !== "fixed") {
    const raw = "baseUrl" in body ? String(body.baseUrl ?? "").trim() : current?.base_url || "";
    if (!raw && kind.baseUrlMode === "required") return invalid(422, "no_base_url");
    if (raw && hasCustomBaseUrl({ provider, base_url: raw })) {
      try {
        baseUrl = await assertPublicBaseUrl(raw, { allowLocal: localProvidersAllowed(process.env) });
      } catch {
        return invalid(422, "unsafe_base_url");
      }
    }
  }

  const metadata = { ...(current?.metadata || {}) };
  delete metadata.preset;
  delete metadata.capabilities;
  if (preset) metadata.preset = preset.id;
  if (capabilities) metadata.capabilities = capabilities;
  const draft = { provider, metadata };

  let models = current?.models || [];
  if ("models" in body || !current) {
    models = cleanModels(body.models ?? []);
    if (!models) return invalid(400, "invalid_models");
  }
  if (!hasCapability(draft, "chat")) models = [];

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (apiKey.length > MAX_KEY) return invalid(400, "invalid_key");

  return { ok: true, fields: { provider, name, base_url: baseUrl, models, metadata }, apiKey };
}

// Detects an embedding model's dimensions, metered as detect_dims. -> { dims } ; throws like detectEmbeddingDims.
export async function detectDims({ admin, projectId, providerId, model, userId }) {
  const started = Date.now();
  const meter = (fields) =>
    recordUsage({ projectId, providerId, feature: "detect_dims", capability: "embed", model, latencyMs: Date.now() - started, userId, ...fields });
  try {
    const out = await detectEmbeddingDims({ admin, projectId, providerId, model });
    meter({ ok: true });
    return out;
  } catch (err) {
    const mapped = mapLlmError(err);
    meter({ ok: false, errorCode: mapped.code });
    if (mapped.markProviderError) await markProviderError({ admin, projectId, providerId, capability: "embed", error: mapped });
    throw err;
  }
}

// Inserts a bare ai_settings row when missing (on conflict do nothing); the patch never rides along, or the BEFORE INSERT guard would see it.
export async function ensureSettingsRow(db, projectId, userId) {
  const { error } = await db
    .from("ai_settings")
    .upsert({ project_id: projectId, created_by: userId }, { onConflict: "project_id", ignoreDuplicates: true });
  if (error) console.error("[ai.settings.ensure]", error.code || "insert_failed");
  return !error;
}

// -> { ok: true } | { ok: false, code } where code is embedding_in_use or write_failed.
export async function updateSettings(db, projectId, patch) {
  const { error } = await db.from("ai_settings").update(patch).eq("project_id", projectId);
  if (!error) return { ok: true };
  if (/EMBEDDING_IN_USE/.test(error.message || "")) return { ok: false, code: "embedding_in_use" };
  console.error("[ai.settings.update]", error.code || "update_failed");
  return { ok: false, code: "write_failed" };
}

// Connecting makes AI usable (spec §5.2): a freshly tested provider fills an empty chat and/or embedding default.
// A failed dimension detect leaves the embedding default unset. -> { chat, embed } (what was assigned)
export async function assignDefaults({ session, admin, row }) {
  const projectId = row.project_id;
  const userId = session.user.id;
  const settings = await readAiSettings(admin, projectId);
  const assigned = { chat: false, embed: false };
  const wantsChat = !settings.chatProviderId && hasCapability(row, "chat") && row.models?.length > 0;
  const embedModel = !settings.embedProviderId && hasCapability(row, "embed") ? suggestedModelsFor(row, "embed")[0]?.id : null;
  if (!wantsChat && !embedModel) return assigned;
  if (!(await ensureSettingsRow(session.db, projectId, userId))) return assigned;

  if (wantsChat) {
    assigned.chat = (await updateSettings(session.db, projectId, { chat_provider_id: row.id, chat_model: row.models[0] })).ok;
  }
  if (embedModel) {
    try {
      const { dims } = await detectDims({ admin, projectId, providerId: row.id, model: embedModel, userId });
      const patch = { embed_provider_id: row.id, embed_model: embedModel, embed_dims: dims };
      assigned.embed = (await updateSettings(session.db, projectId, patch)).ok;
    } catch (err) {
      console.error("[ai.providers.assign_embed]", mapLlmError(err).code);
    }
  }
  return assigned;
}
