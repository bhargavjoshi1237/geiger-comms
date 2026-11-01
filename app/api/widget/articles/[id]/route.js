// GET /api/widget/articles/:id — one published article.

import { after } from "next/server";
import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { getAppById } from "@/lib/widget/apps";
import { getPublishedArticle } from "@/lib/widget/data";
import { articleVm } from "@/lib/widget/viewmodels";
import { rateLimit } from "@/lib/widget/ratelimit";
import { recordArticleView } from "@/lib/server/kb_events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  const app = await getAppById(principal.appId);
  if (!app) return errorResponse(404, "app_not_found");

  const { id } = await params;
  const row = await getPublishedArticle(id, { projectId: app.project_id });
  if (!row) return errorResponse(404, "not_found");
  // One view per session and article every 30 minutes, written after the response.
  if (rateLimit(`view:${principal.sid}:${id}`, 1, 30 * 60_000)) {
    after(() => recordArticleView({ articleId: id, projectId: app.project_id, principal }));
  }
  return jsonResponse({ article: articleVm(row) });
}
