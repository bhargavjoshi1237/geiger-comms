"use client";

// Knowledge Gaps data layer (gap recommendations, topics, signals, refresh; KB spec §8, §11): pure, null / [] / false, never throws or toasts.
// refreshGaps is route-backed and returns { ok: true, … } | { ok: false, code, message } so the screen can show busy or quota errors.

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";
import { apiPath } from "@/lib/widget/embed";

const RECOMMENDATIONS = "recommendations";
const SIGNALS = "knowledge_gap_signals";
const REFRESH = "knowledge_gap_refresh";
const GAP_KINDS = ["missing_content", "edit_content"];
const DAY_MS = 86_400_000;

// Display state over state + dismiss_reason + the linked article (§11.5).
export function gapDisplayState(state, dismissReason, linkedArticle) {
  if (state === "dismissed") return dismissReason === "expired" ? "expired" : "dismissed";
  if (state === "accepted") return linkedArticle?.state === "published" ? "resolved" : "in_progress";
  return "open";
}

export function normalizeGap(row, topic, articlesById = {}) {
  if (!row) return null;
  const detail = row.detail && typeof row.detail === "object" ? row.detail : {};
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const topicMeta = topic?.metadata && typeof topic.metadata === "object" ? topic.metadata : {};
  const linked = detail.articleId ? articlesById[detail.articleId] ?? null : null;
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    kind: row.kind ?? "missing_content",
    state: row.state ?? "new",
    dismissReason: row.dismiss_reason ?? null,
    displayState: gapDisplayState(row.state, row.dismiss_reason, linked),
    title: row.title ?? "",
    topicId: detail.topicId ?? null,
    label: topic?.label || row.title || "",
    description: topicMeta.description ?? "",
    method: detail.method ?? topicMeta.method ?? "keyword",
    impact: Number(detail.impact) || 0,
    volume30d: Number(detail.volume30d) || 0,
    volume90d: Number(detail.volume90d) || 0,
    trend: detail.trend ?? topic?.trend ?? "flat",
    trendPct: Number(detail.trendPct) || 0,
    sampleQuestions: Array.isArray(detail.sampleQuestions) ? detail.sampleQuestions : [],
    matchedArticleIds: Array.isArray(detail.matchedArticleIds) ? detail.matchedArticleIds : [],
    sources: Array.isArray(detail.sources) ? detail.sources : [],
    editArticleId: detail.editArticleId ?? null,
    suggestedTitle: detail.suggestedTitle || row.title || "",
    firstSeenAt: detail.firstSeenAt ?? null,
    lastSeenAt: detail.lastSeenAt ?? null,
    articleId: detail.articleId ?? null,
    linkedArticle: linked,
    detail,
    metadata: meta,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function normalizeSignal(row) {
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
    outcome: row.outcome,
    question: row.question ?? "",
    conversationId: row.conversation_id ?? null,
    matchedArticleId: row.matched_article_id ?? null,
    matchScore: row.match_score === null || row.match_score === undefined ? null : Number(row.match_score),
    occurredAt: row.occurred_at ?? null,
  };
}

// ---- reads -------------------------------------------------------------------------

// Gap recommendations with their topics; `articlesById` (the caller's article view models) resolves linked articles.
export async function listGaps({ projectId, articlesById = {} } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data: recs, error } = await sb
      .from(RECOMMENDATIONS)
      .select("*")
      .eq("project_id", projectId)
      .in("kind", GAP_KINDS)
      .is("deleted_at", null)
      .not("detail->>topicId", "is", null)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("[gaps.list]", error.message);
      return null;
    }
    const topicIds = [...new Set((recs || []).map((r) => r.detail?.topicId).filter(Boolean))];
    let topics = [];
    if (topicIds.length) {
      const { data, error: topicError } = await sb.from("topics").select("id, label, trend, metadata").in("id", topicIds);
      if (topicError) {
        console.error("[gaps.listTopics]", topicError.message);
        return null;
      }
      topics = data || [];
    }
    const byId = new Map(topics.map((t) => [t.id, t]));
    return (recs || []).map((r) => normalizeGap(r, byId.get(r.detail?.topicId), articlesById));
  } catch (e) {
    console.error("[gaps.list]", e);
    return null;
  }
}

export async function listGapSignals(topicId, { limit = 20 } = {}) {
  if (!topicId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(SIGNALS)
      .select("*")
      .eq("topic_id", topicId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[gaps.signals]", error.message);
      return null;
    }
    return (data || []).map(normalizeSignal);
  } catch (e) {
    console.error("[gaps.signals]", e);
    return null;
  }
}

