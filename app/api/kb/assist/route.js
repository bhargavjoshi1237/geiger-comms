import { z } from "zod";
import { adminClient } from "@/lib/server/admin";
import { KB_VIEW, canInProject, openRoute } from "@/lib/server/workspace_auth";
import { aiErrorResponse, errorResponse, jsonResponse, readJsonBody } from "@/lib/server/respond";
import { generateFor, readAiSettings } from "@/lib/server/ai";
import { withinUserRate } from "@/lib/server/ai_quota";
import { isUuid } from "@/lib/engine/secrets";
import { errorFor } from "@/lib/ai/llm_errors";
import {
  ASSIST_ACTIONS,
  TONES,
  buildAssistPrompt,
  buildGapDraftPrompt,
  buildSuggestEditPrompt,
} from "@/lib/kb/prompts";
import { stripUngroundedLinks } from "@/lib/kb/generated_links";

// POST /api/kb/assist — AI writing help for one article (KB spec §9.6), for any project member with the Knowledge Base; nothing is saved.
// With options.gapId, "draft" writes from a knowledge gap and "suggest_edit" revises options.editArticleId (§11.6); ungrounded links are stripped.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SELECTION = 8_000;
const MAX_BODY = 20_000;
const LONG_ACTIONS = new Set(["draft", "translate"]);
const LOCALE_RE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

const SCHEMAS = {
  article: z.object({
    title: z.string().max(200),
    summary: z.string().max(400),
    body: z.string().max(40_000),
  }),
  summary: z.object({ summary: z.string().max(240) }),
  titles: z.object({ titles: z.array(z.string().max(120)).max(5) }),
};

const text = (value, max) => (typeof value === "string" ? value.slice(0, max + 1) : "");
const SNIPPET_LENGTH = 2_000;

// The gap a draft or suggested edit is grounded in: its topic, redacted sample questions and weak-match excerpts.
async function loadGap(db, projectId, gapId) {
  const { data: rec } = await db
    .from("recommendations")
    .select("id, project_id, title, detail")
    .eq("id", gapId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!rec || rec.project_id !== projectId) return null;
  const detail = rec.detail || {};
  const { data: topic } = detail.topicId
    ? await db.from("topics").select("label, metadata").eq("id", detail.topicId).maybeSingle()
    : { data: null };
  const matched = (detail.matchedArticleIds || []).filter(isUuid).slice(0, 3);
  const { data: articles } = matched.length
    ? await db
        .from("articles")
        .select("title, body")
        .in("id", matched)
        .eq("project_id", projectId)
        .eq("state", "published")
        .is("deleted_at", null)
    : { data: [] };
  return {
    label: topic?.label || rec.title || "",
    description: topic?.metadata?.description || "",
    questions: (detail.sampleQuestions || []).map((q) => String(q).slice(0, 500)).slice(0, 20),
    snippets: (articles || []).map((a) => ({ title: a.title, body: String(a.body || "").slice(0, SNIPPET_LENGTH) })),
  };
}

async function defaultLocale(db, projectId) {
  const { data } = await db
    .from("help_centers")
    .select("locales")
    .eq("project_id", projectId)
    .eq("is_default", true)
    .is("deleted_at", null)
    .maybeSingle();
  return data?.locales?.[0] || "en-US";
}

function shape(output, generated, grounding) {
  const removed = [];
  const strip = (value) => {
    const out = stripUngroundedLinks(String(value ?? "").trim(), grounding);
    removed.push(...out.removed);
    return out.text.trim();
  };
  if (output === "text") return { result: { text: strip(generated.text) }, removed };
  const obj = generated.object ?? {};
  if (output === "summary") return { result: { summary: strip(obj.summary).slice(0, 160) }, removed };
  if (output === "titles") {
    const titles = [...new Set((obj.titles ?? []).map(strip).filter(Boolean))].slice(0, 5);
    return { result: { titles }, removed };
  }
  return { result: { title: strip(obj.title), summary: strip(obj.summary), body: strip(obj.body) }, removed };
}

