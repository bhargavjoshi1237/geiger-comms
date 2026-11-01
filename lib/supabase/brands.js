"use client";

// Brands data layer (owns comms.brands, read-only until the Brands screen ships). KB spec §8.
// Pure: returns null / [], never throws or toasts.

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

const TABLE = "brands";

export function normalizeBrand(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "",
    slug: row.slug ?? "",
    logoUrl: row.logo_url ?? "",
    color: row.color ?? "",
  };
}

export async function listBrands({ projectId } = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let query = sb
      .from(TABLE)
      .select("id, project_id, name, slug, logo_url, color")
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[brands.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeBrand);
  } catch (e) {
    console.error("[brands.list]", e);
    return null;
  }
}
