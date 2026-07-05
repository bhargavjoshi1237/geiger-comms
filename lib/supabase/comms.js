// ===========================================================================
// Geiger Comms — conversations data layer (owns comms.conversations +
// comms.messages). DB is snake_case; the UI is camelCase — map at this
// boundary. Pure data access: validate, console.error on failure, return
// null / [] / false. Never throw, never toast (the screen owns UX).
// ===========================================================================

import { createClient } from "./client";

const CONVERSATIONS = "conversations";
const MESSAGES = "messages";

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

// ---- normalize (snake -> camel) -------------------------------------------

export function normalizeConversation(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    subject: row.subject ?? "",
    contactName: row.contact_name ?? "Unknown",
    contactEmail: row.contact_email ?? "",
    contactAvatar: row.contact_avatar ?? "",
    channel: row.channel ?? "Chat",
    status: row.status ?? "Open",
    priority: row.priority ?? "Normal",
    assignee: row.assignee ?? "",
    preview: row.preview ?? "",
    unread: Boolean(row.unread),
    waitingOnUs: Boolean(row.waiting_on_us),
    lastMessageAt: row.last_message_at ?? row.created_at ?? null,
    projectId: row.project_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    ...meta,
  };
}

export function normalizeMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    authorRole: row.author_role ?? "customer", // customer | agent
    authorName: row.author_name ?? "",
    body: row.body ?? "",
    createdAt: row.created_at ?? null,
  };
}

// ---- toRow (camel -> snake, only present keys) ----------------------------

function toConversationRow(input) {
  const row = {};
  const map = {
    subject: "subject",
    contactName: "contact_name",
    contactEmail: "contact_email",
    contactAvatar: "contact_avatar",
    channel: "channel",
    status: "status",
    priority: "priority",
    assignee: "assignee",
    preview: "preview",
    projectId: "project_id",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("unread" in input) row.unread = Boolean(input.unread);
  if ("waitingOnUs" in input) row.waiting_on_us = Boolean(input.waitingOnUs);
  if ("lastMessageAt" in input)
    row.last_message_at = input.lastMessageAt || null;
  return row;
}

// ---- conversations CRUD ----------------------------------------------------

export async function listConversations({ projectId } = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let query = sb
      .from(CONVERSATIONS)
      .select("*")
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[comms.listConversations]", error.message);
      return null;
    }
    return (data || []).map(normalizeConversation);
  } catch (e) {
    console.error("[comms.listConversations]", e);
    return null;
  }
}

export async function getConversation(id) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(CONVERSATIONS)
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error) {
      console.error("[comms.getConversation]", error.message);
      return null;
    }
    return normalizeConversation(data);
  } catch (e) {
    console.error("[comms.getConversation]", e);
    return null;
  }
}

export async function createConversation(input) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = toConversationRow(input);
    if (input.id) payload.id = input.id; // honor optimistic UUID
    const { data, error } = await sb
      .from(CONVERSATIONS)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("[comms.createConversation]", error.message);
      return null;
    }
    return normalizeConversation(data);
  } catch (e) {
    console.error("[comms.createConversation]", e);
    return null;
  }
}

export async function updateConversation(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(CONVERSATIONS)
      .update(toConversationRow(patch))
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      console.error("[comms.updateConversation]", error.message);
      return null;
    }
    return normalizeConversation(data);
  } catch (e) {
    console.error("[comms.updateConversation]", e);
    return null;
  }
}

export async function softDeleteConversation(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(CONVERSATIONS)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[comms.softDeleteConversation]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[comms.softDeleteConversation]", e);
    return false;
  }
}

// ---- messages --------------------------------------------------------------

export async function listMessages(conversationId) {
  if (!conversationId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(MESSAGES)
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[comms.listMessages]", error.message);
      return null;
    }
    return (data || []).map(normalizeMessage);
  } catch (e) {
    console.error("[comms.listMessages]", e);
    return null;
  }
}

export async function createMessage(input) {
  if (!input?.conversationId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = {
      conversation_id: input.conversationId,
      author_role: input.authorRole ?? "agent",
      author_name: input.authorName ?? "",
      body: input.body ?? "",
    };
    if (input.id) payload.id = input.id;
    const { data, error } = await sb
      .from(MESSAGES)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("[comms.createMessage]", error.message);
      return null;
    }
    return normalizeMessage(data);
  } catch (e) {
    console.error("[comms.createMessage]", e);
    return null;
  }
}
