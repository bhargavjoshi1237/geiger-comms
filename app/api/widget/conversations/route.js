// GET  /api/widget/conversations — this caller's conversations only.
// POST /api/widget/conversations — start one ({ subject?, firstMessage?,
//   aboutKind?, aboutOrderId?, aboutLabel? }).

import { errorResponse, jsonResponse, readJsonBody } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { getAppById } from "@/lib/widget/apps";
import { rateLimit } from "@/lib/widget/ratelimit";
import {
  createWidgetConversation,
  listOwnedConversations,
  postMessage,
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

  if (!rateLimit(`send:${principal.sid}`, 30, 60_000)) {
    return errorResponse(429, "rate_limited");
  }

  const body = (await readJsonBody(request)) ?? {};
  const firstMessage = typeof body.firstMessage === "string" ? body.firstMessage.trim() : "";
  if (firstMessage.length > 5000) return errorResponse(400, "bad_request");

  const app = await getAppById(principal.appId);
  if (!app) return errorResponse(404, "app_not_found");

  const subject =
    typeof body.subject === "string" && body.subject.trim()
      ? body.subject.trim().slice(0, 200)
      : firstMessage.slice(0, 80);

  // Optional "about" context — the Hub Quick actions + the New Conversation
  // screen both populate this so the workspace team has the context they
  // need without a back-and-forth.
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
