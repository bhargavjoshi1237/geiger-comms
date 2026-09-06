// ===========================================================================
// Geiger Comms — customers data layer (owns comms.contacts).
// People is the hub of the Customers area: the contact record behind every
// conversation. Companies are derived from the contact's company field (there
// is no separate companies table); segments are saved filters over people.
// DB is snake_case; the UI is camelCase — map at this boundary. Pure data
// access: validate, console.error on failure, return null / [] / false. Never
// throw, never toast (the screen owns UX).
// ===========================================================================

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

const TABLE = "contacts";

// ---- normalize (snake -> camel) --------------------------------------------

export function normalizeContact(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    name: row.name ?? "Unknown",
    email: row.email ?? "",
    avatarUrl: row.avatar_url ?? "",
    company: row.company ?? "",
    projectId: row.project_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
    // Enrichment bag — phone, location, timezone, lifecycle, owner, tags,
    // notes, tasks and subscription live here until a dedicated column ships.
    phone: meta.phone ?? "",
    location: meta.location ?? "",
    timezone: meta.timezone ?? "",
    language: meta.language ?? "",
    title: meta.title ?? "",
    lifecycle: meta.lifecycle ?? "lead",
    owner: meta.owner ?? "",
    website: meta.website ?? "",
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    notes: Array.isArray(meta.notes) ? meta.notes : [],
    tasks: Array.isArray(meta.tasks) ? meta.tasks : [],
    subscribedEmail: meta.subscribedEmail ?? true,
    subscribedSms: meta.subscribedSms ?? false,
    custom: meta.custom && typeof meta.custom === "object" ? meta.custom : {},
    metadata: meta,
  };
}

function toRow(input) {
  const row = {};
  if ("name" in input) row.name = (input.name || "Unknown").trim() || "Unknown";
  if ("email" in input) row.email = (input.email || "").trim() || null;
  if ("avatarUrl" in input) row.avatar_url = input.avatarUrl || null;
  if ("company" in input) row.company = (input.company || "").trim() || null;
  if ("projectId" in input) row.project_id = input.projectId ?? null;
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  const metaKeys = [
    "phone",
    "location",
    "timezone",
    "language",
    "title",
    "lifecycle",
    "owner",
    "website",
    "tags",
    "notes",
    "tasks",
    "subscribedEmail",
    "subscribedSms",
    "custom",
  ];
  const hasMeta = metaKeys.some((k) => k in input);
  if (hasMeta) {
    const base =
      input.metadata && typeof input.metadata === "object"
        ? { ...input.metadata }
        : {};
    for (const k of metaKeys) {
      if (k in input) base[k] = input[k];
    }
    row.metadata = base;
  }
  return row;
}

// ---- CRUD -------------------------------------------------------------------

export async function listContacts({ projectId } = {}) {
  if (!isSupabaseConfigured()) return [];
  try {
    const sb = createClient();
    let query = sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[customers.list]", error.message);
      return [];
    }
    return (data || []).map(normalizeContact);
  } catch (e) {
    console.error("[customers.list]", e);
    return [];
  }
}

export async function getContact(id) {
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
      console.error("[customers.get]", error.message);
      return null;
    }
    return normalizeContact(data);
  } catch (e) {
    console.error("[customers.get]", e);
    return null;
  }
}

export async function createContact(input) {
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
      console.error("[customers.create]", error.message);
      return null;
    }
    return normalizeContact(data);
  } catch (e) {
    console.error("[customers.create]", e);
    return null;
  }
}

export async function updateContact(id, patch) {
  if (!id || !patch || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    // Merge metadata against the stored row so notes/tasks/tags edits never
    // clobber sibling keys another surface wrote.
    let payload = toRow(patch);
    if (payload.metadata) {
      const current = await getContact(id);
      payload = {
        ...payload,
        metadata: { ...(current?.metadata || {}), ...payload.metadata },
      };
    }
    const { data, error } = await sb
      .from(TABLE)
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      console.error("[customers.update]", error.message);
      return null;
    }
    return normalizeContact(data);
  } catch (e) {
    console.error("[customers.update]", e);
    return null;
  }
}

export async function softDeleteContact(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[customers.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[customers.delete]", e);
    return false;
  }
}
