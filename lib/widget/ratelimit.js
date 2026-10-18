import "server-only";

// Best-effort in-memory fixed-window limiter (spec §10.6); per-instance on serverless, so a shared store must replace the Map for hard limits.

const buckets = new Map();
const MAX_BUCKETS = 20000;

function prune(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.reset <= now) buckets.delete(key);
  }
  while (buckets.size > MAX_BUCKETS) buckets.delete(buckets.keys().next().value);
}

// Returns true when the call is allowed.
export function rateLimit(key, limit, windowMs) {
  if (!key) return true;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.reset <= now) {
    if (buckets.size >= MAX_BUCKETS) prune(now);
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

// Every dimension is counted; the call passes only when none is exhausted. Rules: [key, limit, windowMs].
export function rateLimitAll(rules) {
  let ok = true;
  for (const [key, limit, windowMs] of rules) {
    if (!rateLimit(key, limit, windowMs)) ok = false;
  }
  return ok;
}

// Caller IP from the platform's forwarding headers; spoofable off-platform, so it is only one dimension among several.
export function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded ? forwarded.split(",")[0].trim() : "";
  return (first || request.headers.get("x-real-ip") || "unknown").slice(0, 64);
}

// The identity a session acts for — contact when identified, else the visitor — so a fresh boot does not reset per-person limits.
export function ownerKey(principal) {
  return principal?.contactId ? `c:${principal.contactId}` : principal?.visitorId ? `v:${principal.visitorId}` : null;
}
