import "server-only";
import { generateText, Output } from "ai";
import { adminClient } from "./admin";
import { AI_MANAGE, AI_VIEW, canInProject } from "./workspace_auth";
import { assertDailyQuota, usageToday } from "./ai_quota";
import { recordUsage, tokensOf } from "./ai_usage";
import { markProviderError } from "./provider_test";
import { EngineError, engineError as refuse } from "@/lib/engine/errors";
import { resolveModel } from "@/lib/engine/llm";
import { connectEmbedder, embedWith } from "@/lib/engine/embeddings";
import { AI_FEATURES, DEFAULT_FEATURES, DEFAULT_LIMITS, isFeatureKey } from "@/lib/ai/features";
import { errorFor, mapLlmError } from "@/lib/ai/llm_errors";
import { isTemperatureRejection } from "@/lib/ai/model_caps";
import { hasCapability, keyRequired } from "@/lib/ai/provider_kinds";
import { isValidDims } from "@/lib/ai/embedding_models";
import { localProvidersAllowed } from "@/lib/ai/url_guard";

// The one helper every AI feature in comms calls (knowledge-base-and-ai-providers spec §5.3). It reads the
// project's ai_settings through the admin client, refuses in a fixed order (default, switch, consent, quota,
// provider) and only ever calls the workspace's own provider with its own key — never a platform key.

const PLATFORM_KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"];
const EMBED_USAGES = new Set(["embed_index", "embed_query"]);
const DEFAULT_TIMEOUT_MS = 20_000;

let warnedPlatformKeys = false;

// The SDKs fall back to these when no key is passed; comms always passes one, but they must not be set (spec §1.1).
function warnPlatformKeys() {
  if (warnedPlatformKeys) return;
  warnedPlatformKeys = true;
  const present = PLATFORM_KEYS.filter((name) => process.env[name]);
  if (present.length) console.warn(`[ai] ${present.join(", ")} is set on this deployment; comms never uses it — unset it.`);
}

function requireAdmin() {
  const admin = adminClient();
  if (!admin) throw refuse("service_unavailable");
  return admin;
}

// An unknown key is a programming error: loud in development, a refusal in production.
function assertKnown(valid, what) {
  if (valid) return;
  if (process.env.NODE_ENV === "development") throw new Error(`Unknown AI ${what}`);
  throw refuse("ai_feature_disabled");
}

// The project's ai_settings as a camelCase view, defaults filled in (a project without a row has the column defaults).
export async function readAiSettings(admin, projectId) {
  const { data, error } = await admin.from("ai_settings").select("*").eq("project_id", projectId).maybeSingle();
  if (error) {
    console.error("[ai.settings.read]", error.code || "query_failed");
    throw refuse("service_unavailable");
  }
  return {
    exists: Boolean(data),
    chatProviderId: data?.chat_provider_id ?? null,
    chatModel: data?.chat_model ?? null,
    embedProviderId: data?.embed_provider_id ?? null,
    embedModel: data?.embed_model ?? null,
    embedDims: data?.embed_dims ?? null,
    features: { ...DEFAULT_FEATURES, ...(data?.features || {}) },
    limits: { ...DEFAULT_LIMITS, ...(data?.limits || {}) },
    dataSharingAcknowledgedAt: data?.data_sharing_ack_at ?? null,
    dataSharingAcknowledgedBy: data?.data_sharing_ack_by ?? null,
  };
}

async function listProviderRows(admin, projectId) {
  const { data, error } = await admin.from("model_providers").select("*").eq("project_id", projectId).is("deleted_at", null);
  if (error) {
    console.error("[ai.providers.read]", error.code || "query_failed");
    throw refuse("service_unavailable");
  }
  return data || [];
}

async function hasProviders(admin, projectId) {
  return (await listProviderRows(admin, projectId)).length > 0;
}

// The recorded failure that makes this provider unusable for `capability`, or null.
function capabilityError(row, capability) {
  if (keyRequired(row) && !row.has_key) {
    const { code, message } = errorFor("no_key");
    return { code, message };
  }
  if (row.status !== "error") return null;
  const last = row.metadata?.lastError || null;
  const failed = row.metadata?.checks?.[capability] === "error" || last?.capability === capability || last?.code === "provider_auth";
  return failed ? { code: last?.code || "provider_unavailable", message: last?.message || errorFor("provider_unavailable").message } : null;
}

