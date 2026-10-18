// Geiger Comms routing rules data layer (owns comms.routing_rules); ordered by position, read top to bottom by comms.assign_next — strategy round_robin | load | direct, match { channel?, priority?, tags? }.
// DB snake_case ↔ UI camelCase at this boundary; pure data access — console.error on failure, return null / [] / false, never throw or toast.

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

const TABLE = "routing_rules";

export const ROUTING_STRATEGIES = ["round_robin", "load", "direct"];

// Keep only non-empty string arrays for the keys the matcher understands.
function cleanMatch(match) {
  const m = match && typeof match === "object" && !Array.isArray(match) ? match : {};
  const out = {};
  for (const key of ["channel", "priority", "tags"]) {
    const list = Array.isArray(m[key]) ? m[key].filter((v) => typeof v === "string" && v) : [];
    if (list.length) out[key] = list;
  }
  return out;
}

// ---- normalize (snake -> camel) ---------------------------------------------

export function normalizeRoutingRule(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "",
    match: cleanMatch(row.match),
    strategy: ROUTING_STRATEGIES.includes(row.strategy) ? row.strategy : "round_robin",
    teamId: row.team_id ?? null,
    fallbackAssigneeId: row.fallback_assignee ?? null,
    position: Number(row.position ?? 0),
    enabled: row.enabled ?? true,
    lastAssigneeId: row.last_assignee_id ?? null,
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
    strategy: "strategy",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("match" in input) row.match = cleanMatch(input.match);
  if ("teamId" in input) row.team_id = input.teamId || null;
  if ("fallbackAssigneeId" in input) row.fallback_assignee = input.fallbackAssigneeId || null;
  if ("position" in input) row.position = Number(input.position) || 0;
  if ("enabled" in input) row.enabled = Boolean(input.enabled);
  return row;
}

// ---- CRUD --------------------------------------------------------------------

// [] when unconfigured, null on a read failure.
export async function listRoutingRules({ projectId } = {}) {
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
      console.error("[routing_rules.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeRoutingRule);
  } catch (e) {
    console.error("[routing_rules.list]", e);
    return null;
  }
}

export async function createRoutingRule(input) {
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
      console.error("[routing_rules.create]", error.message);
      return null;
    }
    return normalizeRoutingRule(data);
  } catch (e) {
    console.error("[routing_rules.create]", e);
    return null;
  }
}

export async function updateRoutingRule(id, patch) {
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
      console.error("[routing_rules.update]", error.message);
      return null;
    }
    return normalizeRoutingRule(data);
  } catch (e) {
    console.error("[routing_rules.update]", e);
    return null;
  }
}

export async function softDeleteRoutingRule(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[routing_rules.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[routing_rules.delete]", e);
    return false;
  }
}

// Writes position = index for each id in order; false if any write fails.
export async function reorderRoutingRules(orderedIds) {
  const ids = (Array.isArray(orderedIds) ? orderedIds : []).filter(Boolean);
  if (ids.length === 0 || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const results = await Promise.all(
      ids.map((id, index) =>
        sb.from(TABLE).update({ position: index }).eq("id", id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed) {
      console.error("[routing_rules.reorder]", failed.error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[routing_rules.reorder]", e);
    return false;
  }
}
