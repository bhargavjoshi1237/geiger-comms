// POST /api/widget/session/refresh — new { sessionToken, realtimeToken, expiresIn, realtimeExpiresIn } from a still-valid session.
// Call it before expiry; a revoked app, a dropped origin, a claimed/deleted identity or a session older than 24h answers 401.

import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { refreshSession } from "@/lib/widget/session";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");
  const result = await refreshSession(principal, request);
  if (!result.ok) return errorResponse(result.status, result.code);
  return jsonResponse(result.body);
}
