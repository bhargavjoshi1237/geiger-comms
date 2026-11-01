import { generateFor } from "@/lib/server/ai";
import { aiErrorResponse, errorResponse, jsonResponse } from "@/lib/server/respond";
import { isUuid } from "@/lib/engine/secrets";
import { errorFor } from "@/lib/ai/llm_errors";
import { stripUngroundedLinks } from "@/lib/kb/generated_links";
import { MAX_DRAFT_CHARS, MAX_TRANSLATE_CHARS, buildTranslatePrompt, cleanOutput } from "@/lib/inbox/copilot_prompts";
import { customerLanguage, detectLanguage, languageCode } from "@/lib/inbox/language";
import { loadThread, openConversation, rateRefusal } from "../_lib/conversation";

// POST /api/ai/inbox/translate { conversationId, mode: "draft", draft } -> the draft in the customer's language (profile, else messages; 422 language_unknown).
// { conversationId, mode: "message", messageId, language } -> one customer message in the teammate's language. Notes never reach the model; nothing is saved.
export const runtime = "nodejs";
export const maxDuration = 60;

async function contactLanguage(session, contactId) {
  if (!contactId) return null;
  const { data, error } = await session.db.from("contacts").select("metadata").eq("id", contactId).is("deleted_at", null).maybeSingle();
  if (error) console.error("[api.ai.inbox.translate.contact]", error.code || "query_failed");
  return data?.metadata?.language ?? null;
}

// -> { text, target, source, truncated } | { response }
async function draftRequest(session, conversation, body) {
  const text = typeof body.draft === "string" ? body.draft.trim() : "";
  if (!text) return { response: errorResponse(422, "invalid_request") };
  if (text.length > MAX_DRAFT_CHARS) return { response: errorResponse(422, "input_too_long") };
  const [stated, messages] = await Promise.all([
    contactLanguage(session, conversation.contact_id),
    loadThread(session, conversation.id),
  ]);
  if (!messages) return { response: errorResponse(500, "read_failed") };
  const customer = customerLanguage({
    contactLanguage: stated,
    customerMessages: messages.filter((m) => m.role === "customer").map((m) => m.body),
  });
  if (!customer) return { response: errorResponse(422, "language_unknown") };
  return { text, target: customer.code, source: detectLanguage(text), truncated: false };
}

async function messageRequest(session, conversation, body) {
  if (!isUuid(body.messageId)) return { response: errorResponse(422, "invalid_request") };
  const { data: message, error } = await session.db
    .from("messages")
    .select("author_role, message_type, body")
    .eq("id", body.messageId)
    .eq("conversation_id", conversation.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[api.ai.inbox.translate.message]", error.code || "query_failed");
    return { response: errorResponse(500, "read_failed") };
  }
  // Only what a customer wrote; a note is never translated (or sent to the model) here.
  if (!message || message.author_role !== "customer" || message.message_type === "note") {
    return { response: errorResponse(404, "not_found") };
  }
  const full = String(message.body ?? "").trim();
  if (!full) return { response: errorResponse(422, "invalid_request") };
  const text = full.slice(0, MAX_TRANSLATE_CHARS);
  return { text, target: languageCode(body.language) || "en", source: detectLanguage(text), truncated: full.length > text.length };
}

export async function POST(request) {
  const { session, body, conversation, response } = await openConversation(request);
  if (response) return response;
  if (body.mode !== "draft" && body.mode !== "message") return errorResponse(422, "invalid_request");

  const req = body.mode === "draft" ? await draftRequest(session, conversation, body) : await messageRequest(session, conversation, body);
  if (req.response) return req.response;
  if (req.source === req.target) return jsonResponse({ error: "same_language", language: req.target }, 422);
  const refused = await rateRefusal(session, conversation.project_id);
  if (refused) return refused;

  try {
    const { instructions, prompt, grounding } = buildTranslatePrompt({ text: req.text, target: req.target, source: req.source, kind: body.mode });
    const generated = await generateFor({
      projectId: conversation.project_id,
      feature: "inboxTranslation",
      userId: session.user.id,
      instructions,
      prompt,
      maxOutputTokens: 3000,
      temperature: 0.2,
      timeoutMs: 45_000,
    });
    const { text, removed } = stripUngroundedLinks(cleanOutput(generated.text), grounding);
    if (!text.trim()) return errorResponse(502, "generation_failed", errorFor("generation_failed").message);
    return jsonResponse({
      text: text.trim(),
      targetLanguage: req.target,
      sourceLanguage: req.source,
      truncated: req.truncated,
      removedLinks: removed,
      provider: generated.providerName,
      model: generated.modelId,
    });
  } catch (err) {
    return aiErrorResponse(err);
  }
}
