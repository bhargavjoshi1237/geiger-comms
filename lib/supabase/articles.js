"use client";

// Articles data layer (KB spec §8): owns comms.articles + article_versions, snake ↔ camel; never writes articles_derive's columns.
// Pure: returns null / [] / false, never throws or toasts.

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";
import { slugify } from "@/lib/kb/slug";

const TABLE = "articles";
const VERSIONS = "article_versions";
const LIST_LIMIT = 2000;
const VERSION_LIMIT = 50;

// Display state over the authoring state (§7.4).
export function displayStateOf(state, draft) {
  if (state === "published") return draft ? "changes_unpublished" : "published";
  return state === "archived" ? "archived" : "draft";
}

function latest(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(b) > new Date(a) ? b : a;
}

// ---- normalize (snake -> camel) ---------------------------------------------

export function normalizeArticle(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const draft = row.draft && typeof row.draft === "object" ? row.draft : null;
  const state = row.state ?? "draft";
  const updatedAt = row.updated_at ?? row.created_at ?? null;
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    title: row.title ?? "",
    summary: row.summary ?? "",
    body: row.body ?? "",
    slug: row.slug ?? "",
    locale: row.locale ?? "en-US",
    draft,
    state,
    displayState: displayStateOf(state, draft),
    hasPendingChanges: state === "published" && Boolean(draft),
    visibleInMessenger: Boolean(row.published),
    groupId: row.group_id ?? null,
    isSource: !row.group_id || row.group_id === row.id,
    sourceId: row.group_id ?? row.id,
    contentUpdatedAt: row.content_updated_at ?? null,
    translatedFromAt: row.translated_from_at ?? null,
    authorId: row.author_id ?? null,
    authorName: row.author_name ?? "",
    audience: row.audience ?? "everyone",
    aiEnabled: row.ai_enabled !== false,
    readMinutes: row.read_minutes ?? 1,
    collectionTitle: row.collection_title ?? null,
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt,
    lastEditedAt: latest(updatedAt, draft?.savedAt),
    ...meta,
  };
}

export function normalizeVersion(row) {
  if (!row) return null;
  return {
    id: row.id,
    articleId: row.article_id,
    kind: row.kind ?? "published",
    title: row.title ?? "",
    summary: row.summary ?? "",
    body: row.body ?? "",
    locale: row.locale ?? "en-US",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
  };
}

// ---- toRow (camel -> snake, only present keys; never derived columns) --------

function toRow(input) {
  const row = {};
  const map = {
    title: "title",
    summary: "summary",
    body: "body",
    locale: "locale",
    state: "state",
    draft: "draft",
    audience: "audience",
    projectId: "project_id",
    authorId: "author_id",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("aiEnabled" in input) row.ai_enabled = Boolean(input.aiEnabled);
  if ("translatedFromAt" in input) row.translated_from_at = input.translatedFromAt || null;
  if ("title" in input) row.slug = slugify(input.title) || null;
  return row;
}

// A staged draft folds into the live columns, so unpublish and archive keep the author's pending edits.
function foldDraft(draft) {
  if (!draft) return {};
  return { title: draft.title ?? "", summary: draft.summary ?? "", body: draft.body ?? "", draft: null };
}

// ---- reads -------------------------------------------------------------------

// Every live row of the project — source articles and translations alike.
export async function listArticles({ projectId } = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let query = sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[articles.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeArticle);
  } catch (e) {
    console.error("[articles.list]", e);
    return null;
  }
}

export async function getArticle(id) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[articles.get]", error.message);
      return null;
    }
    return normalizeArticle(data);
  } catch (e) {
    console.error("[articles.get]", e);
    return null;
  }
}

// ---- writes ------------------------------------------------------------------

export async function createArticle(input) {
  if (!input?.projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = toRow({ state: "draft", ...input });
    if (input.id) payload.id = input.id; // honor optimistic UUID
    if (input.metadata && typeof input.metadata === "object") payload.metadata = input.metadata;
    const { data, error } = await sb.from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[articles.create]", error.message);
      return null;
    }
    return normalizeArticle(data);
  } catch (e) {
    console.error("[articles.create]", e);
    return null;
  }
}

export async function updateArticle(id, patch) {
  if (!id || !patch || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .update(toRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[articles.update]", error.message);
      return null;
    }
    return normalizeArticle(data);
  } catch (e) {
    console.error("[articles.update]", e);
    return null;
  }
}

