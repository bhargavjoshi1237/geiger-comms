// Data access for comms.widget_apps — the installable Messenger widgets
// (messenger-widget spec §3). Same contract as the other layers: guard with
// isSupabaseConfigured(), console.error on failure, return null/[]/false,
// never throw, never toast. The signing secret itself never lives here: the
// workspace stores only secret_last4 for display; hashing/creation happens in
// the server route that mints the app.

import { isSupabaseConfigured } from "./comms";
import { createClient } from "./client";

const TABLE = "widget_apps";

export function normalizeWidgetApp(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id ?? null,
    publicId: row.public_id ?? "",
    name: row.name || "Website",
    secretLast4: row.secret_last4 || "",
    allowedOrigins: Array.isArray(row.allowed_origins) ? row.allowed_origins : [],
    channelId: row.channel_id ?? null,
    projectId: row.project_id ?? null,
    lastBootAt: meta.last_boot_at ?? null,
    hasBooted: Boolean(meta.last_boot_at),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    ...meta,
  };
}

function toRow(input) {
  const row = {};
  const map = { name: "name", allowedOrigins: "allowed_origins", channelId: "channel_id" };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key];
  return row;
}

export async function listWidgetApps({ channelId }) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let query = sb.from(TABLE).select("*").is("deleted_at", null).order("created_at", { ascending: false });
    if (channelId) query = query.eq("channel_id", channelId);
    const { data, error } = await query;
    if (error) {
      console.error("[widget_apps.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeWidgetApp);
  } catch (e) {
    console.error("[widget_apps.list]", e);
    return null;
  }
}

// Creates the app row. The caller passes an already-generated public_id and
// secret_hash; the plaintext secret is shown once by the screen and never
// stored.
export async function createWidgetApp(input) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = {
      ...(input.id ? { id: input.id } : {}),
      public_id: input.publicId,
      name: input.name || "Website",
      secret_hash: input.secretHash,
      secret_last4: input.secretLast4 || "",
      allowed_origins: input.allowedOrigins || [],
      channel_id: input.channelId ?? null,
      project_id: input.projectId ?? null,
      created_by: input.createdBy ?? null,
    };
    const { data, error } = await sb.from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[widget_apps.create]", error.message);
      return null;
    }
    return normalizeWidgetApp(data);
  } catch (e) {
    console.error("[widget_apps.create]", e);
    return null;
  }
}

export async function updateWidgetApp(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .update(toRow(patch))
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      console.error("[widget_apps.update]", error.message);
      return null;
    }
    return normalizeWidgetApp(data);
  } catch (e) {
    console.error("[widget_apps.update]", e);
    return null;
  }
}

export async function softDeleteWidgetApp(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb.from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[widget_apps.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[widget_apps.delete]", e);
    return false;
  }
}
