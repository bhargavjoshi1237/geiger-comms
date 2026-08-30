// ===========================================================================
// Geiger Comms — tickets data layer (owns comms.tickets + comms.ticket_links).
// type: customer | back_office | tracker — the filter that makes Back-office
// and Tracker tickets views rather than screens. A tracker ticket spans many
// customer conversations via ticket_links. DB is snake_case; the UI is
// camelCase — map at this boundary. Pure data access: validate, console.error
// on failure, return null / [] / false. Never throw, never toast.
// ===========================================================================

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

const TABLE = "tickets";
const LINKS = "ticket_links";

export const TICKET_TYPES = ["customer", "back_office", "tracker"];
export const TICKET_STATES = ["submitted", "in_progress", "waiting", "resolved"];

// ---- normalize (snake -> camel) ---------------------------------------------

export function normalizeTicket(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const attrs =
    row.attributes && typeof row.attributes === "object" ? row.attributes : {};
  return {
    id: row.id,
    conversationId: row.conversation_id ?? null,
    type: row.type ?? "customer",
    state: row.state ?? "submitted",
    title: row.title ?? "",
    description: row.description ?? "",
    ...attrs,
    assigneeId: row.assignee_id ?? null,
    projectId: row.project_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
    ...meta,
  };
}

function toRow(input) {
  const row = {};
  const map = {
    conversationId: "conversation_id",
    type: "type",
    state: "state",
    title: "title",
    description: "description",
    assigneeId: "assignee_id",
    projectId: "project_id",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("attributes" in input && input.attributes && typeof input.attributes === "object") {
    row.attributes = { ...input.attributes };
  }
  return row;
}

// ---- CRUD --------------------------------------------------------------------

export async function listTickets({ projectId, type } = {}) {
  if (!isSupabaseConfigured()) return [];
  try {
    const sb = createClient();
    let query = sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false, nullsFirst: false });
    if (projectId) query = query.eq("project_id", projectId);
    if (type && TICKET_TYPES.includes(type)) query = query.eq("type", type);
    const { data, error } = await query;
    if (error) {
      console.error("[tickets.list]", error.message);
      return [];
    }
    return (data || []).map(normalizeTicket);
  } catch (e) {
    console.error("[tickets.list]", e);
    return [];
  }
}

export async function getTicket(id) {
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
      console.error("[tickets.get]", error.message);
      return null;
    }
    return normalizeTicket(data);
  } catch (e) {
    console.error("[tickets.get]", e);
    return null;
  }
}

export async function createTicket(input) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = toRow(input);
    payload.attributes = { ...(input.attributes ?? {}) };
    if (input.id) payload.id = input.id; // honor optimistic UUID
    const { data, error } = await sb
      .from(TABLE)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("[tickets.create]", error.message);
      return null;
    }
    return normalizeTicket(data);
  } catch (e) {
    console.error("[tickets.create]", e);
    return null;
  }
}

export async function updateTicket(id, patch) {
  if (!id || !patch || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = toRow(patch);
    if ("attributes" in payload && payload.attributes) {
      payload.attributes = { ...payload.attributes };
    }
    const { data, error } = await sb
      .from(TABLE)
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      console.error("[tickets.update]", error.message);
      return null;
    }
    return normalizeTicket(data);
  } catch (e) {
    console.error("[tickets.update]", e);
    return null;
  }
}

export async function softDeleteTicket(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[tickets.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[tickets.delete]", e);
    return false;
  }
}

// ---- tracker links ------------------------------------------------------------

export async function listLinkedConversationIds(ticketId) {
  if (!ticketId || !isSupabaseConfigured()) return [];
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(LINKS)
      .select("conversation_id")
      .eq("ticket_id", ticketId);
    if (error) {
      console.error("[tickets.listLinks]", error.message);
      return [];
    }
    return (data || []).map((r) => r.conversation_id);
  } catch (e) {
    console.error("[tickets.listLinks]", e);
    return [];
  }
}

export async function linkTicket(ticketId, conversationIds) {
  if (!ticketId || !isSupabaseConfigured()) return false;
  const ids = (Array.isArray(conversationIds) ? conversationIds : [conversationIds]).filter(Boolean);
  if (ids.length === 0) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(LINKS)
      .upsert(
        ids.map((conversationId) => ({ ticket_id: ticketId, conversation_id: conversationId })),
        { onConflict: "ticket_id,conversation_id" },
      );
    if (error) {
      console.error("[tickets.link]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[tickets.link]", e);
    return false;
  }
}
