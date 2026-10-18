import "server-only";
import { randomUUID } from "node:crypto";
import { serviceClient } from "./service";
import { isUuid } from "./apps";

// Widget public API data access (service role). Ownership always derives from the session principal, never a request parameter.
// Pure: validate, console.error("[widget.*]"), return null / [] / false — routes decide status codes and bodies.

const PAGE_LIMIT = 50;
// Only these message types ever reach a visitor; internal notes (and anything added later) stay workspace-side.
const VISITOR_MESSAGE_TYPES = ["comment"];
const MESSAGE_COLUMNS = "id, conversation_id, author_role, author_name, body, attachments, metadata, created_at";

function clip(value, max) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

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
        name: clip(name, 200) ?? externalId,
        email: clip(email, 254),
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
  const agent = typeof userAgent === "string" ? userAgent.slice(0, 512) : null;
  try {
    const sb = serviceClient();
    const touched = await sb
      .from("visitors")
      .update({ last_seen_at: new Date().toISOString(), user_agent: agent })
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
      .insert({ anonymous_id: anonymousId, app_id: appId, user_agent: agent })
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

// A browser whose visitor row already belongs to a contact must not reopen that history anonymously: free the anonymous id so a fresh visitor is minted.
export async function releaseClaimedVisitor(visitorId) {
  if (!isUuid(visitorId)) return false;
  try {
    const { error } = await serviceClient()
      .from("visitors")
      .update({ anonymous_id: `rotated:${randomUUID()}` })
      .eq("id", visitorId)
      .not("contact_id", "is", null);
    if (error) {
      console.error("[widget.releaseVisitor]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[widget.releaseVisitor]", e);
    return false;
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

// Whether a session's identity still stands: the contact is live, or the anonymous visitor is live and still unclaimed.
export async function principalActive(principal) {
  if (!principal?.appId) return false;
  try {
    const sb = serviceClient();
    if (principal.contactId) {
      const { data, error } = await sb
        .from("contacts")
        .select("id")
        .eq("id", principal.contactId)
        .eq("app_id", principal.appId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) console.error("[widget.principalActive]", error.message);
      return Boolean(data);
    }
    if (!principal.visitorId) return false;
    const { data, error } = await sb
      .from("visitors")
      .select("id, contact_id")
      .eq("id", principal.visitorId)
      .eq("app_id", principal.appId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) console.error("[widget.principalActive]", error.message);
    return Boolean(data) && !data.contact_id;
  } catch (e) {
    console.error("[widget.principalActive]", e);
    return false;
  }
}

// ---- conversations & messages ----------------------------------------------

// comms.widget_list_conversations owns ownership + note-free preview/unread; an anonymous caller only sees an unclaimed visitor's threads.
async function ownedConversations(principal, { id = null, limit = PAGE_LIMIT } = {}) {
  if (!principal?.contactId && !principal?.visitorId) return [];
  const { data, error } = await serviceClient().rpc("widget_list_conversations", {
    p_contact: principal.contactId ?? null,
    p_visitor: principal.contactId ? null : principal.visitorId,
    p_limit: Math.min(limit, PAGE_LIMIT),
    p_id: id,
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}

export async function listOwnedConversations(principal, { limit = PAGE_LIMIT } = {}) {
  try {
    return await ownedConversations(principal, { limit });
  } catch (e) {
    console.error("[widget.listConversations]", e.message ?? e);
    return null;
  }
}

// The single guard every conversation route goes through: an id that is not the caller's resolves to null and the route answers 404.
export async function findOwnedConversation(conversationId, principal) {
  if (!isUuid(conversationId)) return null;
  try {
    const rows = await ownedConversations(principal, { id: conversationId, limit: 1 });
    return rows[0] ?? null;
  } catch (e) {
    console.error("[widget.findConversation]", e.message ?? e);
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
      .select("id, subject, status, created_at, last_message_at")
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

// Records a CSAT score in the metadata bag; the visitor never changes the conversation's status.
export async function rateConversation(conversationId, principal, { score, comment }) {
  if (!principal) return false;
  try {
    const conversation = await findOwnedConversation(conversationId, principal);
    if (!conversation) return false;
    const sb = serviceClient();
    const { data: current, error: readErr } = await sb
      .from("conversations")
      .select("metadata")
      .eq("id", conversation.id)
      .maybeSingle();
    if (readErr) {
      console.error("[widget.rateConversation]", readErr.message);
      return false;
    }
    const meta = current?.metadata && typeof current.metadata === "object" ? current.metadata : {};
    const { error } = await sb
      .from("conversations")
      .update({
        metadata: { ...meta, rating: { score, comment: comment ?? "", at: new Date().toISOString() } },
      })
      .eq("id", conversation.id);
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

// Atomic write path shared with the workspace (comms.post_message); attachments must already be validated (lib/widget/attachments).
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

// Keyset pagination on created_at; `before` is the oldest loaded ISO timestamp. Notes and deleted messages never leave the server.
export async function listThread(conversationId, { before, limit = PAGE_LIMIT } = {}) {
  try {
    let query = serviceClient()
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", conversationId)
      .in("message_type", VISITOR_MESSAGE_TYPES)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), PAGE_LIMIT));
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

// Visitor-side read marker only; the agent-side unread state is the workspace's and is never touched from here.
export async function markConversationRead(conversationId) {
  try {
    const { error } = await serviceClient()
      .from("conversations")
      .update({ visitor_last_read_at: new Date().toISOString() })
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

// Free text → a term safe inside a quoted PostgREST or() value: no quotes, commas, parens or like-wildcards survive.
export function sanitizeSearchTerm(q) {
  if (typeof q !== "string") return "";
  return q
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s\-'.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

// Every content read is scoped to the app's project; an app with no project sees nothing rather than every tenant's content.
export async function listPublishedArticles({ projectId, q, limit = 20 } = {}) {
  if (!isUuid(projectId)) return [];
  try {
    let query = serviceClient()
      .from("articles")
      .select("*")
      .eq("project_id", projectId)
      .eq("published", true)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(Math.min(limit, 50));
    const search = sanitizeSearchTerm(q);
    if (search) {
      const like = `"%${search}%"`;
      query = query.or(`title.ilike.${like},summary.ilike.${like},body.ilike.${like}`);
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

// Most-viewed first when comms.article_views exists, otherwise most recent.
export async function listPopularArticles({ projectId, limit = 6 } = {}) {
  if (!isUuid(projectId)) return [];
  try {
    const base = (columns) =>
      serviceClient()
        .from("articles")
        .select(columns)
        .eq("project_id", projectId)
        .eq("published", true)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(20);
    const withViews = await base("*, article_stats:article_views(count)");
    if (!withViews.error) {
      return (withViews.data ?? [])
        .map((row) => ({ ...row, _views: row.article_stats?.[0]?.count ?? 0 }))
        .sort((a, b) => b._views - a._views)
        .slice(0, limit);
    }
    const plain = await base("*");
    if (plain.error) {
      console.error("[widget.popular]", plain.error.message);
      return null;
    }
    return (plain.data ?? []).slice(0, limit);
  } catch (e) {
    console.error("[widget.popular]", e);
    return null;
  }
}

// Published-only: an id that is unpublished, deleted, or another project's → null → 404.
export async function getPublishedArticle(articleId, { projectId } = {}) {
  if (!isUuid(articleId) || !isUuid(projectId)) return null;
  try {
    const { data, error } = await serviceClient()
      .from("articles")
      .select("*")
      .eq("id", articleId)
      .eq("project_id", projectId)
      .eq("published", true)
      .is("deleted_at", null)
      .maybeSingle();
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
  if (!isUuid(projectId)) return [];
  try {
    const { data, error } = await serviceClient()
      .from("posts")
      .select("*")
      .eq("project_id", projectId)
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .is("deleted_at", null)
      .order("published_at", { ascending: false })
      .limit(Math.min(limit, 50));
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

// Customer tickets only, joined through the caller's own live conversations; back-office and tracker tickets are internal.
export async function listOwnedTickets(principal, { limit = PAGE_LIMIT } = {}) {
  try {
    if (!principal?.contactId && !(principal?.visitorId && (await principalActive(principal)))) return [];
    let query = serviceClient()
      .from("tickets")
      // Named FK: ticket_links is a second tickets↔conversations path, so a bare embed is ambiguous (PGRST201).
      .select("id, title, description, state, conversation_id, created_at, conversations!tickets_conversation_id_fkey!inner(id)")
      .eq("type", "customer")
      .is("deleted_at", null)
      .is("conversations.deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, PAGE_LIMIT));
    query = principal.contactId
      ? query.eq("conversations.contact_id", principal.contactId)
      : query.eq("conversations.visitor_id", principal.visitorId);
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

// ---- orders -----------------------------------------------------------------

// Orders hang off an identified contact only; anonymous visitors have none.
export async function listContactOrders(contactId) {
  if (!isUuid(contactId)) return [];
  try {
    const { data, error } = await serviceClient()
      .from("orders")
      .select("id, reference, title, status, items:order_items(count)")
      .eq("contact_id", contactId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) {
      console.error("[widget.orders]", error.message);
      return [];
    }
    return data ?? [];
  } catch (e) {
    console.error("[widget.orders]", e);
    return [];
  }
}

// ---- events -----------------------------------------------------------------

// trackEvent appends into the visitor's metadata bag, capped at 50 entries; a lost event under a race costs nothing.
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
