// Conversations data layer (comms.conversations, messages, conversation_reads): snake↔camel here; pure — console.error, return null / [] / false, never throw or toast.
// Filtered lists go through comms.list_conversations() for per-agent unread (spec §3.4); the plain select path serves Overview.

import { createClient } from "./client";

const CONVERSATIONS = "conversations";
const MESSAGES = "messages";
const READS = "conversation_reads";
const TEAMMATES = "teammates";
const CONTACTS = "contacts";

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

const PAGE = 1000;

// Reads every row of a select a page at a time past PostgREST's max_rows; the builder needs a unique tiebreak order.
export async function selectAll(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return { data: rows, error: null };
  }
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
    mergedIntoId: row.merged_into_id ?? null,
    projectId: row.project_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    // Only a searching list_conversations read carries it, so a realtime merge never wipes a row's match.
    ...(row.search_match && typeof row.search_match === "object"
      ? { searchMatch: { body: row.search_match.body ?? "", type: row.search_match.type ?? "comment" } }
      : {}),
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
    // Outbound email delivery { channel, status, error, at }, written by the email sender; null for everything else.
    delivery: meta.delivery && typeof meta.delivery === "object" ? meta.delivery : null,
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

// Keyset cursor after the last held row (activity time, id, priority) so every sort pages without gaps or repeats.
export function conversationCursor(row) {
  if (!row?.id) return null;
  return {
    at: row.lastMessageAt ?? row.createdAt ?? null,
    id: row.id,
    priority: row.priority ?? "Normal",
  };
}

// No filter -> plain select (Overview); a §3.3 filter -> comms.list_conversations RPC (per-agent unread), paged by `cursor`.
export async function listConversations({
  projectId,
  filter,
  limit = 50,
  cursor,
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
        p_cursor: cursor ?? (before ? { at: before } : null),
      });
      if (error) {
        console.error("[comms.listConversations]", error.message);
        return null;
      }
      return (data || []).map(normalizeConversation);
    }
    // Unfiltered reads feed whole-workspace counts (Customers, Overview), so they page past the 1000-row cap.
    const { data, error } = await selectAll(() => {
      let query = sb
        .from(CONVERSATIONS)
        .select("*")
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("id");
      if (projectId) query = query.eq("project_id", projectId);
      return query;
    });
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

// Same filter semantics as listConversations (both read comms.filter_conversations); projectId (2nd arg or filter.projectId) scopes it.
export async function countConversations(filter, { projectId } = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const f = filter && typeof filter === "object" ? filter : {};
    const { data, error } = await sb.rpc("count_conversations", {
      p_teammate: f.teammateId ?? null,
      p_filter: f,
      p_project: projectId ?? f.projectId ?? null,
    });
    if (error) {
      console.error("[comms.countConversations]", error.message);
      return null;
    }
    const n = Number(data);
    return Number.isFinite(n) ? n : null;
  } catch (e) {
    console.error("[comms.countConversations]", e);
    return null;
  }
}

// With a teammateId, `unread` is resolved per agent (spec §3.4) instead of the legacy global flag.
export async function getConversation(id, { teammateId } = {}) {
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
    const conversation = normalizeConversation(data);
    if (!conversation || !teammateId) return conversation;
    const { data: read, error: readError } = await sb
      .from(READS)
      .select("last_read_at")
      .eq("conversation_id", id)
      .eq("teammate_id", teammateId)
      .maybeSingle();
    if (readError) {
      console.error("[comms.getConversation]", readError.message);
      return conversation;
    }
    const activity = Date.parse(conversation.lastMessageAt ?? "");
    const lastRead = Date.parse(read?.last_read_at ?? "");
    return {
      ...conversation,
      unread: !Number.isFinite(lastRead) || (Number.isFinite(activity) && lastRead < activity),
    };
  } catch (e) {
    console.error("[comms.getConversation]", e);
    return null;
  }
}

// Resolves the comms.contacts link for a new conversation: the project's contact with this email, else a new one (customers.js owns the full model).
export async function findOrCreateContact({ projectId, name, email, createdBy } = {}) {
  const cleanName = (name || "").trim() || "Unknown";
  const cleanEmail = (email || "").trim();
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    if (cleanEmail) {
      // ilike for a case-insensitive match; escape LIKE wildcards so "_" in an address stays literal.
      const pattern = cleanEmail.replace(/[\\%_]/g, (ch) => `\\${ch}`);
      let query = sb
        .from(CONTACTS)
        .select("id, name, email, avatar_url")
        .ilike("email", pattern)
        .is("deleted_at", null)
        .limit(1);
      if (projectId) query = query.eq("project_id", projectId);
      const { data: found, error: findError } = await query;
      if (findError) {
        console.error("[comms.findOrCreateContact]", findError.message);
        return null;
      }
      if (found?.[0]) return normalizeContactLink(found[0]);
    }
    const { data, error } = await sb
      .from(CONTACTS)
      .insert({
        name: cleanName,
        email: cleanEmail || null,
        project_id: projectId ?? null,
        created_by: createdBy ?? null,
      })
      .select("id, name, email, avatar_url")
      .single();
    if (error) {
      console.error("[comms.findOrCreateContact]", error.message);
      return null;
    }
    return normalizeContactLink(data);
  } catch (e) {
    console.error("[comms.findOrCreateContact]", e);
    return null;
  }
}

