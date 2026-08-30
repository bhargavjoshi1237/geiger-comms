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

export async function listMentions({ projectId, teammateId } = {}) {
  if (!teammateId || !isSupabaseConfigured()) return [];
  try {
    const sb = createClient();
    const query = sb
      .from(TABLE)
      .select("*, conversation:conversations!inner(id, subject, project_id)")
      .eq("teammate_id", teammateId)
      .order("created_at", { ascending: false });
    // The join to conversations is how a project scope rides along without a
    // denormalised column; filter client-side on the embedded row.
    const { data, error } = await query;
    if (error) {
      console.error("[mentions.list]", error.message);
      return [];
    }
    return (data || [])
      .filter(
        (r) => !projectId || r.conversation?.project_id === projectId || r.conversation?.project_id == null,
      )
      .map(normalizeMention);
  } catch (e) {
    console.error("[mentions.list]", e);
    return [];
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
