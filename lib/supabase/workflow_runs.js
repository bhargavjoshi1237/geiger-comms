// Geiger Comms workflow runs data layer (owns comms.workflow_runs, read-only here): one row per workflow execution, written by the engine.
// Engine contract: status ok | failed | running | skipped; input = trigger payload { trigger, ... }; output = { steps: [{ type, label, status, durationMs, error }], durationMs, finishedAt, error }.
// DB snake_case ↔ UI camelCase at this boundary; pure data access — console.error on failure, return null / [], never throw or toast.

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

const TABLE = "workflow_runs";

const asObject = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeRun(row) {
  if (!row) return null;
  const meta = asObject(row.metadata);
  const input = asObject(row.input);
  const output = asObject(row.output);
  const stepsLog = Array.isArray(output.steps) ? output.steps : [];
  const { trigger, ...context } = input;
  return {
    id: row.id,
    workflowId: row.workflow_id ?? null,
    conversationId: row.conversation_id ?? null,
    projectId: row.project_id ?? null,
    status: row.status ?? "ok",
    trigger: trigger ?? meta.trigger ?? "",
    context,
    stepsLog,
    stepsTotal: stepsLog.length,
    stepsCompleted: stepsLog.filter((s) => (s?.status ?? "ok") === "ok").length,
    durationMs: Number(output.durationMs ?? 0),
    error: output.error ?? "",
    startedAt: row.created_at ?? null,
    finishedAt: output.finishedAt ?? null,
    ...meta,
  };
}

// Newest first, capped at 500.
export async function listWorkflowRuns({ projectId, workflowId } = {}) {
  if (!isSupabaseConfigured()) return [];
  try {
    const sb = createClient();
    let query = sb
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (projectId) query = query.eq("project_id", projectId);
    if (workflowId) query = query.eq("workflow_id", workflowId);
    const { data, error } = await query;
    if (error) {
      console.error("[workflow_runs.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeRun);
  } catch (e) {
    console.error("[workflow_runs.list]", e);
    return null;
  }
}
