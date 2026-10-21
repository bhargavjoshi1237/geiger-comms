import "server-only";
import { createHash } from "node:crypto";
import { embedderFor } from "./ai";
import { isUuid } from "@/lib/engine/secrets";
import { chunkDocument } from "@/lib/ai/chunker";
import { markdownToBlocks } from "@/lib/ai/markdown_blocks";
import { articleLexer } from "@/lib/markdown/lexer";

// Article knowledge index (KB spec §7.7). Every write goes through the user's session, so RLS scopes it to the
// authorized project. Bounded and single-flight per article: a batch claims at most 10 sources by flipping them
// to `syncing`, and a `syncing` row younger than 2 minutes belongs to another call.

export const INDEX_BATCH = 10;
const CHUNKING = { size: 800, overlap: 100 };
const SYNCING_TTL_MS = 2 * 60_000;
// Codes that mean "no embedding model for this project": indexing is then a no-op and retrieval uses FTS.
const NO_EMBEDDER = new Set(["ai_not_configured", "ai_no_default", "ai_consent_required", "no_dims"]);

const vectorLiteral = (vector) => `[${vector.join(",")}]`;

// The project's embedder, or null when it has none (any other refusal is a real error and is rethrown).
export async function projectEmbedder(projectId, usage = "embed_index") {
  try {
    return await embedderFor({ projectId, usage });
  } catch (err) {
    if (NO_EMBEDDER.has(err?.code)) return null;
    throw err;
  }
}

async function pendingCount(db, projectId) {
  const { count } = await db
    .from("knowledge_sources")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("kind", "article")
    .eq("sync_state", "stale")
    .is("deleted_at", null);
  return count || 0;
}

// Sources for the requested articles (or for published, AI-enabled articles that have none), marked stale.
async function queueArticles(db, projectId, articleIds) {
  let ids = articleIds;
  if (!ids) {
    const { data: published } = await db
      .from("articles")
      .select("id")
      .eq("project_id", projectId)
      .eq("state", "published")
      .eq("ai_enabled", true)
      .is("deleted_at", null)
      .limit(500);
    ids = (published || []).map((a) => a.id);
  }
  if (!ids.length) return;
  const { data: existing } = await db
    .from("knowledge_sources")
    .select("id, ref")
    .eq("project_id", projectId)
    .eq("kind", "article")
    .is("deleted_at", null);
  const known = new Map((existing || []).map((s) => [s.ref?.articleId, s.id]));
  if (articleIds) {
    const restale = articleIds.map((id) => known.get(id)).filter(Boolean);
    if (restale.length) {
      await db.from("knowledge_sources").update({ sync_state: "stale" }).in("id", restale).neq("sync_state", "syncing");
    }
  }
  let missing = ids.filter((id) => !known.has(id)).slice(0, 100);
  if (articleIds && missing.length) {
    // Requested ids only get a source when they are live articles of this project.
    const { data: live } = await db.from("articles").select("id").eq("project_id", projectId).in("id", missing).is("deleted_at", null);
    const liveIds = new Set((live || []).map((a) => a.id));
    missing = missing.filter((id) => liveIds.has(id));
  }
  if (missing.length) {
    // A concurrent call may insert the same article first; the unique index rejects the duplicate harmlessly.
    for (const articleId of missing) {
      await db.from("knowledge_sources").insert({
        project_id: projectId,
        kind: "article",
        ref: { articleId },
        sync_state: "stale",
      });
    }
  }
}

async function claimSources(db, projectId, articleIds) {
  const cutoff = new Date(Date.now() - SYNCING_TTL_MS).toISOString();
  let query = db
    .from("knowledge_sources")
    .select("id")
    .eq("project_id", projectId)
    .eq("kind", "article")
    .is("deleted_at", null)
    .or(`sync_state.in.(stale,idle,error),and(sync_state.eq.syncing,updated_at.lt.${cutoff})`)
    .order("updated_at", { ascending: true })
    .limit(INDEX_BATCH);
  if (articleIds) query = query.in("ref->>articleId", articleIds);
  const { data: candidates } = await query;
  if (!candidates?.length) return [];
  const { data: claimed } = await db
    .from("knowledge_sources")
    .update({ sync_state: "syncing" })
    .in("id", candidates.map((c) => c.id))
    .or(`sync_state.in.(stale,idle,error),and(sync_state.eq.syncing,updated_at.lt.${cutoff})`)
    .select("*");
  return claimed || [];
}

