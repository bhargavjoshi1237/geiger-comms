// POST /api/widget/conversations/:id/rating — record a post-chat CSAT score and
// optionally close the conversation. Ownership always comes from the
// session token; the conversation id is only used for routing.

import { errorResponse, jsonResponse, readJsonBody } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { rateLimit } from "@/lib/widget/ratelimit";
import { rateConversation } from "@/lib/widget/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  if (!rateLimit(`rate:${principal.sid}`, 20, 60_000)) {
    return errorResponse(429, "rate_limited");
  }

  const body = (await readJsonBody(request)) ?? {};
  const score = Number(body.score);
  if (!Number.isFinite(score) || score < 1 || score > 5) {
    return errorResponse(400, "bad_score");
  }
  const comment = typeof body.comment === "string" ? body.comment.slice(0, 1000) : "";

  const ok = await rateConversation(params.id, principal, { score, comment });
  if (!ok) return errorResponse(404, "not_found");
  return jsonResponse({ ok: true });
}
