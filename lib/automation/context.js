import "server-only";

// What conditions and actions read about the conversation a run acts on: the row, its tags, its contact and the triggering message.
// Actions patch this object as they change the conversation, so later steps in the same run see the new state.

export function must({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// Scoped to the workflow's project, so a run's ids are never trusted across projects.
export async function loadContext(sb, { projectId, conversationId, messageId }) {
  if (!conversationId) return { conversation: null, tags: [], contact: null, message: null };
  const conversation = must(
    await sb
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle(),
  );
  if (!conversation) return { conversation: null, tags: [], contact: null, message: null };

  const [links, contact, message] = await Promise.all([
    sb.from("conversation_tags").select("tag:tags(id, name, deleted_at)").eq("conversation_id", conversationId),
    conversation.contact_id
      ? sb.from("contacts").select("*").eq("id", conversation.contact_id).maybeSingle()
      : Promise.resolve({ data: null }),
    loadMessage(sb, conversationId, messageId),
  ]);
  return {
    conversation,
    tags: (must(links) || []).map((l) => l.tag).filter((t) => t && !t.deleted_at),
    contact: must(contact),
    message,
  };
}

// The triggering message, else the latest customer message (for triggers that aren't a message).
async function loadMessage(sb, conversationId, messageId) {
  let query = sb
    .from("messages")
    .select("id, body, author_role, created_at")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null);
  query = messageId
    ? query.eq("id", messageId)
    : query
        .eq("author_role", "customer")
        .eq("message_type", "comment")
        .order("created_at", { ascending: false })
        .limit(1);
  const rows = must(await query);
  return rows?.[0] ?? null;
}

// ---- project lookups (actions resolve the builder's free-text names against these) ----

export const sameName = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

export async function findTeammate(sb, projectId, nameOrEmail) {
  const rows = must(
    await sb.from("teammates").select("id, name, email").eq("project_id", projectId).is("deleted_at", null),
  );
  return (rows || []).find((t) => sameName(t.name, nameOrEmail) || sameName(t.email, nameOrEmail)) ?? null;
}

export async function findTeam(sb, projectId, name) {
  const rows = must(
    await sb.from("member_groups").select("id, name").eq("project_id", projectId).is("deleted_at", null),
  );
  return (rows || []).find((g) => sameName(g.name, name)) ?? null;
}

export async function findTag(sb, projectId, name) {
  const rows = must(await sb.from("tags").select("id, name").eq("project_id", projectId).is("deleted_at", null));
  return (rows || []).find((t) => sameName(t.name, name)) ?? null;
}

export async function findSlaPolicy(sb, projectId, name) {
  const rows = must(
    await sb.from("sla_policies").select("id, name, enabled").eq("project_id", projectId).is("deleted_at", null),
  );
  return (rows || []).find((p) => sameName(p.name, name)) ?? null;
}

// The project's default office-hours timezone, for "tomorrow 9am"-style times; UTC without one.
export async function projectTimeZone(sb, projectId) {
  const rows = must(
    await sb
      .from("business_hours")
      .select("timezone")
      .eq("project_id", projectId)
      .is("team_id", null)
      .eq("enabled", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1),
  );
  return rows?.[0]?.timezone || "UTC";
}
