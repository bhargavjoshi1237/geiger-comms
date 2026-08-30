// ===========================================================================
// Widget public API — service-role data access. Owns every query behind the
// /api/widget/* routes: visitor/contact upserts, owned conversations and
// threads (ownership always derived from the session token), published content,
// and the caller's tickets. Pure: validate, console.error("[widget.*]"), return
// null / [] / false — routes decide status codes and bodies.
// ===========================================================================

import { serviceClient } from "./service";

const PAGE_LIMIT = 50;

// ---- identity ---------------------------------------------------------------

export async function upsertContact({ externalId, appId, email, name, projectId }) {
  if (!externalId || !appId) return null;
  try {
    const sb = serviceClient();
    const existing = await sb
      .from("contacts")
      .select("*")
      .eq("external_id", externalId)
      .eq("app_id", appId)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing.error) {
      console.error("[widget.upsertContact]", existing.error.message);
      return null;
    }
    if (existing.data) return existing.data;
    const inserted = await sb
      .from("contacts")
      .insert({
        external_id: externalId,
        app_id: appId,
        project_id: projectId ?? null,
        name: typeof name === "string" && name ? name : externalId,
        email: typeof email === "string" && email ? email : null,
      })
      .select("*")
      .single();
    // A concurrent boot may have won the race on contacts_external_app_idx.
    if (inserted.error?.code === "23505") {
      const raced = await sb
        .from("contacts")
        .select("*")
        .eq("external_id", externalId)
        .eq("app_id", appId)
        .is("deleted_at", null)
        .maybeSingle();
      return raced.data ?? null;
    }
    if (inserted.error) {
      console.error("[widget.upsertContact]", inserted.error.message);
      return null;
    }
    return inserted.data;
  } catch (e) {
    console.error("[widget.upsertContact]", e);
    return null;
  }
}

export async function upsertVisitor({ anonymousId, appId, userAgent }) {
  if (!anonymousId || !appId) return null;
  try {
    const sb = serviceClient();
    const touched = await sb
      .from("visitors")
      .update({ last_seen_at: new Date().toISOString(), user_agent: userAgent ?? null })
      .eq("anonymous_id", anonymousId)
      .eq("app_id", appId)
      .select("*")
      .maybeSingle();
    if (touched.error) {
      console.error("[widget.upsertVisitor]", touched.error.message);
      return null;
    }
    if (touched.data) return touched.data;
    const inserted = await sb
      .from("visitors")
      .insert({ anonymous_id: anonymousId, app_id: appId, user_agent: userAgent ?? null })
      .select("*")
      .single();
    // A concurrent boot may have won the race on visitors_anon_app_idx.
    if (inserted.error?.code === "23505") {
      const raced = await sb
        .from("visitors")
        .select("*")
        .eq("anonymous_id", anonymousId)
        .eq("app_id", appId)
        .maybeSingle();
      return raced.data ?? null;
    }
    if (inserted.error) {
      console.error("[widget.upsertVisitor]", inserted.error.message);
      return null;
    }
    return inserted.data;
  } catch (e) {
    console.error("[widget.upsertVisitor]", e);
    return null;
  }
}

