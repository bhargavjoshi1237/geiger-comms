// ===========================================================================
// Geiger Comms — conversations data layer (owns comms.conversations +
// comms.messages + comms.conversation_reads). DB is snake_case; the UI is
// camelCase — map at this boundary. Pure data access: validate, console.error
// on failure, return null / [] / false. Never throw, never toast (the screen
// owns UX).
//
// The filtered list path goes through comms.list_conversations() (inbox spec
// §3.4): per-agent unread cannot be expressed cleanly in PostgREST. The plain
// select path below stays for the Overview screen, which passes no filter.
// ===========================================================================

import { createClient } from "./client";

const CONVERSATIONS = "conversations";
const MESSAGES = "messages";
const READS = "conversation_reads";
const TEAMMATES = "teammates";

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

// ---- normalize (snake -> camel) --------------------------------------------

export function normalizeConversation(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  // Joined contact/assignee (list_conversations / getConversation) win over
  // the deprecated denormalised text columns, which remain the fallback.
  const joinedContact =
    row.contact && typeof row.contact === "object" ? row.contact : null;
  const joinedAssignee =
    row.assignee && typeof row.assignee === "object" ? row.assignee : null;
  return {
    id: row.id,
    subject: row.subject ?? "",
    contactId: row.contact_id ?? joinedContact?.id ?? null,
    // Legacy columns keep their names for Overview; the joined row overrides.
    contactName: joinedContact?.name ?? row.contact_name ?? "Unknown",
    contactEmail: joinedContact?.email ?? row.contact_email ?? "",
    contactAvatar: joinedContact?.avatar_url ?? row.contact_avatar ?? "",
    channel: row.channel ?? "Chat",
    channelId: row.channel_id ?? null,
    status: row.status ?? "Open",
    priority: row.priority ?? "Normal",
    assigneeId: row.assignee_id ?? joinedAssignee?.id ?? null,
    assignee:
      joinedAssignee?.name ??
      (typeof row.assignee === "string" ? row.assignee : "") ??
      "",
    preview: row.preview ?? "",
    unread: Boolean(row.unread),
    waitingOnUs: Boolean(row.waiting_on_us),
    snoozedUntil: row.snoozed_until ?? null,
    closedAt: row.closed_at ?? null,
    firstResponseAt: row.first_response_at ?? null,
    lastMessageAt: row.last_message_at ?? row.created_at ?? null,
    projectId: row.project_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    ...meta,
  };
}

export function normalizeMessage(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    conversationId: row.conversation_id,
    authorRole: row.author_role ?? "customer", // customer | agent | ai_agent
    authorName: row.author_name ?? "",
    authorId: row.author_id ?? null,
    messageType: row.message_type ?? "comment", // comment | note
    body: row.body ?? "",
    attachments: Array.isArray(row.attachments)
      ? row.attachments
      : Array.isArray(meta.attachments)
        ? meta.attachments
        : [],
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
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
    channelId: "channel_id",
    status: "status",
    priority: "priority",
    assigneeId: "assignee_id",
    contactId: "contact_id",
    preview: "preview",
    projectId: "project_id",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("channel" in input) row.channel = input.channel;
  if ("assignee" in input) row.assignee = input.assignee;
  if ("unread" in input) row.unread = Boolean(input.unread);
  if ("waitingOnUs" in input) row.waiting_on_us = Boolean(input.waitingOnUs);
  if ("lastMessageAt" in input)
    row.last_message_at = input.lastMessageAt || null;
  if ("snoozedUntil" in input)
    row.snoozed_until = input.snoozedUntil || null;
  if ("closedAt" in input) row.closed_at = input.closedAt || null;
  if ("firstResponseAt" in input)
    row.first_response_at = input.firstResponseAt || null;
  return row;
}

function toMessageRow(input) {
  const row = {};
  if ("messageType" in input) row.message_type = input.messageType;
  if ("authorId" in input) row.author_id = input.authorId;
  if ("deletedAt" in input) row.deleted_at = input.deletedAt || null;
  return row;
}

// ---- conversations CRUD ----------------------------------------------------

