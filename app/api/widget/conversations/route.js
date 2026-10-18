// GET  /api/widget/conversations — this caller's conversations only (preview/unread from visible messages; notes never count).
// POST /api/widget/conversations — start one ({ subject?, firstMessage?, aboutKind?, aboutOrderId?, aboutLabel? }).

import { errorResponse, jsonResponse, readJsonBody } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { getAppById } from "@/lib/widget/apps";
import { clientIp, ownerKey, rateLimitAll } from "@/lib/widget/ratelimit";
import {
  createWidgetConversation,
  listOwnedConversations,
  postMessage,
  principalActive,
} from "@/lib/widget/data";
import { conversationVm, messageVm } from "@/lib/widget/viewmodels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_KINDS = new Set(["order", "returns", "billing", "account", "other"]);

export async function GET(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  const rows = await listOwnedConversations(principal);
  if (!rows) return errorResponse(500, "read_failed");
  return jsonResponse({ conversations: rows.map(conversationVm) });
}

export async function POST(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  const allowed = rateLimitAll([
    [`send:sid:${principal.sid}`, 30, 60_000],
    [`send:owner:${ownerKey(principal)}`, 30, 60_000],
    [`send:ip:${clientIp(request)}`, 120, 60_000],
    [`start:owner:${ownerKey(principal)}`, 10, 60_000],
  ]);
  if (!allowed) return errorResponse(429, "rate_limited");

  const body = (await readJsonBody(request)) ?? {};
  const firstMessage = typeof body.firstMessage === "string" ? body.firstMessage.trim() : "";
  if (firstMessage.length > 5000) return errorResponse(400, "bad_request");

  const app = await getAppById(principal.appId);
  if (!app) return errorResponse(404, "app_not_found");
  // A session whose visitor was since claimed by a contact must re-boot before it can write.
  if (!(await principalActive(principal))) return errorResponse(401, "invalid_token");

  const subject =
    typeof body.subject === "string" && body.subject.trim()
      ? body.subject.trim().slice(0, 200)
      : firstMessage.slice(0, 80);

  // Optional "about" context from the Hub quick actions / New Conversation screen.
  const aboutKind = ALLOWED_KINDS.has(body.aboutKind) ? body.aboutKind : null;
  const aboutOrderId = typeof body.aboutOrderId === "string" ? body.aboutOrderId.slice(0, 80) : null;
  const aboutLabel = typeof body.aboutLabel === "string" ? body.aboutLabel.slice(0, 200) : null;

  const conversation = await createWidgetConversation({
    app,
    principal,
    subject,
    aboutKind,
    aboutOrderId,
    aboutLabel,
  });
  if (!conversation) return errorResponse(500, "write_failed");

  let message = null;
  if (firstMessage) {
    const sent = await postMessage({
      conversationId: conversation.id,
      body: firstMessage,
      authorRole: "customer",
    });
    if (sent.message) message = messageVm(sent.message);
  }

  return jsonResponse({ conversation: conversationVm(conversation), message }, 201);
}
