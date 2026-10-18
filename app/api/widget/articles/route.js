// GET /api/widget/articles?q=&popular= — published articles of the app's project; q is sanitised before it reaches the PostgREST filter.
// popular=1 returns the most-read articles for the Hub "Popular right now" rail.

import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { getAppById } from "@/lib/widget/apps";
import { listPopularArticles, listPublishedArticles } from "@/lib/widget/data";
import { articleSummaryVm } from "@/lib/widget/viewmodels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  const app = await getAppById(principal.appId);
  if (!app) return errorResponse(404, "app_not_found");

  const params = new URL(request.url).searchParams;
  const rows = params.get("popular") === "1"
    ? await listPopularArticles({ projectId: app.project_id, limit: 6 })
    : await listPublishedArticles({ projectId: app.project_id, q: params.get("q") ?? "" });
  if (!rows) return errorResponse(500, "read_failed");
  return jsonResponse({ articles: rows.map(articleSummaryVm) });
}
