import { test } from "node:test";
import assert from "node:assert/strict";
import { LLM_ERROR_CODES, errorFor, mapLlmError, redact } from "./llm_errors.js";

const api = (statusCode, extra = {}) => ({ name: "AI_APICallError", statusCode, message: "raw provider text sk-secret123456", ...extra });

test("maps provider statuses to stable codes", () => {
  assert.equal(mapLlmError(api(401)).code, "provider_auth");
  assert.equal(mapLlmError(api(403)).code, "provider_auth");
  assert.equal(mapLlmError(api(404)).code, "model_not_found");
  assert.equal(mapLlmError(api(429)).code, "rate_limited");
  assert.equal(mapLlmError(api(400)).code, "bad_request");
  assert.equal(mapLlmError(api(422)).code, "bad_request");
  assert.equal(mapLlmError(api(500)).code, "provider_unavailable");
  assert.equal(mapLlmError(api(503)).code, "provider_unavailable");
  assert.equal(mapLlmError({ status: 502 }).code, "provider_unavailable");
  assert.equal(mapLlmError(new Error("weird")).code, "generation_failed");
});

test("auth errors mark the provider and never echo provider text", () => {
  const mapped = mapLlmError(api(401));
  assert.equal(mapped.markProviderError, true);
  assert.equal(mapped.status, 502);
  assert.equal(mapped.retryable, false);
  assert.equal(mapped.providerStatus, 401);
  assert.equal(mapped.message, "The provider rejected the API key.");
});

test("spec §5.6 statuses", () => {
  const status = (code) => errorFor(code).status;
  assert.equal(status("rate_limited"), 429);
  assert.equal(status("timeout"), 504);
  assert.equal(status("unsafe_base_url"), 422);
  for (const code of ["no_key", "no_model", "no_base_url", "capability_missing", "provider_not_found", "key_required", "no_dims", "limit_required"]) {
    assert.equal(status(code), 422, code);
  }
  for (const code of ["ai_not_configured", "ai_no_default", "ai_feature_disabled", "ai_consent_required", "busy"]) {
    assert.equal(status(code), 409, code);
  }
  assert.equal(status("ai_quota_exceeded"), 429);
  assert.equal(errorFor("nonsense").code, "generation_failed");
  assert.equal(status("nonsense"), 502);
});

test("retry errors use the last attempt's status", () => {
  assert.equal(mapLlmError({ name: "AI_RetryError", lastError: { statusCode: 429 } }).code, "rate_limited");
});

test("network failures and timeouts", () => {
  const fetchFailed = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
  assert.equal(mapLlmError(fetchFailed).code, "provider_unavailable");
  assert.equal(mapLlmError(api(undefined, { isRetryable: true })).code, "provider_unavailable");
  const timeout = new Error("The operation was aborted due to timeout");
  timeout.name = "TimeoutError";
  const mapped = mapLlmError(timeout);
  assert.equal(mapped.code, "timeout");
  assert.equal(mapped.retryable, true);
  assert.equal(mapLlmError({ name: "AbortError" }).code, "aborted");
});

test("engine errors with a known code pass through with their own message", () => {
  assert.equal(mapLlmError({ name: "EngineError", code: "rate_limited", providerStatus: 429 }).providerStatus, 429);
  const noKey = mapLlmError({ name: "EngineError", code: "no_key", message: 'Add an API key for "OpenAI" in Settings → AI Providers.' });
  assert.equal(noKey.code, "no_key");
  assert.match(noKey.message, /"OpenAI"/);
  assert.equal(mapLlmError({ name: "EngineError", code: "mystery" }).code, "generation_failed");
});

test("every code has a message and status", () => {
  for (const code of LLM_ERROR_CODES) {
    const mapped = mapLlmError({ name: "EngineError", code });
    assert.equal(mapped.code, code);
    assert.ok(mapped.message);
    assert.ok(mapped.status >= 400);
  }
});

test("redact strips the secret and key-shaped tokens", () => {
  const secret = "my-very-secret-key-1234";
  assert.equal(redact(`bad key ${secret} here`, secret), "bad key [redacted] here");
  assert.doesNotMatch(redact("Incorrect API key provided: sk-proj-abcdefghijkl"), /sk-proj/);
  assert.doesNotMatch(redact("Authorization: Bearer abc.def.ghi"), /abc\.def/);
  assert.doesNotMatch(redact("https://x.test/v1?key=AIzaSyA1234567890abcdefghijk"), /AIza/);
  assert.doesNotMatch(redact('{"x-api-key":"plain-key-value"}'), /plain-key-value/);
  assert.equal(redact(new Error("boom")), "Error: boom");
  assert.equal(redact({ a: 1 }), '{"a":1}');
  assert.equal(redact(null), "");
  // Too-short secrets are not used as a needle (would shred ordinary text).
  assert.equal(redact("abc abc", "abc"), "abc abc");
});

test("mapLlmError maps the connect-time private-address refusal anywhere in the cause chain", () => {
  const refusal = Object.assign(new Error("private"), { code: "EPRIVATEADDR" });
  const wrapped = Object.assign(new Error("Cannot connect to API"), { name: "AI_APICallError", cause: Object.assign(new TypeError("fetch failed"), { cause: refusal }) });
  const mapped = mapLlmError(wrapped);
  assert.equal(mapped.code, "unsafe_base_url");
  assert.equal(mapped.status, 422);
  assert.equal(mapped.retryable, false);
});