// Occurrence times of a topic's signals over 90 days, for the drawer's weekly chart.
export async function listGapTimeline(topicId) {
  if (!topicId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(SIGNALS)
      .select("occurred_at")
      .eq("topic_id", topicId)
      .is("deleted_at", null)
      .gte("occurred_at", new Date(Date.now() - 90 * DAY_MS).toISOString())
      .limit(5000);
    if (error) {
      console.error("[gaps.timeline]", error.message);
      return null;
    }
    return (data || []).map((r) => r.occurred_at);
  } catch (e) {
    console.error("[gaps.timeline]", e);
    return null;
  }
}

// 30-day signal counts behind the stats bar: { questions, unanswered, conversations }.
export async function getGapStats({ projectId } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const sinceIso = new Date(Date.now() - 30 * DAY_MS).toISOString();
    const base = () =>
      sb
        .from(SIGNALS)
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .gte("occurred_at", sinceIso);
    const [questions, unanswered, conversations] = await Promise.all([
      base().neq("outcome", "covered"),
      base().eq("source", "conversation").in("outcome", ["no_match", "weak_match"]),
      base().eq("source", "conversation"),
    ]);
    const failed = [questions, unanswered, conversations].find((r) => r.error);
    if (failed) {
      console.error("[gaps.stats]", failed.error.message);
      return null;
    }
    return {
      questions: questions.count ?? 0,
      unanswered: unanswered.count ?? 0,
      conversations: conversations.count ?? 0,
    };
  } catch (e) {
    console.error("[gaps.stats]", e);
    return null;
  }
}

// { lastRefreshedAt, running, progress } — running while another slice holds the lease.
export async function getGapRefreshState({ projectId } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb.from(REFRESH).select("*").eq("project_id", projectId).maybeSingle();
    if (error) {
      console.error("[gaps.refreshState]", error.message);
      return null;
    }
    return {
      lastRefreshedAt: data?.finished_at ?? null,
      running: Boolean(data?.lease_until && new Date(data.lease_until) > new Date()),
      progress: data?.progress ?? {},
    };
  } catch (e) {
    console.error("[gaps.refreshState]", e);
    return null;
  }
}

// Accepted recommendations linked to an article (the article's Insights tile).
export async function countLinkedGaps(articleId) {
  if (!articleId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { count, error } = await sb
      .from(RECOMMENDATIONS)
      .select("id", { count: "exact", head: true })
      .eq("state", "accepted")
      .eq("detail->>articleId", articleId)
      .is("deleted_at", null);
    if (error) {
      console.error("[gaps.linked]", error.message);
      return null;
    }
    return count ?? 0;
  } catch (e) {
    console.error("[gaps.linked]", e);
    return null;
  }
}

// ---- writes -----------------------------------------------------------------------

// Writes take the gap view model and resolve to the saved one; its topic and `linked` article come from the caller.
async function updateGap(gap, payload, op, linked = null) {
  if (!gap?.id || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(RECOMMENDATIONS)
      .update(payload)
      .eq("id", gap.id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error(`[gaps.${op}]`, error.message);
      return null;
    }
    const topic = { label: gap.label, trend: gap.trend, metadata: { description: gap.description, method: gap.method } };
    return normalizeGap(data, topic, linked ? { [linked.id]: linked } : {});
  } catch (e) {
    console.error(`[gaps.${op}]`, e);
    return null;
  }
}

// detail keeps every key the refresh wrote and adds the linked article.
export function acceptGap(gap, article) {
  return updateGap(
    gap,
    { state: "accepted", dismiss_reason: null, detail: { ...gap.detail, articleId: article.id } },
    "accept",
    article,
  );
}

export function dismissGap(gap, reason) {
  return updateGap(
    gap,
    { state: "dismissed", dismiss_reason: reason, metadata: { ...gap.metadata, dismissedVolume: gap.volume30d } },
    "dismiss",
    gap.linkedArticle,
  );
}

export function reopenGap(gap) {
  const detail = { ...gap.detail };
  delete detail.articleId;
  return updateGap(gap, { state: "new", dismiss_reason: null, detail }, "reopen");
}

// One refresh slice (POST /api/kb/gaps/refresh).
// -> { ok: true, done, progress, method, aiError?, lastRefreshedAt } | { ok: false, code, message }
export async function refreshGaps({ projectId } = {}) {
  if (!projectId || !isSupabaseConfigured()) return { ok: false, code: "not_configured", message: "" };
  try {
    const res = await fetch(apiPath("/api/kb/gaps/refresh"), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) return { ok: true, ...data };
    console.error("[gaps.refresh]", res.status, data?.error || "request_failed");
    return { ok: false, code: data?.error || "request_failed", message: data?.message || "" };
  } catch (e) {
    console.error("[gaps.refresh]", e?.name || "network_error");
    return { ok: false, code: "network_error", message: "" };
  }
}
