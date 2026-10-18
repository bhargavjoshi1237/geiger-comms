// Geiger Comms macros data layer (owns comms.macros); a macro is a saved reply (body with {{tokens}}) plus optional actions [{ action, ...config }], scoped personal | team.
// DB snake_case ↔ UI camelCase at this boundary; pure data access — console.error on failure, return null / [] / false, never throw or toast.

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

const TABLE = "macros";

export const MACRO_SCOPES = ["personal", "team"];

// ---- normalize (snake -> camel) ---------------------------------------------

export function normalizeMacro(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "",
    body: row.body ?? "",
    scope: MACRO_SCOPES.includes(row.scope) ? row.scope : "personal",
    actions: Array.isArray(row.actions) ? row.actions : [],
    usageCount: Number(row.usage_count ?? 0),
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
    body: "body",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("name" in input) row.name = (input.name || "").trim();
  if ("scope" in input) row.scope = MACRO_SCOPES.includes(input.scope) ? input.scope : "personal";
  if ("actions" in input) row.actions = Array.isArray(input.actions) ? input.actions : [];
  if ("usageCount" in input) row.usage_count = Number(input.usageCount) || 0;
  return row;
}

// ---- CRUD --------------------------------------------------------------------

// [] when unconfigured, null on a read failure.
export async function listMacros({ projectId } = {}) {
  if (!isSupabaseConfigured()) return [];
  try {
    const sb = createClient();
    let query = sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false, nullsFirst: false });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[macros.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeMacro);
  } catch (e) {
    console.error("[macros.list]", e);
    return null;
  }
}

export async function getMacro(id) {
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
      console.error("[macros.get]", error.message);
      return null;
    }
    return normalizeMacro(data);
  } catch (e) {
    console.error("[macros.get]", e);
    return null;
  }
}

export async function createMacro(input) {
  if (!input || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = toRow(input);
    if (!payload.name) {
      console.error("[macros.create]", "name is required");
      return null;
    }
    if (input.id) payload.id = input.id; // honor optimistic UUID
    const { data, error } = await sb
      .from(TABLE)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("[macros.create]", error.message);
      return null;
    }
    return normalizeMacro(data);
  } catch (e) {
    console.error("[macros.create]", e);
    return null;
  }
}

export async function updateMacro(id, patch) {
  if (!id || !patch || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = toRow(patch);
    if ("name" in payload && !payload.name) {
      console.error("[macros.update]", "name is required");
      return null;
    }
    const { data, error } = await sb
      .from(TABLE)
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      console.error("[macros.update]", error.message);
      return null;
    }
    return normalizeMacro(data);
  } catch (e) {
    console.error("[macros.update]", e);
    return null;
  }
}

export async function softDeleteMacro(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[macros.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[macros.delete]", e);
    return false;
  }
}
