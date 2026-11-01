// Channels data layer (owns comms.channels): one row per destination; snake_case DB ↔ camelCase UI; pure — returns null / [] / false, never throws or toasts.

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

const CHANNELS = "channels";
const CONVERSATIONS = "conversations";

export const CHANNEL_STATUSES = ["connected", "disconnected", "error"];

// Spec §1.1: Messenger runs end to end through the widget and Email sends teammate replies; the other kinds only store settings.
export const LIVE_CHANNEL_KINDS = ["messenger", "email"];

export function isSimulatedKind(kind) {
  return !LIVE_CHANNEL_KINDS.includes(kind);
}

// ---- normalize (snake -> camel) ---------------------------------------------

export function normalizeChannel(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const config =
    row.config && typeof row.config === "object" ? row.config : {};
  return {
    id: row.id,
    kind: row.kind ?? "email",
    name: row.name ?? "",
    status: row.status ?? "disconnected",
    projectId: row.project_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
    ...meta,
    ...config, // config keys (address, simulated…) read as first-class fields; spread last so a column never shadows them
  };
}

// ---- toRow (camel -> snake, only present keys) -------------------------------

function toRow(input) {
  const row = {};
  const map = {
    kind: "kind",
    name: "name",
    status: "status",
    config: "config",
    projectId: "project_id",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("name" in input) row.name = (input.name || "").trim();
  return row;
}

// ---- channels CRUD -----------------------------------------------------------

export async function listChannels({ projectId } = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let query = sb
      .from(CHANNELS)
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[channels.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeChannel);
  } catch (e) {
    console.error("[channels.list]", e);
    return null;
  }
}

export async function listChannelsByKind({ projectId, kind } = {}) {
  if (!kind || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let query = sb
      .from(CHANNELS)
      .select("*")
      .is("deleted_at", null)
      .eq("kind", kind)
      .order("created_at", { ascending: true });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[channels.listByKind]", error.message);
      return null;
    }
    return (data || []).map(normalizeChannel);
  } catch (e) {
    console.error("[channels.listByKind]", e);
    return null;
  }
}

export async function getChannel(id) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(CHANNELS)
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error) {
      console.error("[channels.get]", error.message);
      return null;
    }
    return normalizeChannel(data);
  } catch (e) {
    console.error("[channels.get]", e);
    return null;
  }
}

export async function createChannel(input) {
  if (!input?.kind || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = toRow(input);
    // Copied so caller state is never shared; the §1.1 flag is set here, never by the caller.
    payload.config = { ...(input.config ?? {}), simulated: isSimulatedKind(input.kind) };
    if (input.id) payload.id = input.id; // honor optimistic UUID
    const { data, error } = await sb
      .from(CHANNELS)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("[channels.create]", error.message);
      return null;
    }
    return normalizeChannel(data);
  } catch (e) {
    console.error("[channels.create]", e);
    return null;
  }
}

export async function updateChannel(id, patch) {
  if (!id || !patch || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = toRow(patch);
    // Config shallow-merges over the stored bag so keys the form doesn't own (quickActions…) survive.
    if ("config" in payload) {
      const { data: current, error: readError } = await sb
        .from(CHANNELS)
        .select("kind, config")
        .eq("id", id)
        .maybeSingle();
      if (readError || !current) {
        console.error("[channels.update]", readError?.message ?? "channel not found");
        return null;
      }
      const stored =
        current.config && typeof current.config === "object" ? current.config : {};
      payload.config = {
        ...stored,
        ...(payload.config || {}),
        simulated: isSimulatedKind(payload.kind ?? current.kind),
      };
    }
    const { data, error } = await sb
      .from(CHANNELS)
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      console.error("[channels.update]", error.message);
      return null;
    }
    return normalizeChannel(data);
  } catch (e) {
    console.error("[channels.update]", e);
    return null;
  }
}

export async function setChannelStatus(id, status) {
  if (!id || !CHANNEL_STATUSES.includes(status)) return null;
  return updateChannel(id, { status });
}

export async function softDeleteChannel(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(CHANNELS)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[channels.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[channels.delete]", e);
    return false;
  }
}

// { [channelId]: n } for the connection list; conversations without a channel are omitted.
export async function countConversationsByChannel({ projectId } = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let query = sb
      .from(CONVERSATIONS)
      .select("channel_id")
      .is("deleted_at", null)
      .not("channel_id", "is", null);
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[channels.countConversations]", error.message);
      return null;
    }
    const counts = {};
    for (const row of data || []) {
      counts[row.channel_id] = (counts[row.channel_id] || 0) + 1;
    }
    return counts;
  } catch (e) {
    console.error("[channels.countConversations]", e);
    return null;
  }
}
