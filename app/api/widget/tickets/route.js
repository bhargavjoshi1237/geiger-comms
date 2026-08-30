// GET /api/widget/tickets — the caller's tickets, joined through their own
// conversations.

import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { listOwnedTickets } from "@/lib/widget/data";
import { ticketVm } from "@/lib/widget/viewmodels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  const rows = await listOwnedTickets(principal);
  if (!rows) return errorResponse(500, "read_failed");
  return jsonResponse({ tickets: rows.map(ticketVm) });
}
