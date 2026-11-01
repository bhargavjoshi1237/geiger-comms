// Geiger Comms SLA policies data layer (owns comms.sla_policies; reads comms.conversations for live SLA usage and the inbox timer). Policies apply top to bottom by position.
// DB snake_case ↔ UI camelCase at this boundary; pure data access — console.error on failure, return null / [] / false, never throw or toast.

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

const TABLE = "sla_policies";
const CONVERSATIONS = "conversations";

const SLA_STATES = ["on_track", "approaching", "breached", "paused"];

// ---- normalize (snake -> camel) ---------------------------------------------

function toMinutes(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function toList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string" && value) return [value];
  return [];
}

// Engine reads scope.channels || scope.channel and scope.priorities || scope.priority; the UI only ever sees the plural keys.
function normalizeScope(raw) {
  const s = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const scope = {};
  const channels = toList(s.channels ?? s.channel);
  const priorities = toList(s.priorities ?? s.priority);
  if (channels.length) scope.channels = channels;
  if (priorities.length) scope.priorities = priorities;
  return scope;
}

export function normalizeSlaPolicy(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "",
    firstResponseMins: toMinutes(row.first_response_mins),
    nextResponseMins: toMinutes(row.next_response_mins),
    resolutionMins: toMinutes(row.resolution_mins),
    scope: normalizeScope(row.scope),
    businessHoursId: row.business_hours_id ?? null,
    enabled: row.enabled ?? true,
    position: Number(row.position ?? 0),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
    ...meta,
  };
}

function toRow(input) {
  const row = {};
  const map = {
    projectId: "project_id",
    name: "name",
    businessHoursId: "business_hours_id",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("firstResponseMins" in input) row.first_response_mins = toMinutes(input.firstResponseMins);
  if ("nextResponseMins" in input) row.next_response_mins = toMinutes(input.nextResponseMins);
  if ("resolutionMins" in input) row.resolution_mins = toMinutes(input.resolutionMins);
  if ("scope" in input) row.scope = normalizeScope(input.scope);
  if ("enabled" in input) row.enabled = Boolean(input.enabled);
  if ("position" in input) row.position = Number(input.position) || 0;
  return row;
}

// ---- CRUD --------------------------------------------------------------------

export async function listSlaPolicies({ projectId } = {}) {
  if (!isSupabaseConfigured()) return [];
  try {
    const sb = createClient();
    let query = sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[sla_policies.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeSlaPolicy);
  } catch (e) {
    console.error("[sla_policies.list]", e);
    return null;
  }
}

export async function createSlaPolicy(input) {
  if (!input || !isSupabaseConfigured()) return null;
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
      console.error("[sla_policies.create]", error.message);
      return null;
    }
    return normalizeSlaPolicy(data);
  } catch (e) {
    console.error("[sla_policies.create]", e);
    return null;
  }
}

export async function updateSlaPolicy(id, patch) {
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
      console.error("[sla_policies.update]", error.message);
      return null;
    }
    return normalizeSlaPolicy(data);
  } catch (e) {
    console.error("[sla_policies.update]", e);
    return null;
  }
}

export async function softDeleteSlaPolicy(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[sla_policies.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[sla_policies.delete]", e);
    return false;
  }
}

// Rewrites position = index for the given order; false if any write fails (the screen reconciles).
export async function reorderSlaPolicies(orderedIds) {
  const ids = (Array.isArray(orderedIds) ? orderedIds : []).filter(Boolean);
  if (!ids.length || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const results = await Promise.all(
      ids.map((id, index) => sb.from(TABLE).update({ position: index }).eq("id", id)),
    );
    const failed = results.find((r) => r.error);
    if (failed) {
      console.error("[sla_policies.reorder]", failed.error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[sla_policies.reorder]", e);
    return false;
  }
}

// One conversation's SLA clock (state, due times, policy) for the inbox timer; null when unconfigured, missing or on a read failure.
export async function getConversationSla(conversationId) {
  if (!conversationId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(CONVERSATIONS)
      .select("sla_state, first_response_at, first_response_due_at, resolution_due_at, policy:sla_policies(id, name)")
      .eq("id", conversationId)
      .maybeSingle();
    if (error) {
      console.error("[sla_policies.conversation]", error.message);
      return null;
    }
    if (!data) return null;
    return {
      state: data.sla_state ?? "none",
      policyId: data.policy?.id ?? null,
      policyName: data.policy?.name ?? "",
      firstResponseAt: data.first_response_at ?? null,
      firstResponseDueAt: data.first_response_due_at ?? null,
      resolutionDueAt: data.resolution_due_at ?? null,
    };
  } catch (e) {
    console.error("[sla_policies.conversation]", e);
    return null;
  }
}

// ---- live usage --------------------------------------------------------------

const emptyCounts = () => ({ on_track: 0, approaching: 0, breached: 0, paused: 0 });

// Open conversations with a policy applied, tallied by sla_state — overall and per policy. Null on a read failure.
export async function listSlaUsage({ projectId } = {}) {
  const empty = { totals: emptyCounts(), byPolicy: {} };
  if (!isSupabaseConfigured()) return empty;
  try {
    const sb = createClient();
    let query = sb
      .from(CONVERSATIONS)
      .select("sla_policy_id, sla_state")
      .is("deleted_at", null)
      .neq("status", "Closed")
      .not("sla_policy_id", "is", null);
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[sla_policies.usage]", error.message);
      return null;
    }
    const totals = emptyCounts();
    const byPolicy = {};
    for (const row of data || []) {
      const entry = (byPolicy[row.sla_policy_id] ??= { open: 0, ...emptyCounts() });
      entry.open += 1;
      if (SLA_STATES.includes(row.sla_state)) {
        entry[row.sla_state] += 1;
        totals[row.sla_state] += 1;
      }
    }
    return { totals, byPolicy };
  } catch (e) {
    console.error("[sla_policies.usage]", e);
    return null;
  }
}