function capabilityStatus(capability, rows, providerId, model, acknowledged) {
  const row = rows.find((r) => r.id === providerId && hasCapability(r, capability)) || null;
  // A null chat_model means the chat provider's first model; embeddings always name theirs.
  const fallback = capability === "chat" ? row?.models?.[0] : null;
  const out = {
    available: false,
    reason: null,
    providerId: row?.id ?? null,
    providerName: row?.name ?? null,
    model: row ? model || fallback || null : null,
    status: row?.status ?? null,
    error: null,
  };
  if (!rows.length) return { ...out, reason: "not_configured" };
  if (!row || !out.model) return { ...out, reason: "no_default" };
  if (!acknowledged) return { ...out, reason: "consent_required" };
  out.error = capabilityError(row, capability);
  if (out.error) return { ...out, reason: "provider_error" };
  return { ...out, available: true };
}

function unavailableStatus(reason) {
  const empty = { available: false, reason, providerId: null, providerName: null, model: null, status: null, error: null };
  return {
    chat: empty,
    embed: { ...empty, dims: null },
    features: { ...DEFAULT_FEATURES },
    limits: { ...DEFAULT_LIMITS },
    usageToday: Object.fromEntries(Object.keys(AI_FEATURES).map((key) => [key, 0])),
    dataSharingAcknowledged: false,
    dataSharingAcknowledgedBy: null,
    dataSharingAcknowledgedAt: null,
    localProvidersAllowed: localProvidersAllowed(process.env),
    canView: false,
    canManage: false,
    reindex: { pending: 0 },
  };
}

async function acknowledgerName(db, projectId, userId) {
  if (!userId) return null;
  const { data } = await db.from("teammates").select("name,email").eq("project_id", projectId).eq("user_id", userId).is("deleted_at", null).limit(1).maybeSingle();
  return data?.name || data?.email || null;
}

async function staleSources(db, projectId) {
  const { count, error } = await db
    .from("knowledge_sources")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("kind", "article")
    .eq("sync_state", "stale")
    .is("deleted_at", null);
  if (error) console.error("[ai.status.reindex]", error.code || "query_failed");
  return count || 0;
}

// -> AiStatusVm; never throws. With a `session` it also answers what that user may do and the re-index backlog.
export async function aiStatus(projectId, { session } = {}) {
  warnPlatformKeys();
  try {
    const admin = requireAdmin();
    const [settings, rows, today] = await Promise.all([
      readAiSettings(admin, projectId),
      listProviderRows(admin, projectId),
      usageToday(admin, projectId),
    ]);
    const acknowledged = Boolean(settings.dataSharingAcknowledgedAt);
    const chat = capabilityStatus("chat", rows, settings.chatProviderId, settings.chatModel, acknowledged);
    const embedBase = capabilityStatus("embed", rows, settings.embedProviderId, settings.embedModel, acknowledged);
    const embed = { ...embedBase, dims: settings.embedDims };
    if (embed.available && !isValidDims(settings.embedDims)) Object.assign(embed, { available: false, reason: "no_dims" });

    const [canView, canManage, ackName, pending] = session
      ? await Promise.all([
          canInProject(session, projectId, AI_VIEW),
          canInProject(session, projectId, AI_MANAGE),
          acknowledgerName(session.db, projectId, settings.dataSharingAcknowledgedBy),
          staleSources(session.db, projectId),
        ])
      : [false, false, null, 0];

    return {
      chat,
      embed,
      features: settings.features,
      limits: settings.limits,
      usageToday: today,
      dataSharingAcknowledged: acknowledged,
      dataSharingAcknowledgedBy: ackName,
      dataSharingAcknowledgedAt: settings.dataSharingAcknowledgedAt,
      localProvidersAllowed: localProvidersAllowed(process.env),
      canView,
      canManage,
      reindex: { pending },
    };
  } catch (err) {
    console.error("[ai.status]", err?.code || "failed");
    return unavailableStatus("unavailable");
  }
}

// feature = an AI_FEATURES switch key. -> { model, modelId, providerId, providerKind, providerName, supportsTemperature }
// Throws EngineError ai_not_configured | ai_no_default | ai_feature_disabled | ai_consent_required | ai_quota_exceeded,
// or the provider's own refusal (provider_not_found, no_key, no_model, unsafe_base_url…).
export async function chatModelFor({ projectId, feature }) {
  warnPlatformKeys();
  assertKnown(isFeatureKey(feature), `feature "${feature}"`);
  const admin = requireAdmin();
  const settings = await readAiSettings(admin, projectId);
  if (!settings.chatProviderId) throw refuse((await hasProviders(admin, projectId)) ? "ai_no_default" : "ai_not_configured");
  if (!settings.features[feature]) throw refuse("ai_feature_disabled");
  if (!settings.dataSharingAcknowledgedAt) throw refuse("ai_consent_required");
  await assertDailyQuota({ admin, projectId, feature, limits: settings.limits });
  return resolveModel({ admin, projectId, providerId: settings.chatProviderId, model: settings.chatModel });
}

