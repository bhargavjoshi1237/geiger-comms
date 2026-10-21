import "server-only";
import { rateLimit } from "@/lib/widget/ratelimit";
import { AI_FEATURES, DEFAULT_LIMITS } from "@/lib/ai/features";
import { engineError as refuse } from "@/lib/engine/errors";

// Spend limits on the customer's key (spec §5.9): a durable daily cap per feature switch, counted over a rolling
// 24 h from comms.ai_usage_events, plus a best-effort per-user-per-minute limit for Member-reachable routes.

const DAY_MS = 86_400_000;

// Requests one switch key made in the last 24 h. Fails closed: an uncountable cap refuses the call.
export async function usageCount(admin, projectId, feature) {
  const { data, error } = await admin.rpc("ai_usage_count", {
    p_project: projectId,
    p_feature: AI_FEATURES[feature].usage,
    p_since: new Date(Date.now() - DAY_MS).toISOString(),
  });
  if (error) {
    console.error("[ai.quota.count]", error.code || "rpc_failed");
    throw refuse("service_unavailable");
  }
  return Number(data) || 0;
}

// -> { [switchKey]: requests in the last 24 h }
export async function usageToday(admin, projectId) {
  const keys = Object.keys(AI_FEATURES);
  const counts = await Promise.all(keys.map((key) => usageCount(admin, projectId, key)));
  return Object.fromEntries(keys.map((key, i) => [key, counts[i]]));
}

// Throws ai_feature_disabled for a 0 ("off") limit and ai_quota_exceeded once today's cap is used.
export async function assertDailyQuota({ admin, projectId, feature, limits }) {
  const limit = Number(limits?.[feature]) || 0;
  if (limit <= 0) throw refuse("ai_feature_disabled");
  if ((await usageCount(admin, projectId, feature)) >= limit) throw refuse("ai_quota_exceeded");
}

// The per-user minute limit for routes Members can call (assist, gap refresh); true when the call may proceed.
export function withinUserRate({ projectId, userId, limits }) {
  const perMinute = Math.max(1, Number(limits?.perUserPerMinute) || DEFAULT_LIMITS.perUserPerMinute);
  return rateLimit(`ai:${projectId}:${userId}`, perMinute, 60_000);
}
