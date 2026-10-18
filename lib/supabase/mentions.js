// ===========================================================================
// Geiger Comms — mentions data layer (owns comms.mentions). A mention row per
// (message, teammate); read_at flips when the mentioned teammate opens the
// thread, and unread mentions drive the Mentions badge. DB is snake_case; the
// UI is camelCase — map at this boundary. Pure data access: validate,
// console.error on failure, return null / [] / false. Never throw, never toast.
// ===========================================================================

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

const TABLE = "mentions";

// ---- normalize (snake -> camel) ---------------------------------------------

export function normalizeMention(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    teammateId: row.teammate_id,
    readAt: row.read_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

// ---- reads ---------------------------------------------------------------------

// The inner join to conversations carries the project scope (no denormalised column) and drops deleted threads.
export async function listMentions({ projectId, teammateId } = {}) {
  if (!teammateId || !isSupabaseConfigured()) return [];
  try {
    const sb = createClient();
    let query = sb
      .from(TABLE)
      .select("*, conversation:conversations!inner(id, project_id, deleted_at)")
      .eq("teammate_id", teammateId)
      .is("conversation.deleted_at", null)
      .order("created_at", { ascending: false });
    if (projectId) query = query.eq("conversation.project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[mentions.list]", error.message);
      return [];
    }
    return (data || []).map(normalizeMention);
  } catch (e) {
    console.error("[mentions.list]", e);
    return [];
  }
}

// Unread mentions for one teammate in a project — drives the Mentions nav badge (spec §5.4). null on failure.
export async function countUnreadMentions({ projectId, teammateId } = {}) {
  if (!teammateId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let query = sb
      .from(TABLE)
      .select("id, conversation:conversations!inner(project_id, deleted_at)", {
        count: "exact",
        head: true,
      })
      .eq("teammate_id", teammateId)
      .is("read_at", null)
      .is("conversation.deleted_at", null);
    if (projectId) query = query.eq("conversation.project_id", projectId);
    const { count, error } = await query;
    if (error) {
      console.error("[mentions.countUnread]", error.message);
      return null;
    }
    return count ?? 0;
  } catch (e) {
    console.error("[mentions.countUnread]", e);
    return null;
  }
}

export async function createMentions({ conversationId, messageId, teammateIds }) {
  if (!conversationId || !messageId || !isSupabaseConfigured()) return false;
  const ids = [...new Set((Array.isArray(teammateIds) ? teammateIds : []).filter(Boolean))];
  if (ids.length === 0) return true; // nothing to insert is a success
  try {
    const sb = createClient();
    const { error } = await sb.from(TABLE).insert(
      ids.map((teammateId) => ({
        conversation_id: conversationId,
        message_id: messageId,
        teammate_id: teammateId,
      })),
    );
    if (error) {
      console.error("[mentions.create]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[mentions.create]", e);
    return false;
  }
}

// Mark every unread mention in a thread as read for one teammate.
export async function markMentionsRead({ conversationId, teammateId }) {
  if (!conversationId || !teammateId || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("teammate_id", teammateId)
      .is("read_at", null);
    if (error) {
      console.error("[mentions.markRead]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[mentions.markRead]", e);
    return false;
  }
}
