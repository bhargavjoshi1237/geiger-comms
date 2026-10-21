// Business hours data layer (owns comms.business_hours): schedule { mon: { open, close, closed }, … } as comms.sla_due_at reads it, holidays [{ date, name }].
// Legacy ["09:00", "17:00"] day arrays read as that object shape and save in it; snake ↔ camel here, returns null / [] / false, never throws or toasts.

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

const TABLE = "business_hours";

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const TRUTHY = ["true", "t", "yes", "on", "1"];
const TIME = /^\d{1,2}:\d{2}$/;

export function defaultSchedule() {
  return Object.fromEntries(
    WEEKDAYS.map((day) => [day, { open: "09:00", close: "17:00", closed: day === "sat" || day === "sun" }]),
  );
}

function normalizeDay(raw) {
  if (Array.isArray(raw) && TIME.test(raw[0] ?? "") && TIME.test(raw[1] ?? "")) {
    return { open: raw[0], close: raw[1], closed: false };
  }
  if (raw && typeof raw === "object") {
    return {
      open: TIME.test(raw.open ?? "") ? raw.open : "09:00",
      close: TIME.test(raw.close ?? "") ? raw.close : "17:00",
      closed: TRUTHY.includes(String(raw.closed ?? "false").toLowerCase()),
    };
  }
  return { open: "09:00", close: "17:00", closed: true };
}

function normalizeSchedule(raw) {
  const s = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return Object.fromEntries(WEEKDAYS.map((day) => [day, normalizeDay(s[day])]));
}

function normalizeHolidays(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((h) => (typeof h === "string" ? { date: h, name: "" } : h))
    .filter((h) => h && /^\d{4}-\d{2}-\d{2}/.test(h.date ?? ""))
    .map((h) => ({ date: h.date.slice(0, 10), name: String(h.name ?? "") }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---- normalize (snake -> camel) ---------------------------------------------

export function normalizeBusinessHours(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "",
    timezone: row.timezone ?? "UTC",
    schedule: normalizeSchedule(row.schedule),
    holidays: normalizeHolidays(row.holidays),
    teamId: row.team_id ?? null,
    enabled: row.enabled ?? true,
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
    timezone: "timezone",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("schedule" in input) row.schedule = normalizeSchedule(input.schedule);
  if ("holidays" in input) row.holidays = normalizeHolidays(input.holidays);
  if ("teamId" in input) row.team_id = input.teamId || null;
  if ("enabled" in input) row.enabled = Boolean(input.enabled);
  return row;
}

// ---- CRUD --------------------------------------------------------------------

// [] when unconfigured, null on a read failure.
export async function listBusinessHours({ projectId } = {}) {
  if (!isSupabaseConfigured()) return [];
  try {
    const sb = createClient();
    let query = sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[business_hours.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeBusinessHours);
  } catch (e) {
    console.error("[business_hours.list]", e);
    return null;
  }
}

export async function createBusinessHours(input) {
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
      console.error("[business_hours.create]", error.message);
      return null;
    }
    return normalizeBusinessHours(data);
  } catch (e) {
    console.error("[business_hours.create]", e);
    return null;
  }
}

export async function updateBusinessHours(id, patch) {
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
      console.error("[business_hours.update]", error.message);
      return null;
    }
    return normalizeBusinessHours(data);
  } catch (e) {
    console.error("[business_hours.update]", e);
    return null;
  }
}

export async function softDeleteBusinessHours(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[business_hours.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[business_hours.delete]", e);
    return false;
  }
}
