// Imports data layer: one comms.imports row per CSV run (summary in metadata), rejected rows in comms.import_errors; pure, never throws or toasts.

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

const TABLE = "imports";
const ERRORS = "import_errors";
const ERROR_BATCH = 500;

export function normalizeImport(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    source: row.source ?? "csv",
    status: row.status ?? "pending",
    total: row.total ?? 0,
    doneCount: row.done_count ?? 0,
    errorCount: row.error_count ?? 0,
    entity: meta.entity ?? "",
    fileName: meta.fileName ?? "",
    created: meta.created ?? 0,
    updated: meta.updated ?? 0,
    skipped: meta.skipped ?? 0,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
  };
}

function toRow(input) {
  const row = {};
  if ("projectId" in input) row.project_id = input.projectId ?? null;
  if ("status" in input) row.status = input.status;
  if ("total" in input) row.total = Number(input.total) || 0;
  if ("doneCount" in input) row.done_count = Number(input.doneCount) || 0;
  if ("errorCount" in input) row.error_count = Number(input.errorCount) || 0;
  if ("createdBy" in input) row.created_by = input.createdBy ?? null;
  const metaKeys = ["entity", "fileName", "created", "updated", "skipped"];
  if (metaKeys.some((k) => k in input)) {
    row.metadata = Object.fromEntries(
      metaKeys.filter((k) => k in input).map((k) => [k, input[k]]),
    );
  }
  return row;
}

export async function listImports({ projectId, entity, limit = 5 } = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let query = sb
      .from(TABLE)
      .select("*")
      .eq("source", "csv")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (projectId) query = query.eq("project_id", projectId);
    if (entity) query = query.eq("metadata->>entity", entity);
    const { data, error } = await query;
    if (error) {
      console.error("[imports.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeImport);
  } catch (e) {
    console.error("[imports.list]", e);
    return null;
  }
}

// Opens a run as "running"; finishImport replaces the metadata bag wholesale, so pass every summary key.
export async function createImport(input) {
  if (!input?.projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = { ...toRow(input), source: "csv", status: "running" };
    if (input.id) payload.id = input.id;
    const { data, error } = await sb
      .from(TABLE)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("[imports.create]", error.message);
      return null;
    }
    return normalizeImport(data);
  } catch (e) {
    console.error("[imports.create]", e);
    return null;
  }
}

export async function finishImport(id, patch) {
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
      console.error("[imports.finish]", error.message);
      return null;
    }
    return normalizeImport(data);
  } catch (e) {
    console.error("[imports.finish]", e);
    return null;
  }
}

// errors = [{ rowRef, message }]
export async function recordImportErrors(importId, errors) {
  if (!importId || !Array.isArray(errors) || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    for (let i = 0; i < errors.length; i += ERROR_BATCH) {
      const { error } = await sb.from(ERRORS).insert(
        errors.slice(i, i + ERROR_BATCH).map((e) => ({
          import_id: importId,
          row_ref: String(e.rowRef ?? ""),
          message: e.message || "",
        })),
      );
      if (error) {
        console.error("[imports.errors]", error.message);
        return false;
      }
    }
    return true;
  } catch (e) {
    console.error("[imports.errors]", e);
    return false;
  }
}
