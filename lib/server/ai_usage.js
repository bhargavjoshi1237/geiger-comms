import "server-only";
import { after } from "next/server";
import { adminClient } from "./admin";

// AI metering (spec §5.8): one comms.ai_usage_events row per model call, written after the response through the
// admin client. BYOK, so no cost is stored. The insert swallows its own errors — metering never fails a request.

export function tokensOf(usage) {
  return { inputTokens: Number(usage?.inputTokens) || 0, outputTokens: Number(usage?.outputTokens) || 0 };
}

export function recordUsage({ projectId, providerId = null, feature, capability = "chat", model = null, inputTokens = 0, outputTokens = 0, latencyMs = null, ok = true, errorCode = null, userId = null }) {
  after(async () => {
    const admin = adminClient();
    if (!admin) return;
    try {
      const { error } = await admin.from("ai_usage_events").insert({
        project_id: projectId,
        provider_id: providerId,
        feature,
        capability,
        model,
        input_tokens: Math.max(0, Math.round(inputTokens)),
        output_tokens: Math.max(0, Math.round(outputTokens)),
        latency_ms: latencyMs == null ? null : Math.round(latencyMs),
        ok,
        error_code: errorCode,
        created_by: userId,
      });
      if (error) console.error("[ai.usage.record]", error.code || "insert_failed");
    } catch (e) {
      console.error("[ai.usage.record]", e?.name || "insert_failed");
    }
  });
}

// Per UTC day / feature / provider / outcome rows since `days` ago, read as the caller (RLS). -> rows | null
export async function usageSummary(db, projectId, days) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await db.rpc("ai_usage_summary", { p_project: projectId, p_since: since });
  if (error) {
    console.error("[ai.usage.summary]", error.code || "rpc_failed");
    return null;
  }
  return data || [];
}
