import { test } from "node:test";
import assert from "node:assert/strict";
import { generateText } from "ai";
import { buildLanguageModel, resolveModel } from "./llm.js";
import { OTHER_PROJECT, PROJECT, fakeAdmin, jsonResponse, provider, stubFetch } from "./test_helpers.js";

// Local / custom provider URLs are opt-in (localProvidersAllowed); with the opt-in, custom
// URLs skip DNS and use the stubbed global fetch instead of the pinned transport.
process.env.COMMS_ALLOW_LOCAL_PROVIDERS = "1";

const anthropic = provider(1, "anthropic", { models: ["claude-sonnet-5-5"] });
const openai = provider(2, "openai", { models: ["gpt-4.1"] });
const compat = provider(3, "openai_compatible", { base_url: "http://localhost:8000/v1", models: ["llama"] });
const cohere = provider(4, "cohere");
const bare = provider(5, "openai", { models: [] });
const foreign = provider(6, "openai", { project_id: OTHER_PROJECT, models: ["gpt-4.1"] });
const tables = { model_providers: [anthropic, openai, compat, cohere, bare, foreign] };
const secrets = { [anthropic.id]: "sk-ant", [openai.id]: "sk-oai", [cohere.id]: "co", [bare.id]: "sk-b", [foreign.id]: "sk-f" };
const admin = fakeAdmin({ tables, secrets });
const codeIs = (code) => (err) => err.code === code;

test("builds models per driver and reports temperature support", async () => {
  const claude = await resolveModel({ admin, projectId: PROJECT, providerId: anthropic.id, model: "claude-sonnet-5-5" });
  assert.equal(claude.modelId, "claude-sonnet-5-5");
  assert.equal(claude.model.modelId, "claude-sonnet-5-5");
  assert.equal(claude.providerKind, "anthropic");
  assert.equal(claude.providerName, "anthropic connection");
  assert.equal(claude.supportsTemperature, false);

  const gpt = await resolveModel({ admin, projectId: PROJECT, providerId: openai.id });
  assert.equal(gpt.modelId, "gpt-4.1", "falls back to the connection's first model");
  assert.equal(gpt.supportsTemperature, true);

  const local = await resolveModel({ admin, projectId: PROJECT, providerId: compat.id, model: "llama" });
  assert.equal(local.providerKind, "openai_compatible");
  assert.match(local.model.provider, /openai-compatible/);
});

test("resolution errors", async () => {
  await assert.rejects(resolveModel({ admin, projectId: PROJECT, providerId: null }), codeIs("provider_not_found"));
  await assert.rejects(resolveModel({ admin, projectId: PROJECT, providerId: foreign.id }), codeIs("provider_not_found"));
  await assert.rejects(resolveModel({ admin, projectId: PROJECT, providerId: cohere.id }), codeIs("capability_missing"));
  await assert.rejects(resolveModel({ admin, projectId: PROJECT, providerId: bare.id }), codeIs("no_model"));
  const keyless = fakeAdmin({ tables });
  await assert.rejects(resolveModel({ admin: keyless, projectId: PROJECT, providerId: anthropic.id }), codeIs("no_key"));
});

test("a kind whose SDK would read a platform env key is refused without an explicit key", () => {
  const conn = (format) => ({ format, provider: { name: "x", provider: format }, baseUrl: "https://api.example.com/v1", custom: false });
  const saved = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-platform-must-never-be-used";
  try {
    for (const format of ["openai", "anthropic", "google"]) {
      assert.throws(() => buildLanguageModel(conn(format), "m"), codeIs("no_key"), format);
    }
    // OpenAI-compatible local servers may run without auth, and that SDK never reads env keys.
    assert.ok(buildLanguageModel({ ...conn("openai_compatible"), provider: { name: "x", provider: "openai_compatible" } }, "m"));
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  }
});

test("custom base URLs send chat requests through providerFetch (redirect: error)", async () => {
  const completion = {
    id: "c1",
    object: "chat.completion",
    created: 0,
    model: "llama",
    choices: [{ index: 0, message: { role: "assistant", content: "pong" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
  const stub = stubFetch(() => jsonResponse(completion));
  try {
    const { model } = await resolveModel({ admin, projectId: PROJECT, providerId: compat.id, model: "llama" });
    const out = await generateText({ model, prompt: "ping", maxRetries: 0 });
    assert.equal(out.text, "pong");
    assert.equal(stub.calls[0].url, "http://localhost:8000/v1/chat/completions");
    assert.equal(stub.calls[0].init.redirect, "error");
  } finally {
    stub.restore();
  }
});
