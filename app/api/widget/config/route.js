// GET /api/widget/config?appId=… — appearance + spaces; cacheable, no auth (spec §5).
// The loader fetches it from the host page, so this is the one route that answers cross-origin, echoing an exact allowlisted origin.

import { errorResponse, corsHeaders, jsonResponse } from "@/lib/widget/respond";
import { getAppByPublicId, buildWidgetConfig } from "@/lib/widget/apps";
import { originAllowed } from "@/lib/widget/origins";
import { clientIp, rateLimit } from "@/lib/widget/ratelimit";
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
  // Per caller, not per app: one visitor's page loads must never exhaust a whole customer's budget.
  if (!rateLimit(`config:${appId}:${clientIp(request)}`, 60, 60_000)) return errorResponse(429, "rate_limited");

  const app = await getAppByPublicId(appId);
  // Same 404-not-403 discipline as every other route.
  if (!app) return errorResponse(404, "app_not_found");

  const headers = originAllowed(app.allowed_origins, origin) ? corsHeaders(origin) : {};
  const config = await buildWidgetConfig(app);
  // Vary on Origin always, so a shared cache never serves one origin's CORS answer to another.
  return jsonResponse(config, 200, {
    ...headers,
    Vary: "Origin",
    "Cache-Control": "public, max-age=60, must-revalidate",
  });
}
