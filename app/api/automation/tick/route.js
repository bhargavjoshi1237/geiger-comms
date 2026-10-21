// GET|POST /api/automation/tick — one pass of the automation engine (lib/automation/tick.js) for any scheduler, about once a minute.
// Auth: `Authorization: Bearer <CRON_SECRET>`, the header Vercel Cron sends; GET is there for Vercel Cron, POST for everything else.

import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { isCronAuthorized } from "@/lib/server/cron_auth";
import { isAutomationConfigured } from "@/lib/automation/client";
import { runTick } from "@/lib/automation/tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function tick(request) {
  if (!isCronAuthorized(request)) return errorResponse(401, "unauthorized");
  if (!isAutomationConfigured()) return errorResponse(503, "not_configured");
  return jsonResponse(await runTick());
}

export async function GET(request) {
  return tick(request);
}

export async function POST(request) {
  return tick(request);
}
