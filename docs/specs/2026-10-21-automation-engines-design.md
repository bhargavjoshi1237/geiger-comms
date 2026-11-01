# Automation engines — runtime design

> **Status:** implemented 2026-10-21, not live until `20261021105041_automation_engine` is pushed and a scheduler calls the tick.
> **Covers:** the workflow executor, auto-assignment, the SLA clock, snooze wake and reopen-on-reply
> (gap analysis C14, C15, C19, C25, C35, C36).

## 1. What was already live

The lost September migrations (now adopted in `20261021103039_adopt_business_hours_and_sla` and
`20261021103040_adopt_routing_engine`) left a working SQL core: `conversations_apply_sla` stamps a policy and
due times on insert and on reassignment, `sla_due_at` counts business minutes over a schedule, and
`assign_next` / `is_team_open` implement round robin, balanced and direct assignment with an away-outside-hours
skip. Nothing called `assign_next`, nothing re-derived `sla_state` as time passed, nothing executed workflows,
and nothing woke snoozed conversations. No `pg_cron` or `pg_net` is installed, so the database cannot reach the
network or wake itself.

## 2. Decisions

| Concern | Where it runs | Why |
|---|---|---|
| Reopen on customer reply | DB trigger `messages_automation` | Synchronous state rule; every write path (widget, inbox, seeds) gets it. |
| SLA due times, restart, pause on snooze | DB trigger `conversations_apply_sla` (superseded) | Already a trigger; workflow "Apply SLA" just sets `sla_policy_id`. |
| Breach / approaching as time passes | `comms.sla_refresh()`, called by the tick | Needs time; one set-based update, the trigger recomputes the state. |
| Workflows | Node, `lib/automation` (service role) | Webhooks need the network; waits and quiet-period triggers need time. |
| Routing | `comms.assign_next` via the executor, after a new conversation's workflows | Workflows may assign or tag first; routing takes what's left. |
| Snooze wake, wait resume, quiet-period triggers | The tick | Time-driven. |

### Event feed

Workflow triggers become rows in `comms.automation_events`, written by `SECURITY DEFINER` triggers (so the
inbox's anon-key writes still enqueue) and only when the project has a live workflow on that trigger, or
routing rules for `created`:

| Trigger | Fed by |
|---|---|
| `created` / `replied` | customer comment on `comms.messages` (first comment in the thread = `created`) |
| `teammate_replied` | agent comment not written by a workflow |
| `assigned`, `state_changed` | `assignee_id` / `status` change on `comms.conversations` |
| `tagged` | insert on `comms.conversation_tags` |
| `ticket_created`, `ticket_state_changed` | insert / `state` change on `comms.tickets` |
| `customer_unresponsive`, `teammate_unresponsive` | the tick scans quiet open conversations (`waiting_on_us`, last human message) |

The queue drains in two places: the widget routes call `runConversationAutomation()` in `after()`, so a
customer's own events run seconds after they write; everything else (inbox actions, simulated channels) runs
on the next tick. `automation_claim_events` serializes claims and never hands one conversation's events to
two workers, so they run in order.

### Executor rules

- Steps run in order (`lib/workflows/steps.js#workflowSteps`). Failing leading conditions mean the workflow
  doesn't apply and nothing is recorded; after that a failed condition stops the run, a failed action fails
  it, and a `wait` parks it (`workflow_runs.resume_at`) until the tick resumes it.
- One run per workflow per event / quiet period: `workflow_runs.dedupe_key` is unique per workflow, and the
  row is inserted before any action runs, so a retried event never repeats a reply.
- Loop guard: every executor write carries `x-comms-automation-depth` / `-workflow` headers, which the
  triggers read from PostgREST's `request.headers`, honoured only for the service role so a browser client
  can't forge them. A workflow never re-triggers itself, and events three automated changes deep are dropped.
  The `metadata.automation` marker on a workflow's own message is guarded the same way: the
  `messages_automation_guard` trigger (`20261021114846_automation_write_hardening`) strips it from any other
  role's insert and keeps the stored value on their updates, so a teammate can't hide a reply from
  `teammate_replied` or the quiet-period triggers.
- Unavailable actions are listed in `lib/workflows/availability.js`; the builder marks them and runs log them
  as skipped with the same reason. Today: `ai_answer` (no AI agent) and `survey` (the Messenger already asks
  for a rating on close).
- Workflow replies go through `comms.post_automated_message`: signed with the project's name, broadcast like
  `post_message`, but never counted as the first response and never clearing `waiting_on_us`.
- Quiet-period triggers only consider conversations that crossed the threshold in the last 24 hours, so
  setting one live doesn't sweep old threads; a waiting run stops if the silence breaks.
- Snooze presets and "tomorrow 9am" use the project's default business-hours timezone.

## 3. Running it

`GET|POST /api/automation/tick` with `Authorization: Bearer $CRON_SECRET` (≥ 16 chars, server-only). Call it
about once a minute from any scheduler — Vercel Cron sends exactly this header. Locally:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/automation/tick
```

The response counts what each phase did (`woke`, `slaRefreshed`, `resumed`, `quietRuns`, `events`) and names
any phase that failed in `errors`.

## 4. Known limits

- Pause-on-snooze shifts due times by wall-clock time, not business minutes.
- Next-response targets are stored but not tracked.
- Inbox-originated events wait for the tick; without a scheduler they never run.
- Disabled business hours still drive SLA due times (`sla_due_at` ignores `enabled`).
