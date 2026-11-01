// Companies data layer: owns comms.companies (rename/delete sync people in SQL via companies_sync_people; extras ride in metadata); pure, never throws or toasts.

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";
import { selectAll } from "./comms";

const TABLE = "companies";

const META_KEYS = [
  "website",
  "industry",
  "size",
  "plan",
  "monthlySpend",
  "owner",
  "custom",
];

// "https://www.Acme.com/pricing" -> "acme.com"; the dedupe key for import.
export function normalizeDomain(value) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .replace(/:\d+$/, "");
}

function toNumberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(String(value).replace(/[\s,$€£¥]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// ---- normalize (snake -> camel) --------------------------------------------

export function normalizeCompany(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "",
    domain: row.domain ?? "",
    externalId: row.external_id ?? "",
    website: meta.website ?? "",
    industry: meta.industry ?? "",
    size: meta.size ?? null,
    plan: meta.plan ?? "",
    monthlySpend: meta.monthlySpend ?? null,
    owner: meta.owner ?? "",
    custom: meta.custom && typeof meta.custom === "object" ? meta.custom : {},
    metadata: meta,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
  };
}

function toRow(input) {
  const row = {};
  if ("name" in input) row.name = (input.name || "").trim();
  if ("domain" in input) row.domain = normalizeDomain(input.domain) || null;
  if ("externalId" in input) row.external_id = (input.externalId || "").trim() || null;
  if ("projectId" in input) row.project_id = input.projectId ?? null;
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  if (META_KEYS.some((k) => k in input)) {
    const base =
      input.metadata && typeof input.metadata === "object"
        ? { ...input.metadata }
        : {};
    for (const k of META_KEYS) {
      if (!(k in input)) continue;
      if (k === "size" || k === "monthlySpend") base[k] = toNumberOrNull(input[k]);
      else if (k === "custom") base[k] = input[k] || {};
      else base[k] = String(input[k] ?? "").trim();
    }
    row.metadata = base;
  }
  return row;
}

// ---- CRUD -------------------------------------------------------------------

export async function listCompanies({ projectId } = {}) {
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
      console.error("[companies.list]", error.message);
      return null;
    }
    return data.map(normalizeCompany);
  } catch (e) {
    console.error("[companies.list]", e);
    return null;
  }
}

export async function createCompany(input) {
  if (!input?.name?.trim() || !isSupabaseConfigured()) return null;
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
      console.error("[companies.create]", error.message);
      return null;
    }
    return normalizeCompany(data);
  } catch (e) {
    console.error("[companies.create]", e);
    return null;
  }
}

export async function updateCompany(id, patch) {
  if (!id || !patch || !isSupabaseConfigured()) return null;
  if ("name" in patch && !patch.name?.trim()) return null;
  try {
    const sb = createClient();
    let payload = toRow(patch);
    // Merge metadata against the stored row so one field never clobbers another.
    if (payload.metadata) {
      const { data: current, error: readError } = await sb
        .from(TABLE)
        .select("metadata")
        .eq("id", id)
        .maybeSingle();
      if (readError) {
        console.error("[companies.update]", readError.message);
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
      console.error("[companies.update]", error.message);
      return null;
    }
    return normalizeCompany(data);
  } catch (e) {
    console.error("[companies.update]", e);
    return null;
  }
}

// Upserts a batch of complete companies (CSV import); every input needs the same keys or a missing one nulls its column.
export async function saveCompanies(inputs) {
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
      console.error("[companies.save]", error.message);
      return null;
    }
    return (data || []).map(normalizeCompany);
  } catch (e) {
    console.error("[companies.save]", e);
    return null;
  }
}

export async function softDeleteCompany(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[companies.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[companies.delete]", e);
    return false;
  }
}
