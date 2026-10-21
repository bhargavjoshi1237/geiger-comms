// Provider error mapping and secret redaction (knowledge-base-and-ai-providers spec §5.6), ported from geiger-grey.
// Pure. Works with AI SDK errors (APICallError / RetryError), fetch failures and the engine's own errors by duck
// typing, so it never imports the SDK. Raw provider text is never returned: every code carries our own message.

// code -> [HTTP status comms answers with, message the UI shows]. An upstream 401 is never a comms 401.
const ERRORS = {
  provider_auth: [502, "The provider rejected the API key."],
  model_not_found: [502, "That model isn't available on this provider."],
  rate_limited: [429, "The provider is rate-limiting requests — try again shortly."],
  bad_request: [502, "The provider couldn't process this request."],
  provider_unavailable: [502, "The provider isn't responding."],
  bad_response: [502, "The provider returned an unreadable response."],
  timeout: [504, "The provider took too long to answer."],
  aborted: [499, "The request was cancelled."],
  unsafe_base_url: [422, "This base URL isn't allowed."],
  no_key: [422, "Add an API key for this provider in Settings → AI Providers."],
  no_model: [422, "Add a model id to test."],
  no_base_url: [422, "Add a base URL for this provider in Settings → AI Providers."],
  capability_missing: [422, "This provider can't be used for that."],
  provider_not_found: [422, "The selected AI provider no longer exists — choose another one."],
  key_required: [422, "Changing the base URL or provider needs the API key again."],
  no_dims: [422, "Detect the embedding dimensions in Settings → AI Providers first."],
  dims_mismatch: [422, "The embedding model returned vectors of a different size — re-detect the dimensions in Settings → AI Providers."],
  unsupported_dims: [422, "This embedding model's vector size isn't supported (64–4000 dimensions)."],
  limit_required: [422, "Set a daily limit before turning on Answers in the Messenger."],
  ai_not_configured: [409, "Connect an AI provider in Settings → AI Providers to use this."],
  ai_no_default: [409, "Choose a default model in Settings → AI Providers → Default Models."],
  ai_feature_disabled: [409, "This AI feature is turned off in Settings → AI Providers → AI Features."],
  ai_consent_required: [409, "Confirm data sharing in Settings → AI Providers → AI Features first."],
  ai_quota_exceeded: [429, "Today's AI limit for this feature is used up. An admin can raise it in Settings → AI Providers."],
  busy: [409, "A refresh is already running for this workspace."],
  service_unavailable: [503, "AI is unavailable right now — try again shortly."],
  generation_failed: [502, "Something went wrong generating a response."],
};

const RETRYABLE = new Set(["rate_limited", "provider_unavailable", "bad_response", "timeout", "service_unavailable"]);

export const LLM_ERROR_CODES = Object.keys(ERRORS);

const NETWORK_CODES = new Set([
  "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT",
]);

function upstreamStatus(err) {
  const candidates = [err?.statusCode, err?.status, err?.response?.status, err?.lastError?.statusCode, err?.cause?.statusCode];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 100 && n <= 599) return n;
  }
  return null;
}

function isTimeout(err) {
  const names = [err?.name, err?.cause?.name, err?.lastError?.name, err?.reason?.name];
  if (names.includes("TimeoutError")) return true;
  const code = err?.code || err?.cause?.code;
  return code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT";
}

function isNetwork(err) {
  const code = err?.code || err?.cause?.code || err?.lastError?.cause?.code;
  if (code && NETWORK_CODES.has(code)) return true;
  if (err?.name === "TypeError" && /fetch failed|network/i.test(err?.message || "")) return true;
  // AI SDK APICallError without a status = the request never got a response.
  return err?.name === "AI_APICallError" && err?.statusCode == null && err?.isRetryable === true;
}

// The connect-time SSRF guard (lib/engine/net.js) tags its refusal with this code; AI SDK errors
// wrap it in their cause chain, so walk it rather than importing net.js into this pure module.
const PRIVATE_ADDRESS_CODE = "EPRIVATEADDR";
function isPrivateAddressRefusal(err) {
  for (let e = err, depth = 0; e && depth < 6; e = e.cause ?? e.lastError, depth += 1) {
    if (e.code === PRIVATE_ADDRESS_CODE) return true;
  }
  return false;
}

function result(code, providerStatus = null) {
  const [status, message] = ERRORS[code];
  return {
    code,
    message,
    status,
    retryable: RETRYABLE.has(code),
    providerStatus,
    // provider_auth means the stored key is bad: the connection is marked `error`.
    markProviderError: code === "provider_auth",
  };
}

// -> { code, message, status } for a code comms raises itself (key_required, ai_quota_exceeded…).
export function errorFor(code) {
  const known = ERRORS[code] ? code : "generation_failed";
  const [status, message] = ERRORS[known];
  return { code: known, message, status };
}

// -> { code, message, status, retryable, providerStatus, markProviderError }
// Engine errors keep their own message: it is written by comms (it may name the provider), never by a vendor.
export function mapLlmError(err) {
  if (err?.name === "EngineError" && err?.code && ERRORS[err.code]) {
    return { ...result(err.code, err.providerStatus ?? null), message: err.message || ERRORS[err.code][1] };
  }
  if (isTimeout(err)) return result("timeout");
  if (err?.name === "AbortError" || err?.cause?.name === "AbortError") return result("aborted");
  if (isPrivateAddressRefusal(err)) return result("unsafe_base_url");

  const status = upstreamStatus(err);
  if (status === 401 || status === 403) return result("provider_auth", status);
  if (status === 404) return result("model_not_found", status);
  if (status === 429) return result("rate_limited", status);
  if (status === 400 || status === 422) return result("bad_request", status);
  if (status === 408) return result("timeout", status);
  if (status != null && status >= 500) return result("provider_unavailable", status);
  if (status == null && isNetwork(err)) return result("provider_unavailable");
  return result("generation_failed", status);
}

const REDACTED = "[redacted]";
const PATTERNS = [
  [/sk-[A-Za-z0-9_-]{8,}/g, REDACTED],
  [/AIza[0-9A-Za-z_-]{20,}/g, REDACTED],
  [/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, `$1${REDACTED}`],
  [/((?:api[_-]?key|x-api-key|x-goog-api-key|authorization|access[_-]?token|key)["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi, `$1${REDACTED}`],
];

function stringify(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// Strips the given secret and anything key-shaped, for logs and stored errors.
export function redact(value, secret) {
  let text = stringify(value);
  if (typeof secret === "string" && secret.length >= 4) text = text.split(secret).join(REDACTED);
  for (const [re, replacement] of PATTERNS) text = text.replace(re, replacement);
  return text;
}
