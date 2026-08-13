"use client";

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

// Data access for public.user_nav_prefs — the sidebar entries a user has hidden.
//
// This table is SUITE-WIDE, not a comms table: sidebar curation is a property of
// the user, not of the comms domain. It lives in the shared `public` schema
// (owned and migrated by geiger-dash) and is keyed by
// (product, surface, project_id, user_id), so every Geiger app reads and writes
// the same table without colliding on shared titles like "Overview".
//
// createClient() defaults to the `comms` schema, so every call here re-scopes to
// `public` explicitly.
//
// This layer only records the choice. Which titles may be hidden, and what
// depends on what, is declared in geiger-ui.config.js and enforced by
// @geiger/ui — never here.
//
// DB is snake_case, the UI is camelCase; map at this boundary. Pure: validate,
// console.error on failure, return null/false — never throw, never toast.

const TABLE = "user_nav_prefs";
const PRODUCT = "comms";
const SURFACE = "workspace";

function publicClient() {
  return createClient().schema("public");
}

export function normalizeNavPrefs(row) {
  if (!row) return null;
  return {
    id: row.id,
    product: row.product ?? PRODUCT,
    surface: row.surface ?? SURFACE,
    projectId: row.project_id ?? null,
    userId: row.user_id ?? null,
    hidden: Array.isArray(row.hidden)
      ? row.hidden.filter((t) => typeof t === "string")
      : [],
  };
}

// This user's row for the project. `null` means unconfigured, a failed read, or
// simply no row yet — the caller treats all three as "nothing hidden".
export async function getNavPrefs(projectId, userId = null) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let query = publicClient()
      .from(TABLE)
      .select("*")
      .eq("product", PRODUCT)
      .eq("surface", SURFACE)
      .eq("project_id", projectId)
      .is("deleted_at", null);
    query = userId ? query.eq("user_id", userId) : query.is("user_id", null);

    const { data, error } = await query.maybeSingle();
    if (error) {
      console.error("[nav_prefs.get]", error.message);
      return null;
    }
    return normalizeNavPrefs(data);
  } catch (e) {
    console.error("[nav_prefs.get]", e);
    return null;
  }
}

// Create-or-update this user's single live row. The whole hidden list is written
// at once — it is small, and a partial patch would need a read-modify-write
// round trip for no benefit. The unique index on
// (product, surface, project_id, user_id) where deleted_at is null is the
// upsert target.
export async function saveNavPrefs(projectId, userId, hidden) {
  if (!projectId || !isSupabaseConfigured()) return false;
  try {
    const { error } = await publicClient()
      .from(TABLE)
      .upsert(
        {
          product: PRODUCT,
          surface: SURFACE,
          project_id: projectId,
          user_id: userId || null,
          hidden: Array.isArray(hidden) ? hidden : [],
          created_by: userId || null,
        },
        { onConflict: "product,surface,project_id,user_id" },
      );
    if (error) {
      console.error("[nav_prefs.save]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[nav_prefs.save]", e);
    return false;
  }
}
