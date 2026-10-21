-- Automation engine
--
-- Turns on the engines behind the Automation screens; the runtime is
-- docs/specs/2026-10-21-automation-engines-design.md. DB triggers queue every
-- event a workflow can start on, the Node executor (lib/automation) drains the
-- queue through the service-role RPCs below, and the SLA trigger and routing
-- learn what workflows and routing rules need.
--
-- Owns (new):
--   comms.automation_events                     the event queue (table, indexes, RLS)
--   comms.workflow_runs.resume_at, dedupe_key   wait-step resume time; one run per workflow
--                                               per event or quiet period (+ indexes)
--   comms.automation_enqueue(text, uuid, uuid, jsonb) and the triggers that call it:
--     messages_automation           created / replied / teammate_replied, and a customer
--                                   reply reopens a closed or snoozed conversation
--     conversations_automation      assigned / state_changed
--     conversation_tags_automation  tagged
--     tickets_automation            ticket_created / ticket_state_changed
--   comms.automation_claim_events(integer, uuid)              executor's queue claim
--   comms.post_automated_message(uuid, text, text, uuid, text) a workflow's reply or note
--   comms.sla_refresh()                                        breach/approaching sweep
--   comms.hours_open(uuid, uuid, timestamptz)                  project-scoped office hours
--   comms.routing_pick(uuid, text, uuid, uuid, uuid)           next teammate for a strategy
--
-- Supersedes (as adopted from live in 20261021103039_adopt_business_hours_and_sla and
-- 20261021103040_adopt_routing_engine; this file becomes the owner of these three functions):
--   comms.assign_next(uuid)          rules now apply when their match holds (the live body
--                                    only ever used rules with an empty match), a rule with
--                                    nobody available hands over to the next match, default
--                                    office hours are scoped to the conversation's project,
--                                    an assigned conversation is left alone, and only
--                                    service_role may call it (live, any signed-in user could
--                                    assign any project's conversation through it)
--   comms.is_team_open(uuid, timestamptz)
--                                    reads within the team's own project, falling back to that
--                                    project's default hours; live, a null team read team-less
--                                    hours of every project. Same signature and security mode.
--   comms.conversations_apply_sla()  a changed sla_policy_id restarts the clock on that policy
--                                    (workflow "Apply SLA"); reassigning or reopening restarts
--                                    it on the current policy instead of re-picking by scope;
--                                    snoozing pauses the clock and waking pushes the due times
--                                    back by the time spent paused (metadata.sla_paused_at)
-- The down section restores all three previous bodies and grants and drops everything new.
--
-- Depends on (owned elsewhere, all earlier versions):
--   comms.can_access_project(uuid)               20260821182908_adopt_rbac
--   comms.workflows, workflow_runs, routing_rules,
--     sla_policies                               20261018184858_adopt_automation
--   comms.business_hours, comms.sla_due_at(), the conversations_apply_sla trigger
--                                                20261021103039_adopt_business_hours_and_sla
--   comms.conversations, messages, conversation_tags, tickets, teammates, project_members
--                                                earlier comms / inbox / rbac migrations

-- @up

create extension if not exists pgcrypto;
create schema if not exists comms;
grant usage on schema comms to anon, authenticated, service_role;

create or replace function comms.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ---- event queue --------------------------------------------------------------

create table if not exists comms.automation_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  conversation_id uuid references comms.conversations(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  origin_workflow_id uuid,
  depth integer not null default 0,
  status text not null default 'pending',
  attempts integer not null default 0,
  claimed_at timestamptz,
  processed_at timestamptz,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint automation_events_status_check
    check (status = any (array['pending', 'processing', 'done', 'failed']))
);

create index if not exists automation_events_queue_idx
  on comms.automation_events (status, created_at) where status <> 'done';
create index if not exists automation_events_conversation_idx
  on comms.automation_events (conversation_id, created_at desc);

drop trigger if exists automation_events_touch_updated_at on comms.automation_events;
create trigger automation_events_touch_updated_at
before update on comms.automation_events
for each row execute function comms.touch_updated_at();

revoke all on comms.automation_events from anon, authenticated;
grant select on comms.automation_events to authenticated;
grant select, insert, update, delete on comms.automation_events to service_role;

alter table comms.automation_events enable row level security;
drop policy if exists automation_events_project_read on comms.automation_events;
create policy automation_events_project_read on comms.automation_events for select to authenticated
  using (comms.can_access_project(project_id));

-- ---- workflow runs: wait-step resume + one run per workflow per event ---------------

alter table comms.workflow_runs add column if not exists resume_at timestamptz;
alter table comms.workflow_runs add column if not exists dedupe_key text;

create index if not exists workflow_runs_resume_idx
  on comms.workflow_runs (resume_at) where resume_at is not null;
create unique index if not exists workflow_runs_dedupe_idx
  on comms.workflow_runs (workflow_id, dedupe_key) where dedupe_key is not null;

-- ---- enqueue + the triggers that feed it -------------------------------------------

create or replace function comms.automation_enqueue(p_kind text, p_project uuid, p_conversation uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_headers jsonb;
  v_origin  uuid;
  v_depth   integer := 0;
begin
  if p_project is null then
    return;
  end if;

  -- Queue only what something listens for: a live workflow on this trigger, or routing for a new conversation.
  if not exists (
    select 1 from comms.workflows w
     where w.project_id = p_project and w.trigger = p_kind and w.status = 'live' and w.deleted_at is null
  ) and not (
    p_kind = 'created' and exists (
      select 1 from comms.routing_rules r
       where r.project_id = p_project and r.enabled and r.deleted_at is null
    )
  ) then
    return;
  end if;

  -- The executor stamps its writes with origin headers (PostgREST's request.headers); only the service role's count, so a browser client can't forge them.
  if coalesce(auth.role(), '') = 'service_role' then
    begin
      v_headers := nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb;
      v_origin := nullif(v_headers ->> 'x-comms-automation-workflow', '')::uuid;
      v_depth := greatest(0, coalesce(nullif(v_headers ->> 'x-comms-automation-depth', '')::integer, 0));
    exception when others then
      v_origin := null;
      v_depth := 0;
    end;
  end if;

  insert into comms.automation_events (project_id, conversation_id, kind, payload, origin_workflow_id, depth, created_by)
  values (p_project, p_conversation, p_kind, coalesce(p_payload, '{}'::jsonb), v_origin, v_depth, auth.uid());
exception when others then
  -- Best-effort: never abort the write that raised the event.
  null;
end;
$$;
revoke all on function comms.automation_enqueue(text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function comms.automation_enqueue(text, uuid, uuid, jsonb) to service_role;

-- created = the customer's message opens the thread, replied = any later customer message, teammate_replied = a person's reply.
create or replace function comms.messages_automation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_project uuid;
  v_status  text;
  v_first   boolean;
begin
  if new.message_type <> 'comment' or new.deleted_at is not null then
    return null;
  end if;

  select c.project_id, c.status
    into v_project, v_status
    from comms.conversations c
   where c.id = new.conversation_id
     and c.deleted_at is null;
  if not found then
    return null;
  end if;

  if new.author_role = 'customer' then
    -- A customer reply wakes a snoozed conversation and reopens a closed one.
    if v_status in ('Snoozed', 'Closed') then
      update comms.conversations c
         set status = 'Open', snoozed_until = null, closed_at = null
       where c.id = new.conversation_id;
    end if;
    v_first := not exists (
      select 1 from comms.messages m
       where m.conversation_id = new.conversation_id
         and m.id <> new.id
         and m.message_type = 'comment'
         and m.deleted_at is null
         and m.created_at <= new.created_at
    );
    perform comms.automation_enqueue(
      case when v_first then 'created' else 'replied' end,
      v_project, new.conversation_id, jsonb_build_object('message_id', new.id)
    );
  elsif new.author_role in ('agent', 'ai_agent') and not (new.metadata ? 'automation') then
    perform comms.automation_enqueue(
      'teammate_replied', v_project, new.conversation_id,
      jsonb_build_object('message_id', new.id, 'author_id', new.author_id)
    );
  end if;
  return null;
exception when others then
  return null;
end;
$$;
revoke all on function comms.messages_automation() from public, anon, authenticated;

drop trigger if exists messages_automation on comms.messages;
create trigger messages_automation
after insert on comms.messages
for each row execute function comms.messages_automation();

create or replace function comms.conversations_automation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.deleted_at is not null then
    return null;
  end if;
  if new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id then
    perform comms.automation_enqueue(
      'assigned', new.project_id, new.id,
      jsonb_build_object('assignee_id', new.assignee_id, 'previous_assignee_id', old.assignee_id)
    );
  end if;
  if new.status is distinct from old.status then
    perform comms.automation_enqueue(
      'state_changed', new.project_id, new.id,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return null;
exception when others then
  return null;
end;
$$;
revoke all on function comms.conversations_automation() from public, anon, authenticated;

drop trigger if exists conversations_automation on comms.conversations;
create trigger conversations_automation
after update of assignee_id, status on comms.conversations
for each row execute function comms.conversations_automation();

create or replace function comms.conversation_tags_automation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_project uuid;
begin
  select c.project_id into v_project
    from comms.conversations c
   where c.id = new.conversation_id
     and c.deleted_at is null;
  perform comms.automation_enqueue(
    'tagged', v_project, new.conversation_id, jsonb_build_object('tag_id', new.tag_id)
  );
  return null;
exception when others then
  return null;
end;
$$;
revoke all on function comms.conversation_tags_automation() from public, anon, authenticated;

drop trigger if exists conversation_tags_automation on comms.conversation_tags;
create trigger conversation_tags_automation
after insert on comms.conversation_tags
for each row execute function comms.conversation_tags_automation();

create or replace function comms.tickets_automation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.deleted_at is not null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform comms.automation_enqueue(
      'ticket_created', new.project_id, new.conversation_id,
      jsonb_build_object('ticket_id', new.id, 'type', new.type, 'state', new.state)
    );
  elsif new.state is distinct from old.state then
    perform comms.automation_enqueue(
      'ticket_state_changed', new.project_id, new.conversation_id,
      jsonb_build_object('ticket_id', new.id, 'from', old.state, 'to', new.state)
    );
  end if;
  return null;
exception when others then
  return null;
end;
$$;
revoke all on function comms.tickets_automation() from public, anon, authenticated;

drop trigger if exists tickets_automation on comms.tickets;
create trigger tickets_automation
after insert or update of state on comms.tickets
for each row execute function comms.tickets_automation();

-- ---- executor RPCs (service role only) ------------------------------------------------

-- Claims serialize, and a conversation with events in flight is skipped, so one conversation's events run in order on one worker.
create or replace function comms.automation_claim_events(p_limit integer default 50, p_conversation uuid default null)
returns setof comms.automation_events
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('comms.automation_claim_events'));
  return query
  with busy as (
    select distinct e.conversation_id
      from comms.automation_events e
     where e.status = 'processing'
       and e.claimed_at > pg_catalog.now() - interval '5 minutes'
       and e.conversation_id is not null
  ), picked as (
    select e.id
      from comms.automation_events e
     where (
             e.status = 'pending'
             or (e.status = 'processing' and e.claimed_at <= pg_catalog.now() - interval '5 minutes')
             or (e.status = 'failed' and e.attempts < 3 and e.updated_at <= pg_catalog.now() - interval '1 minute')
           )
       and (p_conversation is null or e.conversation_id = p_conversation)
       and not exists (select 1 from busy b where b.conversation_id = e.conversation_id)
     order by e.created_at, e.id
     limit greatest(coalesce(p_limit, 50), 1)
  ), claimed as (
    update comms.automation_events e
       set status = 'processing', claimed_at = pg_catalog.now(), attempts = e.attempts + 1
      from picked p
     where e.id = p.id
    returning e.*
  )
  select * from claimed;
end;
$$;
revoke all on function comms.automation_claim_events(integer, uuid) from public, anon, authenticated;
grant execute on function comms.automation_claim_events(integer, uuid) to service_role;

-- A workflow's reply or note. Unlike post_message it neither counts as the first response nor stops the customer waiting.
create or replace function comms.post_automated_message(
  p_conversation uuid,
  p_body text,
  p_message_type text,
  p_workflow uuid,
  p_author_name text default null
)
returns comms.messages
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_project uuid;
  v_message comms.messages;
begin
  if p_conversation is null or coalesce(btrim(p_body), '') = '' then
    raise exception 'conversation_and_body_required';
  end if;
  if p_message_type not in ('comment', 'note') then
    raise exception 'invalid_message_type';
  end if;

  select c.project_id into v_project
    from comms.conversations c
   where c.id = p_conversation
     and c.deleted_at is null;
  if not found then
    raise exception 'conversation_not_found';
  end if;

  -- Customer-facing replies are signed with the project's name; notes carry the workflow's.
  insert into comms.messages (conversation_id, author_role, author_name, body, message_type, metadata)
  values (
    p_conversation,
    'agent',
    coalesce(nullif(btrim(p_author_name), ''), (select p.name from public.projects p where p.id = v_project), 'Support'),
    p_body,
    p_message_type,
    jsonb_build_object('automation', jsonb_build_object('workflow_id', p_workflow))
  )
  returning * into v_message;

  if p_message_type = 'comment' then
    update comms.conversations c
       set last_message_at = pg_catalog.now(),
           preview = left(p_body, 140)
     where c.id = p_conversation;

    begin
      perform realtime.send(
        jsonb_build_object(
          'type', 'message.created',
          'conversationId', p_conversation::text,
          'messageId', v_message.id::text
        ),
        'message.created',
        'conversation:' || p_conversation::text,
        true
      );
    exception when others then
      -- Realtime is a best-effort notification; clients always re-fetch via the API.
      null;
    end;
  end if;

  return v_message;
end;
$$;
revoke all on function comms.post_automated_message(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function comms.post_automated_message(uuid, text, text, uuid, text) to service_role;

-- Touches open conversations whose SLA target has passed or entered its last quarter; conversations_apply_sla recomputes their state.
create or replace function comms.sla_refresh()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_count integer;
begin
  with due as (
    select c.id,
           c.sla_state,
           c.created_at,
           least(
             coalesce(case when c.first_response_at is null then c.first_response_due_at end, c.resolution_due_at),
             coalesce(c.resolution_due_at, case when c.first_response_at is null then c.first_response_due_at end)
           ) as due_at
      from comms.conversations c
     where c.deleted_at is null
       and c.status <> 'Closed'
       and c.sla_state in ('on_track', 'approaching')
  )
  update comms.conversations c
     set sla_state = c.sla_state
    from due d
   where c.id = d.id
     and d.due_at is not null
     and (
       d.due_at <= pg_catalog.now()
       or (d.sla_state = 'on_track' and d.due_at - (d.due_at - d.created_at) * 0.25 <= pg_catalog.now())
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function comms.sla_refresh() from public, anon, authenticated;
grant execute on function comms.sla_refresh() to service_role;

-- ---- office hours + routing ---------------------------------------------------------

-- Whether a project's office hours are open: the team's own hours, else the project's default (team_id null) hours; no hours = open.
create or replace function comms.hours_open(p_project uuid, p_team uuid default null, p_at timestamptz default now())
returns boolean
language plpgsql
stable
set search_path to ''
as $$
declare
  v_team      uuid := p_team;
  v_seen      boolean := false;
  v_tz        text;
  v_local     timestamp;
  v_dow       text;
  v_day       text;
  v_local_min integer;
  v_sched     jsonb;
  v_open_txt  text;
  v_close_txt text;
  v_open_min  integer;
  v_close_min integer;
  v_holiday   boolean;
  v_hdate     text;
  r           record;
  h           jsonb;
begin
  p_at := coalesce(p_at, pg_catalog.now());

  if v_team is not null and not exists (
    select 1 from comms.business_hours b
     where b.deleted_at is null
       and b.enabled
       and b.team_id = v_team
       and b.project_id is not distinct from p_project
  ) then
    v_team := null;
  end if;

  for r in
    select b.timezone as tz, b.schedule as sched, b.holidays as hols
      from comms.business_hours b
     where b.deleted_at is null
       and b.enabled
       and b.project_id is not distinct from p_project
       and b.team_id is not distinct from v_team
     order by b.created_at asc
  loop
    v_seen := true;

    -- Resolve the zone; unknown names fall back to UTC.
    v_tz := nullif(btrim(coalesce(r.tz, '')), '');
    if v_tz is null or not exists (
      select 1 from pg_catalog.pg_timezone_names z where z.name = v_tz
    ) then
      v_tz := 'UTC';
    end if;
    v_local := pg_catalog.timezone(v_tz, p_at);
    v_dow := lower(pg_catalog.to_char(v_local, 'dy'));
    v_day := pg_catalog.to_char(v_local, 'YYYY-MM-DD');
    v_local_min := pg_catalog.date_part('hour', v_local)::integer * 60
      + pg_catalog.date_part('minute', v_local)::integer;

    -- A holiday ({date, name} or a bare "YYYY-MM-DD") closes the row for that calendar day.
    v_holiday := false;
    if pg_catalog.jsonb_typeof(coalesce(r.hols, '[]'::jsonb)) = 'array' then
      for h in
        select pg_catalog.jsonb_array_elements(coalesce(r.hols, '[]'::jsonb))
      loop
        v_hdate := case
          when pg_catalog.jsonb_typeof(h) = 'string' then h #>> '{}'
          when pg_catalog.jsonb_typeof(h) = 'object' then h ->> 'date'
          else null
        end;
        if v_hdate is not null and left(v_hdate, 10) = v_day then
          v_holiday := true;
          exit;
        end if;
      end loop;
    end if;
    if v_holiday then
      continue;
    end if;

    -- Weekday window in the row's timezone (minute precision, same-day only).
    v_sched := case
      when pg_catalog.jsonb_typeof(coalesce(r.sched, '{}'::jsonb)) = 'object'
      then (coalesce(r.sched, '{}'::jsonb) -> v_dow)
      else null
    end;
    if v_sched is not null and pg_catalog.jsonb_typeof(v_sched) = 'object'
       and lower(coalesce(v_sched ->> 'closed', 'false'))
         not in ('true', 't', 'yes', 'on', '1') then
      v_open_txt := btrim(coalesce(v_sched ->> 'open', ''));
      v_close_txt := btrim(coalesce(v_sched ->> 'close', ''));
      if v_open_txt ~ '^[0-9]{1,2}:[0-9]{2}$'
         and v_close_txt ~ '^[0-9]{1,2}:[0-9]{2}$' then
        v_open_min := pg_catalog.split_part(v_open_txt, ':', 1)::integer * 60
          + pg_catalog.split_part(v_open_txt, ':', 2)::integer;
        v_close_min := pg_catalog.split_part(v_close_txt, ':', 1)::integer * 60
          + pg_catalog.split_part(v_close_txt, ':', 2)::integer;
        if v_open_min between 0 and 1439
           and v_close_min between 0 and 1439
           and v_close_min > v_open_min
           and v_local_min >= v_open_min
           and v_local_min < v_close_min then
          return true;
        end if;
      end if;
    end if;
  end loop;

  return not v_seen;
end;
$$;
revoke all on function comms.hours_open(uuid, uuid, timestamptz) from public, anon;
grant execute on function comms.hours_open(uuid, uuid, timestamptz) to authenticated, service_role;

-- Supersedes the live is_team_open, which read team-less hours of every project for a null team: it now reads within the
-- team's own project (falling back to that project's default hours). Nothing in the engine calls it any more; same signature.
create or replace function comms.is_team_open(p_team_id uuid, p_at timestamptz default now())
returns boolean
language plpgsql
stable
set search_path to ''
as $function$
begin
  return comms.hours_open(
    (select g.project_id from comms.member_groups g where g.id = p_team_id),
    p_team_id,
    p_at
  );
end;
$function$;

-- The next teammate for a strategy: a live project teammate who isn't offline (away ones only while their hours are open),
-- from the team when given; direct = that one teammate, load = fewest open conversations, round_robin = first id after p_after.
create or replace function comms.routing_pick(
  p_project uuid,
  p_strategy text,
  p_team uuid,
  p_teammate uuid,
  p_after uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_pool uuid[];
  v_next uuid;
begin
  select coalesce(array_agg(t.id order by t.id), '{}')
    into v_pool
    from comms.teammates t
   where t.deleted_at is null
     and t.project_id is not distinct from p_project
     and coalesce(t.availability, 'available') <> 'offline'
     and case
       when p_strategy = 'direct' then t.id = p_teammate
       when p_team is not null then exists (
         select 1
           from comms.project_members m
          where m.deleted_at is null
            and m.project_id is not distinct from p_project
            and m.user_id is not null
            and m.user_id = t.user_id
            and p_team = any (m.group_ids)
       )
       else true
     end
     and (
       coalesce(t.availability, 'available') <> 'away'
       or exists (
         select 1
           from comms.project_members m
           left join lateral pg_catalog.unnest(coalesce(m.group_ids, '{}'::uuid[])) as g(gid) on true
          where m.deleted_at is null
            and m.project_id is not distinct from p_project
            and m.user_id is not null
            and m.user_id = t.user_id
            and comms.hours_open(p_project, g.gid)
       )
       or (
         not exists (
           select 1
             from comms.project_members m
            where m.deleted_at is null
              and m.project_id is not distinct from p_project
              and m.user_id is not null
              and m.user_id = t.user_id
         )
         and comms.hours_open(p_project, null)
       )
     );

  if v_pool = '{}' then
    return null;
  end if;
  if p_strategy = 'direct' then
    return v_pool[1];
  end if;

  if p_strategy = 'load' then
    select u.id into v_next
      from pg_catalog.unnest(v_pool) as u(id)
     order by (
       select count(*)
         from comms.conversations c
        where c.assignee_id = u.id
          and c.deleted_at is null
          and c.status <> 'Closed'
     ) asc, u.id asc
     limit 1;
    return v_next;
  end if;

  select u.id into v_next
    from pg_catalog.unnest(v_pool) as u(id)
   where p_after is null or u.id > p_after
   order by u.id asc
   limit 1;
  return coalesce(v_next, v_pool[1]);
end;
$$;
revoke all on function comms.routing_pick(uuid, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function comms.routing_pick(uuid, text, uuid, uuid, uuid) to service_role;

-- Supersedes the live assign_next: rules apply top to bottom when their match holds (each non-empty list must contain the
-- conversation's channel / priority / one of its tags), a rule with nobody available hands over to the next match, and an
-- already-assigned conversation is left alone.
create or replace function comms.assign_next(p_conversation_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_conv record;
  v_tags text[];
  r      record;
  v_next uuid;
  v_name text;
begin
  if p_conversation_id is null then
    return null;
  end if;

  -- Row-lock the conversation so concurrent assignments serialize here.
  select c.id, c.project_id, c.channel, c.priority, c.assignee_id
    into v_conv
    from comms.conversations c
   where c.id = p_conversation_id
     and c.deleted_at is null
   for update;

  if v_conv.id is null or v_conv.assignee_id is not null then
    return null;
  end if;

  select coalesce(array_agg(lower(t.name)), '{}')
    into v_tags
    from comms.conversation_tags ct
    join comms.tags t on t.id = ct.tag_id and t.deleted_at is null
   where ct.conversation_id = v_conv.id;

  for r in
    select rr.id, rr.strategy, rr.team_id, rr.fallback_assignee, rr.last_assignee_id,
           coalesce(rr.match, '{}'::jsonb) as m
      from comms.routing_rules rr
     where rr.deleted_at is null
       and rr.enabled
       and rr.project_id is not distinct from v_conv.project_id
     order by rr.position asc, rr.created_at asc
  loop
    if pg_catalog.jsonb_typeof(r.m -> 'channel') = 'array'
       and pg_catalog.jsonb_array_length(r.m -> 'channel') > 0
       and not ((r.m -> 'channel') ? v_conv.channel) then
      continue;
    end if;
    if pg_catalog.jsonb_typeof(r.m -> 'priority') = 'array'
       and pg_catalog.jsonb_array_length(r.m -> 'priority') > 0
       and not ((r.m -> 'priority') ? v_conv.priority) then
      continue;
    end if;
    if pg_catalog.jsonb_typeof(r.m -> 'tags') = 'array'
       and pg_catalog.jsonb_array_length(r.m -> 'tags') > 0
       and not exists (
         select 1
           from pg_catalog.jsonb_array_elements_text(r.m -> 'tags') as x(tag)
          where lower(x.tag) = any (v_tags)
       ) then
      continue;
    end if;

    v_next := comms.routing_pick(v_conv.project_id, r.strategy, r.team_id, r.fallback_assignee, r.last_assignee_id);
    if v_next is null then
      continue;
    end if;

    select t.name into v_name from comms.teammates t where t.id = v_next;

    update comms.conversations c
       set assignee_id = v_next,
           assignee = coalesce(v_name, c.assignee)
     where c.id = v_conv.id;

    update comms.routing_rules rr
       set last_assignee_id = v_next
     where rr.id = r.id;

    return v_next;
  end loop;

  return null;
end;
$function$;
revoke all on function comms.assign_next(uuid) from public, anon, authenticated;
grant execute on function comms.assign_next(uuid) to service_role;

-- ---- SLA clock ---------------------------------------------------------------------

-- Supersedes the live conversations_apply_sla: a changed sla_policy_id restarts the clock on that policy (workflow "Apply SLA");
-- reassigning or reopening restarts it on the current policy, falling back to the first matching one; snoozing pauses it and
-- waking pushes the due times back by the time spent paused.
create or replace function comms.conversations_apply_sla()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_now        timestamptz := now();
  v_explicit   boolean := false;
  v_restart    boolean := false;
  v_policy_id  uuid;
  v_frt        integer;
  v_res        integer;
  v_hours      uuid;
  v_paused     interval;
  v_first_due  timestamptz;
  v_due        timestamptz;
begin
  if pg_catalog.to_regclass('comms.sla_policies') is null then
    return new;
  end if;

  -- Close stops the clock.
  if new.status = 'Closed'
    and (tg_op = 'INSERT' or old.status is distinct from 'Closed') then
    if new.resolution_due_at is not null and new.resolution_due_at <= v_now then
      new.sla_state := 'breached';
    else
      new.sla_state := 'none';
    end if;
    new.metadata := coalesce(new.metadata, '{}'::jsonb) - 'sla_paused_at';
    return new;
  end if;
  if new.status = 'Closed' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_restart := true;
  elsif new.sla_policy_id is distinct from old.sla_policy_id then
    v_restart := true;
    v_explicit := true;
  elsif new.assignee_id is distinct from old.assignee_id or old.status = 'Closed' then
    v_restart := true;
  end if;

  if v_restart then
    begin
      if new.sla_policy_id is not null then
        select p.id, p.first_response_mins, p.resolution_mins, p.business_hours_id
          into v_policy_id, v_frt, v_res, v_hours
          from comms.sla_policies p
         where p.id = new.sla_policy_id
           and p.deleted_at is null
           and p.enabled
           and p.project_id is not distinct from new.project_id;
      end if;

      if v_policy_id is null and not v_explicit then
        select p.id, p.first_response_mins, p.resolution_mins, p.business_hours_id
          into v_policy_id, v_frt, v_res, v_hours
          from comms.sla_policies p
         where p.deleted_at is null
           and p.enabled
           and p.project_id is not distinct from new.project_id
           and (
             coalesce(p.scope -> 'channels', p.scope -> 'channel', '[]'::jsonb) = '[]'::jsonb
             or (
               pg_catalog.jsonb_typeof(coalesce(p.scope -> 'channels', p.scope -> 'channel', '[]'::jsonb)) = 'array'
               and new.channel in (
                 select value from pg_catalog.jsonb_array_elements_text(
                   coalesce(p.scope -> 'channels', p.scope -> 'channel', '[]'::jsonb))
               )
             )
           )
           and (
             coalesce(p.scope -> 'priorities', p.scope -> 'priority', '[]'::jsonb) = '[]'::jsonb
             or (
               pg_catalog.jsonb_typeof(coalesce(p.scope -> 'priorities', p.scope -> 'priority', '[]'::jsonb)) = 'array'
               and new.priority in (
                 select value from pg_catalog.jsonb_array_elements_text(
                   coalesce(p.scope -> 'priorities', p.scope -> 'priority', '[]'::jsonb))
               )
             )
           )
         order by p.position asc, p.created_at asc
         limit 1;
      end if;
    exception when others then
      v_policy_id := null;
    end;

    new.metadata := coalesce(new.metadata, '{}'::jsonb) - 'sla_paused_at';
    if v_policy_id is null then
      new.sla_policy_id := null;
      new.first_response_due_at := null;
      new.resolution_due_at := null;
      new.sla_state := 'none';
      return new;
    end if;

    new.sla_policy_id := v_policy_id;
    new.first_response_due_at := comms.sla_due_at(v_now, v_frt, v_hours);
    new.resolution_due_at := comms.sla_due_at(v_now, v_res, v_hours);
    if new.first_response_due_at is null and new.resolution_due_at is null then
      new.sla_state := 'none';
      return new;
    end if;
    new.sla_state := 'on_track';
  end if;

  -- Snoozing pauses a running clock; waking resumes it, pushed back by the time spent paused.
  if new.status = 'Snoozed' then
    if new.sla_state in ('on_track', 'approaching') then
      new.sla_state := 'paused';
      new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object('sla_paused_at', v_now);
    end if;
    return new;
  end if;
  if new.sla_state = 'paused' and coalesce(new.metadata, '{}'::jsonb) ? 'sla_paused_at' then
    v_paused := v_now - (new.metadata ->> 'sla_paused_at')::timestamptz;
    new.first_response_due_at := new.first_response_due_at + v_paused;
    new.resolution_due_at := new.resolution_due_at + v_paused;
    new.metadata := new.metadata - 'sla_paused_at';
    new.sla_state := 'on_track';
  end if;

  -- Live recompute for open threads (a met first-response target drops out).
  if coalesce(new.sla_state, 'none') in ('paused', 'none')
    and new.first_response_due_at is null
    and new.resolution_due_at is null then
    return new;
  end if;
  if coalesce(new.sla_state, 'none') = 'paused' then
    return new;
  end if;

  v_first_due := case when new.first_response_at is null then new.first_response_due_at else null end;
  v_due := least(
    coalesce(v_first_due, new.resolution_due_at),
    coalesce(new.resolution_due_at, v_first_due)
  );

  if v_due is null then
    new.sla_state := 'none';
  elsif v_due <= v_now then
    new.sla_state := 'breached';
  elsif new.created_at is not null
    and v_due > new.created_at
    and (v_due - new.created_at) > interval '0 seconds'
    and (
      pg_catalog.date_part('epoch', v_due - v_now)
      / pg_catalog.date_part('epoch', v_due - new.created_at)
    ) < 0.25 then
    new.sla_state := 'approaching';
  else
    new.sla_state := 'on_track';
  end if;

  return new;
exception when others then
  return new;
end;
$function$;

-- @down

-- Refuses on the shared database: it drops the event queue and every waiting run's resume time, and gives
-- assign_next back to every signed-in user.
do $$
begin
  if coalesce(current_setting('comms.allow_destructive_down', true), '') <> 'on' then
    raise exception 'automation_engine @down is destructive on the shared database; set comms.allow_destructive_down=on on a disposable database';
  end if;
end;
$$;

drop trigger if exists messages_automation on comms.messages;
drop trigger if exists conversations_automation on comms.conversations;
drop trigger if exists conversation_tags_automation on comms.conversation_tags;
drop trigger if exists tickets_automation on comms.tickets;
drop function if exists comms.messages_automation();
drop function if exists comms.conversations_automation();
drop function if exists comms.conversation_tags_automation();
drop function if exists comms.tickets_automation();
drop function if exists comms.automation_enqueue(text, uuid, uuid, jsonb);
drop function if exists comms.automation_claim_events(integer, uuid);
drop function if exists comms.post_automated_message(uuid, text, text, uuid, text);
drop function if exists comms.sla_refresh();

-- The previous assign_next (live body, as adopted by 20261021103040_adopt_routing_engine) and its grants.
CREATE OR REPLACE FUNCTION comms.assign_next(p_conversation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conv_id  uuid;
  v_project  uuid;
  v_rule     uuid;
  v_strategy text;
  v_team     uuid;
  v_fallback uuid;
  v_last     uuid;
  v_pool     uuid[];
  v_next     uuid;
  v_name     text;
begin
  if p_conversation_id is null then
    return null;
  end if;

  -- Row-lock the conversation so concurrent assignments serialize here.
  select c.id, c.project_id
    into v_conv_id, v_project
    from comms.conversations c
   where c.id = p_conversation_id
     and c.deleted_at is null
   for update;

  if v_conv_id is null then
    return null;
  end if;

  select r.id, r.strategy, r.team_id, r.fallback_assignee, r.last_assignee_id
    into v_rule, v_strategy, v_team, v_fallback, v_last
    from comms.routing_rules r
   where r.deleted_at is null
     and r.enabled
     and r.project_id is not distinct from v_project
     and (r.match is null or r.match = '{}'::jsonb)
   order by r.position asc, r.created_at asc
   limit 1;

  if v_rule is null then
    return null;
  end if;

  if v_strategy = 'direct' then
    -- Away-skip: the fallback holds only while its own hours (its team via
    -- project_members.group_ids, else the default row) report open.
    select t.id, t.name
      into v_next, v_name
      from comms.teammates t
     where t.id = v_fallback
       and t.deleted_at is null
       and t.project_id is not distinct from v_project
       and coalesce(t.availability, 'available') <> 'offline'
       and (
         coalesce(t.availability, 'available') <> 'away'
         or exists (
           select 1
             from comms.project_members m
             left join lateral unnest(coalesce(m.group_ids, '{}'::uuid[])) as g(gid) on true
            where m.deleted_at is null
              and m.project_id is not distinct from v_project
              and m.user_id is not null
              and m.user_id = t.user_id
              and comms.is_team_open(g.gid)
         )
         or (
           not exists (
             select 1
               from comms.project_members m
              where m.deleted_at is null
                and m.project_id is not distinct from v_project
                and m.user_id is not null
                and m.user_id = t.user_id
           )
           and comms.is_team_open(null)
         )
       );
    if v_next is null then
      return null;
    end if;
  else
    if v_team is not null then
      select coalesce(array_agg(t.id order by t.id), '{}')
        into v_pool
        from comms.teammates t
       where t.deleted_at is null
         and t.project_id is not distinct from v_project
         and coalesce(t.availability, 'available') <> 'offline'
         and exists (
           select 1
             from comms.project_members m
            where m.deleted_at is null
              and m.project_id is not distinct from v_project
              and m.user_id is not null
              and m.user_id = t.user_id
              and v_team = any (m.group_ids)
         );
    else
      select coalesce(array_agg(t.id order by t.id), '{}')
        into v_pool
        from comms.teammates t
       where t.deleted_at is null
         and t.project_id is not distinct from v_project
         and coalesce(t.availability, 'available') <> 'offline';
    end if;

    -- Away-skip: prune 'away' teammates whose own hours (their team via
    -- project_members.group_ids, else the default row) report closed.
    -- Teammates with no login (user_id null, e.g. legacy assignee names)
    -- match no membership row and fall through to the default hours.
    if v_pool <> '{}' then
      select coalesce(array_agg(u.id order by u.id), '{}')
        into v_pool
        from unnest(v_pool) as u(id)
        join comms.teammates t on t.id = u.id
       where coalesce(t.availability, 'available') <> 'away'
          or exists (
            select 1
              from comms.project_members m
              left join lateral unnest(coalesce(m.group_ids, '{}'::uuid[])) as g(gid) on true
             where m.deleted_at is null
               and m.project_id is not distinct from v_project
               and m.user_id is not null
               and m.user_id = t.user_id
               and comms.is_team_open(g.gid)
          )
          or (
            not exists (
              select 1
                from comms.project_members m
               where m.deleted_at is null
                 and m.project_id is not distinct from v_project
                 and m.user_id is not null
                 and m.user_id = t.user_id
            )
            and comms.is_team_open(null)
          );
    end if;

    if v_pool = '{}' then
      return null;
    end if;

    if v_strategy = 'load' then
      select t.id, t.name
        into v_next, v_name
        from comms.teammates t
       where t.id = any (v_pool)
       order by (
         select count(*)
           from comms.conversations c
          where c.assignee_id = t.id
            and c.deleted_at is null
            and c.status <> 'Closed'
       ) asc, t.id asc
       limit 1;
    else
      -- Round-robin: first id past the cursor, wrapping to the head.
      select t.id, t.name
        into v_next, v_name
        from comms.teammates t
       where t.id = any (v_pool)
         and (v_last is null or t.id > v_last)
       order by t.id asc
       limit 1;
      if v_next is null then
        select t.id, t.name
          into v_next, v_name
          from comms.teammates t
         where t.id = any (v_pool)
         order by t.id asc
         limit 1;
      end if;
    end if;

    if v_next is null then
      return null;
    end if;
  end if;

  update comms.conversations c
     set assignee_id = v_next,
         assignee = coalesce(v_name, c.assignee)
   where c.id = v_conv_id;

  update comms.routing_rules r
     set last_assignee_id = v_next
   where r.id = v_rule;

  return v_next;
end;
$function$;
grant execute on function comms.assign_next(uuid) to authenticated, service_role;

-- The previous is_team_open (live body, as adopted by 20261021103040_adopt_routing_engine); it must stop calling hours_open first.
CREATE OR REPLACE FUNCTION comms.is_team_open(p_team_id uuid, p_at timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_seen      boolean := false;
  v_any_open  boolean := false;
  v_row_open  boolean;
  v_tz        text;
  v_local     timestamp;
  v_dow       text;
  v_day       text;
  v_local_min integer;
  v_sched     jsonb;
  v_open_txt  text;
  v_close_txt text;
  v_open_min  integer;
  v_close_min integer;
  v_holiday   boolean;
  v_hdate     text;
  r           record;
  h           jsonb;
begin
  p_at := coalesce(p_at, pg_catalog.now());

  for r in
    select h.timezone as tz, h.schedule as sched, h.holidays as hols
      from comms.business_hours h
     where h.deleted_at is null
       and h.enabled
       and h.team_id is not distinct from p_team_id
     order by h.created_at asc
  loop
    v_seen := true;

    -- Resolve the zone; unknown names fall back to UTC.
    v_tz := nullif(btrim(coalesce(r.tz, '')), '');
    if v_tz is null or not exists (
      select 1 from pg_catalog.pg_timezone_names z where z.name = v_tz
    ) then
      v_tz := 'UTC';
    end if;
    v_local := pg_catalog.timezone(v_tz, p_at);
    v_dow := lower(pg_catalog.to_char(v_local, 'dy'));
    v_day := pg_catalog.to_char(v_local, 'YYYY-MM-DD');
    v_local_min := pg_catalog.date_part('hour', v_local)::integer * 60
      + pg_catalog.date_part('minute', v_local)::integer;

    -- A matching holiday date closes the row for the whole calendar day.
    -- Entries are {date:"YYYY-MM-DD", name} objects (bare "YYYY-MM-DD"
    -- strings are accepted too); only the date prefix is compared.
    v_holiday := false;
    if pg_catalog.jsonb_typeof(coalesce(r.hols, '[]'::jsonb)) = 'array' then
      for h in
        select pg_catalog.jsonb_array_elements(coalesce(r.hols, '[]'::jsonb))
      loop
        v_hdate := case
          when pg_catalog.jsonb_typeof(h) = 'string' then h #>> '{}'
          when pg_catalog.jsonb_typeof(h) = 'object' then h ->> 'date'
          else null
        end;
        if v_hdate is not null and left(v_hdate, 10) = v_day then
          v_holiday := true;
          exit;
        end if;
      end loop;
    end if;
    if v_holiday then
      continue;
    end if;

    -- Weekday window in the row's timezone (minute precision, same-day only).
    v_row_open := false;
    v_sched := case
      when pg_catalog.jsonb_typeof(coalesce(r.sched, '{}'::jsonb)) = 'object'
      then (coalesce(r.sched, '{}'::jsonb) -> v_dow)
      else null
    end;
    if v_sched is not null and pg_catalog.jsonb_typeof(v_sched) = 'object'
       and lower(coalesce(v_sched ->> 'closed', 'false'))
         not in ('true', 't', 'yes', 'on', '1') then
      v_open_txt := btrim(coalesce(v_sched ->> 'open', ''));
      v_close_txt := btrim(coalesce(v_sched ->> 'close', ''));
      if v_open_txt ~ '^[0-9]{1,2}:[0-9]{2}$'
         and v_close_txt ~ '^[0-9]{1,2}:[0-9]{2}$' then
        v_open_min := pg_catalog.split_part(v_open_txt, ':', 1)::integer * 60
          + pg_catalog.split_part(v_open_txt, ':', 2)::integer;
        v_close_min := pg_catalog.split_part(v_close_txt, ':', 1)::integer * 60
          + pg_catalog.split_part(v_close_txt, ':', 2)::integer;
        if v_open_min between 0 and 1439
           and v_close_min between 0 and 1439
           and v_close_min > v_open_min
           and v_local_min >= v_open_min
           and v_local_min < v_close_min then
          v_row_open := true;
        end if;
      end if;
    end if;

    if v_row_open then
      v_any_open := true;
    end if;
  end loop;

  -- No hours row for this scope: open (nothing constrains the team).
  if not v_seen then
    return true;
  end if;
  return v_any_open;
end;
$function$;

drop function if exists comms.routing_pick(uuid, text, uuid, uuid, uuid);
drop function if exists comms.hours_open(uuid, uuid, timestamptz);

-- The previous conversations_apply_sla (live body, as adopted by 20261021103039_adopt_business_hours_and_sla).
CREATE OR REPLACE FUNCTION comms.conversations_apply_sla()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_now        timestamptz := now();
  v_policy_id  uuid;
  v_frt        integer;
  v_res        integer;
  v_hours      uuid;
  v_first_due  timestamptz;
  v_due        timestamptz;
begin
  if pg_catalog.to_regclass('comms.sla_policies') is null then
    return new;
  end if;

  -- Close stops the clock.
  if new.status = 'Closed'
    and (tg_op = 'INSERT' or old.status is distinct from 'Closed') then
    if new.resolution_due_at is not null and new.resolution_due_at <= v_now then
      new.sla_state := 'breached';
    else
      new.sla_state := 'none';
    end if;
    return new;
  end if;
  if new.status = 'Closed' then
    return new;
  end if;

  -- (Re)assign the clock on insert / assignee change.
  if tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id then
    begin
      select p.id, p.first_response_mins, p.resolution_mins, p.business_hours_id
        into v_policy_id, v_frt, v_res, v_hours
        from comms.sla_policies p
       where p.deleted_at is null
         and p.enabled
         and p.project_id is not distinct from new.project_id
         and (
           coalesce(p.scope -> 'channels', p.scope -> 'channel', '[]'::jsonb) = '[]'::jsonb
           or (
             pg_catalog.jsonb_typeof(coalesce(p.scope -> 'channels', p.scope -> 'channel', '[]'::jsonb)) = 'array'
             and new.channel in (
               select value from pg_catalog.jsonb_array_elements_text(
                 coalesce(p.scope -> 'channels', p.scope -> 'channel', '[]'::jsonb))
             )
           )
         )
         and (
           coalesce(p.scope -> 'priorities', p.scope -> 'priority', '[]'::jsonb) = '[]'::jsonb
           or (
             pg_catalog.jsonb_typeof(coalesce(p.scope -> 'priorities', p.scope -> 'priority', '[]'::jsonb)) = 'array'
             and new.priority in (
               select value from pg_catalog.jsonb_array_elements_text(
                 coalesce(p.scope -> 'priorities', p.scope -> 'priority', '[]'::jsonb))
             )
           )
         )
       order by p.position asc, p.created_at asc
       limit 1;
    exception when others then
      v_policy_id := null;
    end;

    if v_policy_id is null then
      new.sla_policy_id := null;
      new.first_response_due_at := null;
      new.resolution_due_at := null;
      new.sla_state := 'none';
      return new;
    end if;

    new.sla_policy_id := v_policy_id;
    new.first_response_due_at := comms.sla_due_at(v_now, v_frt, v_hours);
    new.resolution_due_at := comms.sla_due_at(v_now, v_res, v_hours);
    if new.first_response_due_at is null and new.resolution_due_at is null then
      new.sla_state := 'none';
      return new;
    end if;
    new.sla_state := 'on_track';
  end if;

  -- Live recompute for open threads (a met first-response target drops out).
  if coalesce(new.sla_state, 'none') in ('paused', 'none')
    and new.first_response_due_at is null
    and new.resolution_due_at is null then
    return new;
  end if;
  if coalesce(new.sla_state, 'none') = 'paused' then
    return new;
  end if;

  v_first_due := case when new.first_response_at is null then new.first_response_due_at else null end;
  v_due := least(
    coalesce(v_first_due, new.resolution_due_at),
    coalesce(new.resolution_due_at, v_first_due)
  );

  if v_due is null then
    new.sla_state := 'none';
  elsif v_due <= v_now then
    new.sla_state := 'breached';
  elsif new.created_at is not null
    and v_due > new.created_at
    and (v_due - new.created_at) > interval '0 seconds'
    and (
      pg_catalog.date_part('epoch', v_due - v_now)
      / pg_catalog.date_part('epoch', v_due - new.created_at)
    ) < 0.25 then
    new.sla_state := 'approaching';
  else
    new.sla_state := 'on_track';
  end if;

  return new;
exception when others then
  return new;
end;
$function$;

drop index if exists comms.workflow_runs_dedupe_idx;
drop index if exists comms.workflow_runs_resume_idx;
alter table comms.workflow_runs drop column if exists dedupe_key;
alter table comms.workflow_runs drop column if exists resume_at;

drop table if exists comms.automation_events cascade;
