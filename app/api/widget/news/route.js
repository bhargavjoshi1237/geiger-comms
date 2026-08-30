// GET /api/widget/news — published posts.

import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { getAppById } from "@/lib/widget/apps";
import { listPublishedPosts } from "@/lib/widget/data";
import { postVm } from "@/lib/widget/viewmodels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  const app = await getAppById(principal.appId);
  if (!app) return errorResponse(404, "app_not_found");

  const rows = await listPublishedPosts({ projectId: app.project_id });
  if (!rows) return errorResponse(500, "read_failed");
  return jsonResponse({ posts: rows.map(postVm) });
}
