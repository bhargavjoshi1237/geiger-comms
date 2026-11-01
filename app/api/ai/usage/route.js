import { AI_VIEW, canInProject, openRoute } from "@/lib/server/workspace_auth";
import { errorResponse, jsonResponse } from "@/lib/server/respond";
import { usageSummary } from "@/lib/server/ai_usage";
import { isUuid } from "@/lib/engine/secrets";

// GET /api/ai/usage?projectId=&days=30 -> { totals, byDay: [{ day, ok, error }], byFeature, byProvider } (comms.settings.view).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

function tally(map, key) {
  if (!map.has(key)) map.set(key, { requests: 0, errors: 0 });
  return map.get(key);
}

export async function GET(request) {
  const { session, response } = await openRoute(request);
  if (response) return response;
  const params = new URL(request.url).searchParams;
  const projectId = params.get("projectId");
  if (!isUuid(projectId) || !(await canInProject(session, projectId, AI_VIEW))) return errorResponse(404, "not_found");
  const days = Math.min(90, Math.max(1, Number.parseInt(params.get("days"), 10) || 30));

  const rows = await usageSummary(session.db, projectId, days);
  if (!rows) return errorResponse(500, "read_failed");

  // Every UTC day in the window, oldest first, so the chart has no gaps.
  const today = Date.parse(new Date().toISOString().slice(0, 10));
  const byDay = new Map(
    Array.from({ length: days }, (_, i) => [new Date(today - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10), { ok: 0, error: 0 }]),
  );
  const byFeature = new Map();
  const byProvider = new Map();
  const totals = { requests: 0, errors: 0, inputTokens: 0, outputTokens: 0 };

  for (const row of rows) {
    const failed = row.ok ? 0 : row.requests;
    totals.requests += row.requests;
    totals.errors += failed;
    totals.inputTokens += Number(row.input_tokens) || 0;
    totals.outputTokens += Number(row.output_tokens) || 0;
    const day = byDay.get(String(row.day).slice(0, 10));
    if (day) day[row.ok ? "ok" : "error"] += row.requests;
    const feature = tally(byFeature, row.feature);
    feature.requests += row.requests;
    feature.errors += failed;
    if (row.provider_id) {
      const provider = tally(byProvider, row.provider_id);
      provider.requests += row.requests;
      provider.errors += failed;
    }
  }

  const sorted = (map, key) => [...map].map(([id, v]) => ({ [key]: id, ...v })).sort((a, b) => b.requests - a.requests);
  return jsonResponse({
    totals,
    byDay: [...byDay].map(([day, v]) => ({ day, ...v })),
    byFeature: sorted(byFeature, "feature"),
    byProvider: sorted(byProvider, "providerId"),
  });
}
