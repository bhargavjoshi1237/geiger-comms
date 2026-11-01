// Geiger Comms workflows data layer (owns comms.workflows): a trigger feeding ordered condition/action steps, edited in the list + canvas builder.
// `steps` + `graph` are the builder's form and `steps` is what lib/automation runs; `conditions` / `actions` are re-derived from steps on every save.
// DB snake_case ↔ UI camelCase at this boundary; pure data access — console.error on failure, return null / [] / false, never throw or toast.

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";
import { rulesFromSteps, workflowSteps } from "@/lib/workflows/steps";

const TABLE = "workflows";

// ---- normalize (snake -> camel) ---------------------------------------------

export function normalizeWorkflow(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const steps = workflowSteps(row);
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "",
    description: row.description ?? "",
    status: row.status ?? "draft",
    trigger: row.trigger ?? steps[0]?.type ?? "created",
    steps,
    graph:
      row.graph && typeof row.graph === "object" && !Array.isArray(row.graph)
        ? row.graph
        : {},
    position: Number(row.position ?? 0),
    runCount: Number(row.run_count ?? 0),
    lastRunAt: row.last_run_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
    ...meta,
  };
}

// Emits a column only when its key is present, so one updateWorkflow serves a full save and a `{ status }` toggle.
function toRow(input) {
  const row = {};
  const map = {
    projectId: "project_id",
    name: "name",
    description: "description",
    status: "status",
    trigger: "trigger",
    position: "position",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("steps" in input) {
    const steps = Array.isArray(input.steps) ? input.steps : [];
    const rules = rulesFromSteps(steps);
    row.steps = steps;
    row.conditions = rules.conditions;
    row.actions = rules.actions;
    if (rules.trigger) row.trigger = rules.trigger;
  }
  if ("graph" in input) {
    row.graph = input.graph && typeof input.graph === "object" ? input.graph : {};
  }
  return row;
}

// ---- CRUD --------------------------------------------------------------------

export async function listWorkflows({ projectId } = {}) {
  if (!isSupabaseConfigured()) return [];
  try {
    const sb = createClient();
    let query = sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[workflows.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeWorkflow);
  } catch (e) {
    console.error("[workflows.list]", e);
    return null;
  }
}

export async function getWorkflow(id) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[workflows.get]", error.message);
      return null;
    }
    return normalizeWorkflow(data);
  } catch (e) {
    console.error("[workflows.get]", e);
    return null;
  }
}

export async function createWorkflow(input) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = toRow(input);
    if (input.id) payload.id = input.id; // honor optimistic UUID
    const { data, error } = await sb
      .from(TABLE)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("[workflows.create]", error.message);
      return null;
    }
    return normalizeWorkflow(data);
  } catch (e) {
    console.error("[workflows.create]", e);
    return null;
  }
}

export async function updateWorkflow(id, patch) {
  if (!id || !patch || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .update(toRow(patch))
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      console.error("[workflows.update]", error.message);
      return null;
    }
    return normalizeWorkflow(data);
  } catch (e) {
    console.error("[workflows.update]", e);
    return null;
  }
}

export async function softDeleteWorkflow(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[workflows.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[workflows.delete]", e);
    return false;
  }
}
