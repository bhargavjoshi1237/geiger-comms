// POST /api/widget/events — trackEvent({ name, meta }).

import { errorResponse, jsonResponse, readJsonBody } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { rateLimit } from "@/lib/widget/ratelimit";
import { appendVisitorEvent } from "@/lib/widget/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  if (!rateLimit(`events:${principal.sid}`, 60, 60_000)) {
    return errorResponse(429, "rate_limited");
  }

  const body = (await readJsonBody(request)) ?? {};
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 64) : "";
  if (!name) return errorResponse(400, "bad_request");

  // Analytics never breaks chat: attribution is best-effort and anonymous
  // visitors only (identified-only sessions carry no visitor id).
  if (principal.visitorId) {
    await appendVisitorEvent(principal.visitorId, {
      name,
      meta: body.meta && typeof body.meta === "object" ? body.meta : null,
      at: new Date().toISOString(),
    });
  }
  return jsonResponse({ ok: true }, 202);
}
