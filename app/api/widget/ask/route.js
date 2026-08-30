// POST /api/widget/ask — submit an AI query. The answer card is built as a
// transformation of the existing help-centre search: the top-matching articles
// become cited "sources", the body becomes the summary, and a small canned
// step list is produced from the collection. Real AI layers override the body
// at the inference step; this route gives the front-end a contract to render
// against even when no LLM is wired up.

import { errorResponse, jsonResponse, readJsonBody } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { getAppById } from "@/lib/widget/apps";
import { rateLimit } from "@/lib/widget/ratelimit";
import { listPublishedArticles } from "@/lib/widget/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_STEPS = [
  "Check the FAQ for the most common cause of this issue.",
  "If the FAQ doesn't cover it, start a message and Maya will pick it up.",
];

const FOLLOW_UPS = [
  { label: "Open a claim" },
  { label: "Track it again" },
  { label: "Talk to a person" },
];

function snippet(text, terms, length = 280) {
  if (!text) return "";
  const lower = String(text).toLowerCase();
  for (const term of terms) {
    const i = lower.indexOf(term.toLowerCase());
    if (i >= 0) {
      const start = Math.max(0, i - 40);
      return (start > 0 ? "…" : "") + String(text).slice(start, start + length).trim() + (start + length < text.length ? "…" : "");
    }
  }
  return String(text).slice(0, length).trim() + (text.length > length ? "…" : "");
}

export async function POST(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  if (!rateLimit(`ask:${principal.sid}`, 30, 60_000)) {
    return errorResponse(429, "rate_limited");
  }

  const body = (await readJsonBody(request)) ?? {};
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query || query.length > 500) return errorResponse(400, "bad_request");

  const app = await getAppById(principal.appId);
  if (!app) return errorResponse(404, "app_not_found");

  // Pull the top articles for the same workspace; the AI summary is built
  // from whichever card the matcher picks first.
  const articles = (await listPublishedArticles({ projectId: app.project_id, q: query, limit: 6 })) ?? [];
  const terms = query.split(/\s+/).filter(Boolean);
  const top = articles[0];

  const summary = top
    ? `${top.title}\n${snippet(top.body || top.summary || "", terms)}`
    : `We don't have an article for that yet — Maya can help.`;
  const steps = top
    ? FALLBACK_STEPS
    : ["Tap “Talk to a person” to start a thread with Maya."];
  const sources = articles.slice(0, 4).map((a) => ({
    title: a.title,
    articleId: a.id,
    icon: "📄",
  }));
  const followUps = FOLLOW_UPS;
  const topArticles = articles.slice(0, 3).map((a) => ({
    id: a.id,
    title: a.title,
    readMinutes: Math.max(1, Math.round((a.body || "").split(/\s+/).length / 200)),
  }));

  return jsonResponse({
    answer: {
      query,
      summary,
      steps,
      sources,
      followUps,
      topArticles,
      hero: top ? { kind: "article", id: top.id, title: top.title } : { kind: "talk", label: "Talk to a person" },
    },
  });
}
