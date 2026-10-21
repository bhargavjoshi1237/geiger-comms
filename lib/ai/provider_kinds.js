// AI provider registry (knowledge-base-and-ai-providers spec §3.1). Pure: no I/O. A connection is a
// comms.model_providers row (snake_case from the engine, camelCase from the UI — both share `provider`
// and `metadata`). Its kind decides which capabilities it offers and which driver (wire format) serves each one.

import { SUGGESTED_EMBEDDING_MODELS } from "./embedding_models.js";

export const CAPABILITIES = ["chat", "embed"];

export const CAPABILITY_LABELS = {
  chat: "Chat",
  embed: "Embeddings",
};

// Embedding suggestions come from embedding_models.js so ids and dims live in one place; `ids` sets their order.
const embedSuggestions = (format, ids) =>
  (ids ? ids.map((id) => SUGGESTED_EMBEDDING_MODELS[format].find((m) => m.id === id)) : SUGGESTED_EMBEDDING_MODELS[format])
    .map((m) => ({ id: m.id, label: m.label, dims: m.nativeDims }));

export const PROVIDER_KINDS = {
  openai: {
    label: "OpenAI",
    capabilities: ["chat", "embed"],
    formats: { chat: "openai", embed: "openai" },
    baseUrl: "https://api.openai.com/v1",
    baseUrlMode: "editable",
    suggestedModels: {
      chat: [
        { id: "gpt-5", label: "GPT-5" },
        { id: "gpt-5-mini", label: "GPT-5 mini" },
      ],
      embed: embedSuggestions("openai", ["text-embedding-3-small", "text-embedding-3-large"]),
    },
  },
  anthropic: {
    label: "Anthropic",
    capabilities: ["chat"],
    formats: { chat: "anthropic" },
    baseUrl: "https://api.anthropic.com/v1",
    baseUrlMode: "editable",
    suggestedModels: {
      chat: [
        { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
        { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
        { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
      ],
    },
  },
  google: {
    label: "Google Gemini",
    capabilities: ["chat", "embed"],
    formats: { chat: "google", embed: "google" },
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    baseUrlMode: "fixed",
    suggestedModels: {
      chat: [
        { id: "gemini-3-pro", label: "Gemini 3 Pro" },
        { id: "gemini-3-flash", label: "Gemini 3 Flash" },
      ],
      embed: embedSuggestions("google"),
    },
  },
  openrouter: {
    label: "OpenRouter",
    capabilities: ["chat"],
    formats: { chat: "openai_compatible" },
    baseUrl: "https://openrouter.ai/api/v1",
    baseUrlMode: "fixed",
    suggestedModels: {},
  },
  openai_compatible: {
    label: "OpenAI-compatible",
    // The user picks a subset of these; stored in metadata.capabilities.
    capabilities: "user",
    userCapabilities: ["chat", "embed"],
    formats: { chat: "openai_compatible", embed: "openai" },
    baseUrl: null,
    baseUrlMode: "required",
    suggestedModels: {},
  },
  cohere: {
    label: "Cohere",
    capabilities: ["embed"],
    formats: { embed: "cohere" },
    baseUrl: "https://api.cohere.com",
    baseUrlMode: "editable",
    suggestedModels: { embed: embedSuggestions("cohere") },
  },
  voyage: {
    label: "Voyage AI",
    capabilities: ["embed"],
    formats: { embed: "voyage" },
    baseUrl: "https://api.voyageai.com/v1",
    baseUrlMode: "fixed",
    suggestedModels: { embed: embedSuggestions("voyage") },
  },
};

// UI templates that prefill a connection; each is stored as an openai_compatible
// connection with metadata.preset = id. `local` presets need localProvidersAllowed.
export const PROVIDER_PRESETS = [
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    suggestedModels: { chat: [{ id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" }] },
  },
  { id: "together", label: "Together AI", baseUrl: "https://api.together.xyz/v1" },
  { id: "fireworks", label: "Fireworks", baseUrl: "https://api.fireworks.ai/inference/v1" },
  {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    suggestedModels: { chat: [{ id: "mistral-large-latest", label: "Mistral Large" }] },
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    suggestedModels: { chat: [{ id: "deepseek-chat", label: "DeepSeek Chat" }] },
  },
  {
    id: "xai",
    label: "xAI",
    baseUrl: "https://api.x.ai/v1",
    suggestedModels: { chat: [{ id: "grok-4", label: "Grok 4" }] },
  },
  { id: "ollama", label: "Ollama", baseUrl: "http://localhost:11434/v1", local: true },
  { id: "vllm", label: "vLLM", baseUrl: "http://localhost:8000/v1", local: true },
  { id: "lmstudio", label: "LM Studio", baseUrl: "http://localhost:1234/v1", local: true },
].map((preset) => ({ kind: "openai_compatible", capabilities: ["chat"], ...preset }));

const PRESETS_BY_ID = Object.fromEntries(PROVIDER_PRESETS.map((p) => [p.id, p]));

export function isProviderKind(value) {
  return Object.prototype.hasOwnProperty.call(PROVIDER_KINDS, value);
}

export function kindOf(providerRow) {
  return PROVIDER_KINDS[providerRow?.provider] || null;
}

export function presetOf(providerRow) {
  const id = providerRow?.metadata?.preset;
  return (id && PRESETS_BY_ID[id]) || null;
}

export function presetById(id) {
  return PRESETS_BY_ID[id] || null;
}

// openai_compatible reads metadata.capabilities (default ['chat']); fixed kinds return their own list.
export function capabilitiesOf(providerRow) {
  const kind = kindOf(providerRow);
  if (!kind) return [];
  if (kind.capabilities !== "user") return [...kind.capabilities];
  const stored = providerRow?.metadata?.capabilities;
  const picked = Array.isArray(stored) ? kind.userCapabilities.filter((c) => stored.includes(c)) : [];
  return picked.length ? picked : ["chat"];
}

export function hasCapability(providerRow, capability) {
  return capabilitiesOf(providerRow).includes(capability);
}

// -> 'openai'|'anthropic'|'google'|'openai_compatible'|'cohere'|'voyage'|null
export function driverFormat(providerRow, capability) {
  if (!hasCapability(providerRow, capability)) return null;
  return kindOf(providerRow)?.formats?.[capability] || null;
}

// The base URL a connection actually calls: fixed kinds ignore the stored value,
// editable kinds fall back to the kind default, required kinds use only the stored one.
export function resolveBaseUrl(providerRow) {
  const kind = kindOf(providerRow);
  if (!kind) return null;
  const stored = String(providerRow?.base_url ?? providerRow?.baseUrl ?? "").trim();
  const value = kind.baseUrlMode === "fixed" ? kind.baseUrl : stored || kind.baseUrl;
  return value ? value.replace(/\/+$/, "") : null;
}

// True when the connection calls somewhere other than its kind's default URL
// (custom URLs pass the SSRF guard before any request is made).
export function hasCustomBaseUrl(providerRow) {
  const kind = kindOf(providerRow);
  const url = resolveBaseUrl(providerRow);
  if (!kind || !url) return false;
  return !kind.baseUrl || url !== kind.baseUrl.replace(/\/+$/, "");
}

// Local servers (Ollama, vLLM, LM Studio) often run without auth.
export function keyRequired(providerRow) {
  return providerRow?.provider !== "openai_compatible";
}

// Preset suggestions first, then the kind's own (the kind's only when the
// connection still calls the kind's default URL, since a custom server may not
// serve the vendor's model ids).
export function suggestedModelsFor(providerRow, capability) {
  const kind = kindOf(providerRow);
  if (!kind || !hasCapability(providerRow, capability)) return [];
  const fromPreset = presetOf(providerRow)?.suggestedModels?.[capability] || [];
  const fromKind = hasCustomBaseUrl(providerRow) ? [] : kind.suggestedModels?.[capability] || [];
  const seen = new Set();
  return [...fromPreset, ...fromKind].filter((m) => (seen.has(m.id) ? false : seen.add(m.id)));
}

export function providerKindLabel(kind, presetId) {
  return PRESETS_BY_ID[presetId]?.label || PROVIDER_KINDS[kind]?.label || kind || "";
}
