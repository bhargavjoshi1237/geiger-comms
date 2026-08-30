// ===========================================================================
// Geiger Comms — views data layer (owns comms.views). A view is a saved §3.3
// filter object (the same shape listConversations takes) plus display config.
// DB is snake_case; the UI is camelCase — map at this boundary. Pure data
// access: validate, console.error on failure, return null / [] / false. Never
// throw, never toast.
// ===========================================================================

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

// ---- CRUD --------------------------------------------------------------------

export async function listViews({ projectId } = {}) {
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
      console.error("[views.list]", error.message);
      return [];
    }
    return (data || []).map(normalizeView);
  } catch (e) {
    console.error("[views.list]", e);
    return [];
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
