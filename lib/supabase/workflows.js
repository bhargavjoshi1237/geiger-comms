// Geiger Comms workflows data layer (owns comms.workflows): a trigger feeding ordered condition/action steps, edited in the list + canvas builder.
// `steps` + `graph` are the builder's form; `conditions` / `actions` are the engine-facing columns, re-derived from steps on every save.
// DB snake_case ↔ UI camelCase at this boundary; pure data access — console.error on failure, return null / [] / false, never throw or toast.

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

const TABLE = "workflows";

// Condition step type → [workflows.conditions key, step config field]; values collect into an array per key.
const CONDITION_KEYS = {
  "if.channel": ["channel", "channel"],
  "if.priority": ["priority", "priority"],
  "if.tag": ["tags", "tag"],
  "if.state": ["state", "state"],
  "if.office_hours": ["office_hours", "when"],
  "if.assignee": ["assignee", "assignee"],
  "if.message_contains": ["message_contains", "text"],
};
const ATTRIBUTE_CONDITION = "if.contact_attribute";

const stepId = () => `step_${crypto.randomUUID()}`;

// steps → { trigger, conditions, actions } for the engine. Trigger config rides along as conditions.trigger.
export function rulesFromSteps(steps) {
  const list = Array.isArray(steps) ? steps : [];
  const triggerStep = list[0]?.kind === "trigger" ? list[0] : null;
  const rest = triggerStep ? list.slice(1) : list;
  const conditions = {};
  const actions = [];
  if (triggerStep?.config && Object.values(triggerStep.config).some((v) => v !== "" && v != null)) {
    conditions.trigger = { ...triggerStep.config };
  }
  for (const step of rest) {
    const config = step.config || {};
    if (step.kind === "condition") {
      if (step.type === ATTRIBUTE_CONDITION) {
        (conditions.attributes ??= []).push({ ...config });
        continue;
      }
      const mapping = CONDITION_KEYS[step.type];
      const value = mapping ? config[mapping[1]] : null;
      if (mapping && value !== "" && value != null) (conditions[mapping[0]] ??= []).push(value);
    } else if (step.kind === "action") {
      actions.push({ action: step.type, ...config });
    }
  }
  return { trigger: triggerStep?.type ?? null, conditions, actions };
}

// Rows saved before the builder existed (seeded rules) have no steps — rebuild them from trigger/conditions/actions.
function stepsFromRules(row) {
  const conditions = row.conditions && typeof row.conditions === "object" ? row.conditions : {};
  const steps = [
    { id: stepId(), kind: "trigger", type: row.trigger || "created", config: { ...(conditions.trigger || {}) } },
  ];
  for (const [type, [key, field]] of Object.entries(CONDITION_KEYS)) {
    for (const value of [].concat(conditions[key] ?? [])) {
      steps.push({ id: stepId(), kind: "condition", type, config: { [field]: value } });
    }
  }
  for (const attr of [].concat(conditions.attributes ?? [])) {
    steps.push({ id: stepId(), kind: "condition", type: ATTRIBUTE_CONDITION, config: { ...attr } });
  }
  for (const entry of Array.isArray(row.actions) ? row.actions : []) {
    const { action, ...config } = entry || {};
    if (!action) continue;
    if (action === "assign" && !config.strategy) config.strategy = config.to ? "direct" : "round_robin";
    steps.push({ id: stepId(), kind: "action", type: action, config });
  }
  return steps.map((s, i) => ({ ...s, position: { x: 0, y: i * 150 } }));
}

// ---- normalize (snake -> camel) ---------------------------------------------

export function normalizeWorkflow(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const steps = Array.isArray(row.steps) && row.steps.length ? row.steps : stepsFromRules(row);
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