export async function POST(request) {
  const { session, response } = await openRoute(request, { write: true });
  if (response) return response;

  const body = await readJsonBody(request);
  const projectId = body?.projectId;
  const action = body?.action;
  const options = body?.options && typeof body.options === "object" ? body.options : {};
  if (!isUuid(projectId) || !ASSIST_ACTIONS.includes(action)) return errorResponse(422, "invalid_request");
  if (action === "tone" && !TONES.includes(options.tone)) return errorResponse(422, "invalid_request");
  if (!(await canInProject(session, projectId, KB_VIEW))) return errorResponse(404, "not_found");

  const input = {
    title: text(body.input?.title, 200),
    summary: text(body.input?.summary, 400),
    body: text(body.input?.body, MAX_BODY),
    selection: text(body.input?.selection, MAX_SELECTION),
  };
  if (input.body.length > MAX_BODY || input.selection.length > MAX_SELECTION) {
    return errorResponse(422, "input_too_long");
  }

  // The article's own locale drives the writing language; another project's id answers 404.
  let locale = "en-US";
  if (body.articleId !== undefined) {
    if (!isUuid(body.articleId)) return errorResponse(422, "invalid_request");
    const { data: article } = await session.db
      .from("articles")
      .select("id, project_id, locale")
      .eq("id", body.articleId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!article || article.project_id !== projectId) return errorResponse(404, "not_found");
    locale = article.locale || locale;
  }
  if (action === "translate" && (!LOCALE_RE.test(options.targetLocale ?? "") || options.targetLocale === locale)) {
    return errorResponse(422, "invalid_request");
  }

  let gap = null;
  let editTarget = null;
  if (options.gapId !== undefined || action === "suggest_edit") {
    if (!isUuid(options.gapId)) return errorResponse(422, "invalid_request");
    gap = await loadGap(session.db, projectId, options.gapId);
    if (!gap) return errorResponse(404, "not_found");
    if (body.articleId === undefined) locale = await defaultLocale(session.db, projectId);
  }
  if (action === "suggest_edit") {
    if (!isUuid(options.editArticleId)) return errorResponse(422, "invalid_request");
    const { data: article } = await session.db
      .from("articles")
      .select("project_id, locale, title, summary, body, draft")
      .eq("id", options.editArticleId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!article || article.project_id !== projectId) return errorResponse(404, "not_found");
    const staged = article.draft && typeof article.draft === "object" ? article.draft : null;
    editTarget = {
      title: staged?.title ?? article.title,
      summary: staged?.summary ?? article.summary,
      body: staged?.body ?? article.body,
    };
    locale = article.locale || locale;
  }

  try {
    const settings = await readAiSettings(adminClient(), projectId);
    if (!withinUserRate({ projectId, userId: session.user.id, limits: settings.limits })) {
      return errorResponse(429, "ai_quota_exceeded", errorFor("ai_quota_exceeded").message);
    }
    const long = LONG_ACTIONS.has(action);
    const { instructions, prompt, output } =
      action === "suggest_edit"
        ? buildSuggestEditPrompt(locale, editTarget, gap)
        : action === "draft" && gap
          ? buildGapDraftPrompt(locale, gap)
          : buildAssistPrompt(action, { locale, input, options });
    const generated = await generateFor({
      projectId,
      feature: action === "translate" ? "translation" : "articleAssist",
      userId: session.user.id,
      instructions,
      prompt,
      schema: SCHEMAS[output],
      maxOutputTokens: long ? 3000 : 1500,
      temperature: action === "translate" ? 0.2 : 0.3,
      timeoutMs: long ? 45_000 : 20_000,
    });
    const grounding = [
      input.title,
      input.summary,
      input.body,
      input.selection,
      editTarget?.body,
      ...(gap?.questions ?? []),
      ...(gap?.snippets ?? []).map((snippet) => snippet.body),
    ]
      .filter(Boolean)
      .join("\n");
    const { result, removed } = shape(output, generated, grounding);
    return jsonResponse({
      action,
      output,
      result,
      removedLinks: removed,
      provider: generated.providerName,
      model: generated.modelId,
    });
  } catch (err) {
    return aiErrorResponse(err);
  }
}
