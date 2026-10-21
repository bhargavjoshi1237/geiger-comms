import "server-only";
import { assertPublicUrl } from "@/lib/ai/url_guard";
import { isPrivateAddressError, pinnedFetch } from "@/lib/engine/net";
import { findSlaPolicy, findTag, findTeam, findTeammate, must, projectTimeZone, sameName } from "./context";
import { formatInZone, snoozeUntil } from "./time";

// "Then do this" steps. Each handler acts through env.sb (stamped with the workflow's origin), patches ctx, and returns the
// line Run History shows; a thrown Error fails the step with its message. `wait` is the executor's, not here.

const PRIORITIES = ["Urgent", "Normal", "Low"];
const TICKET_TYPE_LABELS = { customer: "customer", back_office: "back-office", tracker: "tracker" };
const CONTACT_COLUMNS = ["name", "email", "company"];
const CONTACT_META = ["phone", "location", "timezone", "language", "title", "lifecycle", "owner", "website"];

function requireConversation(ctx) {
  if (!ctx.conversation) throw new Error("There's no conversation to act on.");
  return ctx.conversation;
}

async function updateConversation(env, ctx, patch) {
  const conversation = requireConversation(ctx);
  must(await env.sb.from("conversations").update(patch).eq("id", conversation.id));
  Object.assign(conversation, patch);
}

async function postMessage(env, ctx, text, type) {
  const conversation = requireConversation(ctx);
  const body = String(text ?? "").trim();
  if (!body) throw new Error(type === "note" ? "This step has no note to add." : "This step has no message to send.");
  must(
    await env.sb.rpc("post_automated_message", {
      p_conversation: conversation.id,
      p_body: body.slice(0, 5000),
      p_message_type: type,
      p_workflow: env.workflow.id,
      p_author_name: type === "note" ? env.workflow.name : null,
    }),
  );
}

