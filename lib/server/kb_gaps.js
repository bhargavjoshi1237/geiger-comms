import "server-only";
import { z } from "zod";
import { aiStatus, generateFor } from "./ai";
import { indexArticles, projectEmbedder } from "./kb_index";
import { featureAvailability } from "@/lib/ai/features";
import { stripUngroundedLinks } from "@/lib/kb/generated_links";
import { cleanQuestion } from "@/lib/kb/gap_text";
import { clusterByKeywords, rankTopic, tokenize } from "@/lib/kb/gap_cluster";
import { matchOutcome } from "@/lib/kb/gap_thresholds";
import { buildClusterPrompt } from "@/lib/kb/prompts";

// Knowledge Gaps refresh (KB spec §11): one bounded, resumable slice per call under the project's lease. In order —
// re-index stale articles, scan new conversations into signals, cluster unassigned signals into gap topics, and only
// when nothing is left rank, trend, expire and reopen the recommendations. Progress lives in the data itself (signals
// without a topic, conversations without a signal), so an abandoned slice loses nothing. Writes use the user's session.

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 90;
const SCAN_LIMIT = 100;
const LLM_BATCH = 100;
const LLM_BATCHES = 2;
const KEYWORD_LIMIT = 1000;
const OPEN_TOPICS_FOR_LLM = 50;
const EXPIRY_DAYS = 28;
const SAMPLE_SIZE = 5;
const GAP_KINDS = ["missing_content", "edit_content"];

const CLUSTER_SCHEMA = z.object({
  assignments: z
    .array(
      z.object({
        index: z.number().int().min(0).max(LLM_BATCH),
        topicId: z.string().max(64).nullable(),
        newTopicKey: z.string().max(40).nullable(),
      }),
    )
    .max(LLM_BATCH),
  newTopics: z
    .array(
      z.object({
        key: z.string().max(40),
        label: z.string().max(60),
        description: z.string().max(200),
        suggestedArticleTitle: z.string().max(100),
      }),
    )
    .max(50),
});

const since = (days) => new Date(Date.now() - days * DAY_MS).toISOString();
const plainText = (value, max) => stripUngroundedLinks(String(value ?? ""), "").text.replace(/\s+/g, " ").trim().slice(0, max);

function topKeywords(questions) {
  const counts = new Map();
  for (const q of questions) for (const t of tokenize(q)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([t]) => t);
}

// ---- Gap topics and their recommendations -------------------------------------------

async function loadGapState(db, projectId) {
  const [{ data: topics }, { data: recs }] = await Promise.all([
    db
      .from("topics")
      .select("*")
      .eq("project_id", projectId)
      .eq("metadata->>kind", "knowledge_gap")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(1000),
    db
      .from("recommendations")
      .select("*")
      .eq("project_id", projectId)
      .in("kind", GAP_KINDS)
      .is("deleted_at", null)
      .not("detail->>topicId", "is", null),
  ]);
  const recByTopic = new Map((recs || []).map((r) => [r.detail?.topicId, r]));
  const linkedIds = [...new Set((recs || []).map((r) => r.detail?.articleId).filter(Boolean))];
  const { data: linked } = linkedIds.length
    ? await db.from("articles").select("id, state, deleted_at").in("id", linkedIds)
    : { data: [] };
  return { topics: topics || [], recByTopic, articles: new Map((linked || []).map((a) => [a.id, a])) };
}

// Open or in progress (accepted, linked article not yet published): the topics new questions may join.
function openTopics({ topics, recByTopic, articles }) {
  return topics.filter((t) => {
    const rec = recByTopic.get(t.id);
    if (!rec) return true;
    if (rec.state === "new") return true;
    if (rec.state !== "accepted") return false;
    const article = articles.get(rec.detail?.articleId);
    return !article || article.deleted_at || article.state !== "published";
  });
}

// ---- Step 2: scan conversations into signals -------------------------------------------

