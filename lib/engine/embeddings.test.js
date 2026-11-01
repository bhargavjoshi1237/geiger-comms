import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { detectEmbeddingDims, embedTexts, toPgVector } from "./embeddings.js";
import { PROJECT, fakeAdmin, jsonResponse, provider, stubFetch, uuid } from "./test_helpers.js";

// Local / custom provider URLs are opt-in (localProvidersAllowed); with the opt-in, custom
// URLs skip DNS and use the stubbed global fetch instead of the pinned transport.
process.env.COMMS_ALLOW_LOCAL_PROVIDERS = "1";

let stub = null;
afterEach(() => {
  stub?.restore();
  stub = null;
});

const openaiVectors = (body, dims) =>
  jsonResponse({
    data: body.input.map((_, index) => ({ index, embedding: Array(dims).fill(index / 10) })),
    usage: { total_tokens: body.input.length },
  });

const openai = provider(1, "openai");
const cohere = provider(2, "cohere");
const local = provider(3, "openai_compatible", { base_url: "http://localhost:11434/v1", metadata: { capabilities: ["chat", "embed"] } });
const anthropic = provider(4, "anthropic");
const admin = fakeAdmin({
  tables: { model_providers: [openai, cohere, local, anthropic] },
  secrets: { [openai.id]: "sk-openai-test-key", [cohere.id]: "co-key", [anthropic.id]: "sk-ant-key" },
});
const embed = (extra) => ({ providerId: openai.id, model: "text-embedding-3-large", dims: 1024, ...extra });
const codeIs = (code) => (err) => err.code === code;

test("a missing default, model or dims fails with an actionable code", async () => {
  await assert.rejects(
    embedTexts({ admin, projectId: PROJECT, embed: embed({ providerId: null }), texts: ["a"] }),
    (err) => err.code === "ai_no_default" && /Default Models/.test(err.message),
  );
  await assert.rejects(embedTexts({ admin, projectId: PROJECT, embed: embed({ model: "" }), texts: ["a"] }), codeIs("no_model"));
  await assert.rejects(embedTexts({ admin, projectId: PROJECT, embed: embed({ dims: null }), texts: ["a"] }), codeIs("no_dims"));
});

test("batches, orders and sends the dimension param when the model accepts it", async () => {
  stub = stubFetch((url, init, i, call) => openaiVectors(call.body, 1024));
  const texts = Array.from({ length: 300 }, (_, i) => `t${i}`);
  const out = await embedTexts({ admin, projectId: PROJECT, embed: embed(), texts, inputType: "document" });
  assert.equal(stub.calls.length, 2);
  assert.equal(stub.calls[0].url, "https://api.openai.com/v1/embeddings");
  assert.equal(stub.calls[0].body.dimensions, 1024);
  assert.equal(stub.calls[0].init.headers.Authorization, "Bearer sk-openai-test-key");
  assert.deepEqual(stub.calls.map((c) => c.body.input.length).sort((a, b) => a - b), [44, 256]);
  assert.equal(out.vectors.length, 300);
  assert.equal(out.tokens, 300);
  assert.equal(out.dims, 1024);
  assert.ok(out.vectors.every((v) => v.length === 1024));
  assert.equal(await embedTexts({ admin, projectId: PROJECT, embed: embed(), texts: [] }).then((r) => r.vectors.length), 0);
});

test("vectors of the wrong length fail with dims_mismatch", async () => {
  stub = stubFetch((url, init, i, call) => openaiVectors(call.body, 768));
  await assert.rejects(
    embedTexts({ admin, projectId: PROJECT, embed: embed(), texts: ["a"] }),
    (err) => err.code === "dims_mismatch" && /768-dimension vectors but this workspace expects 1024/.test(err.message),
  );
});

test("retries 429 honouring Retry-After, but not auth errors", async () => {
  stub = stubFetch((url, init, i, call) => (i === 0 ? jsonResponse({}, 429, { "retry-after": "0" }) : openaiVectors(call.body, 1024)));
  const out = await embedTexts({ admin, projectId: PROJECT, embed: embed(), texts: ["a"], inputType: "query" });
  assert.equal(stub.calls.length, 2);
  assert.equal(out.vectors.length, 1);
  stub.restore();

  stub = stubFetch(() => jsonResponse({ error: { message: "Incorrect API key sk-openai-test-key" } }, 401));
  await assert.rejects(embedTexts({ admin, projectId: PROJECT, embed: embed(), texts: ["a"] }), (err) => {
    assert.equal(err.code, "provider_auth");
    assert.equal(err.providerStatus, 401);
    assert.doesNotMatch(err.message, /sk-openai/);
    return true;
  });
  assert.equal(stub.calls.length, 1);
  stub.restore();

  stub = stubFetch(() => jsonResponse({}, 503, { "retry-after": "120" }));
  await assert.rejects(embedTexts({ admin, projectId: PROJECT, embed: embed(), texts: ["a"] }), (err) => err.code === "provider_unavailable" && err.retryable);
  assert.equal(stub.calls.length, 1, "a Retry-After over 10 s fails fast");
});

