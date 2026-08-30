// Widget response view models (spec §5): camelCase JSON containing only what
// the widget renders — never assignee ids, teammate emails or metadata bags.

export function conversationVm(row) {
  if (!row) return null;
  return {
    id: row.id,
    subject: row.subject ?? "",
    preview: row.preview ?? "",
    state: row.state ?? "open",
    lastActivityAt: row.last_message_at ?? row.last_activity_at ?? row.created_at ?? null,
    lastMessageAt: row.last_message_at ?? row.created_at ?? null,
    createdAt: row.created_at ?? null,
    agentName: row.agent_name ?? row.assignee_name ?? "",
    unread: typeof row.unread === "boolean" ? row.unread : false,
  };
}

export function messageVm(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    body: row.body ?? "",
    authorRole: row.author_role ?? "customer",
    authorName: row.author_name ?? "",
    attachments: Array.isArray(meta.attachments) ? meta.attachments : [],
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