async function scanConversations(db, projectId, embedder, deadline) {
  const { data: candidates, error } = await db.rpc("gap_candidates", {
    p_project: projectId,
    p_since: since(WINDOW_DAYS),
    p_limit: SCAN_LIMIT,
  });
  if (error) throw new Error(error.code || "gap_candidates_failed");
  if (!candidates?.length) return { scanned: 0, matched: 0, more: false };

  const questions = candidates.map((c) => cleanQuestion(c.question));
  let vectors = null;
  if (embedder) {
    try {
      const out = await embedder.embedTexts(questions, { signal: AbortSignal.timeout(Math.max(5_000, deadline - Date.now() - 10_000)) });
      vectors = out.vectors;
    } catch (err) {
      console.error("[kb.gaps.embed]", err?.code || "embed_failed");
    }
  }

  const rows = [];
  for (let i = 0; i < candidates.length; i += 1) {
    if (deadline - Date.now() < 6_000) break;
    const question = questions[i];
    let method = "fts";
    let best = null;
    if (vectors) {
      method = "embedding";
      const { data } = await db.rpc("match_knowledge_chunks", {
        p_project: projectId,
        p_query: `[${vectors[i].join(",")}]`,
        p_dims: embedder.dims,
        p_limit: 3,
        p_scope: "published",
      });
      if (data?.[0]) best = { articleId: data[0].article_id, score: Number(data[0].similarity) };
    } else {
      const { data } = await db.rpc("search_articles", {
        p_project: projectId,
        p_query: question,
        p_scope: "published",
        p_limit: 3,
      });
      if (data?.[0]) best = { articleId: data[0].article_id, score: Number(data[0].rank) };
    }
    rows.push({
      project_id: projectId,
      source: "conversation",
      outcome: matchOutcome(method, best?.score ?? null),
      question,
      conversation_id: candidates[i].conversation_id,
      matched_article_id: best?.articleId ?? null,
      match_score: best?.score ?? null,
      occurred_at: candidates[i].occurred_at,
      metadata: { matchMethod: method },
    });
  }

  if (rows.length) {
    const { error: insertError } = await db.from("knowledge_gap_signals").insert(rows);
    // One signal per conversation: on a duplicate, keep the rest one by one.
    if (insertError) for (const row of rows) await db.from("knowledge_gap_signals").insert(row);
  }
  return {
    scanned: rows.length,
    matched: rows.filter((r) => r.outcome === "covered").length,
    more: rows.length < candidates.length || candidates.length === SCAN_LIMIT,
  };
}

// ---- Step 3: cluster signals into topics -------------------------------------------

async function clusterWithLlm({ projectId, userId, batch, topics }) {
  const known = topics.slice(0, OPEN_TOPICS_FOR_LLM);
  const { instructions, prompt } = buildClusterPrompt(
    batch.map((s) => s.question),
    known.map((t) => ({ id: t.id, label: t.label, description: t.metadata?.description ?? "" })),
  );
  const { object } = await generateFor({
    projectId,
    feature: "gapClustering",
    userId,
    instructions,
    prompt,
    schema: CLUSTER_SCHEMA,
    maxOutputTokens: 4000,
    temperature: 0.2,
    timeoutMs: 15_000,
  });
  const knownIds = new Set(known.map((t) => t.id));
  const proposals = new Map((object.newTopics || []).map((t) => [t.key, t]));
  const existing = new Map();
  const created = new Map();
  const leftover = new Set(batch.map((s) => s.id));
  for (const a of object.assignments || []) {
    const signal = batch[a.index];
    if (!signal || !leftover.has(signal.id)) continue;
    if (a.topicId && knownIds.has(a.topicId)) {
      if (!existing.has(a.topicId)) existing.set(a.topicId, []);
      existing.get(a.topicId).push(signal);
      leftover.delete(signal.id);
    } else if (a.newTopicKey && proposals.has(a.newTopicKey)) {
      if (!created.has(a.newTopicKey)) created.set(a.newTopicKey, []);
      created.get(a.newTopicKey).push(signal);
      leftover.delete(signal.id);
    }
  }
  const newTopics = [...created.entries()].map(([key, members]) => {
    const p = proposals.get(key);
    const questions = members.map((s) => s.question);
    return {
      label: plainText(p.label, 60) || plainText(questions[0], 60),
      description: plainText(p.description, 200),
      suggestedTitle: plainText(p.suggestedArticleTitle, 100),
      keywords: topKeywords(questions),
      sampleQuestions: [...new Set(questions)].slice(0, SAMPLE_SIZE),
      method: "llm",
      members,
    };
  });
  return { existing, newTopics, leftover: batch.filter((s) => leftover.has(s.id)) };
}

