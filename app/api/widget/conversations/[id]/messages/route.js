// GET  /api/widget/conversations/:id/messages — thread, keyset-paginated; internal notes and deleted messages never leave the server.
// POST /api/widget/conversations/:id/messages — send { body, attachments? }; writes then broadcasts (comms.post_message).
// An id that is not the caller's answers 404, never 403.

import { errorResponse, jsonResponse, readJsonBody } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { clientIp, ownerKey, rateLimitAll } from "@/lib/widget/ratelimit";
import { validateAttachments } from "@/lib/widget/attachments";
import {
  findOwnedConversation,
  listThread,
  postMessage,
} from "@/lib/widget/data";
import { messageVm } from "@/lib/widget/viewmodels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO_CURSOR = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})?$/;

export async function GET(request, { params }) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  const { id } = await params;
  const conversation = await findOwnedConversation(id, principal);
  if (!conversation) return errorResponse(404, "not_found");

  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 50);

  const rows = await listThread(conversation.id, {
    before: before && ISO_CURSOR.test(before) ? before : null,
    limit,
  });
  if (!rows) return errorResponse(500, "read_failed");
  return jsonResponse({
    messages: rows.map(messageVm),
    hasMore: rows.length >= limit,
  });
}

export async function POST(request, { params }) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  const { id } = await params;
  const conversation = await findOwnedConversation(id, principal);
  if (!conversation) return errorResponse(404, "not_found");

  const allowed = rateLimitAll([
    [`send:sid:${principal.sid}`, 30, 60_000],
    [`send:owner:${ownerKey(principal)}`, 30, 60_000],
    [`send:ip:${clientIp(request)}`, 120, 60_000],
  ]);
  if (!allowed) return errorResponse(429, "rate_limited");

  const body = (await readJsonBody(request)) ?? {};
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length > 5000) return errorResponse(400, "bad_request");

  // Only files the upload route stored for this caller are accepted; the server rebuilds each entry.
  const attachments = await validateAttachments(principal, body.attachments);
  if (!attachments) return errorResponse(400, "bad_attachment");
  if (!text && !attachments.length) return errorResponse(400, "bad_request");

  // The visitor always writes as the customer; the server owns authorship.
  const sent = await postMessage({
    conversationId: conversation.id,
    body: text,
    authorRole: "customer",
    attachments,
  });
  if (sent.code === "not_found") return errorResponse(404, "not_found");
  if (!sent.message) return errorResponse(500, "write_failed");
  return jsonResponse({ message: messageVm(sent.message) }, 201);
}
