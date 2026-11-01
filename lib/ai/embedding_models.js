// Embedding models and wire formats (knowledge-base-and-ai-providers spec §3.2). Pure: request builders
// and response parsers per driver format, batch planning and the pgvector literal. lib/engine/drivers/embed/* does the I/O.

export const EMBED_FORMATS = ["openai", "cohere", "voyage", "google"];

export const MIN_DIMS = 64;
export const MAX_DIMS = 4000;
// Dimension-param models whose native size isn't known are asked for this.
export const DEFAULT_REQUESTED_DIMS = 1024;
// Dimensions with a partial HNSW index (knowledge_index migration); others use exact search.
export const INDEXED_DIMS = [256, 384, 512, 768, 1024, 1536, 2048, 3072];

export const BATCH_LIMITS = { openai: 256, cohere: 96, voyage: 128, google: 100 };
// Keeps one request well under every provider's per-request token cap (~100k tokens).
export const MAX_BATCH_CHARS = 400_000;

// Suggested models per driver format. nativeDims is the model's default output;
// dimensionParam says whether the driver may ask for another size.
export const SUGGESTED_EMBEDDING_MODELS = {
  openai: [
    { id: "text-embedding-3-large", label: "OpenAI text-embedding-3-large", nativeDims: 3072, dimensionParam: true },
    { id: "text-embedding-3-small", label: "OpenAI text-embedding-3-small", nativeDims: 1536, dimensionParam: true },
    { id: "mistral-embed", label: "Mistral Embed", nativeDims: 1024, dimensionParam: false },
    { id: "nomic-embed-text", label: "Nomic Embed Text", nativeDims: 768, dimensionParam: false },
  ],
  cohere: [
    { id: "embed-v5.0-pro", label: "Cohere Embed v5 Pro", nativeDims: 1536, dimensionParam: true },
    { id: "embed-v5.0-fast", label: "Cohere Embed v5 Fast", nativeDims: 1536, dimensionParam: true },
    { id: "embed-v4.0", label: "Cohere Embed v4", nativeDims: 1536, dimensionParam: true },
  ],
  voyage: [
    { id: "voyage-3.5", label: "Voyage 3.5", nativeDims: 1024, dimensionParam: true },
    { id: "voyage-3.5-lite", label: "Voyage 3.5 Lite", nativeDims: 1024, dimensionParam: true },
    { id: "voyage-3-large", label: "Voyage 3 Large", nativeDims: 1024, dimensionParam: true },
  ],
  google: [
    { id: "gemini-embedding-001", label: "Gemini Embedding", nativeDims: 3072, dimensionParam: true },
  ],
};

const LABELS = Object.fromEntries(
  Object.values(SUGGESTED_EMBEDDING_MODELS).flatMap((list) => list.map((m) => [m.id, m.label])),
);

export function embeddingModelLabel(value) {
  return LABELS[value] || value || "";
}

export function isValidDims(value) {
  return Number.isInteger(value) && value >= MIN_DIMS && value <= MAX_DIMS;
}

export function isIndexedDims(value) {
  return INDEXED_DIMS.includes(value);
}