// Round-robin cursor for a workflow's own Assign step: whoever its latest assigning run picked.
async function lastWorkflowAssignee(env) {
  const rows = must(
    await env.sb
      .from("workflow_runs")
      .select("metadata")
      .eq("workflow_id", env.workflow.id)
      .not("metadata->>assignee_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1),
  );
  return rows?.[0]?.metadata?.assignee_id ?? null;
}

async function assign(env, ctx, config) {
  const conversation = requireConversation(ctx);
  const target = String(config.to ?? "").trim();
  const teammate = target ? await findTeammate(env.sb, env.projectId, target) : null;
  const team = target && !teammate ? await findTeam(env.sb, env.projectId, target) : null;
  if (target && !teammate && !team) throw new Error(`No teammate or team called "${target}".`);
  if (!target && config.strategy === "direct") throw new Error("Choose who this step assigns to.");

  let assignee = teammate;
  if (!assignee) {
    // A team (or everyone) shares the work; "direct" to a team uses the team's rotation.
    const strategy = config.strategy === "load" ? "load" : "round_robin";
    const id = must(
      await env.sb.rpc("routing_pick", {
        p_project: env.projectId,
        p_strategy: strategy,
        p_team: team?.id ?? null,
        p_teammate: null,
        p_after: strategy === "round_robin" ? await lastWorkflowAssignee(env) : null,
      }),
    );
    if (!id) throw new Error(team ? `Nobody in ${team.name} is available.` : "No teammate is available.");
    assignee = must(await env.sb.from("teammates").select("id, name").eq("id", id).maybeSingle());
  }
  env.runMeta.assignee_id = assignee.id;
  if (conversation.assignee_id === assignee.id) return `Already assigned to ${assignee.name}`;
  await updateConversation(env, ctx, { assignee_id: assignee.id, assignee: assignee.name });
  return `Assigned to ${assignee.name}${team ? ` (${team.name})` : ""}`;
}

const tagName = (config) => String(config.tag ?? "").trim().replace(/^#/, "");

async function addTag(env, ctx, config) {
  const conversation = requireConversation(ctx);
  const name = tagName(config);
  if (!name) throw new Error("This step has no tag.");
  let tag = await findTag(env.sb, env.projectId, name);
  if (!tag) {
    const created = await env.sb.from("tags").insert({ name, project_id: env.projectId }).select("id, name").single();
    tag = created.error?.code === "23505" ? await findTag(env.sb, env.projectId, name) : must(created);
  }
  if (ctx.tags.some((t) => t.id === tag.id)) return `Already tagged #${tag.name}`;
  must(
    await env.sb
      .from("conversation_tags")
      .upsert(
        { conversation_id: conversation.id, tag_id: tag.id },
        { onConflict: "conversation_id,tag_id", ignoreDuplicates: true },
      ),
  );
  ctx.tags.push(tag);
  return `Added tag #${tag.name}`;
}

async function removeTag(env, ctx, config) {
  const conversation = requireConversation(ctx);
  const name = tagName(config);
  if (!name) throw new Error("This step has no tag.");
  const tag = ctx.tags.find((t) => sameName(t.name, name));
  if (!tag) return `Wasn't tagged #${name}`;
  must(await env.sb.from("conversation_tags").delete().eq("conversation_id", conversation.id).eq("tag_id", tag.id));
  ctx.tags = ctx.tags.filter((t) => t.id !== tag.id);
  return `Removed tag #${tag.name}`;
}

async function setPriority(env, ctx, config) {
  if (!PRIORITIES.includes(config.priority)) throw new Error("Choose a priority for this step.");
  if (requireConversation(ctx).priority === config.priority) return `Already ${config.priority}`;
  await updateConversation(env, ctx, { priority: config.priority });
  return `Set priority to ${config.priority}`;
}

async function snooze(env, ctx, config) {
  requireConversation(ctx);
  const timeZone = await projectTimeZone(env.sb, env.projectId);
  const until = snoozeUntil(config.duration || "tomorrow9", timeZone);
  if (!until) throw new Error("Choose how long to snooze for.");
  await updateConversation(env, ctx, { status: "Snoozed", snoozed_until: until.toISOString() });
  return `Snoozed until ${formatInZone(until, timeZone)}`;
}

async function close(env, ctx) {
  if (requireConversation(ctx).status === "Closed") return "Already closed";
  await updateConversation(env, ctx, { status: "Closed", closed_at: new Date().toISOString() });
  return "Closed the conversation";
}

// Setting sla_policy_id makes conversations_apply_sla restart the clock on that policy.
async function applySla(env, ctx, config) {
  const conversation = requireConversation(ctx);
  const name = String(config.policy ?? "").trim();
  if (!name) throw new Error("Choose the SLA policy to apply.");
  const policy = await findSlaPolicy(env.sb, env.projectId, name);
  if (!policy) throw new Error(`No SLA policy called "${name}".`);
  if (!policy.enabled) throw new Error(`"${policy.name}" is disabled.`);
  if (conversation.sla_policy_id === policy.id) return `Already on "${policy.name}"`;
  await updateConversation(env, ctx, { sla_policy_id: policy.id });
  return `Applied "${policy.name}"`;
}

async function createTicket(env, ctx, config) {
  const conversation = requireConversation(ctx);
  const type = TICKET_TYPE_LABELS[config.type] ? config.type : "customer";
  const contactName = ctx.contact?.name || conversation.contact_name || "a customer";
  const ticket = must(
    await env.sb
      .from("tickets")
      .insert({
        conversation_id: conversation.id,
        type,
        title: (conversation.subject || `Conversation with ${contactName}`).slice(0, 200),
        description: String(ctx.message?.body ?? "").slice(0, 2000),
        project_id: env.projectId,
      })
      .select("id, title")
      .single(),
  );
  must(
    await env.sb
      .from("ticket_links")
      .upsert({ ticket_id: ticket.id, conversation_id: conversation.id }, { onConflict: "ticket_id,conversation_id" }),
  );
  return `Created ${TICKET_TYPE_LABELS[type]} ticket "${ticket.title}"`;
}

// Public http(s) only: the URL guard checks the host, then pinnedFetch re-checks every address at connect time (no DNS rebinding).
async function sendWebhook(env, ctx, config) {
  const method = ["POST", "GET", "PUT"].includes(config.method) ? config.method : "POST";
  let url;
  try {
    url = await assertPublicUrl(String(config.url ?? "").trim());
  } catch (e) {
    throw new Error(`Webhook URL refused: ${e?.message || "it isn't allowed."}`);
  }

  const conversation = ctx.conversation;
  const payload = {
    event: env.trigger,
    sentAt: new Date().toISOString(),
    workflow: { id: env.workflow.id, name: env.workflow.name },
    conversation: conversation
      ? {
          id: conversation.id,
          subject: conversation.subject,
          status: conversation.status,
          priority: conversation.priority,
          channel: conversation.channel,
          assigneeId: conversation.assignee_id,
          contact: ctx.contact ? { id: ctx.contact.id, name: ctx.contact.name, email: ctx.contact.email } : null,
        }
      : null,
  };
  let response;
  try {
    response = await pinnedFetch(url, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      ...(method === "GET"
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }),
    });
  } catch (e) {
    if (isPrivateAddressError(e)) throw new Error("Webhooks can only call public addresses.");
    throw e;
  }
  // The body is never read; cancelling it frees the connection.
  await response.body?.cancel().catch(() => {});
  if (!response.ok) throw new Error(`${url.host} answered ${response.status}.`);
  return `${method} ${url.host} answered ${response.status}`;
}

async function updateContact(env, ctx, config) {
  const contact = ctx.contact;
  if (!contact) throw new Error("This conversation has no contact to update.");
  const attribute = String(config.attribute ?? "").trim();
  if (!attribute) throw new Error("This step has no attribute to set.");
  const key = attribute.toLowerCase();
  const value = String(config.value ?? "");
  const meta = contact.metadata && typeof contact.metadata === "object" ? contact.metadata : {};
  let patch;
  if (CONTACT_COLUMNS.includes(key)) {
    patch = { [key]: value || (key === "name" ? "Unknown" : null) };
  } else if (CONTACT_META.includes(key)) {
    patch = { metadata: { ...meta, [key]: value } };
  } else {
    // Anything else is a custom attribute, where the Customers screens keep plan, seats and the like.
    patch = { metadata: { ...meta, custom: { ...(meta.custom || {}), [key]: value } } };
  }
  must(await env.sb.from("contacts").update(patch).eq("id", contact.id));
  Object.assign(contact, patch);
  return `Set ${attribute} to "${value}"`;
}

const ACTIONS = {
  reply: (env, ctx, config) => postMessage(env, ctx, config.message, "comment").then(() => "Replied to the customer"),
  note: (env, ctx, config) => postMessage(env, ctx, config.note, "note").then(() => "Added a note"),
  assign,
  "tag.add": addTag,
  "tag.remove": removeTag,
  priority: setPriority,
  snooze,
  close,
  sla: applySla,
  ticket: createTicket,
  webhook: sendWebhook,
  "contact.update": updateContact,
};

export async function runAction(step, ctx, env) {
  const handler = ACTIONS[step.type];
  if (!handler) throw new Error(`Unknown action (${step.type}).`);
  return handler(env, ctx, step.config || {});
}
