import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { isCronAuthorized } from "@/lib/server/cron_auth";
import { drainEmailOutbox } from "@/lib/email/outbox";

// GET|POST /api/email/outbox/drain — sends queued email replies; call it about once a minute, like /api/automation/tick.
// Auth: `Authorization: Bearer <CRON_SECRET>` (the header Vercel Cron sends; GET for Vercel Cron, POST for everything else).
// -> { processed, sent, failed, uncertain }.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function drain(request) {
  if (!isCronAuthorized(request)) return errorResponse(401, "unauthorized");
  // Three 15-second sends fit the 60-second budget; a larger backlog drains over the next calls.
  const result = await drainEmailOutbox({ limit: 3 });
  if (result.error) return errorResponse(result.error === "claim_failed" ? 500 : 503, result.error);
  return jsonResponse(result);
}

export async function GET(request) {
  return drain(request);
}

export async function POST(request) {
  return drain(request);
}
