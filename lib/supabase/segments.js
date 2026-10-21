// Segments data layer: owns comms.segments; membership is evaluated in SQL (segment_counts / segment_contacts RPCs take raw rules); pure, never throws or toasts.

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";
import { normalizeContact } from "./customers";

const TABLE = "segments";

// ---- normalize (snake -> camel) --------------------------------------------

export function normalizeSegment(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "",
    description: row.description ?? "",
    rules: Array.isArray(row.rules) ? row.rules : [],
    builtIn: false,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
  };
}

function toRow(input) {
  const row = {};
  if ("name" in input) row.name = (input.name || "").trim();
  if ("description" in input) row.description = (input.description || "").trim();
  if ("rules" in input) row.rules = Array.isArray(input.rules) ? input.rules : [];
  if ("projectId" in input) row.project_id = input.projectId ?? null;
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  return row;
}

// ---- CRUD -------------------------------------------------------------------

export async function listSegments({ projectId } = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let query = sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[segments.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeSegment);
  } catch (e) {
    console.error("[segments.list]", e);
    return null;
  }
}

export async function createSegment(input) {
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
      console.error("[segments.create]", error.message);
      return null;
    }
    return normalizeSegment(data);
  } catch (e) {
    console.error("[segments.create]", e);
    return null;
  }
}

export async function updateSegment(id, patch) {
  if (!id || !patch || !isSupabaseConfigured()) return null;
  if ("name" in patch && !patch.name?.trim()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .update(toRow(patch))
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      console.error("[segments.update]", error.message);
      return null;
    }
    return normalizeSegment(data);
  } catch (e) {
    console.error("[segments.update]", e);
    return null;
  }
}

export async function softDeleteSegment(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[segments.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[segments.delete]", e);
    return false;
  }
}

// ---- evaluation (RPCs) --------------------------------------------------------

// Match counts for many rule sets ({ key: rules } -> { key: n }); with contactId each is that person's 1/0 membership.
export async function countSegments({ projectId, sets, contactId = null }) {
  if (!projectId || !sets || !isSupabaseConfigured()) return null;
  if (Object.keys(sets).length === 0) return {};
  try {
    const sb = createClient();
    const { data, error } = await sb.rpc("segment_counts", {
      p_project: projectId,
      p_sets: sets,
      p_contact: contactId,
    });
    if (error) {
      console.error("[segments.count]", error.message);
      return null;
    }
    return Object.fromEntries((data || []).map((r) => [r.key, Number(r.matched) || 0]));
  } catch (e) {
    console.error("[segments.count]", e);
    return null;
  }
}

// A page of the people matching rules, newest first.
export async function listSegmentContacts({ projectId, rules, limit = 50, offset = 0 }) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb.rpc("segment_contacts", {
      p_project: projectId,
      p_rules: Array.isArray(rules) ? rules : [],
      p_limit: limit,
      p_offset: offset,
    });
    if (error) {
      console.error("[segments.contacts]", error.message);
      return null;
    }
    return (data || []).map(normalizeContact);
  } catch (e) {
    console.error("[segments.contacts]", e);
    return null;
  }
}
