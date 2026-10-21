import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BATCH_LIMITS,
  DEFAULT_REQUESTED_DIMS,
  SUGGESTED_EMBEDDING_MODELS,
  acceptsDimensionParam,
  buildEmbedRequest,
  cohereUrl,
  defaultRequestedDims,
  embeddingModelLabel,
  isIndexedDims,
  isValidDims,
  parseEmbedResponse,
  planBatches,
  toPgVector,
} from "./embedding_models.js";

const body = (req) => JSON.parse(req.init.body);

test("labels fall back to the raw id", () => {
  assert.equal(DEFAULT_REQUESTED_DIMS, 1024);
  assert.equal(embeddingModelLabel("text-embedding-3-large"), "OpenAI text-embedding-3-large");
  assert.equal(embeddingModelLabel("my-model"), "my-model");
  assert.equal(embeddingModelLabel(""), "");
});

test("dimension rules", () => {
  assert.equal(isValidDims(64), true);
  assert.equal(isValidDims(4000), true);
  assert.equal(isValidDims(63), false);
  assert.equal(isValidDims(4001), false);
  assert.equal(isValidDims(1024.5), false);
  assert.equal(isIndexedDims(1024), true);
  assert.equal(isIndexedDims(1000), false);
  assert.equal(acceptsDimensionParam("openai", "text-embedding-3-large"), true);
  assert.equal(acceptsDimensionParam("openai", "nomic-embed-text"), false);
  assert.equal(acceptsDimensionParam("openai", "text-embedding-ada-002"), false);
  assert.equal(acceptsDimensionParam("cohere", "embed-v4.0"), true);
  assert.equal(acceptsDimensionParam("cohere", "embed-english-v3.0"), false);
  assert.equal(acceptsDimensionParam("voyage", "voyage-3.5-lite"), true);
  assert.equal(acceptsDimensionParam("voyage", "voyage-3"), false);
  assert.equal(acceptsDimensionParam("google", "models/gemini-embedding-001"), true);
  assert.equal(acceptsDimensionParam("nope", "x"), false);
});

test("default requested dims are the model's native size, every one of them indexed", () => {
  assert.equal(defaultRequestedDims("openai", "text-embedding-3-small"), 1536);
  assert.equal(defaultRequestedDims("google", "models/gemini-embedding-001"), 3072);
  assert.equal(defaultRequestedDims("openai", "nomic-embed-text"), 768);
  assert.equal(defaultRequestedDims("openai", "unknown-model"), 1024);
  for (const list of Object.values(SUGGESTED_EMBEDDING_MODELS)) {
    for (const m of list) assert.ok(isIndexedDims(m.nativeDims), m.id);
  }
});

test("openai request body", () => {
  const req = buildEmbedRequest({ format: "openai", baseUrl: "https://api.openai.com/v1/", apiKey: "sk-test", model: "text-embedding-3-large", texts: ["a", "b"], dimensions: 1024 });
  assert.equal(req.url, "https://api.openai.com/v1/embeddings");
  assert.equal(req.init.method, "POST");
  assert.equal(req.init.headers.Authorization, "Bearer sk-test");
  assert.deepEqual(body(req), { model: "text-embedding-3-large", input: ["a", "b"], encoding_format: "float", dimensions: 1024 });
  const keyless = buildEmbedRequest({ format: "openai", baseUrl: "http://localhost:11434/v1", model: "nomic-embed-text", texts: ["a"] });
  assert.equal(keyless.init.headers.Authorization, undefined);
  assert.equal(body(keyless).dimensions, undefined);
});

test("cohere request body and versioned base URLs", () => {
  const req = buildEmbedRequest({ format: "cohere", baseUrl: "https://api.cohere.com", apiKey: "k", model: "embed-v5.0-pro", texts: ["a"], inputType: "query", dimensions: 1024 });
  assert.equal(req.url, "https://api.cohere.com/v2/embed");
  assert.deepEqual(body(req), { model: "embed-v5.0-pro", texts: ["a"], input_type: "search_query", embedding_types: ["float"], output_dimension: 1024 });
  const doc = buildEmbedRequest({ format: "cohere", baseUrl: "https://compat.example.com/v1", apiKey: "k", model: "m", texts: ["a"] });
  assert.equal(doc.url, "https://compat.example.com/v1/embed");
  assert.equal(body(doc).input_type, "search_document");
  assert.equal(cohereUrl("https://api.cohere.com", "models?endpoint=embed", "v1"), "https://api.cohere.com/v1/models?endpoint=embed");
});

