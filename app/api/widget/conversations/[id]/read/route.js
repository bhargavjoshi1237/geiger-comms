// POST /api/widget/conversations/:id/read — mark the thread read.

import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { findOwnedConversation, markConversationRead } from "@/lib/widget/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  const { id } = await params;
  const conversation = await findOwnedConversation(id, principal);
  if (!conversation) return errorResponse(404, "not_found");

  const ok = await markConversationRead(conversation.id);
  if (!ok) return errorResponse(500, "write_failed");
  return jsonResponse({ ok: true });
}