// entry: { action, provider, model, at }; the RPC keeps the last 20.
export async function logAiAssist(id, entry) {
  if (!id || !entry || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb.rpc("article_log_ai_assist", { p_id: id, p_entry: entry });
    if (error) {
      console.error("[articles.logAiAssist]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[articles.logAiAssist]", e);
    return false;
  }
}

// ---- publishing verbs (§7.4): each is one update -----------------------------

// A translation records which source revision it was published against (translatedFromAt).
export function publishArticle(id, { translatedFromAt } = {}) {
  const patch = { state: "published" };
  if (translatedFromAt !== undefined) patch.translatedFromAt = translatedFromAt;
  return updateArticle(id, patch);
}

export function publishChanges(id, draft, { translatedFromAt } = {}) {
  if (!draft) return Promise.resolve(null);
  const patch = { state: "published", ...foldDraft(draft) };
  if (translatedFromAt !== undefined) patch.translatedFromAt = translatedFromAt;
  return updateArticle(id, patch);
}

export function discardChanges(id) {
  return updateArticle(id, { draft: null });
}

export function unpublishArticle(id, draft) {
  return updateArticle(id, { state: "draft", ...foldDraft(draft) });
}

export function archiveArticle(id, draft) {
  return updateArticle(id, { state: "archived", ...foldDraft(draft) });
}

export function restoreArticle(id) {
  return updateArticle(id, { state: "draft" });
}

export function markTranslationCurrent(id, translatedFromAt) {
  return updateArticle(id, { translatedFromAt });
}

// A source row takes its translations and placements with it; a translation goes alone.
export async function softDeleteArticle(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { data, error } = await sb.rpc("soft_delete_article", { p_id: id });
    if (error) {
      console.error("[articles.delete]", error.message);
      return false;
    }
    return Number(data) > 0;
  } catch (e) {
    console.error("[articles.delete]", e);
    return false;
  }
}

// A new draft with the live content, audience and AI switch; no placements and no translations.
export async function duplicateArticle(id, { newId, authorId } = {}) {
  const source = await getArticle(id);
  if (!source) return null;
  return createArticle({
    id: newId,
    projectId: source.projectId,
    title: `${source.title || "Untitled article"} (copy)`,
    summary: source.summary,
    body: source.body,
    locale: source.locale,
    audience: source.audience,
    aiEnabled: source.aiEnabled,
    authorId: authorId ?? null,
  });
}

// machine: { provider, model, at } for an AI translation, recorded as metadata.machineTranslated.
export async function createTranslation(sourceId, { id, locale, title, summary, body, machine } = {}) {
  if (!sourceId || !locale || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb.rpc("create_translation", {
      p_source: sourceId,
      p_id: id ?? null,
      p_locale: locale,
      p_title: title ?? "",
      p_summary: summary ?? "",
      p_body: body ?? "",
      p_metadata: machine ? { machineTranslated: machine } : {},
    });
    if (error || !data) {
      console.error("[articles.createTranslation]", error?.message ?? "no row");
      return null;
    }
    return normalizeArticle(data);
  } catch (e) {
    console.error("[articles.createTranslation]", e);
    return null;
  }
}

// ---- versions (§9.7) -----------------------------------------------------------

export async function listVersions(articleId) {
  if (!articleId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(VERSIONS)
      .select("*")
      .eq("article_id", articleId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(VERSION_LIMIT);
    if (error) {
      console.error("[articles.listVersions]", error.message);
      return null;
    }
    return (data || []).map(normalizeVersion);
  } catch (e) {
    console.error("[articles.listVersions]", e);
    return null;
  }
}

// "Save version": a snapshot of the effective content; published rows are written by the database only.
export async function saveSnapshot({ id, articleId, projectId, title, summary, body, locale } = {}) {
  if (!articleId || !projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = {
      article_id: articleId,
      project_id: projectId,
      kind: "snapshot",
      title: title ?? "",
      summary: summary ?? "",
      body: body ?? "",
      locale: locale ?? "en-US",
    };
    if (id) payload.id = id;
    const { data, error } = await sb.from(VERSIONS).insert(payload).select("*").single();
    if (error) {
      console.error("[articles.saveSnapshot]", error.message);
      return null;
    }
    return normalizeVersion(data);
  } catch (e) {
    console.error("[articles.saveSnapshot]", e);
    return null;
  }
}

// ---- views (§9.1, §9.7) --------------------------------------------------------

// { byArticle: { [articleId]: { views, viewers } }, total: { views, viewers } } over the last `days`.
export async function getViewCounts({ projectId, days = 30 } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data, error } = await sb.rpc("article_view_counts", { p_project: projectId, p_since: since });
    if (error) {
      console.error("[articles.viewCounts]", error.message);
      return null;
    }
    const byArticle = {};
    let total = { views: 0, viewers: 0 };
    for (const row of data || []) {
      const counts = { views: Number(row.views) || 0, viewers: Number(row.viewers) || 0 };
      if (row.article_id) byArticle[row.article_id] = counts;
      else total = counts;
    }
    return { byArticle, total };
  } catch (e) {
    console.error("[articles.viewCounts]", e);
    return null;
  }
}

// { series: [{ day, views }], views, viewers, reactions: { happy, neutral, sad } }
export async function getArticleInsights(id, { days = 30 } = {}) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb.rpc("article_insights", { p_article: id, p_days: days });
    if (error || !data) {
      console.error("[articles.insights]", error?.message ?? "no data");
      return null;
    }
    return {
      series: (data.series || []).map((point) => ({ day: point.day, views: Number(point.views) || 0 })),
      views: Number(data.views) || 0,
      viewers: Number(data.viewers) || 0,
      reactions: {
        happy: Number(data.reactions?.happy) || 0,
        neutral: Number(data.reactions?.neutral) || 0,
        sad: Number(data.reactions?.sad) || 0,
      },
    };
  } catch (e) {
    console.error("[articles.insights]", e);
    return null;
  }
}
