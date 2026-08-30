// POST /api/widget/session — boot (spec §4). Body { appId, jwt?, anonymousId }
// → { sessionToken, realtimeToken, contact, config }. The Origin allowlist is
// enforced here on every call; a forged/expired/alg:none JWT answers 401.

import { errorResponse, jsonResponse, readJsonBody } from "@/lib/widget/respond";
import { bootSession } from "@/lib/widget/session";
import { isWidgetApiConfigured } from "@/lib/widget/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");

  const body = await readJsonBody(request);
  if (!body) return errorResponse(400, "bad_request");

  const result = await bootSession(
    { appId: body.appId, jwt: body.jwt, anonymousId: body.anonymousId },
    {
      origin: request.headers.get("origin"),
      userAgent: request.headers.get("user-agent"),
    }
  );

  if (!result.ok) return errorResponse(result.status, result.code);
  return jsonResponse(result.body, 200, { "Cache-Control": "no-store" });
}
