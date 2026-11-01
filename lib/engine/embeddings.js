// Embeddings interface (knowledge-base-and-ai-providers spec §3.2), ported from geiger-grey: dispatches to the
// connection's embed driver (lib/engine/drivers/embed/<format>.js). Batches per model limits, keeps at most 3 requests
// in flight, retries 429/5xx (drivers/http.js), and rejects any vector whose length isn't ai_settings.embed_dims.
import { EngineError } from "./errors.js";
import { connectProvider } from "./secrets.js";
import { MAX_DIMS, MIN_DIMS, acceptsDimensionParam, defaultRequestedDims, isValidDims, planBatches } from "../ai/embedding_models.js";
import * as openai from "./drivers/embed/openai.js";
import * as cohere from "./drivers/embed/cohere.js";
import * as voyage from "./drivers/embed/voyage.js";
import * as google from "./drivers/embed/google.js";

export { toPgVector } from "../ai/embedding_models.js";

const DRIVERS = { openai, cohere, voyage, google };
const MAX_IN_FLIGHT = 3;
const TIMEOUT_MS = { document: 60_000, query: 15_000 };

function dimMismatch(got, expected) {
  return new EngineError(
    "dims_mismatch",
    `The embedding model returned ${got}-dimension vectors but this workspace expects ${expected} — re-detect the dimensions in Settings → AI Providers.`,
    { status: 422, retryable: false },
  );
}

// Runs `worker` over `items` with at most `limit` in flight; the first failure aborts the rest (via `controller`) and is rethrown.
async function runPool(items, limit, controller, worker) {
  let next = 0;
  let failure = null;
  const lane = async () => {
    while (!failure && next < items.length) {
      const item = items[next++];
      try {
        await worker(item);
      } catch (err) {
        if (!failure) {
          failure = err;
          controller.abort();
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  if (failure) throw failure;
}

// One driver call on an already-connected provider (see connectProvider()). -> { vectors, tokens }
export async function embedWithConnection(conn, { model, texts, inputType = "document", dimensions, signal, timeoutMs, retries }) {
  const driver = DRIVERS[conn.format];
  if (!driver) throw new EngineError("capability_missing", "This provider's embedding format isn't supported.", { status: 422 });
  return driver.embed({
    baseUrl: conn.baseUrl,
    apiKey: conn.apiKey,
    model,
    texts,
    inputType,
    dimensions,
    signal,
    timeoutMs: timeoutMs ?? TIMEOUT_MS[inputType] ?? TIMEOUT_MS.document,
    retries,
    noRedirect: conn.custom,
  });
}

// Checks the project's embedding default (embed: { providerId, model, dims } from ai_settings) and connects its
// provider. -> { conn, model, dims } for embedWith(); the connection holds the key, so keep it to one request.
export async function connectEmbedder({ admin, projectId, embed }) {
  if (!embed?.providerId) {
    throw new EngineError("ai_no_default", "Choose a default embedding model in Settings → AI Providers → Default Models.", { status: 409 });
  }
  const model = String(embed.model || "").trim();
  if (!model) throw new EngineError("no_model", "Choose an embedding model in Settings → AI Providers.", { status: 422 });
  const dims = embed.dims == null ? null : Number(embed.dims);
  if (!isValidDims(dims)) {
    throw new EngineError("no_dims", "Detect the embedding dimensions in Settings → AI Providers first.", { status: 422 });
  }
  const conn = await connectProvider({ admin, projectId, providerId: embed.providerId, capability: "embed" });
  return { conn, model, dims };
}

// -> { vectors: number[][], tokens, dims }
export async function embedTexts({ admin, projectId, embed, texts, inputType = "document", signal }) {
  return embedWith(await connectEmbedder({ admin, projectId, embed }), { texts, inputType, signal });
}

// Embeds texts on a connected embedder (connectEmbedder). -> { vectors: number[][], tokens, dims }
export async function embedWith({ conn, model, dims }, { texts, inputType = "document", signal } = {}) {
  const list = Array.isArray(texts) ? texts.map((t) => String(t ?? "")) : [];
  if (!list.length) return { vectors: [], tokens: 0, dims };

  const kind = inputType === "query" ? "query" : "document";
  const dimensions = acceptsDimensionParam(conn.format, model) ? dims : undefined;
  const vectors = new Array(list.length);
  let tokens = 0;

  const controller = new AbortController();
  const batchSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    await runPool(planBatches(list, { format: conn.format }), MAX_IN_FLIGHT, controller, async ({ start, end }) => {
      const out = await embedWithConnection(conn, { model, texts: list.slice(start, end), inputType: kind, dimensions, signal: batchSignal });
      out.vectors.forEach((vector, i) => {
        if (vector.length !== dims) throw dimMismatch(vector.length, dims);
        vectors[start + i] = vector;
      });
      tokens += out.tokens || 0;
    });
  } catch (err) {
    // A caller's abort wins over whatever the in-flight batches reported.
    if (signal?.aborted) throw new EngineError("aborted", "The request was cancelled.", { status: 499 });
    throw err;
  }

  return { vectors, tokens, dims };
}

// Embeds "ping" and reports the vector length. Dimension-param drivers are asked for `requestedDims`
// (default: the model's native size). -> { dims }
export async function detectEmbeddingDims({ admin, projectId, providerId, model, requestedDims }) {
  const id = String(model || "").trim();
  if (!id) throw new EngineError("no_model", "Choose an embedding model first.", { status: 422 });
  const explicit = requestedDims == null || requestedDims === "" ? null : Number(requestedDims);
  if (explicit !== null && !isValidDims(explicit)) {
    throw new EngineError("unsupported_dims", `Dimensions must be a whole number between ${MIN_DIMS} and ${MAX_DIMS}.`, { status: 422 });
  }

  const conn = await connectProvider({ admin, projectId, providerId, capability: "embed" });
  const requested = explicit ?? defaultRequestedDims(conn.format, id);
  const { vectors } = await embedWithConnection(conn, {
    model: id,
    texts: ["ping"],
    inputType: "document",
    dimensions: acceptsDimensionParam(conn.format, id) ? requested : undefined,
    timeoutMs: TIMEOUT_MS.query,
    retries: 1,
  });
  const dims = vectors[0].length;
  if (!isValidDims(dims)) {
    throw new EngineError("unsupported_dims", `This model returns ${dims}-dimension vectors; comms supports ${MIN_DIMS}–${MAX_DIMS}.`, { status: 422 });
  }
  return { dims };
}
