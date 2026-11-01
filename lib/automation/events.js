import "server-only";
import { workflowSteps } from "@/lib/workflows/steps";
import { automationClient, baseClient, isAutomationConfigured } from "./client";
import { must, sameName } from "./context";
import { startWorkflow } from "./executor";

// Drains comms.automation_events (fed by DB triggers on messages, conversations, conversation_tags and tickets):
// each event runs the project's live workflows on that trigger, and a new conversation is then routed if still unassigned.

// Events caused by this many automated changes in a row are dropped, which ends any workflow loop.
const MAX_DEPTH = 3;

const TICKET_STATE_LABELS = {
  submitted: "Submitted",
  in_progress: "In progress",
  waiting: "Waiting",
  resolved: "Resolved",
};

// The builder's "Changes to" options: back to Open from Closed or Snoozed reads as Reopened.
function stateChange(from, to) {
  return to === "Open" && (from === "Closed" || from === "Snoozed") ? "Reopened" : to;
}

// What Run History shows as the run's context, and what trigger options match against.
async function eventDetail(sb, event) {
  const p = event.payload || {};
  switch (event.kind) {
    case "tagged": {
      const tag = must(await sb.from("tags").select("name").eq("id", p.tag_id).maybeSingle());
      return { tag: tag?.name ?? "" };
    }
    case "assigned": {
      const mate = must(await sb.from("teammates").select("name").eq("id", p.assignee_id).maybeSingle());
      return { assignee: mate?.name ?? "" };
    }
    case "state_changed":
      return { from: p.from, to: stateChange(p.from, p.to) };
    case "ticket_created":
      return { ticketType: p.type };
    case "ticket_state_changed":
      return { from: TICKET_STATE_LABELS[p.from] ?? p.from, to: TICKET_STATE_LABELS[p.to] ?? p.to };
    default:
      return {};
  }
}

function triggerMatches(workflow, event, detail) {
  const config = workflowSteps(workflow)[0]?.config || {};
  const any = (value) => !value || value === "Any state";
  switch (event.kind) {
    case "tagged": {
      const wanted = String(config.tag ?? "").trim().replace(/^#/, "");
      return !wanted || sameName(wanted, detail.tag);
    }
    case "state_changed":
    case "ticket_state_changed":
      return any(config.to) || config.to === detail.to;
    default:
      return true;
  }
}

async function markEvent(event, status, error) {
  must(
    await baseClient()
      .from("automation_events")
      .update({ status, error: error || null, processed_at: new Date().toISOString() })
      .eq("id", event.id),
  );
}

async function processEvent(event) {
  const sb = baseClient();
  if (event.depth >= MAX_DEPTH) {
    return markEvent(event, "done", `Not run: ${MAX_DEPTH} automated changes in a row (loop guard).`);
  }
  const errors = [];
  const workflows =
    must(
      await sb
        .from("workflows")
        .select("*")
        .eq("project_id", event.project_id)
        .eq("trigger", event.kind)
        .eq("status", "live")
        .is("deleted_at", null)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
    ) || [];
  const detail = workflows.length ? await eventDetail(sb, event) : {};

  for (const workflow of workflows) {
    // A workflow never re-triggers itself.
    if (workflow.id === event.origin_workflow_id || !triggerMatches(workflow, event, detail)) continue;
    try {
      await startWorkflow(workflow, {
        conversationId: event.conversation_id,
        messageId: event.payload?.message_id ?? null,
        depth: event.depth,
        dedupeKey: `event:${event.id}`,
        context: detail,
      });
    } catch (e) {
      errors.push(`${workflow.name}: ${e?.message ?? e}`);
    }
  }

  // Routing rules pick up whatever the workflows left unassigned (assign_next ignores assigned conversations).
  if (event.kind === "created" && event.conversation_id) {
    const { error } = await automationClient({ depth: event.depth + 1 }).rpc("assign_next", {
      p_conversation_id: event.conversation_id,
    });
    if (error) errors.push(`Routing: ${error.message}`);
  }

  return markEvent(event, errors.length ? "failed" : "done", errors.join("; "));
}

// Claims and runs queued events, oldest first; a conversation's events run in order, conversations in parallel.
export async function drainEvents({ conversationId = null, limit = 50, rounds = 5 } = {}) {
  let processed = 0;
  for (let round = 0; round < rounds; round += 1) {
    const events =
      must(await baseClient().rpc("automation_claim_events", { p_limit: limit, p_conversation: conversationId })) || [];
    if (!events.length) break;
    const byConversation = new Map();
    for (const event of [...events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))) {
      const key = event.conversation_id ?? event.id;
      if (!byConversation.has(key)) byConversation.set(key, []);
      byConversation.get(key).push(event);
    }
    await Promise.all(
      [...byConversation.values()].map(async (list) => {
        for (const event of list) {
          try {
            await processEvent(event);
          } catch (e) {
            console.error("[automation.event]", event.id, e?.message ?? e);
            await markEvent(event, "failed", e?.message ?? String(e)).catch(() => {});
          }
        }
      }),
    );
    processed += events.length;
  }
  return processed;
}

// Called after a widget write so the customer's own events (new conversation, reply) run without waiting for the tick.
export async function runConversationAutomation(conversationId) {
  if (!conversationId || !isAutomationConfigured()) return;
  try {
    await drainEvents({ conversationId, limit: 20 });
  } catch (e) {
    console.error("[automation.conversation]", conversationId, e?.message ?? e);
  }
}
