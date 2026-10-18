// POST /api/widget/events — trackEvent({ name, meta }); meta is a small flat bag of primitives.

import { errorResponse, jsonResponse, readJsonBody } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { clientIp, rateLimitAll } from "@/lib/widget/ratelimit";
import { appendVisitorEvent } from "@/lib/widget/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_META_KEYS = 25;

// Keeps only primitive values under short keys, so a hostile page cannot bloat the visitor row.
function cleanMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const out = {};
  for (const [key, value] of Object.entries(meta).slice(0, MAX_META_KEYS)) {
    if (key.length > 64) continue;
    if (value === null || typeof value === "boolean") out[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "string") out[key] = value.slice(0, 500);
  }
  return Object.keys(out).length ? out : null;
}

export async function POST(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  const allowed = rateLimitAll([
    [`events:sid:${principal.sid}`, 60, 60_000],
    [`events:ip:${clientIp(request)}`, 300, 60_000],
  ]);
  if (!allowed) return errorResponse(429, "rate_limited");

  const body = (await readJsonBody(request)) ?? {};
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 64) : "";
  if (!name) return errorResponse(400, "bad_request");

  // Analytics never breaks chat: attribution is best-effort and rides on the visitor row.
  if (principal.visitorId) {
    await appendVisitorEvent(principal.visitorId, {
      name,
      meta: cleanMeta(body.meta),
      at: new Date().toISOString(),
    });
  }
  return jsonResponse({ ok: true }, 202);
}
