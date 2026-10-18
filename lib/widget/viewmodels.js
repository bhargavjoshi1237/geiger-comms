// Widget response view models (spec §5): camelCase JSON with only what the widget renders — never assignee ids, teammate emails or metadata bags.

// Accepts a comms.widget_list_conversations payload or a freshly inserted conversations row.
export function conversationVm(row) {
  if (!row) return null;
  const unreadCount = Number.isFinite(row.unread_count) ? row.unread_count : 0;
  const lastMessageAt = row.last_message_at ?? row.created_at ?? null;
  return {
    id: row.id,
    subject: row.subject ?? "",
    preview: row.preview ?? "",
    state: String(row.status ?? "Open").toLowerCase() === "closed" ? "closed" : "open",
    lastActivityAt: lastMessageAt,
    lastMessageAt,
    createdAt: row.created_at ?? null,
    agentName: row.agent_name ?? "",
    lastAuthorRole: row.last_author_role ?? null,
    unread: unreadCount > 0,
    unreadCount,
  };
}

// Attachments are validated on write; on read only well-formed http(s) links survive (legacy rows predate validation).
function attachmentVm(a) {
  if (!a || typeof a !== "object" || typeof a.url !== "string" || !/^https?:\/\//i.test(a.url)) return null;
  return {
    url: a.url,
    name: typeof a.name === "string" ? a.name.slice(0, 120) : "",
    size: Number.isFinite(a.size) ? a.size : null,
    contentType: typeof a.contentType === "string" ? a.contentType : null,
  };
}

export function messageVm(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const raw = Array.isArray(row.attachments) && row.attachments.length
    ? row.attachments
    : Array.isArray(meta.attachments)
      ? meta.attachments
      : [];
  return {
    id: row.id,
    body: row.body ?? "",
    authorRole: row.author_role ?? "customer",
    authorName: row.author_name ?? "",
    attachments: raw.map(attachmentVm).filter(Boolean),
    createdAt: row.created_at ?? null,
    readAt: meta.read_at ?? null,
  };
}

export function articleSummaryVm(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title ?? "",
    summary: row.summary ?? "",
    updatedAt: row.updated_at ?? null,
    collectionTitle: row.collection_title ?? row.collection ?? null,
    readMinutes: typeof row.read_minutes === "number"
      ? row.read_minutes
      : Math.max(1, Math.round(((row.body || "").split(/\s+/).length) / 200)),
  };
}

export function articleVm(row) {
  if (!row) return null;
  return {
    ...articleSummaryVm(row),
    body: row.body ?? "",
    authorName: row.author_name ?? row.author ?? "Author",
    callout: row.callout ?? "",
  };
}

export function postVm(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title ?? "",
    summary: row.summary ?? "",
    body: row.body ?? "",
    publishedAt: row.published_at ?? null,
  };
}

export function ticketVm(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title ?? "",
    description: row.description ?? "",
    state: row.state ?? "submitted",
    conversationId: row.conversation_id ?? null,
    createdAt: row.created_at ?? null,
  };
}

export function contactVm(row) {
  if (!row) return null;
  return { name: row.name ?? "", email: row.email ?? "" };
}