function normalizeContactLink(row) {
  return {
    id: row.id,
    name: row.name ?? "Unknown",
    email: row.email ?? "",
    avatarUrl: row.avatar_url ?? "",
  };
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

// Closes `sourceId`, links it to `targetId` and notes both threads (comms.merge_conversations); the closed source, or null.
export async function mergeConversation(sourceId, targetId) {
  if (!sourceId || !targetId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb.rpc("merge_conversations", {
      p_source: sourceId,
      p_target: targetId,
    });
    if (error) {
      console.error("[comms.mergeConversation]", error.message);
      return null;
    }
    return normalizeConversation(data);
  } catch (e) {
    console.error("[comms.mergeConversation]", e);
    return null;
  }
}

// ---- bulk -----------------------------------------------------------------------

// Ids per request: keeps the PostgREST `in` filter well inside URL limits.
const BULK_CHUNK = 100;

function chunk(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += BULK_CHUNK) out.push(ids.slice(i, i + BULK_CHUNK));
  return out;
}

// Every conversation id a §3.3 filter matches (comms.filter_conversations), paged past max_rows, for "select all matching".
export async function listConversationIds({ projectId, filter } = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const f = filter && typeof filter === "object" ? filter : {};
    const { data, error } = await selectAll(() =>
      sb
        .rpc("filter_conversations", {
          p_project: projectId ?? null,
          p_teammate: f.teammateId ?? null,
          p_filter: f,
        })
        .select("id")
        .order("id"),
    );
    if (error) {
      console.error("[comms.listConversationIds]", error.message);
      return null;
    }
    return data.map((r) => r.id);
  } catch (e) {
    console.error("[comms.listConversationIds]", e);
    return null;
  }
}

// Applies one patch to many conversations; returns the ids actually updated (a failed chunk is left out), null when unconfigured.
export async function updateConversations(ids, patch) {
  const wanted = [...new Set((ids || []).filter(Boolean))];
  if (wanted.length === 0 || !patch || !isSupabaseConfigured()) return null;
  const sb = createClient();
  const row = toConversationRow(patch);
  const results = await Promise.all(
    chunk(wanted).map(async (part) => {
      try {
        const { data, error } = await sb
          .from(CONVERSATIONS)
          .update(row)
          .in("id", part)
          .is("deleted_at", null)
          .select("id");
        if (error) {
          console.error("[comms.updateConversations]", error.message);
          return [];
        }
        return (data || []).map((r) => r.id);
      } catch (e) {
        console.error("[comms.updateConversations]", e);
        return [];
      }
    }),
  );
  return results.flat();
}

// Bulk twin of assignConversation: a { id, name } teammate, or null to unassign.
export async function assignConversations(ids, teammate) {
  return updateConversations(
    ids,
    teammate?.id
      ? { assigneeId: teammate.id, assignee: teammate.name || "" }
      : { assigneeId: null, assignee: "Unassigned" },
  );
}

// ---- per-agent read state ---------------------------------------------------

// Server-clock marker (comms.mark_conversation_read) so client clock skew can't leave a read thread unread.
export async function markRead(conversationId, teammateId) {
  if (!conversationId || !teammateId || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { data, error } = await sb.rpc("mark_conversation_read", {
      p_conversation: conversationId,
      p_teammate: teammateId,
    });
    if (error) {
      console.error("[comms.markRead]", error.message);
      return false;
    }
    return data === true;
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

// A contact's other live conversations, newest first (merge candidates).
export async function listContactConversations(contactId, { projectId, limit = 20 } = {}) {
  if (!contactId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let query = sb
      .from(CONVERSATIONS)
      .select("*")
      .eq("contact_id", contactId)
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[comms.listContactConversations]", error.message);
      return null;
    }
    return (data || []).map(normalizeConversation);
  } catch (e) {
    console.error("[comms.listContactConversations]", e);
    return null;
  }
}

// ---- messages ---------------------------------------------------------------

// Uploads one reply/note attachment through /api/inbox/upload; the { url, name, size, contentType } to send, or null.
export async function uploadMessageAttachment(file, conversationId) {
  if (!file || !conversationId) return null;
  try {
    const form = new FormData();
    form.append("file", file);
    form.append("conversationId", conversationId);
    // fetch() is not basePath-aware, so the prefix ("/comms" in prod) is added here.
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/inbox/upload`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      console.error("[comms.uploadMessageAttachment]", res.status);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error("[comms.uploadMessageAttachment]", e);
    return null;
  }
}

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
