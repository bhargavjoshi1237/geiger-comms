import "server-only";
import { connectProvider } from "@/lib/engine/secrets";
import { requestJson } from "@/lib/engine/drivers/http";
import { capabilitiesOf, hasCapability, suggestedModelsFor } from "@/lib/ai/provider_kinds";
import { cohereUrl, joinUrl } from "@/lib/ai/embedding_models";
import { mapLlmError } from "@/lib/ai/llm_errors";
import { recordUsage } from "./ai_usage";
import { markProviderError } from "./provider_test";

// Model catalogue of a saved provider (spec §5.7). Only for a provider whose key is already stored, so a key
// never travels just to list models; custom base URLs go through providerFetch (requestJson's noRedirect).

const MAX_IDS = 200;
const TIMEOUT_MS = 15_000;

const bearer = (apiKey) => (apiKey ? { Authorization: `Bearer ${apiKey}` } : {});
const ids = (list) => [...new Set(list.filter((id) => typeof id === "string" && id))].sort().slice(0, MAX_IDS);

// -> { chat: string[], embed: string[] } straight from the vendor's listing.
async function fetchCatalogue(conn) {
  const get = (url, headers) => requestJson(url, { method: "GET", headers }, { timeoutMs: TIMEOUT_MS, retries: 0, noRedirect: conn.custom });
  const kind = conn.provider.provider;
  if (kind === "anthropic") {
    const json = await get(joinUrl(conn.baseUrl, "models?limit=1000"), { "x-api-key": conn.apiKey, "anthropic-version": "2023-06-01" });
    return { chat: (json?.data || []).map((m) => m?.id), embed: [] };
  }
  if (kind === "google") {
    const json = await get(joinUrl(conn.baseUrl, "models?pageSize=1000"), { "x-goog-api-key": conn.apiKey });
    const models = json?.models || [];
    const named = (method) =>
      models.filter((m) => (m?.supportedGenerationMethods || []).includes(method)).map((m) => String(m?.name || "").replace(/^models\//, ""));
    return { chat: named("generateContent"), embed: named("embedContent") };
  }
  if (kind === "cohere") {
    const json = await get(cohereUrl(conn.baseUrl, "models?endpoint=embed", "v1"), bearer(conn.apiKey));
    return { chat: [], embed: (json?.models || []).map((m) => m?.name) };
  }
  // OpenAI and OpenAI-compatible servers (OpenRouter included) list everything under /models.
  const json = await get(joinUrl(conn.baseUrl, "models"), bearer(conn.apiKey));
  const all = (json?.data || []).map((m) => m?.id);
  return { chat: all.filter((id) => !/embed/i.test(id || "")), embed: all.filter((id) => /embed/i.test(id || "")) };
}

// -> { chat, embed }, each capped and sorted, limited to what the provider serves. Throws EngineError / provider errors.
export async function listProviderModels({ admin, provider, userId = null }) {
  const capability = capabilitiesOf(provider)[0];
  if (provider.provider === "voyage") {
    return { chat: [], embed: suggestedModelsFor(provider, "embed").map((m) => m.id) };
  }
  const started = Date.now();
  const meter = (fields) =>
    recordUsage({ projectId: provider.project_id, providerId: provider.id, feature: "models", capability, latencyMs: Date.now() - started, userId, ...fields });
  try {
    const conn = await connectProvider({ admin, projectId: provider.project_id, providerId: provider.id, capability });
    const catalogue = await fetchCatalogue(conn);
    meter({ ok: true });
    return {
      chat: hasCapability(provider, "chat") ? ids(catalogue.chat) : [],
      embed: hasCapability(provider, "embed") ? ids(catalogue.embed) : [],
    };
  } catch (err) {
    const mapped = mapLlmError(err);
    meter({ ok: false, errorCode: mapped.code });
    if (mapped.markProviderError) {
      await markProviderError({ admin, projectId: provider.project_id, providerId: provider.id, capability, error: mapped });
    }
    throw err;
  }
}
