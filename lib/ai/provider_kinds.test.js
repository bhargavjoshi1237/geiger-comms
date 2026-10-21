import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROVIDER_KINDS,
  PROVIDER_PRESETS,
  capabilitiesOf,
  driverFormat,
  hasCapability,
  hasCustomBaseUrl,
  isProviderKind,
  keyRequired,
  resolveBaseUrl,
  suggestedModelsFor,
  providerKindLabel,
} from "./provider_kinds.js";

const row = (provider, extra = {}) => ({ provider, metadata: {}, ...extra });

test("every kind declares a format for each capability", () => {
  for (const [name, kind] of Object.entries(PROVIDER_KINDS)) {
    const caps = kind.capabilities === "user" ? kind.userCapabilities : kind.capabilities;
    for (const cap of caps) assert.ok(kind.formats[cap], `${name}.${cap} has no format`);
    assert.ok(["fixed", "editable", "required"].includes(kind.baseUrlMode), name);
  }
  // Mirrors the model_providers_provider_check constraint.
  assert.deepEqual(Object.keys(PROVIDER_KINDS), ["openai", "anthropic", "google", "openrouter", "openai_compatible", "cohere", "voyage"]);
  assert.equal(isProviderKind("openai"), true);
  assert.equal(isProviderKind("toString"), false);
});

test("presets are chat-only openai-compatible connections; local ones are flagged", () => {
  for (const preset of PROVIDER_PRESETS) {
    assert.equal(preset.kind, "openai_compatible", preset.id);
    assert.deepEqual(preset.capabilities, ["chat"], preset.id);
    assert.match(preset.baseUrl, /^https?:\/\//, preset.id);
  }
  const local = PROVIDER_PRESETS.filter((p) => p.local).map((p) => p.id);
  assert.deepEqual(local, ["ollama", "vllm", "lmstudio"]);
  for (const p of PROVIDER_PRESETS) assert.equal(p.local === true, p.baseUrl.startsWith("http://localhost"), p.id);
});

test("capabilities per kind (spec §3.1)", () => {
  assert.deepEqual(capabilitiesOf(row("openai")), ["chat", "embed"]);
  assert.deepEqual(capabilitiesOf(row("anthropic")), ["chat"]);
  assert.deepEqual(capabilitiesOf(row("google")), ["chat", "embed"]);
  assert.deepEqual(capabilitiesOf(row("openrouter")), ["chat"]);
  assert.deepEqual(capabilitiesOf(row("cohere")), ["embed"]);
  assert.deepEqual(capabilitiesOf(row("voyage")), ["embed"]);
  assert.deepEqual(capabilitiesOf(row("nope")), []);
  assert.deepEqual(capabilitiesOf(null), []);
  // A stored list never narrows or widens a fixed kind.
  assert.deepEqual(capabilitiesOf(row("voyage", { metadata: { capabilities: ["chat"] } })), ["embed"]);
});

test("openai_compatible reads metadata.capabilities, default chat", () => {
  assert.deepEqual(capabilitiesOf(row("openai_compatible")), ["chat"]);
  assert.deepEqual(capabilitiesOf(row("openai_compatible", { metadata: { capabilities: [] } })), ["chat"]);
  assert.deepEqual(capabilitiesOf(row("openai_compatible", { metadata: { capabilities: ["embed", "rerank", "bogus"] } })), ["embed"]);
  assert.deepEqual(capabilitiesOf(row("openai_compatible", { metadata: { capabilities: ["embed", "chat"] } })), ["chat", "embed"]);
  assert.equal(hasCapability(row("openai_compatible"), "embed"), false);
});

test("driver format per capability", () => {
  assert.equal(driverFormat(row("openai"), "chat"), "openai");
  assert.equal(driverFormat(row("openai"), "embed"), "openai");
  assert.equal(driverFormat(row("openai"), "rerank"), null);
  assert.equal(driverFormat(row("anthropic"), "chat"), "anthropic");
  assert.equal(driverFormat(row("anthropic"), "embed"), null);
  assert.equal(driverFormat(row("google"), "embed"), "google");
  assert.equal(driverFormat(row("openrouter"), "chat"), "openai_compatible");
  assert.equal(driverFormat(row("cohere"), "embed"), "cohere");
  assert.equal(driverFormat(row("voyage"), "embed"), "voyage");
  const compat = row("openai_compatible", { metadata: { capabilities: ["chat", "embed"] } });
  assert.equal(driverFormat(compat, "chat"), "openai_compatible");
  assert.equal(driverFormat(compat, "embed"), "openai");
  assert.equal(driverFormat(row("openai_compatible"), "embed"), null);
});

test("base URL resolution by mode", () => {
  assert.equal(resolveBaseUrl(row("openai")), "https://api.openai.com/v1");
  assert.equal(resolveBaseUrl(row("openai", { base_url: "https://proxy.example.com/v1/" })), "https://proxy.example.com/v1");
  assert.equal(resolveBaseUrl(row("openai", { baseUrl: "https://camel.example.com/v1" })), "https://camel.example.com/v1");
  assert.equal(resolveBaseUrl(row("voyage", { base_url: "https://evil.example.com" })), "https://api.voyageai.com/v1");
  assert.equal(resolveBaseUrl(row("google", { base_url: "https://evil.example.com" })), "https://generativelanguage.googleapis.com/v1beta");
  assert.equal(resolveBaseUrl(row("openai_compatible")), null);
  assert.equal(resolveBaseUrl(row("openai_compatible", { base_url: " http://localhost:11434/v1 " })), "http://localhost:11434/v1");
  assert.equal(hasCustomBaseUrl(row("openai")), false);
  assert.equal(hasCustomBaseUrl(row("openai", { base_url: "https://api.openai.com/v1/" })), false);
  assert.equal(hasCustomBaseUrl(row("cohere", { base_url: "https://cohere.proxy.example.com" })), true);
  assert.equal(hasCustomBaseUrl(row("openai_compatible", { base_url: "https://x.example.com/v1" })), true);
});

test("keys are optional only for openai-compatible servers", () => {
  assert.equal(keyRequired(row("openai_compatible")), false);
  assert.equal(keyRequired(row("anthropic")), true);
  assert.equal(keyRequired(row("openrouter")), true);
});

test("suggested models combine preset and kind", () => {
  const anthropic = suggestedModelsFor(row("anthropic"), "chat").map((m) => m.id);
  assert.deepEqual(anthropic, ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]);
  // The first OpenAI embedding suggestion is the one connecting assigns by default.
  assert.deepEqual(suggestedModelsFor(row("openai"), "embed")[0], { id: "text-embedding-3-small", label: "OpenAI text-embedding-3-small", dims: 1536 });
  assert.deepEqual(suggestedModelsFor(row("openai", { base_url: "https://proxy.example.com/v1" }), "chat"), []);
  const groq = row("openai_compatible", { base_url: "https://api.groq.com/openai/v1", metadata: { preset: "groq" } });
  assert.deepEqual(suggestedModelsFor(groq, "chat").map((m) => m.id), ["llama-3.3-70b-versatile"]);
  assert.deepEqual(suggestedModelsFor(groq, "embed"), []);
  assert.deepEqual(suggestedModelsFor(row("voyage"), "embed")[0], { id: "voyage-3.5", label: "Voyage 3.5", dims: 1024 });
});

test("labels prefer the preset", () => {
  assert.equal(providerKindLabel("openai_compatible", "groq"), "Groq");
  assert.equal(providerKindLabel("google"), "Google Gemini");
  assert.equal(providerKindLabel("mystery"), "mystery");
});
