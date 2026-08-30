// GET /api/widget/articles?q=&popular= — published articles with a plain
// ILIKE search. `popular=1` returns the most-read articles ordered by
// (article_views desc, updated_at desc) for the Hub "Popular right now"
// rail.

import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { getAppById } from "@/lib/widget/apps";
import { listPublishedArticles } from "@/lib/widget/data";
import { articleSummaryVm } from "@/lib/widget/viewmodels";
import { serviceClient } from "@/lib/widget/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  const app = await getAppById(principal.appId);
  if (!app) return errorResponse(404, "app_not_found");

  const params = new URL(request.url).searchParams;
  const q = params.get("q") ?? "";
  const popular = params.get("popular") === "1";

  if (popular) {
    const rows = await listPopularArticles({ projectId: app.project_id, limit: 6 });
    if (!rows) return errorResponse(500, "read_failed");
    return jsonResponse({ articles: rows.map(articleSummaryVm) });
  }

  const rows = await listPublishedArticles({ projectId: app.project_id, q });
  if (!rows) return errorResponse(500, "read_failed");
  return jsonResponse({ articles: rows.map(articleSummaryVm) });
}

async function listPopularArticles({ projectId, limit = 6 }) {
  try {
    let query = serviceClient()
      .from("articles")
      .select("*, article_stats:article_views(count)")
      .eq("published", true)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(Math.min(limit, 20));
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[widget.popular]", error.message);
      return null;
    }
    // Sort by view count when available, fall back to updated_at.
    return (data ?? [])
      .map((row) => ({ ...row, _views: row.article_stats?.[0]?.count ?? 0 }))
      .sort((a, b) => b._views - a._views)
      .slice(0, limit);
  } catch (e) {
    console.error("[widget.popular]", e);
    return null;
  }
}
