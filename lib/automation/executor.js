import "server-only";
import { workflowSteps } from "@/lib/workflows/steps";
import { unavailableReason } from "@/lib/workflows/availability";
import { automationClient, baseClient } from "./client";
import { loadContext, must } from "./context";
import { evaluateCondition } from "./conditions";
import { runAction } from "./actions";
import { durationLabel, durationMs } from "./time";

// Runs a workflow's steps in order and records one comms.workflow_runs row per run (Run History reads it).
// Failing leading conditions mean the workflow doesn't apply, so nothing is recorded; past the first action a failed condition
// stops the run, a failed action fails it, unavailable actions are logged as skipped, and a wait parks it for the tick.

const QUIET_TRIGGERS = new Set(["customer_unresponsive", "teammate_unresponsive"]);

const asObject = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

function entry(step, label, status, startedAt, error) {
  return {
    kind: step.kind,
    type: step.type,
    label: label ?? "",
    status,
    durationMs: Date.now() - startedAt,
    ...(error ? { error } : {}),
  };
}

async function saveRun(sb, id, patch) {
  must(await sb.from("workflow_runs").update(patch).eq("id", id));
}

async function finish(env, run, log, { priorMs, passStart, failure }) {
  const actionRan = log.some((s) => s.kind === "action" && s.status === "ok");
  const status = failure ? "failed" : actionRan ? "ok" : "skipped";
  await saveRun(env.sb, run.id, {
    status,
    resume_at: null,
    metadata: env.runMeta,
    output: {
      steps: log,
      durationMs: priorMs + (Date.now() - passStart),
      finishedAt: new Date().toISOString(),
      ...(failure ? { error: failure } : {}),
    },
  });
  return status;
}

async function continueRun({ run, steps, index, ctx, env, log, priorMs }) {
  const passStart = Date.now();
  let failure = null;
  for (let i = index; i < steps.length; i += 1) {
    const step = steps[i];
    const startedAt = Date.now();
    try {
      if (step.kind === "condition") {
        const { met, label } = await evaluateCondition(step, ctx, env);
        if (!met) {
          log.push(entry(step, `Stopped: ${label} — not met`, "skipped", startedAt));
          break;
        }
        log.push(entry(step, label, "ok", startedAt));
        continue;
      }
      if (step.kind !== "action") continue;

      const reason = unavailableReason(step.type);
      if (reason) {
        log.push(entry(step, null, "skipped", startedAt, reason));
        continue;
      }

      if (step.type === "wait") {
        const ms = durationMs(step.config?.amount, step.config?.unit);
        if (!ms) throw new Error("Set how long to wait.");
        log.push(entry(step, `Waiting ${durationLabel(step.config.amount, step.config.unit)}`, "running", startedAt));
        env.runMeta.resume_step = i + 1;
        await saveRun(env.sb, run.id, {
          status: "running",
          resume_at: new Date(Date.now() + ms).toISOString(),
          metadata: env.runMeta,
          output: { steps: log, durationMs: priorMs + (Date.now() - passStart) },
        });
        return "running";
      }

      log.push(entry(step, await runAction(step, ctx, env), "ok", startedAt));
    } catch (e) {
      failure = e?.message || "This step failed.";
      log.push(entry(step, null, "failed", startedAt, failure));
      break;
    }
  }
  return finish(env, run, log, { priorMs, passStart, failure });
}

// job: { conversationId, messageId, depth, dedupeKey, context (Run History's context rows), meta (engine bookkeeping) }
export async function startWorkflow(workflow, job) {
  const sb = automationClient({ depth: job.depth + 1, workflowId: workflow.id });
  const ctx = await loadContext(sb, { projectId: workflow.project_id, conversationId: job.conversationId, messageId: job.messageId });
  if (job.conversationId && !ctx.conversation) return null;

  const steps = workflowSteps(workflow);
  const env = {
    sb,
    workflow,
    projectId: workflow.project_id,
    trigger: workflow.trigger,
    runMeta: { depth: job.depth, message_id: job.messageId ?? null, ...job.meta },
  };

  const log = [];
  let index = 1;
  for (; index < steps.length && steps[index].kind === "condition"; index += 1) {
    const startedAt = Date.now();
    const { met, label } = await evaluateCondition(steps[index], ctx, env);
    if (!met) return null;
    log.push(entry(steps[index], label, "ok", startedAt));
  }

  const { data: run, error } = await sb
    .from("workflow_runs")
    .insert({
      workflow_id: workflow.id,
      conversation_id: job.conversationId ?? null,
      project_id: workflow.project_id,
      status: "running",
      input: {
        trigger: workflow.trigger,
        ...(ctx.conversation
          ? { conversation: ctx.conversation.subject || "No subject", channel: ctx.conversation.channel }
          : {}),
        ...job.context,
      },
      output: { steps: log },
      metadata: env.runMeta,
      dedupe_key: job.dedupeKey,
    })
    .select("*")
    .single();
  // A run with this dedupe key exists: the workflow already ran for this event or quiet period.
  if (error?.code === "23505") return null;
  if (error) throw new Error(error.message);

  return continueRun({ run, steps, index, ctx, env, log, priorMs: 0 });
}

// A quiet-period run stops once that silence breaks: the customer wrote back, or a person on the team replied.
async function silenceBroken(sb, run, trigger) {
  let query = sb
    .from("messages")
    .select("id")
    .eq("conversation_id", run.conversation_id)
    .eq("message_type", "comment")
    .is("deleted_at", null)
    .gt("created_at", run.created_at)
    .limit(1);
  query =
    trigger === "customer_unresponsive"
      ? query.eq("author_role", "customer")
      : query.neq("author_role", "customer").is("metadata->automation", null);
  return (must(await query) || []).length > 0;
}

// Picks a parked run back up after its wait (the caller has already claimed it by clearing resume_at).
export async function resumeRun(run) {
  const meta = asObject(run.metadata);
  const output = asObject(run.output);
  const sb = automationClient({ depth: (Number(meta.depth) || 0) + 1, workflowId: run.workflow_id });
  const workflow = must(await baseClient().from("workflows").select("*").eq("id", run.workflow_id).maybeSingle());
  const log = (Array.isArray(output.steps) ? output.steps : []).map((s) =>
    s.status === "running" ? { ...s, label: String(s.label || "").replace(/^Waiting/, "Waited"), status: "ok" } : s,
  );
  const env = { sb, workflow, projectId: run.project_id, trigger: run.input?.trigger, runMeta: meta };
  const priorMs = Number(output.durationMs) || 0;
  const stop = (label) => {
    log.push({ type: "stop", label, status: "skipped", durationMs: 0 });
    return finish(env, run, log, { priorMs, passStart: Date.now(), failure: null });
  };

  if (!workflow || workflow.deleted_at || workflow.status !== "live" || workflow.project_id !== run.project_id) {
    return stop("Stopped: the workflow was paused before the wait ended");
  }
  if (QUIET_TRIGGERS.has(workflow.trigger) && (await silenceBroken(sb, run, workflow.trigger))) {
    return stop(
      workflow.trigger === "customer_unresponsive"
        ? "Stopped: the customer replied during the wait"
        : "Stopped: a teammate replied during the wait",
    );
  }
  const ctx = await loadContext(sb, { projectId: run.project_id, conversationId: run.conversation_id, messageId: meta.message_id });
  if (run.conversation_id && !ctx.conversation) return stop("Stopped: the conversation was deleted");

  return continueRun({
    run,
    steps: workflowSteps(workflow),
    index: Number(meta.resume_step) || 1,
    ctx,
    env,
    log,
    priorMs,
  });
}
