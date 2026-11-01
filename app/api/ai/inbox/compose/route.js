import { generateFor } from "@/lib/server/ai";
import { aiErrorResponse, errorResponse, jsonResponse } from "@/lib/server/respond";
import { errorFor } from "@/lib/ai/llm_errors";
import { stripUngroundedLinks } from "@/lib/kb/generated_links";
import { COMPOSE_ACTIONS, MAX_DRAFT_CHARS, buildComposePrompt, cleanOutput } from "@/lib/inbox/copilot_prompts";
import { loadThread, openConversation, rateRefusal } from "../_lib/conversation";

// POST /api/ai/inbox/compose { conversationId, action, draft } — one rewrite of a reply draft (rephrase, friendlier,
// formal, shorten, expand, fix). Recent public messages give context; internal notes never reach the model. Nothing is
// sent: the composer swaps the draft in, undoably. Links not in the draft are removed, so a customer can't plant one.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  const { session, body, conversation, response } = await openConversation(request);
  if (response) return response;

  const draft = typeof body.draft === "string" ? body.draft.trim() : "";
  if (!COMPOSE_ACTIONS.includes(body.action) || !draft) return errorResponse(422, "invalid_request");
  if (draft.length > MAX_DRAFT_CHARS) return errorResponse(422, "input_too_long");

  const messages = await loadThread(session, conversation.id);
  if (!messages) return errorResponse(500, "read_failed");
  const refused = await rateRefusal(session, conversation.project_id);
  if (refused) return refused;

  try {
    const { instructions, prompt, grounding } = buildComposePrompt(body.action, { draft, messages });
    const generated = await generateFor({
      projectId: conversation.project_id,
      feature: "inboxAssist",
      userId: session.user.id,
      instructions,
      prompt,
      maxOutputTokens: 2000,
      temperature: body.action === "fix" ? 0.1 : 0.4,
      timeoutMs: 25_000,
    });
    const { text, removed } = stripUngroundedLinks(cleanOutput(generated.text), grounding);
    if (!text.trim()) return errorResponse(502, "generation_failed", errorFor("generation_failed").message);
    return jsonResponse({ text: text.trim(), removedLinks: removed, provider: generated.providerName, model: generated.modelId });
  } catch (err) {
    return aiErrorResponse(err);
  }
}
