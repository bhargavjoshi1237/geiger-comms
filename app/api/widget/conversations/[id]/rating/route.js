// POST /api/widget/conversations/:id/rating — record a post-chat CSAT score { score: 1-5, comment? }.
// Ownership comes from the session token; the id only routes. The conversation's status is the workspace's, never changed here.

import { errorResponse, jsonResponse, readJsonBody } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { ownerKey, rateLimitAll } from "@/lib/widget/ratelimit";
import { rateConversation } from "@/lib/widget/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  const allowed = rateLimitAll([
    [`rate:sid:${principal.sid}`, 20, 60_000],
    [`rate:owner:${ownerKey(principal)}`, 20, 60_000],
  ]);
  if (!allowed) return errorResponse(429, "rate_limited");

  const body = (await readJsonBody(request)) ?? {};
  const score = Number(body.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return errorResponse(400, "bad_score");
  }
  const comment = typeof body.comment === "string" ? body.comment.slice(0, 1000) : "";

  const { id } = await params;
  const ok = await rateConversation(id, principal, { score, comment });
  if (!ok) return errorResponse(404, "not_found");
  return jsonResponse({ ok: true });
}
