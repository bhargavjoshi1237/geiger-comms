import { jsonResponse } from "@/lib/widget/respond";
import { mapLlmError } from "@/lib/ai/llm_errors";

export { jsonResponse, readJsonBody } from "@/lib/widget/respond";

// { error: code, message? } — `message` only on provider and AI errors, and always comms' own mapped text.
export function errorResponse(status, code, message) {
  return jsonResponse(message ? { error: code, message } : { error: code }, status);
}

// A provider or engine failure -> its mapped code, status and message (spec §5.6); raw provider text never leaves.
export function aiErrorResponse(err) {
  const mapped = mapLlmError(err);
  return errorResponse(mapped.status, mapped.code, mapped.message);
}
