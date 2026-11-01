// POST /api/inbox/upload — a teammate's reply/note attachment, multipart fields "file" + "conversationId".
// Same storage model as the Messenger upload (lib/widget/attachments): allowlisted types by magic bytes, 10 MB cap, metadata stripped,
// download-only. The caller is the signed-in teammate: the conversation must be visible to them (RLS) and they must hold
// comms.conversation.reply in its project. Returns { url, name, size, contentType } to pass in the message's attachments.

import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { serviceRoleKey, supabaseUrl } from "@/lib/widget/env";
import { isUuid } from "@/lib/widget/apps";
import { clientIp, rateLimitAll } from "@/lib/widget/ratelimit";
import { canInProject, isSameOriginRequest, workspaceSession } from "@/lib/widget/workspace_auth";
import { MAX_ATTACHMENT_BYTES, storeAttachment } from "@/lib/widget/attachments";

export const runtime = "nodejs";

const REPLY_PERMISSION = "comms.conversation.reply";

export async function POST(request) {
  if (!supabaseUrl() || !serviceRoleKey()) return errorResponse(503, "not_configured");
  if (!isSameOriginRequest(request)) return errorResponse(403, "cross_site");
  const session = await workspaceSession();
  if (!session) return errorResponse(401, "unauthorized");

  const allowed = rateLimitAll([
    [`inbox-upload:user:${session.user.id}`, 30, 60_000],
    [`inbox-upload:ip:${clientIp(request)}`, 60, 60_000],
  ]);
  if (!allowed) return errorResponse(429, "rate_limited");

  // Refuse oversized bodies before buffering the multipart form.
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ATTACHMENT_BYTES + 64 * 1024) {
    return errorResponse(413, "too_large");
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, "bad_request");
  }
  const conversationId = form.get("conversationId");
  if (!isUuid(conversationId)) return errorResponse(400, "bad_request");

  // Read as the teammate, so a thread outside their projects reads as nonexistent.
  const { data: conversation, error } = await session.db
    .from("conversations")
    .select("id, project_id")
    .eq("id", conversationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[inbox.upload]", error.message);
    return errorResponse(500, "read_failed");
  }
  if (!conversation?.project_id) return errorResponse(404, "not_found");
  if (!(await canInProject(session, conversation.project_id, REPLY_PERMISSION))) {
    return errorResponse(403, "forbidden");
  }

  const stored = await storeAttachment(form.get("file"), `workspace/${conversation.project_id}/${conversation.id}`);
  if (!stored.attachment) return errorResponse(stored.status, stored.error);
  return jsonResponse(stored.attachment, 201);
}
