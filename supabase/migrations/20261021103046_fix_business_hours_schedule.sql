-- Fix business-hours schedules
--
-- One-time data fix. The two seeded comms.business_hours rows (metadata.seed =
-- demo-dense-usa-v1, written 2026-09-14 by a seed that is in no repo) store each
-- day as an array, {"mon": ["09:00", "17:00"]}. comms.sla_due_at() and
-- comms.is_team_open() read {"mon": {"open": "09:00", "close": "17:00",
-- "closed": false}}, so every day reads as closed: sla_due_at walks its
-- 1500-day guard (open conversations are due ~2030-10-23 and stay "on_track"),
-- and is_team_open reports the default hours as closed.
--
-- Owns no schema. It rewrites only array-shaped day values (object-shaped days
-- are kept as they are), then re-derives first_response_due_at and
-- resolution_due_at for open conversations whose SLA policy uses a rewritten
-- row: comms.sla_due_at() from the conversation's created_at, which is also the
-- start the trigger's "approaching" window measures from. The update fires
-- conversations_apply_sla, which re-derives sla_state, and the business_hours
-- audit trigger, which logs the rewrite. Re-running is a no-op: once no day is
-- an array, nothing is selected.
--
-- Live effect (conversion previewed read-only on the live rows, recompute
-- replayed on a copy of them, 2026-10-21): 2 business_hours rows and 2
-- audit_log rows; 91 open or snoozed conversations get due dates inside
-- Mon-Fri 09:00-17:00 America/New_York, and all 91 then read as breached
-- (their windows closed between August and 2026-10-20).
--
-- Depends on (owned elsewhere, all earlier versions):
--   comms.business_hours, comms.sla_due_at(), conversations_apply_sla
--                                   20261021103039_adopt_business_hours_and_sla
--   comms.sla_policies              20261018184858_adopt_automation

-- @up

do $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(h.id), '{}')
    into v_ids
    from comms.business_hours h
   where jsonb_typeof(h.schedule) = 'object'
     and exists (select 1 from jsonb_each(h.schedule) d where jsonb_typeof(d.value) = 'array');

  if cardinality(v_ids) = 0 then
    return;
  end if;

  -- ["09:00", "17:00"] becomes {"open": "09:00", "close": "17:00", "closed": false}; a short array reads as closed.
  update comms.business_hours h
     set schedule = (
       select jsonb_object_agg(
                d.key,
                case when jsonb_typeof(d.value) = 'array'
                  then jsonb_build_object('open', d.value ->> 0, 'close', d.value ->> 1,
                                          'closed', d.value ->> 0 is null or d.value ->> 1 is null)
                  else d.value end)
         from jsonb_each(h.schedule) d)
   where h.id = any (v_ids);

  update comms.conversations c
     set first_response_due_at = comms.sla_due_at(c.created_at, p.first_response_mins, p.business_hours_id),
         resolution_due_at = comms.sla_due_at(c.created_at, p.resolution_mins, p.business_hours_id)
    from comms.sla_policies p
   where p.id = c.sla_policy_id
     and p.business_hours_id = any (v_ids)
     and c.deleted_at is null
     and c.status <> 'Closed';
end;
$$;

-- @down

-- Forget-only on purpose: putting the array shape back would only re-break the
-- SLA clock, so rolling back drops the ledger row and nothing else.
select 1;