function clusterWithKeywords(signals, topics) {
  const byId = new Map(signals.map((s) => [s.id, s]));
  const out = clusterByKeywords(
    signals.map((s) => ({ id: s.id, question: s.question })),
    topics.map((t) => ({ id: t.id, keywords: t.metadata?.keywords ?? [] })),
  );
  const existing = new Map();
  const created = new Map(out.newTopics.map((t) => [t.key, { ...t, members: [] }]));
  for (const a of out.assignments) {
    const signal = byId.get(a.signalId);
    if (a.topicId) {
      if (!existing.has(a.topicId)) existing.set(a.topicId, []);
      existing.get(a.topicId).push(signal);
    } else created.get(a.newTopicKey)?.members.push(signal);
  }
  const newTopics = [...created.values()].map((t) => ({
    label: t.label,
    description: "",
    suggestedTitle: t.label,
    keywords: t.keywords,
    sampleQuestions: t.sampleQuestions,
    method: "keyword",
    members: t.members,
  }));
  return { existing, newTopics, unclusterable: out.unclusterable.map((id) => byId.get(id)) };
}

async function assign(db, topicId, members) {
  await db.from("knowledge_gap_signals").update({ topic_id: topicId }).in("id", members.map((s) => s.id));
  const links = members.filter((s) => s.conversation_id).map((s) => ({ conversation_id: s.conversation_id, topic_id: topicId, score: 1 }));
  if (links.length) {
    await db.from("conversation_topics").upsert(links, { onConflict: "conversation_id,topic_id", ignoreDuplicates: true });
  }
}

async function writeClusters(db, projectId, { existing, newTopics, unclusterable = [] }) {
  let clustered = 0;
  for (const [topicId, members] of existing) {
    await assign(db, topicId, members);
    clustered += members.length;
  }
  for (const topic of newTopics) {
    if (!topic.members.length) continue;
    const { data: row, error } = await db
      .from("topics")
      .insert({
        project_id: projectId,
        label: topic.label,
        volume: 0,
        trend: "flat",
        metadata: {
          kind: "knowledge_gap",
          description: topic.description,
          keywords: topic.keywords,
          method: topic.method,
          sampleQuestions: topic.sampleQuestions,
          suggestedTitle: topic.suggestedTitle,
        },
      })
      .select("id")
      .single();
    if (error) {
      console.error("[kb.gaps.topic]", error.code || "insert_failed");
      continue;
    }
    await assign(db, row.id, topic.members);
    clustered += topic.members.length;
  }
  for (const signal of unclusterable) {
    await db
      .from("knowledge_gap_signals")
      .update({ metadata: { ...(signal.metadata || {}), unclusterable: true } })
      .eq("id", signal.id);
  }
  return clustered;
}

async function clusterSignals(db, { projectId, userId, deadline, useLlm }) {
  const limit = useLlm ? LLM_BATCH * LLM_BATCHES : KEYWORD_LIMIT;
  const { data: queue, error } = await db
    .from("knowledge_gap_signals")
    .select("id, question, conversation_id, metadata")
    .eq("project_id", projectId)
    .is("topic_id", null)
    .neq("outcome", "covered")
    .is("deleted_at", null)
    .is("metadata->>unclusterable", null)
    .gte("occurred_at", since(WINDOW_DAYS))
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.code || "signal_queue_failed");
  if (!queue?.length) return { clustered: 0, more: false, method: useLlm ? "llm" : "keyword", aiError: null };

  const state = await loadGapState(db, projectId);
  const topics = openTopics(state);
  let clustered = 0;
  let method = useLlm ? "llm" : "keyword";
  let aiError = null;
  let rest = queue;

  if (useLlm) {
    rest = [];
    for (let i = 0; i < queue.length; i += LLM_BATCH) {
      const batch = queue.slice(i, i + LLM_BATCH);
      if (deadline - Date.now() < 20_000) break;
      try {
        const out = await clusterWithLlm({ projectId, userId, batch, topics });
        clustered += await writeClusters(db, projectId, out);
        rest.push(...out.leftover);
      } catch (err) {
        // A failed batch falls through to the keyword path and the slice reports why.
        aiError = err?.code || "generation_failed";
        method = "keyword";
        rest.push(...batch);
      }
    }
  }
  if (rest.length && deadline - Date.now() > 4_000) {
    const current = await loadGapState(db, projectId);
    clustered += await writeClusters(db, projectId, clusterWithKeywords(rest, openTopics(current)));
  }
  return { clustered, more: queue.length === limit, method, aiError };
}