// One-way anonymous → identified merge; false means "start a fresh visitor".
export async function mergeVisitor(visitorId, contactId) {
  if (!visitorId || !contactId) return false;
  try {
    const { data, error } = await serviceClient().rpc("merge_visitor", {
      p_visitor: visitorId,
      p_contact: contactId,
    });
    if (error) {
      console.error("[widget.mergeVisitor]", error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error("[widget.mergeVisitor]", e);
    return false;
  }
}

// ---- conversations & messages ----------------------------------------------

function ownershipFilter(query, principal) {
  if (principal.contactId) return query.eq("contact_id", principal.contactId);
  if (principal.visitorId) return query.eq("visitor_id", principal.visitorId);
  return query.in("id", []); // no identity → no rows, ever
}

export async function listOwnedConversations(principal, { limit = PAGE_LIMIT } = {}) {
  try {
    let query = serviceClient()
      .from("conversations")
      .select("*")
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(Math.min(limit, PAGE_LIMIT));
    query = ownershipFilter(query, principal);
    const { data, error } = await query;
    if (error) {
      console.error("[widget.listConversations]", error.message);
      return null;
    }
    return data ?? [];
  } catch (e) {
    console.error("[widget.listConversations]", e);
    return null;
  }
}

// The single row-returning guard every conversation route goes through: an id
// that is not the caller's resolves to null and the route answers 404.
export async function findOwnedConversation(conversationId, principal) {
  if (!conversationId) return null;
  try {
    let query = serviceClient()
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .is("deleted_at", null)
      .maybeSingle();
    query = ownershipFilter(query, principal);
    const { data, error } = await query;
    if (error) {
      console.error("[widget.findConversation]", error.message);
      return null;
    }
    return data ?? null;
  } catch (e) {
    console.error("[widget.findConversation]", e);
    return null;
  }
}

export async function createWidgetConversation({ app, principal, subject, aboutKind, aboutOrderId, aboutLabel }) {
  try {
    const metadata = {};
    if (aboutKind) metadata.about_kind = aboutKind;
    if (aboutOrderId) metadata.about_order_id = aboutOrderId;
    if (aboutLabel) metadata.about_label = aboutLabel;
    const payload = {
      subject: typeof subject === "string" ? subject.slice(0, 200) : "",
      source: "widget",
      project_id: app?.project_id ?? null,
    };
    if (principal.visitorId) payload.visitor_id = principal.visitorId;
    if (principal.contactId) payload.contact_id = principal.contactId;
    // The messenger channel row is the display channel for widget threads.
    if (app?.channel_id) payload.channel_id = app.channel_id;
    if (Object.keys(metadata).length) payload.metadata = metadata;
    const { data, error } = await serviceClient()
      .from("conversations")
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("[widget.createConversation]", error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.error("[widget.createConversation]", e);
    return null;
  }
}

export async function rateConversation(conversationId, principal, { score, comment }) {
  if (!conversationId || !principal) return false;
  try {
    const conversation = await findOwnedConversation(conversationId, principal);
    if (!conversation) return false;
    const sb = serviceClient();
    const { data: current, error: readErr } = await sb
      .from("conversations")
      .select("metadata")
      .eq("id", conversationId)
      .maybeSingle();
    if (readErr) {
      console.error("[widget.rateConversation]", readErr.message);
      return false;
    }
    const meta = current?.metadata && typeof current.metadata === "object" ? current.metadata : {};
    const nextMeta = {
      ...meta,
      rating: { score, comment: comment ?? "", at: new Date().toISOString() },
    };
    const { error } = await sb
      .from("conversations")
      .update({ metadata: nextMeta, state: "closed" })
      .eq("id", conversationId);
    if (error) {
      console.error("[widget.rateConversation]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[widget.rateConversation]", e);
    return false;
  }
}

// Atomic write path shared with the workspace (comms.post_message). Maps the
// function's raised errors to codes the route can turn into responses.
export async function postMessage({ conversationId, body, authorRole, authorName, attachments }) {
  try {
    const { data, error } = await serviceClient().rpc("post_message", {
      p_conversation: conversationId,
      p_body: String(body ?? "").slice(0, 5000),
      p_author_role: authorRole,
      p_author_name: authorName ?? "",
      p_message_type: "comment",
      p_attachments: Array.isArray(attachments) ? attachments : [],
      p_source: "widget",
    });
    if (error) {
      console.error("[widget.postMessage]", error.message);
      if (error.message?.includes("conversation_not_found")) return { code: "not_found" };
      return { code: "write_failed" };
    }
    return { message: data };
  } catch (e) {
    console.error("[widget.postMessage]", e);
    return { code: "write_failed" };
  }
}

// Keyset pagination on created_at; `before` is the oldest loaded ISO timestamp.
export async function listThread(conversationId, { before, limit = PAGE_LIMIT } = {}) {
  try {
    let query = serviceClient()
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, PAGE_LIMIT));
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query;
    if (error) {
      console.error("[widget.listThread]", error.message);
      return null;
    }
    return (data ?? []).reverse();
  } catch (e) {
    console.error("[widget.listThread]", e);
    return null;
  }
}

export async function markConversationRead(conversationId) {
  try {
    const { error } = await serviceClient()
      .from("conversations")
      .update({ unread: false })
      .eq("id", conversationId);
    if (error) {
      console.error("[widget.markRead]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[widget.markRead]", e);
    return false;
  }
}

// ---- published content (Help & News) ---------------------------------------

export async function listPublishedArticles({ projectId, q, limit = 20 } = {}) {
  try {
    let query = serviceClient()
      .from("articles")
      .select("*")
      .eq("published", true)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(Math.min(limit, 50));
    if (projectId) query = query.eq("project_id", projectId);
    const search = typeof q === "string" ? q.trim() : "";
    if (search) {
      query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%,body.ilike.%${search}%`);
    }
    const { data, error } = await query;
    if (error) {
      console.error("[widget.listArticles]", error.message);
      return null;
    }
    return data ?? [];
  } catch (e) {
    console.error("[widget.listArticles]", e);
    return null;
  }
}

// Published-only: an id that is unpublished, deleted, or foreign → null → 404.
export async function getPublishedArticle(articleId, { projectId } = {}) {
  if (!articleId) return null;
  try {
    let query = serviceClient()
      .from("articles")
      .select("*")
      .eq("id", articleId)
      .eq("published", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[widget.getArticle]", error.message);
      return null;
    }
    return data ?? null;
  } catch (e) {
    console.error("[widget.getArticle]", e);
    return null;
  }
}

export async function listPublishedPosts({ projectId, limit = 20 } = {}) {
  try {
    let query = serviceClient()
      .from("posts")
      .select("*")
      .not("published_at", "is", null)
      .is("deleted_at", null)
      .order("published_at", { ascending: false })
      .limit(Math.min(limit, 50));
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[widget.listPosts]", error.message);
      return null;
    }
    return data ?? [];
  } catch (e) {
    console.error("[widget.listPosts]", e);
    return null;
  }
}

// ---- tickets ----------------------------------------------------------------

// A caller's tickets join through their conversations; tickets without a
// conversation are workspace-side and never leak here.
export async function listOwnedTickets(principal, { limit = PAGE_LIMIT } = {}) {
  try {
    let query = serviceClient()
      .from("tickets")
      .select("*, conversations!inner(id)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, PAGE_LIMIT));
    if (principal.contactId) query = query.eq("conversations.contact_id", principal.contactId);
    else if (principal.visitorId) query = query.eq("conversations.visitor_id", principal.visitorId);
    else return [];
    const { data, error } = await query;
    if (error) {
      console.error("[widget.listTickets]", error.message);
      return null;
    }
    return data ?? [];
  } catch (e) {
    console.error("[widget.listTickets]", e);
    return null;
  }
}

// ---- events -----------------------------------------------------------------

// trackEvent appends into the visitor's metadata bag, capped at 50 entries.
// Read-modify-write is deliberate: analytics never justifies another migration,
// and a lost event under a race costs nothing.
export async function appendVisitorEvent(visitorId, entry) {
  if (!visitorId || !entry) return false;
  try {
    const sb = serviceClient();
    const current = await sb
      .from("visitors")
      .select("metadata")
      .eq("id", visitorId)
      .maybeSingle();
    if (current.error) {
      console.error("[widget.trackEvent]", current.error.message);
      return false;
    }
    const meta =
      current.data?.metadata && typeof current.data.metadata === "object"
        ? current.data.metadata
        : {};
    const events = Array.isArray(meta.tracked_events) ? meta.tracked_events : [];
    const nextEvents = [...events, entry].slice(-50);
    const { error } = await sb
      .from("visitors")
      .update({ metadata: { ...meta, tracked_events: nextEvents } })
      .eq("id", visitorId);
    if (error) {
      console.error("[widget.trackEvent]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[widget.trackEvent]", e);
    return false;
  }
}
