// ===========================================================================
// Geiger Comms — tags data layer (owns comms.tags + comms.conversation_tags).
// Tags on conversations are also the first input to topic clustering later
// (inbox spec §8). DB is snake_case; the UI is camelCase — map at this
// boundary. Pure data access: validate, console.error on failure, return
// null / [] / false. Never throw, never toast.
// ===========================================================================

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

const TABLE = "tags";
const LINKS = "conversation_tags";

export const TAG_COLORS = [
  "slate",
  "red",
  "amber",
  "emerald",
  "sky",
  "violet",
  "pink",
];

// ---- normalize (snake -> camel) ---------------------------------------------

export function normalizeTag(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    name: row.name ?? "",
    color: row.color ?? "slate",
    projectId: row.project_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    ...meta,
  };
}

function toRow(input) {
  const row = {};
  const map = {
    name: "name",
    color: "color",
    projectId: "project_id",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("name" in input) row.name = (input.name || "").trim();
  return row;
}

// ---- tags CRUD ----------------------------------------------------------------

export async function listTags({ projectId } = {}) {
  if (!isSupabaseConfigured()) return [];
  try {
    const sb = createClient();
    let query = sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[tags.list]", error.message);
      return [];
    }
    return (data || []).map(normalizeTag);
  } catch (e) {
    console.error("[tags.list]", e);
    return [];
  }
}

export async function createTag(input) {
  if (!input?.name || !isSupabaseConfigured()) return null;
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
      console.error("[tags.create]", error.message);
      return null;
    }
    return normalizeTag(data);
  } catch (e) {
    console.error("[tags.create]", e);
    return null;
  }
}

export async function updateTag(id, patch) {
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
      console.error("[tags.update]", error.message);
      return null;
    }
    return normalizeTag(data);
  } catch (e) {
    console.error("[tags.update]", e);
    return null;
  }
}

export async function softDeleteTag(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[tags.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[tags.delete]", e);
    return false;
  }
}

// ---- conversation <-> tag links ------------------------------------------------

export async function listTagsForConversation(conversationId) {
  if (!conversationId || !isSupabaseConfigured()) return [];
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(LINKS)
      .select("tag:tags(*)")
      .eq("conversation_id", conversationId);
    if (error) {
      console.error("[tags.listForConversation]", error.message);
      return [];
    }
    return (data || []).map((r) => normalizeTag(r.tag)).filter(Boolean);
  } catch (e) {
    console.error("[tags.listForConversation]", e);
    return [];
  }
}

export async function setConversationTags(conversationId, tagIds) {
  if (!conversationId || !Array.isArray(tagIds) || !isSupabaseConfigured()) {
    return false;
  }
  try {
    const sb = createClient();
    // Replace the link set wholesale — the caller owns the full selection.
    const { error: clearError } = await sb
      .from(LINKS)
      .delete()
      .eq("conversation_id", conversationId);
    if (clearError) {
      console.error("[tags.setForConversation]", clearError.message);
      return false;
    }
    if (tagIds.length === 0) return true;
    const { error } = await sb.from(LINKS).insert(
      tagIds.map((tagId) => ({ conversation_id: conversationId, tag_id: tagId })),
    );
    if (error) {
      console.error("[tags.setForConversation]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[tags.setForConversation]", e);
    return false;
  }
}

export async function listTagsForConversations(conversationIds) {
  const ids = (Array.isArray(conversationIds) ? conversationIds : []).filter(Boolean);
  if (ids.length === 0 || !isSupabaseConfigured()) return {};
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(LINKS)
      .select("conversation_id, tag:tags(id,name,color)")
      .in("conversation_id", ids);
    if (error) {
      console.error("[tags.listForConversations]", error.message);
      return {};
    }
    // { [conversationId]: Tag[] }
    const map = {};
    for (const row of data || []) {
      if (!row.tag) continue;
      (map[row.conversation_id] ??= []).push(normalizeTag(row.tag));
    }
    return map;
  } catch (e) {
    console.error("[tags.listForConversations]", e);
    return {};
  }
}
