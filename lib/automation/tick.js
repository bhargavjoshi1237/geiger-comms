import "server-only";
import { selectAll } from "@/lib/supabase/comms";
import { workflowSteps } from "@/lib/workflows/steps";
import { baseClient } from "./client";
import { must } from "./context";
import { drainEvents } from "./events";
import { resumeRun, startWorkflow } from "./executor";
import { durationMs } from "./time";

// One pass of the time-driven engine, run by POST/GET /api/automation/tick: wake snoozed conversations, refresh SLA states,
// resume runs whose wait is over, start quiet-period workflows, then drain the event queue (inbox-made events land here).

// The waiting_on_us value that means the conversation has gone quiet on that side.
const QUIET_TRIGGERS = { customer_unresponsive: false, teammate_unresponsive: true };
// A conversation that crossed a quiet threshold longer ago than this is left alone, so a newly live workflow doesn't sweep old threads.
const QUIET_WINDOW_MS = 86_400_000;

const iso = (ms) => new Date(ms).toISOString();

async function wakeSnoozed() {
  const rows = must(
    await baseClient()
      .from("conversations")
      .update({ status: "Open", snoozed_until: null })
      .eq("status", "Snoozed")
      .lte("snoozed_until", new Date().toISOString())
      .is("deleted_at", null)
      .select("id"),
  );
  return rows?.length ?? 0;
}

async function refreshSla() {
  return must(await baseClient().rpc("sla_refresh")) ?? 0;
}

async function resumeWaitingRuns(limit = 50) {
  const sb = baseClient();
  const due =
    must(
      await sb
        .from("workflow_runs")
        .select("id, resume_at")
        .not("resume_at", "is", null)
        .lte("resume_at", new Date().toISOString())
        .order("resume_at", { ascending: true })
        .limit(limit),
    ) || [];
  let resumed = 0;
  for (const { id, resume_at: resumeAt } of due) {
    // Clearing resume_at is the claim, so only one tick picks a run back up.
    const claimed = must(
      await sb.from("workflow_runs").update({ resume_at: null }).eq("id", id).eq("resume_at", resumeAt).select("*"),
    );
    const run = claimed?.[0];
    if (!run) continue;
    try {
      await resumeRun(run);
      resumed += 1;
    } catch (e) {
      const error = e?.message ?? String(e);
      console.error("[automation.resume]", id, error);
      const output = run.output && typeof run.output === "object" ? run.output : {};
      await sb
        .from("workflow_runs")
        .update({ status: "failed", output: { ...output, error, finishedAt: new Date().toISOString() } })
        .eq("id", id);
    }
  }
  return resumed;
}

async function runQuietTriggers() {
  const sb = baseClient();
  const workflows =
    must(
      await sb
        .from("workflows")
        .select("*")
        .in("trigger", Object.keys(QUIET_TRIGGERS))
        .eq("status", "live")
        .is("deleted_at", null),
    ) || [];
  let started = 0;

  for (const workflow of workflows) {
    const config = workflowSteps(workflow)[0]?.config || {};
    const ms = durationMs(config.amount, config.unit);
    if (!ms || !workflow.project_id) continue;
    const cutoff = Date.now() - ms;
    const floor = cutoff - QUIET_WINDOW_MS;

    const candidates =
      must(
        await sb
          .from("conversations")
          .select("id")
          .eq("project_id", workflow.project_id)
          .eq("status", "Open")
          .eq("waiting_on_us", QUIET_TRIGGERS[workflow.trigger])
          .is("deleted_at", null)
          .lte("last_message_at", iso(cutoff))
          .gt("last_message_at", iso(floor))
          .limit(200),
      ) || [];
    if (!candidates.length) continue;
    const ids = candidates.map((c) => c.id);

    // Quiet since = the last message a person wrote; a workflow's own replies don't restart the silence. Paged past the 1,000-row cap.
    const messages =
      must(
        await selectAll(() =>
          sb
            .from("messages")
            .select("conversation_id, created_at, metadata")
            .in("conversation_id", ids)
            .eq("message_type", "comment")
            .is("deleted_at", null)
            .gt("created_at", iso(floor))
            .order("created_at", { ascending: false })
            .order("id", { ascending: true }),
        ),
      ) || [];
    const quietSince = new Map();
    for (const m of messages) {
      if (!quietSince.has(m.conversation_id) && !m.metadata?.automation) quietSince.set(m.conversation_id, m.created_at);
    }

    const due = ids
      .map((id) => ({ id, since: quietSince.get(id) }))
      .filter(({ since }) => since && Date.parse(since) <= cutoff)
      .map((c) => ({ ...c, key: `quiet:${iso(Date.parse(c.since))}` }));
    if (!due.length) continue;
    const ran = must(
      await sb
        .from("workflow_runs")
        .select("dedupe_key")
        .eq("workflow_id", workflow.id)
        .in("dedupe_key", due.map((c) => c.key)),
    );
    const done = new Set((ran || []).map((r) => r.dedupe_key));

    for (const { id, since, key } of due) {
      if (done.has(key)) continue;
      try {
        if (await startWorkflow(workflow, { conversationId: id, depth: 0, dedupeKey: key, context: { quietSince: since } })) {
          started += 1;
        }
      } catch (e) {
        console.error("[automation.quiet]", workflow.id, id, e?.message ?? e);
      }
    }
  }
  return started;
}

export async function runTick() {
  const startedAt = Date.now();
  const result = { errors: [] };
  const tasks = [
    ["woke", wakeSnoozed],
    ["slaRefreshed", refreshSla],
    ["resumed", resumeWaitingRuns],
    ["quietRuns", runQuietTriggers],
    ["events", () => drainEvents({ limit: 100 })],
  ];
  for (const [key, task] of tasks) {
    try {
      result[key] = await task();
    } catch (e) {
      console.error(`[automation.tick] ${key}`, e?.message ?? e);
      result[key] = null;
      result.errors.push(key);
    }
  }
  result.durationMs = Date.now() - startedAt;
  return result;
}
