// Engine error: a stable `code` callers branch on, a user-safe `message`, the HTTP status a route should
// answer with, and whether a caller may retry it. Plain Node (relative imports only) so node --test runs it.

import { errorFor } from "../ai/llm_errors.js";

export class EngineError extends Error {
  constructor(code, message, { status = 500, retryable = false } = {}) {
    super(message);
    this.name = "EngineError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function isEngineError(err) {
  return err instanceof EngineError || err?.name === "EngineError";
}

// An EngineError with a code's own status and message from lib/ai/llm_errors.js.
export function engineError(code) {
  const { message, status } = errorFor(code);
  return new EngineError(code, message, { status });
}
