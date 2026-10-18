// Geiger Comms views data layer (owns comms.views): a saved §3.3 filter plus display config, owned by a teammate and optionally shared.
// DB snake_case ↔ UI camelCase at this boundary; pure data access — console.error on failure, return null / [] / false, never throw or toast.

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

const TABLE = "views";

// ---- normalize (snake -> camel) ---------------------------------------------

export function normalizeView(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    name: row.name ?? "Untitled view",
    icon: row.icon ?? null,
    filter:
      row.filter && typeof row.filter === "object" ? row.filter : {},
    sort: row.sort ?? "newest",
    ownerId: row.owner_id ?? null,
    shared: Boolean(row.shared),
    position: Number(row.position ?? 0),
    projectId: row.project_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    ...meta,
  };
}

function toRow(input) {
  const row = {};
  const map = {
    name: "name",
    icon: "icon",
    filter: "filter",
    sort: "sort",
    ownerId: "owner_id",
    shared: "shared",
    position: "position",
    projectId: "project_id",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("name" in input) row.name = (input.name || "").trim() || "Untitled view";
  return row;
}

// ---- visibility --------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Shared views are everyone's; a private view is its owner's. Legacy ownerless rows fall back to their creator (or everyone when neither is known).
function visibilityClause({ teammateId, userId } = {}) {
  const clauses = ["shared.eq.true", "and(owner_id.is.null,created_by.is.null)"];
  if (UUID_RE.test(teammateId || "")) clauses.push(`owner_id.eq.${teammateId}`);
  if (UUID_RE.test(userId || "")) {
    clauses.push(`and(owner_id.is.null,created_by.eq.${userId})`);
  }
  return clauses.join(",");
}

// Client-side mirror of visibilityClause, for rows that arrive outside listViews.
export function isViewVisible(view, { teammateId, userId } = {}) {
  if (!view) return false;
  if (view.shared) return true;
  if (view.ownerId) return Boolean(teammateId) && view.ownerId === teammateId;
  return !view.createdBy || (Boolean(userId) && view.createdBy === userId);
}

// ---- CRUD --------------------------------------------------------------------

// Only the views this teammate may see (data-layer filter; RLS is the real gate). [] when unconfigured, null on a read failure.
export async function listViews({ projectId, teammateId, userId } = {}) {
  if (!isSupabaseConfigured()) return [];
  try {
    const sb = createClient();
    let query = sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .or(visibilityClause({ teammateId, userId }))
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[views.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeView);
  } catch (e) {
    console.error("[views.list]", e);
    return null;
  }
}

export async function getView(id) {
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
      console.error("[views.get]", error.message);
      return null;
    }
    return normalizeView(data);
  } catch (e) {
    console.error("[views.get]", e);
    return null;
  }
}

export async function createView(input) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = toRow(input);
    payload.filter = { ...(input.filter ?? {}) }; // never share one object with the caller's state
    if (input.id) payload.id = input.id; // honor optimistic UUID
    const { data, error } = await sb
      .from(TABLE)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("[views.create]", error.message);
      return null;
    }
    return normalizeView(data);
  } catch (e) {
    console.error("[views.create]", e);
    return null;
  }
}

export async function updateView(id, patch) {
  if (!id || !patch || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = toRow(patch);
    if ("filter" in payload && payload.filter) payload.filter = { ...payload.filter };
    const { data, error } = await sb
      .from(TABLE)
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      console.error("[views.update]", error.message);
      return null;
    }
    return normalizeView(data);
  } catch (e) {
    console.error("[views.update]", e);
    return null;
  }
}

export async function softDeleteView(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[views.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[views.delete]", e);
    return false;
  }
}