// Without a §3.3 filter this takes the plain-select path (the Overview screen);
// with one it calls the comms.list_conversations RPC — the only place the
// per-agent unread rule can be expressed. Keyset pagination via `before`
// (last_message_at of the last held row).
export async function listConversations({
  projectId,
  filter,
  limit = 50,
  before,
} = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    if (filter && Object.keys(filter).length > 0) {
      const { data, error } = await sb.rpc("list_conversations", {
        p_project: projectId ?? null,
        p_teammate: filter.teammateId ?? null,
        p_filter: filter,
        p_limit: limit,
        p_before: before ?? null,
      });
      if (error) {
        console.error("[comms.listConversations]", error.message);
        return null;
      }
      return (data || []).map(normalizeConversation);
    }
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
      .select(
        // The !fk hints are required: conversations↔teammates also connects
        // through conversation_reads, which would make the embed ambiguous.
        "*, contact:contacts(id,name,email,avatar_url), assignee:teammates!conversations_assignee_id_fkey(id,name,avatar_url)",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
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
  if (!id || !patch || !isSupabaseConfigured()) return null;
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

// ---- named mutations (every change goes through a named function so a
// ---- workflow engine can call the same seam later — spec §8)

// Accepts teammateId or a { id, name } teammate; the legacy free-text assignee
// column is kept in sync either way so Overview keeps reading correct rows.
// (teammates.js imports this file's guard, so the lookup stays local to avoid
// an import cycle.)
export async function assignConversation(id, teammate) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const teammateId =
      typeof teammate === "object" && teammate !== null
        ? teammate.id
        : teammate;
    let name =
      typeof teammate === "object" && teammate !== null
        ? teammate.name
        : null;
    if (teammateId && !name) {
      const sb = createClient();
      const { data } = await sb
        .from(TEAMMATES)
        .select("name")
        .eq("id", teammateId)
        .is("deleted_at", null)
        .maybeSingle();
      name = data?.name ?? null;
    }
    const patch = { assigneeId: teammateId ?? null };
    if (teammateId) {
      if (name) patch.assignee = name;
    } else {
      patch.assignee = "Unassigned";
    }
    return updateConversation(id, patch);
  } catch (e) {
    console.error("[comms.assignConversation]", e);
    return null;
  }
}

export async function snoozeConversation(id, untilISO) {
  if (!id || !untilISO || !isSupabaseConfigured()) return null;
  return updateConversation(id, {
    status: "Snoozed",
    snoozedUntil: untilISO,
  });
}

export async function closeConversation(id) {
  if (!id || !isSupabaseConfigured()) return null;
  return updateConversation(id, {
    status: "Closed",
    closedAt: new Date().toISOString(),
  });
}

export async function reopenConversation(id) {
  if (!id || !isSupabaseConfigured()) return null;
  return updateConversation(id, {
    status: "Open",
    closedAt: null,
    snoozedUntil: null,
  });
}

export async function setPriority(id, priority) {
  if (!id || !priority || !isSupabaseConfigured()) return null;
  return updateConversation(id, { priority });
}

// ---- per-agent read state ---------------------------------------------------

export async function markRead(conversationId, teammateId) {
  if (!conversationId || !teammateId || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb.from(READS).upsert(
      {
        conversation_id: conversationId,
        teammate_id: teammateId,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id,teammate_id" },
    );
    if (error) {
      console.error("[comms.markRead]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[comms.markRead]", e);
    return false;
  }
}

export async function markUnread(conversationId, teammateId) {
  if (!conversationId || !teammateId || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(READS)
      .delete()
      .eq("conversation_id", conversationId)
      .eq("teammate_id", teammateId);
    if (error) {
      console.error("[comms.markUnread]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[comms.markUnread]", e);
    return false;
  }
}

// ---- messages ---------------------------------------------------------------

export async function listThread(conversationId) {
  if (!conversationId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(MESSAGES)
      .select("*")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[comms.listThread]", error.message);
      return null;
    }
    return (data || []).map(normalizeMessage);
  } catch (e) {
    console.error("[comms.listThread]", e);
    return null;
  }
}

export async function createMessage(input) {
  if (!input?.conversationId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    // Every write goes through comms.post_message (widget spec §6, inbox spec
    // §3.2): the RPC updates the parent conversation atomically and broadcasts
    // a content-free envelope any open widget is listening on. p_id carries
    // the optimistic UUID so local state and the DB row share an id.
    const { data, error } = await sb.rpc("post_message", {
      p_conversation: input.conversationId,
      p_body: input.body ?? "",
      p_author_role: input.authorRole ?? "agent",
      p_author_name: input.authorName ?? "",
      p_message_type: input.messageType ?? "comment",
      p_author_id: input.authorId ?? null,
      p_attachments: input.attachments ?? [],
      p_id: input.id ?? null,
    });
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
