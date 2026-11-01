// Customers data layer: owns comms.contacts (company_id links ./companies, custom values in metadata.custom) and comms.custom_fields; pure, never throws or toasts.

import { createClient } from "./client";
import { isSupabaseConfigured, selectAll } from "./comms";

const TABLE = "contacts";
const FIELDS = "custom_fields";

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
    companyId: row.company_id ?? null,
    externalId: row.external_id ?? "",
    projectId: row.project_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
    // Enrichment bag: these live in metadata until a dedicated column ships.
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

const META_KEYS = [
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

function toRow(input) {
  const row = {};
  if ("name" in input) row.name = (input.name || "Unknown").trim() || "Unknown";
  if ("email" in input) row.email = (input.email || "").trim() || null;
  if ("avatarUrl" in input) row.avatar_url = input.avatarUrl || null;
  if ("company" in input) row.company = (input.company || "").trim() || null;
  if ("companyId" in input) row.company_id = input.companyId || null;
  if ("externalId" in input) row.external_id = (input.externalId || "").trim() || null;
  if ("projectId" in input) row.project_id = input.projectId ?? null;
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  if (META_KEYS.some((k) => k in input)) {
    const base =
      input.metadata && typeof input.metadata === "object"
        ? { ...input.metadata }
        : {};
    for (const k of META_KEYS) {
      if (k in input) base[k] = input[k];
    }
    row.metadata = base;
  }
  return row;
}

// ---- CRUD -------------------------------------------------------------------

export async function listContacts({ projectId } = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await selectAll(() => {
      let query = sb
        .from(TABLE)
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id");
      if (projectId) query = query.eq("project_id", projectId);
      return query;
    });
    if (error) {
      console.error("[customers.list]", error.message);
      return null;
    }
    return data.map(normalizeContact);
  } catch (e) {
    console.error("[customers.list]", e);
    return null;
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
    // Merge metadata onto the stored row; a failed read aborts rather than writing a bag with only the patched keys.
    let payload = toRow(patch);
    if (payload.metadata) {
      const { data: current, error: readError } = await sb
        .from(TABLE)
        .select("metadata")
        .eq("id", id)
        .maybeSingle();
      if (readError) {
        console.error("[customers.update]", readError.message);
        return null;
      }
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

// Upserts a batch of complete contacts (CSV import); every input needs the same keys or a missing one nulls its column.
export async function saveContacts(inputs) {
  if (!Array.isArray(inputs) || !isSupabaseConfigured()) return null;
  if (inputs.length === 0) return [];
  try {
    const sb = createClient();
    const payload = inputs.map((input) => ({ id: input.id, ...toRow(input) }));
    const { data, error } = await sb
      .from(TABLE)
      .upsert(payload, { onConflict: "id" })
      .select("*");
    if (error) {
      console.error("[customers.save]", error.message);
      return null;
    }
    return (data || []).map(normalizeContact);
  } catch (e) {
    console.error("[customers.save]", e);
    return null;
  }
}

// Point a set of people at one company (or none) in a single write.
export async function setContactsCompany(ids, company) {
  if (!Array.isArray(ids) || !ids.length || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ company_id: company?.id ?? null, company: company?.name || null })
      .in("id", ids);
    if (error) {
      console.error("[customers.setCompany]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[customers.setCompany]", e);
    return false;
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

// ---- custom attribute definitions (comms.custom_fields) ---------------------

export function normalizeAttribute(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    entity: row.entity,
    key: row.key,
    label: row.label || row.key,
    type: row.type ?? "text",
    options: Array.isArray(row.options) ? row.options.map(String) : [],
    required: Boolean(row.required),
    position: row.position ?? 0,
  };
}

// Definitions for "contact" and "company", ordered for display.
export async function listAttributes({ projectId } = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let query = sb
      .from(FIELDS)
      .select("*")
      .in("entity", ["contact", "company"])
      .is("deleted_at", null)
      .order("position")
      .order("created_at");
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[customers.attributes]", error.message);
      return null;
    }
    return (data || []).map(normalizeAttribute);
  } catch (e) {
    console.error("[customers.attributes]", e);
    return null;
  }
}

// Attribute keys are snake_case slugs of the label ("Plan tier" -> plan_tier).
export function attributeKey(label) {
  return (label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export async function createAttribute({ projectId, entity, label, type = "text", options = [], position = 0, createdBy = null }) {
  const key = attributeKey(label);
  if (!projectId || !key || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(FIELDS)
      .insert({
        project_id: projectId,
        entity,
        key,
        label: label.trim(),
        type,
        options: type === "select" ? options : [],
        position,
        created_by: createdBy,
      })
      .select("*")
      .single();
    if (error) {
      console.error("[customers.createAttribute]", error.message);
      return null;
    }
    return normalizeAttribute(data);
  } catch (e) {
    console.error("[customers.createAttribute]", e);
    return null;
  }
}
