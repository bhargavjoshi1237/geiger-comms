import "server-only";
import { generateText } from "ai";
import { connectProvider } from "@/lib/engine/secrets";
import { buildLanguageModel } from "@/lib/engine/llm";
import { embedWithConnection } from "@/lib/engine/embeddings";
import { EngineError, isEngineError } from "@/lib/engine/errors";
import { capabilitiesOf, suggestedModelsFor } from "@/lib/ai/provider_kinds";
import { acceptsDimensionParam, defaultRequestedDims } from "@/lib/ai/embedding_models";
import { mapLlmError } from "@/lib/ai/llm_errors";
import { recordUsage, tokensOf } from "./ai_usage";

// Real connection test (spec §5.7), ported from geiger-grey: one minimal call per capability, in parallel, then
// status / last_checked_at / metadata.checks / metadata.lastError (mapped code + message, never raw provider text)
// are written through the admin client, so it works whoever the caller is.

const TIMEOUT_MS = 15_000;
const SKIPPED = { skipped: true };

class CheckFailure extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// 16 output tokens: the smallest budget every chat API accepts. No temperature, no retries.
async function checkChat(conn) {
  const model = conn.provider.models?.[0];
  if (!model) throw new CheckFailure("no_model", "Add a model id to test.");
  const result = await generateText({
    model: buildLanguageModel(conn, model),
    prompt: "ping",
    maxOutputTokens: 16,
    maxRetries: 0,
    timeout: TIMEOUT_MS,
  });
  return { model, usage: tokensOf(result.totalUsage ?? result.usage) };
}

// The project's embedding model when this provider is the embedding default, else the kind's first suggestion.
async function checkEmbed(conn, settings) {
  const isDefault = settings?.embed_provider_id === conn.provider.id && settings?.embed_model;
  const model = isDefault ? settings.embed_model : suggestedModelsFor(conn.provider, "embed")[0]?.id;
  if (!model) return SKIPPED;
  const dims = isDefault && settings.embed_dims ? settings.embed_dims : defaultRequestedDims(conn.format, model);
  const { tokens } = await embedWithConnection(conn, {
    model,
    texts: ["ping"],
    inputType: "query",
    dimensions: acceptsDimensionParam(conn.format, model) ? dims : undefined,
    timeoutMs: TIMEOUT_MS,
    retries: 0,
  });
  return { model, usage: { inputTokens: tokens, outputTokens: 0 } };
}

const CHECKS = { chat: checkChat, embed: checkEmbed };

function describe(err) {
  if (err instanceof CheckFailure || isEngineError(err)) return { code: err.code, message: err.message };
  const { code, message } = mapLlmError(err);
  return { code, message };
}

async function loadSettings(admin, projectId) {
  const { data, error } = await admin
    .from("ai_settings")
    .select("embed_provider_id,embed_model,embed_dims")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) console.error("[ai.provider_test.settings]", error.code || "query_failed");
  return data || null;
}

// Runs every capability check in parallel and meters each call. -> { status, checks, lastError }
export async function checkProvider({ admin, provider, userId = null }) {
  const settings = await loadSettings(admin, provider.project_id);
  const results = await Promise.all(
    capabilitiesOf(provider).map(async (capability) => {
      const started = Date.now();
      let model = null;
      try {
        const conn = await connectProvider({ admin, projectId: provider.project_id, providerId: provider.id, capability });
        const outcome = await CHECKS[capability](conn, settings);
        if (outcome?.skipped) return { capability, state: "skipped" };
        model = outcome.model;
        recordUsage({ projectId: provider.project_id, providerId: provider.id, feature: "test", capability, model, ...outcome.usage, latencyMs: Date.now() - started, userId });
        return { capability, state: "ok" };
      } catch (err) {
        const error = describe(err);
        recordUsage({ projectId: provider.project_id, providerId: provider.id, feature: "test", capability, model, latencyMs: Date.now() - started, ok: false, errorCode: error.code, userId });
        return { capability, state: "error", error };
      }
    }),
  );
  const checks = Object.fromEntries(results.map((r) => [r.capability, r.state]));
  const failed = results.find((r) => r.state === "error");
  const status = failed ? "error" : results.some((r) => r.state === "ok") ? "ok" : "unverified";
  const lastError = failed ? { ...failed.error, capability: failed.capability, at: new Date().toISOString() } : null;
  return { status, checks, lastError };
}

async function writeHealth(admin, provider, patch) {
  const { data, error } = await admin
    .from("model_providers")
    .update(patch)
    .eq("id", provider.id)
    .eq("project_id", provider.project_id)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    console.error("[ai.provider_test.write]", error?.code || "not_found");
    throw new EngineError("service_unavailable", "Couldn't record the connection test.", { status: 503, retryable: true });
  }
  return data;
}

// Tests the connection and records the outcome on its row. -> the updated row (snake_case)
export async function runProviderTest({ admin, provider, userId = null }) {
  const { status, checks, lastError } = await checkProvider({ admin, provider, userId });
  const metadata = { ...(provider.metadata || {}), checks };
  if (lastError) metadata.lastError = lastError;
  else delete metadata.lastError;
  return writeHealth(admin, provider, { status, last_checked_at: new Date().toISOString(), metadata });
}

// A provider_auth failure during real use: flag the row so Settings → AI Providers shows it (spec §5.6).
export async function markProviderError({ admin, projectId, providerId, capability, error }) {
  try {
    const { data: provider } = await admin
      .from("model_providers")
      .select("id,project_id,metadata")
      .eq("id", providerId)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!provider) return;
    const lastError = { code: error.code, message: error.message, capability, at: new Date().toISOString() };
    await writeHealth(admin, provider, { status: "error", metadata: { ...(provider.metadata || {}), lastError } });
  } catch (err) {
    console.error("[ai.provider_test.mark]", err?.code || "write_failed");
  }
}
