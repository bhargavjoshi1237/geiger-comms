// Best-effort in-memory fixed-window rate limiter (spec §10.6). Per-instance
// on serverless — enough to blunt abuse spikes; a shared store can replace the
// Map later without changing callers.

const buckets = new Map();
const MAX_BUCKETS = 10000;

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
