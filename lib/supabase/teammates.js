// ===========================================================================
// Geiger Comms — teammates data layer (owns comms.teammates). One row per
// person in a workspace, keyed by (user_id, project_id); getCurrentTeammate is
// the backbone of Your Inbox and Mentions. DB is snake_case; the UI is
// camelCase — map at this boundary. Pure data access: validate, console.error
// on failure, return null / [] / false. Never throw, never toast.
// ===========================================================================

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";
import { getUser } from "./user";

const TABLE = "teammates";

export const AVAILABILITIES = ["available", "away", "offline"];

// ---- normalize (snake -> camel) ---------------------------------------------

export function normalizeTeammate(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    userId: row.user_id ?? null,
    name: row.name ?? "",
    email: row.email ?? "",
    avatarUrl: row.avatar_url ?? "",
    availability: row.availability ?? "available",
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
    email: "email",
    avatarUrl: "avatar_url",
    availability: "availability",
    projectId: "project_id",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("userId" in input) row.user_id = input.userId;
  return row;
}

// ---- CRUD --------------------------------------------------------------------

export async function listTeammates({ projectId } = {}) {
  if (!isSupabaseConfigured()) return [];
  try {
    const sb = createClient();
    let query = sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[teammates.list]", error.message);
      return [];
    }
    return (data || []).map(normalizeTeammate);
  } catch (e) {
    console.error("[teammates.list]", e);
    return [];
  }
}

export async function getTeammate(id) {
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
      console.error("[teammates.get]", error.message);
      return null;
    }
    return normalizeTeammate(data);
  } catch (e) {
    console.error("[teammates.get]", e);
    return null;
  }
}

export async function createTeammate(input) {
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
      console.error("[teammates.create]", error.message);
      return null;
    }
    return normalizeTeammate(data);
  } catch (e) {
    console.error("[teammates.create]", e);
    return null;
  }
}

export async function updateTeammate(id, patch) {
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
      console.error("[teammates.update]", error.message);
      return null;
    }
    return normalizeTeammate(data);
  } catch (e) {
    console.error("[teammates.update]", e);
    return null;
  }
}

export async function softDeleteTeammate(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[teammates.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[teammates.delete]", e);
    return false;
  }
}

export async function setAvailability(id, availability) {
  if (!id || !AVAILABILITIES.includes(availability)) return null;
  return updateTeammate(id, { availability });
}

// The signed-in user's teammate row for this project; created on first touch.
// Returns null when signed out or Supabase is unconfigured — every screen must
// handle that (inbox spec §5.6).
export async function getCurrentTeammate({ projectId } = {}) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const user = await getUser();
    if (!user?.id) return null;

    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error && error.code !== "PGRST116") {
      // PGRST116 = zero rows; anything else is a real read failure.
      console.error("[teammates.getCurrent]", error.message);
      return null;
    }
    if (data) return normalizeTeammate(data);

    // First visit to this project as a signed-in user — mint the row. A unique
    // index backs (user_id, project_id), so a double-tap stays single-row.
    return createTeammate({
      userId: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatar ?? "",
      projectId,
      createdBy: user.id,
    });
  } catch (e) {
    console.error("[teammates.getCurrent]", e);
    return null;
  }
}