async function clearChunks(db, sourceId) {
  const { data } = await db
    .from("knowledge_chunks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("source_id", sourceId)
    .is("deleted_at", null)
    .select("id");
  return (data || []).length;
}

function finishSource(db, source, patch) {
  return db
    .from("knowledge_sources")
    .update({ last_synced_at: new Date().toISOString(), ...patch })
    .eq("id", source.id);
}

// One source: chunk the article, embed only chunks whose hash changed, retire the rest.
async function indexSource(db, embedder, source, signal) {
  const articleId = source.ref?.articleId;
  const { data: article } = isUuid(articleId)
    ? await db
        .from("articles")
        .select("id, project_id, title, body, state, ai_enabled, deleted_at")
        .eq("id", articleId)
        .maybeSingle()
    : { data: null };

  const eligible =
    article && article.project_id === source.project_id && !article.deleted_at && article.state === "published" && article.ai_enabled;
  if (!eligible) {
    const removed = await clearChunks(db, source.id);
    await finishSource(db, source, { sync_state: "synced", chunk_count: 0 });
    return { indexed: false, removed };
  }

  const { chunks } = chunkDocument(markdownToBlocks(article.body || "", { lexer: articleLexer }), CHUNKING, {
    title: article.title,
  });
  const hashed = chunks.map((c) => ({
    ...c,
    hash: createHash("sha256").update(`${embedder.modelId}:${embedder.dims}:${c.search_text}`).digest("hex"),
  }));

  const { data: existing } = await db
    .from("knowledge_chunks")
    .select("id, content_hash, position")
    .eq("source_id", source.id)
    .is("deleted_at", null);
  const byHash = new Map((existing || []).map((c) => [c.content_hash, c]));
  const fresh = hashed.filter((c) => !byHash.has(c.hash));

  if (fresh.length) {
    const { vectors, dims } = await embedder.embedTexts(fresh.map((c) => c.search_text), { signal });
    const rows = fresh.map((c, i) => ({
      source_id: source.id,
      project_id: source.project_id,
      article_id: article.id,
      content: c.search_text,
      token_count: c.token_count,
      position: c.ordinal,
      embedding: vectorLiteral(vectors[i]),
      embedding_dims: dims,
      content_hash: c.hash,
      metadata: { headingPath: c.heading_path ?? [], breadcrumb: c.breadcrumb ?? null },
    }));
    const { error } = await db.from("knowledge_chunks").insert(rows);
    if (error) throw new Error(error.code || "chunk_insert_failed");
  }

  const keep = new Set(hashed.map((c) => c.hash));
  const stale = (existing || []).filter((c) => !keep.has(c.content_hash)).map((c) => c.id);
  if (stale.length) {
    await db.from("knowledge_chunks").update({ deleted_at: new Date().toISOString() }).in("id", stale);
  }
  for (const c of hashed) {
    const kept = byHash.get(c.hash);
    if (kept && kept.position !== c.ordinal) {
      await db.from("knowledge_chunks").update({ position: c.ordinal }).eq("id", kept.id);
    }
  }

  await finishSource(db, source, {
    sync_state: "synced",
    chunk_count: hashed.length,
    metadata: { modelId: embedder.modelId, dims: embedder.dims },
  });
  return { indexed: true, removed: stale.length };
}

// -> { indexed, removed, pending, partial }. articleIds: up to 10 ids of the authorized project, or the stale queue.
export async function indexArticles({ session, projectId, articleIds = null, deadline }) {
  const db = session.db;
  const embedder = await projectEmbedder(projectId);
  if (!embedder) return { indexed: 0, removed: 0, pending: 0, partial: false };

  await queueArticles(db, projectId, articleIds);
  const claimed = await claimSources(db, projectId, articleIds);
  let indexed = 0;
  let removed = 0;
  let partial = false;

  for (let i = 0; i < claimed.length; i += 1) {
    const remaining = deadline - Date.now();
    if (remaining < 5_000) {
      partial = true;
      const leftover = claimed.slice(i).map((s) => s.id);
      await db.from("knowledge_sources").update({ sync_state: "stale" }).in("id", leftover);
      break;
    }
    const source = claimed[i];
    try {
      const out = await indexSource(db, embedder, source, AbortSignal.timeout(remaining - 2_000));
      if (out.indexed) indexed += 1;
      removed += out.removed;
    } catch (err) {
      console.error("[kb.index]", err?.code || err?.message || "failed");
      await db
        .from("knowledge_sources")
        .update({ sync_state: "error", metadata: { lastError: err?.code || "index_failed" } })
        .eq("id", source.id);
    }
  }

  return { indexed, removed, pending: await pendingCount(db, projectId), partial };
}
