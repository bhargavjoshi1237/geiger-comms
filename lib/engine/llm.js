// Chat model resolution (knowledge-base-and-ai-providers spec §5.3), ported from geiger-grey: a provider + model id ->
// an AI SDK LanguageModel built directly on the customer's provider. The default model comes from ai_settings (lib/server/ai.js).
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { EngineError } from "./errors.js";
import { connectProvider } from "./secrets.js";
import { providerFetch } from "./net.js";
import { supportsTemperature } from "../ai/model_caps.js";

// These SDK factories read OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY when apiKey is
// undefined; comms never lets a call fall back to a platform key (spec §1.1).
const ENV_KEY_FORMATS = new Set(["openai", "anthropic", "google"]);

// conn: from connectProvider(..., capability: 'chat'). -> AI SDK LanguageModel
// Custom base URLs passed the SSRF guard; providerFetch keeps them there (no redirects, addresses re-checked at connect time).
export function buildLanguageModel(conn, modelId) {
  const { apiKey, baseUrl: baseURL, custom } = conn;
  if (!apiKey && ENV_KEY_FORMATS.has(conn.format)) {
    throw new EngineError("no_key", `Add an API key for "${conn.provider?.name || "this provider"}" in Settings → AI Providers.`, { status: 422 });
  }
  const fetch = custom ? providerFetch : undefined;
  switch (conn.format) {
    case "openai": {
      const openai = createOpenAI({ apiKey, baseURL, fetch });
      // Proxies behind a custom URL usually speak Chat Completions, not Responses.
      return custom ? openai.chat(modelId) : openai(modelId);
    }
    case "anthropic":
      return createAnthropic({ apiKey, baseURL, fetch })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey, baseURL, fetch })(modelId);
    case "openai_compatible":
      return createOpenAICompatible({
        name: conn.provider.provider === "openrouter" ? "openrouter" : "openai-compatible",
        baseURL,
        apiKey,
        includeUsage: true,
        fetch,
      }).chatModel(modelId);
    default:
      throw new EngineError("capability_missing", "This provider's chat format isn't supported.", { status: 422 });
  }
}

// -> { model, modelId, providerKind, providerId, providerName, supportsTemperature }
// `model` empty = the provider's first model. Throws EngineError provider_not_found | no_key |
// capability_missing | no_model | no_base_url | unsafe_base_url.
export async function resolveModel({ admin, projectId, providerId, model }) {
  const conn = await connectProvider({ admin, projectId, providerId, capability: "chat" });
  const modelId = String(model || "").trim() || conn.provider.models?.[0];
  if (!modelId) {
    throw new EngineError("no_model", `Add a model id to "${conn.provider.name}" in Settings → AI Providers.`, { status: 422 });
  }
  return {
    model: buildLanguageModel(conn, modelId),
    modelId,
    providerKind: conn.provider.provider,
    providerId: conn.provider.id,
    providerName: conn.provider.name,
    supportsTemperature: supportsTemperature(conn.provider.provider, modelId),
  };
}
