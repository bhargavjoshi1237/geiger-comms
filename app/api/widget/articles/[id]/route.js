// GET /api/widget/articles/:id — one published article.

import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { getAppById } from "@/lib/widget/apps";
import { getPublishedArticle } from "@/lib/widget/data";
import { articleVm } from "@/lib/widget/viewmodels";

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
  return jsonResponse({ article: articleVm(row) });
}