// usage = 'embed_index' | 'embed_query'. -> { embedTexts(texts, { signal }?) -> { vectors, tokens, dims }, dims, modelId, providerId }
// Throws EngineError ai_not_configured | ai_no_default | ai_consent_required | no_dims, or the provider's refusal.
export async function embedderFor({ projectId, usage }) {
  warnPlatformKeys();
  assertKnown(EMBED_USAGES.has(usage), `embedding usage "${usage}"`);
  const admin = requireAdmin();
  const settings = await readAiSettings(admin, projectId);
  if (!settings.embedProviderId) throw refuse((await hasProviders(admin, projectId)) ? "ai_no_default" : "ai_not_configured");
  if (!settings.dataSharingAcknowledgedAt) throw refuse("ai_consent_required");
  const embedder = await connectEmbedder({
    admin,
    projectId,
    embed: { providerId: settings.embedProviderId, model: settings.embedModel, dims: settings.embedDims },
  });
  const meta = { projectId, providerId: embedder.conn.provider.id, feature: usage, capability: "embed", model: embedder.model };

  return {
    dims: embedder.dims,
    modelId: embedder.model,
    providerId: embedder.conn.provider.id,
    embedTexts: async (texts, { signal } = {}) => {
      const started = Date.now();
      try {
        const out = await embedWith(embedder, { texts, inputType: usage === "embed_query" ? "query" : "document", signal });
        recordUsage({ ...meta, inputTokens: out.tokens, latencyMs: Date.now() - started });
        return out;
      } catch (err) {
        const mapped = mapLlmError(err);
        recordUsage({ ...meta, latencyMs: Date.now() - started, ok: false, errorCode: mapped.code });
        if (mapped.markProviderError) await markProviderError({ admin, projectId, providerId: meta.providerId, capability: "embed", error: mapped });
        throw err;
      }
    },
  };
}

// One model call for a feature (spec §5.3): `instructions` (never `system`), then `prompt` or `messages`; with a
// zod `schema` the result is `object` (bound every string and array in it), else `text`. Usage is metered in after().
// -> { text | object, usage: { inputTokens, outputTokens }, modelId, providerName }
export async function generateFor({ projectId, feature, userId = null, instructions, prompt, messages, schema, maxOutputTokens, temperature, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const resolved = await chatModelFor({ projectId, feature });
  const call = {
    model: resolved.model,
    instructions,
    ...(messages ? { messages } : { prompt }),
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
    ...(schema ? { output: Output.object({ schema }) } : {}),
    maxRetries: 1,
    timeout: { totalMs: timeoutMs },
  };
  const withTemperature = typeof temperature === "number" && resolved.supportsTemperature;
  const meta = { projectId, providerId: resolved.providerId, feature: AI_FEATURES[feature].usage, model: resolved.modelId, userId };
  const started = Date.now();

  try {
    let result;
    try {
      result = await generateText(withTemperature ? { ...call, temperature } : call);
    } catch (err) {
      // Models this table doesn't know yet can still reject sampling params: retry once without them.
      if (!withTemperature || !isTemperatureRejection(err)) throw err;
      result = await generateText(call);
    }
    const usage = tokensOf(result.totalUsage ?? result.usage);
    recordUsage({ ...meta, ...usage, latencyMs: Date.now() - started });
    const out = schema ? { object: result.output } : { text: result.text };
    return { ...out, usage, modelId: resolved.modelId, providerName: resolved.providerName };
  } catch (err) {
    const mapped = mapLlmError(err);
    recordUsage({ ...meta, latencyMs: Date.now() - started, ok: false, errorCode: mapped.code });
    if (mapped.markProviderError) {
      await markProviderError({ admin: requireAdmin(), projectId, providerId: resolved.providerId, capability: "chat", error: mapped });
    }
    throw new EngineError(mapped.code, mapped.message, { status: mapped.status, retryable: mapped.retryable });
  }
}
