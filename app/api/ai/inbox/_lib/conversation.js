import "server-only";
import { adminClient } from "@/lib/server/admin";
import { canInProject, openRoute } from "@/lib/server/workspace_auth";
import { aiErrorResponse, errorResponse, readJsonBody } from "@/lib/server/respond";
import { readAiSettings } from "@/lib/server/ai";
import { withinUserRate } from "@/lib/server/ai_quota";
import { isUuid } from "@/lib/engine/secrets";
import { errorFor } from "@/lib/ai/llm_errors";
import { messageFromRow } from "@/lib/inbox/copilot_prompts";

// Shared by the /api/ai/inbox/* routes (spec §5.1 order). The conversation and its messages are read as the signed-in
// user through RLS, so the copilot only ever sees a thread that teammate can open, in a project where they can reply.

export const CONVERSATION_REPLY = "comms.conversation.reply";
const THREAD_LIMIT = 200;

// Session, then the conversation by body.conversationId and reply permission in its project; a miss is 404.
// -> { session, body, conversation: { id, project_id, contact_id, subject, channel } } | { response }
export async function openConversation(request) {
  const { session, response } = await openRoute(request, { write: true });
  if (response) return { response };
  const body = await readJsonBody(request);
  if (!isUuid(body?.conversationId)) return { response: errorResponse(422, "invalid_request") };

  const { data: conversation, error } = await session.db
    .from("conversations")
    .select("id, project_id, contact_id, subject, channel")
    .eq("id", body.conversationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[api.ai.inbox.conversation]", error.code || "query_failed");
    return { response: errorResponse(500, "read_failed") };
  }
  if (!conversation?.project_id || !(await canInProject(session, conversation.project_id, CONVERSATION_REPLY))) {
    return { response: errorResponse(404, "not_found") };
  }
  return { session, body, conversation };
}

// The per-user minute limit (spec §5.9), checked once the request is known to be valid. -> a 429 response | null
export async function rateRefusal(session, projectId) {
  try {
    const settings = await readAiSettings(adminClient(), projectId);
    if (withinUserRate({ projectId, userId: session.user.id, limits: settings.limits })) return null;
    return errorResponse(429, "ai_quota_exceeded", errorFor("ai_quota_exceeded").message);
  } catch (err) {
    return aiErrorResponse(err);
  }
}

// The newest messages of the thread, oldest first, in the copilot's shape; internal notes only with `notes`. -> messages | null
export async function loadThread(session, conversationId, { notes = false } = {}) {
  let query = session.db
    .from("messages")
    .select("author_role, author_name, message_type, body")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null);
  if (!notes) query = query.or("message_type.is.null,message_type.neq.note");
  const { data, error } = await query.order("created_at", { ascending: false }).limit(THREAD_LIMIT);
  if (error) {
    console.error("[api.ai.inbox.thread]", error.code || "query_failed");
    return null;
  }
  return (data || []).reverse().map(messageFromRow);
}