// ---- Step 4: rank, trend, expire and reopen -------------------------------------------

async function finalize(db, projectId) {
  const state = await loadGapState(db, projectId);
  if (!state.topics.length) return;
  const { data: signals } = await db
    .from("knowledge_gap_signals")
    .select("topic_id, source, question, occurred_at, conversation_id, outcome, matched_article_id, metadata")
    .eq("project_id", projectId)
    .neq("outcome", "covered")
    .not("topic_id", "is", null)
    .is("deleted_at", null)
    .gte("occurred_at", since(WINDOW_DAYS))
    .order("occurred_at", { ascending: false })
    .limit(10_000);
  const byTopic = new Map();
  for (const s of signals || []) {
    if (!byTopic.has(s.topic_id)) byTopic.set(s.topic_id, []);
    byTopic.get(s.topic_id).push(s);
  }
  const expiry = Date.now() - EXPIRY_DAYS * DAY_MS;

  for (const topic of state.topics) {
    const own = byTopic.get(topic.id) ?? [];
    const rec = state.recByTopic.get(topic.id) ?? null;
    if (!own.length && !rec) continue;
    const rank = rankTopic(own.map((s) => ({ occurredAt: s.occurred_at, conversationId: s.conversation_id, sessionId: s.metadata?.sessionId })));
    const meta = topic.metadata || {};
    const samples = [...new Set(own.map((s) => s.question))].slice(0, SAMPLE_SIZE);
    const lastSeenAt = own[0]?.occurred_at ?? rec?.detail?.lastSeenAt ?? null;
    const firstSeenAt = own.at(-1)?.occurred_at ?? rec?.detail?.firstSeenAt ?? null;

    // "Edit existing content" when most of the topic's signals point at one weakly matching article.
    const weak = own.filter((s) => (s.outcome === "weak_match" || s.outcome === "negative_reaction") && s.matched_article_id);
    const perArticle = new Map();
    for (const s of weak) perArticle.set(s.matched_article_id, (perArticle.get(s.matched_article_id) ?? 0) + 1);
    const [topArticle, topCount] = [...perArticle.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    const kind = own.length && topCount * 2 > own.length ? "edit_content" : "missing_content";

    await db
      .from("topics")
      .update({ volume: rank.volume30d, trend: rank.trend, metadata: { ...meta, sampleQuestions: samples.length ? samples : meta.sampleQuestions ?? [] } })
      .eq("id", topic.id);

    const detail = {
      ...(rec?.detail || {}),
      topicId: topic.id,
      volume30d: rank.volume30d,
      volume90d: rank.volume90d,
      impact: rank.impact,
      trend: rank.trend,
      trendPct: rank.trendPct,
      sampleQuestions: samples.length ? samples : rec?.detail?.sampleQuestions ?? [],
      matchedArticleIds: [...perArticle.keys()],
      sources: own.length ? [...new Set(own.map((s) => s.source))] : rec?.detail?.sources ?? [],
      editArticleId: kind === "edit_content" ? topArticle : null,
      firstSeenAt,
      lastSeenAt,
      suggestedTitle: meta.suggestedTitle || topic.label,
      method: meta.method ?? "keyword",
    };
    const title = meta.suggestedTitle || topic.label;

    if (!rec) {
      if (!rank.volume90d) continue;
      const { error } = await db.from("recommendations").insert({ project_id: projectId, kind, title, detail, state: "new" });
      if (error) console.error("[kb.gaps.recommendation]", error.code || "insert_failed");
      continue;
    }

    const patch = { kind, title, detail };
    const recMeta = rec.metadata || {};
    const stale = !lastSeenAt || new Date(lastSeenAt).getTime() < expiry;
    if (rec.state === "new" && stale) {
      Object.assign(patch, { state: "dismissed", dismiss_reason: "expired" });
    } else if (rec.state === "dismissed" && rec.dismiss_reason !== "expired") {
      const threshold = Math.max(1, Number(recMeta.dismissedVolume) || 0) * 2;
      if (rank.volume30d >= threshold) {
        Object.assign(patch, { state: "new", dismiss_reason: null, metadata: { ...recMeta, reopenedAt: new Date().toISOString() } });
      }
    } else if (rec.state === "accepted") {
      const article = state.articles.get(rec.detail?.articleId);
      if (!article || article.deleted_at || article.state === "archived") {
        const reopened = { ...detail };
        delete reopened.articleId;
        Object.assign(patch, {
          state: "new",
          detail: reopened,
          metadata: { ...recMeta, reopenedReason: "article_removed", reopenedAt: new Date().toISOString() },
        });
      }
    }
    await db.from("recommendations").update(patch).eq("id", rec.id);
  }
}

// ---- The slice -------------------------------------------------------------------

async function remainingWork(db, projectId) {
  const [{ data: candidates }, { count: unclustered }] = await Promise.all([
    db.rpc("gap_candidates", { p_project: projectId, p_since: since(WINDOW_DAYS), p_limit: 500 }),
    db
      .from("knowledge_gap_signals")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("topic_id", null)
      .neq("outcome", "covered")
      .is("deleted_at", null)
      .is("metadata->>unclusterable", null)
      .gte("occurred_at", since(WINDOW_DAYS)),
  ]);
  return (candidates?.length ?? 0) + (unclustered ?? 0);
}

// -> { busy: true } | { done, progress: { scanned, matched, clustered, remaining }, method, aiError?, lastRefreshedAt }
export async function refreshSlice({ session, projectId, userId, deadline }) {
  const db = session.db;
  const { data: lease, error } = await db.rpc("claim_gap_refresh", { p_project: projectId });
  if (error) throw new Error(error.code || "claim_failed");
  if (!lease?.id) return { busy: true };

  const fresh = lease.progress?.runStartedAt !== lease.started_at;
  const progress = fresh
    ? { runStartedAt: lease.started_at, scanned: 0, matched: 0, clustered: 0, remaining: 0 }
    : { ...lease.progress };
  let done = false;
  let method = "keyword";
  let aiError = null;

  try {
    const embedder = await projectEmbedder(projectId, "embed_query").catch(() => null);
    const status = await aiStatus(projectId);
    const useLlm = featureAvailability(status, "gapClustering").available;
    method = useLlm ? "llm" : "keyword";

    // 1. Re-index stale articles so matching sees current content.
    let indexPending = 0;
    if (embedder && deadline - Date.now() > 30_000) {
      const out = await indexArticles({ session, projectId, deadline: Date.now() + 12_000 });
      indexPending = out.pending;
    }

    // 2. Scan new conversations. Embedding matches need an index; otherwise keyword search answers.
    let scan = { scanned: 0, matched: 0, more: false };
    if (deadline - Date.now() > 12_000) {
      const { count: chunks } = await db
        .from("knowledge_chunks")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .is("deleted_at", null);
      scan = await scanConversations(db, projectId, chunks ? embedder : null, deadline);
      progress.scanned += scan.scanned;
      progress.matched += scan.matched;
    } else scan.more = true;

    // 3. Cluster what's unassigned.
    let cluster = { clustered: 0, more: false };
    if (deadline - Date.now() > 8_000) {
      cluster = await clusterSignals(db, { projectId, userId, deadline, useLlm });
      progress.clustered += cluster.clustered;
      method = cluster.method;
      aiError = cluster.aiError;
    } else cluster.more = true;

    // 4. Only when nothing is left: rank, trend, expire and reopen.
    progress.remaining = await remainingWork(db, projectId);
    if (!scan.more && !cluster.more && !indexPending && !progress.remaining && deadline - Date.now() > 3_000) {
      await finalize(db, projectId);
      done = true;
    }
    progress.method = method;
    if (aiError) progress.aiError = aiError;
  } finally {
    await db.rpc("release_gap_refresh", { p_project: projectId, p_done: done, p_progress: progress });
  }

  const { data: row } = await db.from("knowledge_gap_refresh").select("finished_at").eq("project_id", projectId).maybeSingle();
  return {
    done,
    progress: {
      scanned: progress.scanned,
      matched: progress.matched,
      clustered: progress.clustered,
      remaining: progress.remaining,
    },
    method,
    ...(aiError ? { aiError } : {}),
    lastRefreshedAt: row?.finished_at ?? null,
  };
}
