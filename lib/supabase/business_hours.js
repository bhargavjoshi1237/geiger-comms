// Geiger Comms business hours — read-only lookup over comms.business_hours for pickers (SLA policies); editing belongs to Settings → Business Hours.
// DB snake_case ↔ UI camelCase at this boundary; pure data access — console.error on failure, return [], never throw or toast.

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

const TABLE = "business_hours";

export function normalizeBusinessHours(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name ?? "",
    timezone: row.timezone ?? "UTC",
    enabled: row.enabled ?? true,
  };
}

export async function listBusinessHours({ projectId } = {}) {
  if (!isSupabaseConfigured()) return [];
  try {
    const sb = createClient();
    let query = sb
      .from(TABLE)
      .select("id, name, timezone, enabled")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[business_hours.list]", error.message);
      return [];
    }
    return (data || []).map(normalizeBusinessHours);
  } catch (e) {
    console.error("[business_hours.list]", e);
    return [];
  }
}
