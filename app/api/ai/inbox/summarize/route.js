import { generateFor } from "@/lib/server/ai";
import { aiErrorResponse, errorResponse, jsonResponse } from "@/lib/server/respond";
import { errorFor } from "@/lib/ai/llm_errors";
import { stripUngroundedLinks } from "@/lib/kb/generated_links";
import { buildSummaryPrompt, cleanOutput } from "@/lib/inbox/copilot_prompts";
import { languageCode } from "@/lib/inbox/language";
import { loadThread, openConversation, rateRefusal } from "../_lib/conversation";

// POST /api/ai/inbox/summarize { conversationId, language? } — a short summary of the thread so far, in the teammate's
// language, for teammates only: internal notes are context here and nowhere else. Nothing is saved or sent; the
// teammate decides whether it becomes an internal note. Links the model added that aren't in the thread are removed.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  const { session, body, conversation, response } = await openConversation(request);
  if (response) return response;

  const messages = await loadThread(session, conversation.id, { notes: true });
  if (!messages) return errorResponse(500, "read_failed");
  if (!messages.some((m) => m.body.trim())) return errorResponse(422, "nothing_to_summarize");
  const refused = await rateRefusal(session, conversation.project_id);
  if (refused) return refused;

  try {
    const { instructions, prompt, grounding } = buildSummaryPrompt({
      subject: conversation.subject ?? "",
      channel: conversation.channel ?? "",
      messages,
      language: languageCode(body.language) || "en",
    });
    const generated = await generateFor({
      projectId: conversation.project_id,
      feature: "inboxAssist",
      userId: session.user.id,
      instructions,
      prompt,
      maxOutputTokens: 600,
      temperature: 0.2,
      timeoutMs: 30_000,
    });
    const { text, removed } = stripUngroundedLinks(cleanOutput(generated.text), grounding);
    if (!text.trim()) return errorResponse(502, "generation_failed", errorFor("generation_failed").message);
    return jsonResponse({ summary: text.trim(), removedLinks: removed, provider: generated.providerName, model: generated.modelId });
  } catch (err) {
    return aiErrorResponse(err);
  }
}
