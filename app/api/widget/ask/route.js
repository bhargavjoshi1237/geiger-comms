// POST /api/widget/ask — help-centre search shaped as an answer card. NOT an AI answer: no model is involved, and the
// response says so (answer.kind = "article_search", answer.generatedByAi = false) so the widget never labels it as AI (EU AI Act Art. 50).

import { errorResponse, jsonResponse, readJsonBody } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { getAppById } from "@/lib/widget/apps";
import { clientIp, rateLimitAll } from "@/lib/widget/ratelimit";
import { listPublishedArticles } from "@/lib/widget/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_STEPS = [
  "Check the article above for the most common cause of this issue.",
  "If it doesn't cover it, start a conversation and the team will pick it up.",
];

const FOLLOW_UPS = [{ label: "Talk to a person" }];

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

  const allowed = rateLimitAll([
    [`ask:sid:${principal.sid}`, 30, 60_000],
    [`ask:ip:${clientIp(request)}`, 60, 60_000],
  ]);
  if (!allowed) return errorResponse(429, "rate_limited");

  const body = (await readJsonBody(request)) ?? {};
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query || query.length > 500) return errorResponse(400, "bad_request");

  const app = await getAppById(principal.appId);
  if (!app) return errorResponse(404, "app_not_found");

  const articles = (await listPublishedArticles({ projectId: app.project_id, q: query, limit: 6 })) ?? [];
  const terms = query.split(/\s+/).filter(Boolean);
  const top = articles[0];

  const summary = top
    ? `${top.title}\n${snippet(top.body || top.summary || "", terms)}`
    : "We don't have an article for that yet — the team can help.";
  const steps = top ? FALLBACK_STEPS : ["Tap “Talk to a person” to start a conversation with the team."];
  const sources = articles.slice(0, 4).map((a) => ({ title: a.title, articleId: a.id, icon: "📄" }));
  const topArticles = articles.slice(0, 3).map((a) => ({
    id: a.id,
    title: a.title,
    readMinutes: Math.max(1, Math.round((a.body || "").split(/\s+/).length / 200)),
  }));

  return jsonResponse({
    answer: {
      kind: "article_search",
      generatedByAi: false,
      query,
      summary,
      steps,
      sources,
      followUps: FOLLOW_UPS,
      topArticles,
      hero: top ? { kind: "article", id: top.id, title: top.title } : { kind: "talk", label: "Talk to a person" },
    },
  });
}