test("keeps at most 3 batches in flight", async () => {
  let active = 0;
  let peak = 0;
  stub = stubFetch(async (url, init, i, call) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return jsonResponse({ embeddings: { float: call.body.texts.map(() => Array(1024).fill(0)) }, meta: { billed_units: { input_tokens: 1 } } });
  });
  const texts = Array.from({ length: 96 * 7 }, () => "x");
  const out = await embedTexts({ admin, projectId: PROJECT, embed: embed({ providerId: cohere.id, model: "embed-v4.0" }), texts });
  assert.equal(stub.calls.length, 7);
  assert.equal(stub.calls[0].url, "https://api.cohere.com/v2/embed");
  assert.ok(peak <= 3, `peak ${peak}`);
  assert.equal(out.tokens, 7);
});

test("connections must exist, embed and have a key (local servers may skip it)", async () => {
  await assert.rejects(embedTexts({ admin, projectId: PROJECT, embed: embed({ providerId: uuid(404) }), texts: ["a"] }), codeIs("provider_not_found"));
  await assert.rejects(embedTexts({ admin, projectId: PROJECT, embed: embed({ providerId: anthropic.id }), texts: ["a"] }), codeIs("capability_missing"));
  const noKey = fakeAdmin({ tables: { model_providers: [openai] } });
  await assert.rejects(embedTexts({ admin: noKey, projectId: PROJECT, embed: embed(), texts: ["a"] }), codeIs("no_key"));

  stub = stubFetch((url, init, i, call) => openaiVectors(call.body, 768));
  const out = await embedTexts({ admin, projectId: PROJECT, embed: embed({ providerId: local.id, model: "nomic-embed-text", dims: 768 }), texts: ["a"] });
  assert.equal(out.dims, 768);
  assert.equal(stub.calls[0].url, "http://localhost:11434/v1/embeddings");
  assert.equal(stub.calls[0].init.headers.Authorization, undefined);
  assert.equal(stub.calls[0].body.dimensions, undefined);
  assert.equal(stub.calls[0].init.redirect, "error");
});

test("private custom base URLs are blocked without the local opt-in, whatever NODE_ENV", async () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, COMMS_ALLOW_LOCAL_PROVIDERS: process.env.COMMS_ALLOW_LOCAL_PROVIDERS };
  delete process.env.COMMS_ALLOW_LOCAL_PROVIDERS;
  stub = stubFetch(() => assert.fail("no request may be sent"));
  try {
    for (const nodeEnv of [undefined, "test", "production"]) {
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;
      await assert.rejects(
        embedTexts({ admin, projectId: PROJECT, embed: embed({ providerId: local.id, model: "nomic-embed-text", dims: 768 }), texts: ["a"] }),
        codeIs("unsafe_base_url"),
        String(nodeEnv),
      );
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("detect reports the vector length, asking for the native size when supported", async () => {
  stub = stubFetch((url, init, i, call) => openaiVectors(call.body, call.body.dimensions || 3072));
  assert.deepEqual(await detectEmbeddingDims({ admin, projectId: PROJECT, providerId: openai.id, model: "text-embedding-3-small" }), { dims: 1536 });
  assert.equal(stub.calls[0].body.input[0], "ping");
  assert.deepEqual(await detectEmbeddingDims({ admin, projectId: PROJECT, providerId: openai.id, model: "text-embedding-3-small", requestedDims: 512 }), { dims: 512 });
  assert.deepEqual(await detectEmbeddingDims({ admin, projectId: PROJECT, providerId: openai.id, model: "text-embedding-ada-002" }), { dims: 3072 });
  assert.equal(stub.calls[2].body.dimensions, undefined);
  await assert.rejects(detectEmbeddingDims({ admin, projectId: PROJECT, providerId: openai.id, model: "" }), codeIs("no_model"));
  await assert.rejects(detectEmbeddingDims({ admin, projectId: PROJECT, providerId: openai.id, model: "m", requestedDims: 5000 }), codeIs("unsupported_dims"));
  stub.restore();
  stub = stubFetch((url, init, i, call) => openaiVectors(call.body, 8192));
  await assert.rejects(detectEmbeddingDims({ admin, projectId: PROJECT, providerId: local.id, model: "big" }), codeIs("unsupported_dims"));
});

test("toPgVector is re-exported for writers", () => {
  assert.equal(toPgVector([1, 2]), "[1,2]");
});
