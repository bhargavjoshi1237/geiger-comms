// GET /api/widget/config?appId=… — appearance + spaces. Cacheable, no auth
// (spec §5). The loader fetches it from the host page, so this is the one
// route that answers cross-origin: it echoes back an exact allowlisted origin.

import { errorResponse, corsHeaders, jsonResponse } from "@/lib/widget/respond";
import { getAppByPublicId, buildWidgetConfig } from "@/lib/widget/apps";
import { originAllowed } from "@/lib/widget/origins";
import { rateLimit } from "@/lib/widget/ratelimit";
import { isWidgetApiConfigured } from "@/lib/widget/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request) {
  const origin = request.headers.get("origin") ?? "";
  const appId = new URL(request.url).searchParams.get("appId");
  if (!appId || !isWidgetApiConfigured()) return errorResponse(400, "bad_request");
  const app = await getAppByPublicId(appId);
  if (!app || !originAllowed(app.allowed_origins, origin)) {
    return errorResponse(403, "origin_not_allowed");
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function GET(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const origin = request.headers.get("origin") ?? "";
  const appId = new URL(request.url).searchParams.get("appId");
  if (!appId) return errorResponse(400, "bad_request");
  if (!rateLimit(`config:${appId}`, 120, 60_000)) return errorResponse(429, "rate_limited");

  const app = await getAppByPublicId(appId);
  // Same 404-not-403 discipline as every other route.
  if (!app) return errorResponse(404, "app_not_found");

  const headers = originAllowed(app.allowed_origins, origin)
    ? corsHeaders(origin)
    : {};
  const config = await buildWidgetConfig(app);
  return jsonResponse(config, 200, {
    ...headers,
    "Cache-Control": "public, max-age=60, must-revalidate",
  });
}
