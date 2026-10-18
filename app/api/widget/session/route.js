// POST /api/widget/session — boot (spec §4). Body { appId, jwt?, anonymousId, parentOrigin? } → { sessionToken, realtimeToken, expiresIn, realtimeExpiresIn, contact, visitorId, config }.
// parentOrigin is the host origin the iframe's bridge verified; it must be allowlisted (403 otherwise). A forged/expired/alg:none JWT answers 401.

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
    {
      appId: body.appId,
      jwt: body.jwt,
      anonymousId: body.anonymousId,
      parentOrigin: typeof body.parentOrigin === "string" ? body.parentOrigin : null,
    },
    request,
  );

  if (!result.ok) return errorResponse(result.status, result.code);
  return jsonResponse(result.body);
}
