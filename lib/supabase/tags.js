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

// Adds one tag link; an existing link is a no-op success.
export async function addConversationTag(conversationId, tagId) {
  if (!conversationId || !tagId || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(LINKS)
      .upsert(
        { conversation_id: conversationId, tag_id: tagId },
        { onConflict: "conversation_id,tag_id", ignoreDuplicates: true },
      );
    if (error) {
      console.error("[tags.addToConversation]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[tags.addToConversation]", e);
    return false;
  }
}

// Bulk twin of addConversationTag: links one tag to many conversations; the ids now tagged (a failed chunk is left out), null when unconfigured.
export async function addTagToConversations(conversationIds, tagId) {
  const ids = [...new Set((conversationIds || []).filter(Boolean))];
  if (ids.length === 0 || !tagId || !isSupabaseConfigured()) return null;
  const sb = createClient();
  const parts = [];
  for (let i = 0; i < ids.length; i += 500) parts.push(ids.slice(i, i + 500));
  const results = await Promise.all(
    parts.map(async (part) => {
      try {
        const { error } = await sb.from(LINKS).upsert(
          part.map((id) => ({ conversation_id: id, tag_id: tagId })),
          { onConflict: "conversation_id,tag_id", ignoreDuplicates: true },
        );
        if (error) {
          console.error("[tags.addToConversations]", error.message);
          return [];
        }
        return part;
      } catch (e) {
        console.error("[tags.addToConversations]", e);
        return [];
      }
    }),
  );
  return results.flat();
}

// Removes one tag link; a missing link is a no-op success.
export async function removeConversationTag(conversationId, tagId) {
  if (!conversationId || !tagId || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(LINKS)
      .delete()
      .eq("conversation_id", conversationId)
      .eq("tag_id", tagId);
    if (error) {
      console.error("[tags.removeFromConversation]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[tags.removeFromConversation]", e);
    return false;
  }
}

// Makes the link set equal `tagIds` by diffing (add missing, remove extra) — never clears first, so a failure can't wipe tags.
export async function setConversationTags(conversationId, tagIds) {
  if (!conversationId || !Array.isArray(tagIds) || !isSupabaseConfigured()) {
    return false;
  }
  try {
    const sb = createClient();
    const wanted = [...new Set(tagIds.filter(Boolean))];
    const { data: current, error: readError } = await sb
      .from(LINKS)
      .select("tag_id")
      .eq("conversation_id", conversationId);
    if (readError) {
      console.error("[tags.setForConversation]", readError.message);
      return false;
    }
    const have = new Set((current || []).map((r) => r.tag_id));
    const toAdd = wanted.filter((id) => !have.has(id));
    const toRemove = [...have].filter((id) => !wanted.includes(id));
    if (toAdd.length > 0) {
      const { error } = await sb.from(LINKS).upsert(
        toAdd.map((tagId) => ({ conversation_id: conversationId, tag_id: tagId })),
        { onConflict: "conversation_id,tag_id", ignoreDuplicates: true },
      );
      if (error) {
        console.error("[tags.setForConversation]", error.message);
        return false;
      }
    }
    if (toRemove.length > 0) {
      const { error } = await sb
        .from(LINKS)
        .delete()
        .eq("conversation_id", conversationId)
        .in("tag_id", toRemove);
      if (error) {
        console.error("[tags.setForConversation]", error.message);
        return false;
      }
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
      .select("conversation_id, tag:tags(id,name,color,deleted_at)")
      .in("conversation_id", ids);
    if (error) {
      console.error("[tags.listForConversations]", error.message);
      return {};
    }
    // { [conversationId]: Tag[] }
    const map = {};
    for (const row of data || []) {
      if (!row.tag || row.tag.deleted_at) continue; // soft-deleted tags never render
      (map[row.conversation_id] ??= []).push(normalizeTag(row.tag));
    }
    return map;
  } catch (e) {
    console.error("[tags.listForConversations]", e);
    return {};
  }
}