const stripModelsPrefix = (model) => String(model || "").replace(/^models\//, "");

// Whether the driver may send a dimension parameter for this model. OpenAI-format
// servers only get `dimensions` for models known to accept it (text-embedding-3-*).
export function acceptsDimensionParam(format, model) {
  const id = stripModelsPrefix(model).toLowerCase();
  if (format === "openai") return /^text-embedding-3-/.test(id);
  if (format === "cohere") return /^embed-v[4-9]/.test(id);
  if (format === "voyage") return /^voyage-(3\.5|3-large|code-3|context-3|[4-9])/.test(id);
  if (format === "google") return /^(gemini-embedding|text-embedding-00[4-9])/.test(id);
  return false;
}

// Dimensions to ask a dimension-param model for when the caller doesn't say: its native
// size (every suggested size has an HNSW index), else the default.
export function defaultRequestedDims(format, model) {
  const id = stripModelsPrefix(model);
  return SUGGESTED_EMBEDDING_MODELS[format]?.find((m) => m.id === id)?.nativeDims ?? DEFAULT_REQUESTED_DIMS;
}

export function joinUrl(base, path) {
  return `${String(base || "").replace(/\/+$/, "")}/${String(path || "").replace(/^\/+/, "")}`;
}

// The official Cohere API is versioned in the path (/v2/embed); compatible servers
// configured with a versioned base (…/v1) take the bare path.
export function cohereUrl(base, endpoint, version = "v2") {
  return /\/v\d+$/.test(String(base || "").replace(/\/+$/, ""))
    ? joinUrl(base, endpoint)
    : joinUrl(base, `${version}/${endpoint}`);
}

const bearer = (apiKey) => (apiKey ? { Authorization: `Bearer ${apiKey}` } : {});

const INPUT_TYPES = {
  cohere: { document: "search_document", query: "search_query" },
  voyage: { document: "document", query: "query" },
  google: { document: "RETRIEVAL_DOCUMENT", query: "RETRIEVAL_QUERY" },
};

// -> { url, init } for one embedding request. `dimensions` is sent only when given;
// callers decide with acceptsDimensionParam().
export function buildEmbedRequest({ format, baseUrl, apiKey, model, texts, inputType = "document", dimensions }) {
  const headers = { "Content-Type": "application/json" };
  const kind = inputType === "query" ? "query" : "document";
  let url;
  let body;
  if (format === "openai") {
    url = joinUrl(baseUrl, "embeddings");
    body = { model, input: texts, encoding_format: "float" };
    if (dimensions) body.dimensions = dimensions;
    Object.assign(headers, bearer(apiKey));
  } else if (format === "cohere") {
    url = cohereUrl(baseUrl, "embed");
    body = { model, texts, input_type: INPUT_TYPES.cohere[kind], embedding_types: ["float"] };
    if (dimensions) body.output_dimension = dimensions;
    Object.assign(headers, bearer(apiKey));
  } else if (format === "voyage") {
    url = joinUrl(baseUrl, "embeddings");
    body = { model, input: texts, input_type: INPUT_TYPES.voyage[kind] };
    if (dimensions) body.output_dimension = dimensions;
    Object.assign(headers, bearer(apiKey));
  } else if (format === "google") {
    const id = stripModelsPrefix(model);
    url = joinUrl(baseUrl, `models/${encodeURIComponent(id)}:batchEmbedContents`);
    body = {
      requests: texts.map((text) => {
        const req = { model: `models/${id}`, content: { parts: [{ text }] }, taskType: INPUT_TYPES.google[kind] };
        if (dimensions) req.outputDimensionality = dimensions;
        return req;
      }),
    };
    if (apiKey) headers["x-goog-api-key"] = apiKey;
  } else {
    throw new Error(`Unknown embedding format: ${format}`);
  }
  return { url, init: { method: "POST", headers, body: JSON.stringify(body) } };
}

// Rough token estimate for providers that don't report usage (≈ 4 chars/token).
export function estimateTokens(texts) {
  return Math.ceil((texts || []).reduce((sum, t) => sum + String(t || "").length, 0) / 4);
}

function byIndex(items) {
  return [...items].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

// -> { vectors: number[][], tokens } ; throws when the payload has no vectors.
export function parseEmbedResponse(format, json, texts = []) {
  let vectors;
  let tokens;
  if (format === "openai") {
    vectors = Array.isArray(json?.data) ? byIndex(json.data).map((d) => d.embedding) : null;
    tokens = json?.usage?.total_tokens ?? json?.usage?.prompt_tokens;
  } else if (format === "cohere") {
    const emb = json?.embeddings;
    vectors = Array.isArray(emb) ? emb : Array.isArray(emb?.float) ? emb.float : null;
    tokens = json?.meta?.billed_units?.input_tokens;
  } else if (format === "voyage") {
    vectors = Array.isArray(json?.data) ? byIndex(json.data).map((d) => d.embedding) : null;
    tokens = json?.usage?.total_tokens;
  } else if (format === "google") {
    vectors = Array.isArray(json?.embeddings) ? json.embeddings.map((e) => e?.values) : null;
  } else {
    throw new Error(`Unknown embedding format: ${format}`);
  }
  if (!vectors || vectors.some((v) => !Array.isArray(v) || !v.length)) {
    throw new Error("The embedding response had no vectors.");
  }
  if (texts.length && vectors.length !== texts.length) {
    throw new Error(`Expected ${texts.length} vectors, got ${vectors.length}.`);
  }
  return { vectors, tokens: Number.isFinite(tokens) ? tokens : estimateTokens(texts) };
}

// Splits texts into [start, end) ranges within the format's batch size and a
// character budget. A single oversized text still gets its own batch.
export function planBatches(texts, { format, maxBatch, maxChars = MAX_BATCH_CHARS } = {}) {
  const limit = Math.max(1, maxBatch || BATCH_LIMITS[format] || 96);
  const batches = [];
  let start = 0;
  let chars = 0;
  for (let i = 0; i < texts.length; i++) {
    const len = String(texts[i] ?? "").length;
    const full = i - start >= limit || (i > start && chars + len > maxChars);
    if (full) {
      batches.push({ start, end: i });
      start = i;
      chars = 0;
    }
    chars += len;
  }
  if (texts.length > start) batches.push({ start, end: texts.length });
  return batches;
}

// '[0.1,0.2,…]' — the literal pgvector/halfvec columns accept.
export function toPgVector(numbers) {
  if (!Array.isArray(numbers) || !numbers.length) throw new Error("A vector needs at least one value.");
  for (const n of numbers) if (typeof n !== "number" || !Number.isFinite(n)) throw new Error("Vector values must be finite numbers.");
  return `[${numbers.join(",")}]`;
}