test("voyage request body", () => {
  const req = buildEmbedRequest({ format: "voyage", baseUrl: "https://api.voyageai.com/v1", apiKey: "k", model: "voyage-3.5", texts: ["a"], inputType: "document", dimensions: 1024 });
  assert.equal(req.url, "https://api.voyageai.com/v1/embeddings");
  assert.deepEqual(body(req), { model: "voyage-3.5", input: ["a"], input_type: "document", output_dimension: 1024 });
});

test("google request body", () => {
  const req = buildEmbedRequest({ format: "google", baseUrl: "https://generativelanguage.googleapis.com/v1beta", apiKey: "g-key", model: "models/gemini-embedding-001", texts: ["a", "b"], inputType: "query", dimensions: 768 });
  assert.equal(req.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents");
  assert.equal(req.init.headers["x-goog-api-key"], "g-key");
  const parsed = body(req);
  assert.equal(parsed.requests.length, 2);
  assert.deepEqual(parsed.requests[0], {
    model: "models/gemini-embedding-001",
    content: { parts: [{ text: "a" }] },
    taskType: "RETRIEVAL_QUERY",
    outputDimensionality: 768,
  });
});

test("unknown formats throw", () => {
  assert.throws(() => buildEmbedRequest({ format: "nope", baseUrl: "x", model: "m", texts: [] }));
  assert.throws(() => parseEmbedResponse("nope", {}));
});

test("response parsers", () => {
  const openai = parseEmbedResponse("openai", { data: [{ index: 1, embedding: [3, 4] }, { index: 0, embedding: [1, 2] }], usage: { total_tokens: 7 } }, ["a", "b"]);
  assert.deepEqual(openai, { vectors: [[1, 2], [3, 4]], tokens: 7 });
  const cohere = parseEmbedResponse("cohere", { embeddings: { float: [[1, 2]] }, meta: { billed_units: { input_tokens: 3 } } }, ["a"]);
  assert.deepEqual(cohere, { vectors: [[1, 2]], tokens: 3 });
  const voyage = parseEmbedResponse("voyage", { data: [{ index: 0, embedding: [5] }], usage: { total_tokens: 2 } }, ["a"]);
  assert.deepEqual(voyage, { vectors: [[5]], tokens: 2 });
  const google = parseEmbedResponse("google", { embeddings: [{ values: [1, 1] }] }, ["abcdefgh"]);
  assert.deepEqual(google, { vectors: [[1, 1]], tokens: 2 });
  assert.throws(() => parseEmbedResponse("openai", { data: [] }, ["a"]), /Expected 1 vectors/);
  assert.throws(() => parseEmbedResponse("cohere", { embeddings: {} }, ["a"]), /no vectors/);
});

test("batch planning respects count and character limits", () => {
  const texts = Array.from({ length: 200 }, () => "x");
  const cohere = planBatches(texts, { format: "cohere" });
  assert.deepEqual(cohere, [{ start: 0, end: 96 }, { start: 96, end: 192 }, { start: 192, end: 200 }]);
  assert.equal(planBatches(texts, { format: "openai" }).length, 1);
  assert.equal(BATCH_LIMITS.voyage, 128);
  assert.equal(BATCH_LIMITS.google, 100);
  const long = ["a".repeat(60), "b".repeat(60), "c".repeat(10)];
  assert.deepEqual(planBatches(long, { format: "openai", maxChars: 100 }), [{ start: 0, end: 1 }, { start: 1, end: 3 }]);
  assert.deepEqual(planBatches(["z".repeat(500)], { format: "openai", maxChars: 100 }), [{ start: 0, end: 1 }]);
  assert.deepEqual(planBatches([], { format: "openai" }), []);
});

test("pgvector literal", () => {
  assert.equal(toPgVector([0.1, -2, 3e-5]), "[0.1,-2,0.00003]");
  assert.throws(() => toPgVector([]));
  assert.throws(() => toPgVector([1, NaN]));
  assert.throws(() => toPgVector("1,2"));
});
