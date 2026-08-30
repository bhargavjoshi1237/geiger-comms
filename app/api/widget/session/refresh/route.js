// POST /api/widget/session/refresh — new tokens from a still-valid session.

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
  // The full claims set rides along — refreshed tokens must keep pointing at
  // the same app/contact/visitor or every later call would 404.
  const result = await refreshSession(principal);
  if (!result.ok) return errorResponse(result.status, result.code);
  return jsonResponse(result.body);
}
