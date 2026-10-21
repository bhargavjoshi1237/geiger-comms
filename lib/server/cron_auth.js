import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Scheduler auth for /api/automation/tick and /api/email/outbox/drain: `Authorization: Bearer <CRON_SECRET>`, as Vercel Cron sends it.

const MIN_SECRET_LENGTH = 16;

const digest = (value) => createHash("sha256").update(value).digest();

// Both sides are hashed first, so the comparison is constant-time and leaks neither the secret nor its length.
export function isCronAuthorized(request) {
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < MIN_SECRET_LENGTH) return false;
  return timingSafeEqual(digest(request.headers.get("authorization") || ""), digest(`Bearer ${secret}`));
}
