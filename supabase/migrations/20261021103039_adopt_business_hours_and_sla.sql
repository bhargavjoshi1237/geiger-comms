-- Adopt business hours and the SLA engine
--
-- Brings into the repo what the lost business_hours and sla_engine migrations
-- (ledger versions 20260909194512, 20260909202831) created: the business-hours
-- table and the trigger that stamps an SLA policy, due dates and an SLA state
-- onto every conversation. This file re-declares their exact live DDL,
-- idempotently: on the live database every statement is a no-op or a
-- same-definition replace; on a fresh one it builds them.
--
-- Owns:
--   comms.business_hours (table, index, touch trigger, RLS, grants)
--   comms.conversations.sla_policy_id, first_response_due_at, resolution_due_at,
--     sla_state (+ conversations_sla_policy_id_fkey, conversations_sla_state_check,
--     conversations_resolution_due_idx, conversations_sla_state_idx)
--   comms.sla_due_at(timestamptz, integer, uuid)  business-minute clock over a schedule
--   comms.conversations_apply_sla()               the SLA trigger function
--   conversations_apply_sla trigger on comms.conversations
--   sla_policies_project_idx                      missed by adopt_automation
--
-- Depends on (owned elsewhere, all earlier versions):
--   comms.can_access_project(uuid)  20260821182908_adopt_rbac
--   comms.conversations             20260705072403_comms
--   comms.member_groups             20260825112725_rbac_team_management
--   comms.sla_policies              20261018184858_adopt_automation
--
-- schedule is {"mon": {"open": "09:00", "close": "17:00", "closed": false}, …} in
-- the row's timezone; a day that is missing, closed or not an object is closed.
-- The trigger (re)starts both clocks on insert and on an assignee change, and
-- re-derives sla_state on every other write. business_hours' audit trigger is
-- owned by 20261021103045_adopt_audit_log.

-- @up

create extension if not exists pgcrypto;
create schema if not exists comms;
grant usage on schema comms to anon, authenticated, service_role;

create or replace function comms.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ---- business_hours ---------------------------------------------------------

create table if not exists comms.business_hours (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  name text not null default 'Default hours',
  timezone text not null default 'UTC',
  schedule jsonb not null default '{}'::jsonb,
  holidays jsonb not null default '[]'::jsonb,
  team_id uuid,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint business_hours_pkey primary key (id),
  constraint business_hours_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint business_hours_team_id_fkey foreign key (team_id) references comms.member_groups(id) on delete set null
);

alter table comms.business_hours
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists name text not null default 'Default hours',
  add column if not exists timezone text not null default 'UTC',
  add column if not exists schedule jsonb not null default '{}'::jsonb,
  add column if not exists holidays jsonb not null default '[]'::jsonb,
  add column if not exists team_id uuid,
  add column if not exists enabled boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists business_hours_project_idx on comms.business_hours (project_id) where deleted_at is null;

drop trigger if exists business_hours_touch_updated_at on comms.business_hours;
create trigger business_hours_touch_updated_at
before update on comms.business_hours
for each row execute function comms.touch_updated_at();

-- ---- conversations: SLA columns ---------------------------------------------

alter table comms.conversations add column if not exists sla_policy_id uuid;
alter table comms.conversations add column if not exists first_response_due_at timestamptz;
alter table comms.conversations add column if not exists resolution_due_at timestamptz;
alter table comms.conversations add column if not exists sla_state text not null default 'none';

create index if not exists conversations_resolution_due_idx on comms.conversations (resolution_due_at) where deleted_at is null;
create index if not exists conversations_sla_state_idx on comms.conversations (sla_state) where deleted_at is null;

-- Named constraints, each added only when a pre-existing table lacks it.
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('comms.business_hours', 'business_hours_pkey', 'primary key (id)'),
      ('comms.business_hours', 'business_hours_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.business_hours', 'business_hours_team_id_fkey', 'foreign key (team_id) references comms.member_groups(id) on delete set null'),
      ('comms.conversations', 'conversations_sla_policy_id_fkey', 'foreign key (sla_policy_id) references comms.sla_policies(id) on delete set null'),
      ('comms.conversations', 'conversations_sla_state_check', $c$check (sla_state = any (array['none', 'on_track', 'approaching', 'breached', 'paused']))$c$)
    ) as v(tbl, name, def)
  loop
    if not exists (select 1 from pg_constraint where conrelid = c.tbl::regclass and conname = c.name) then
      execute format('alter table %s add constraint %I %s', c.tbl, c.name, c.def);
    end if;
  end loop;
end;
$$;

-- ---- sla_policies -----------------------------------------------------------

create index if not exists sla_policies_project_idx on comms.sla_policies (project_id) where deleted_at is null;

-- ---- SLA clock --------------------------------------------------------------

create or replace function comms.sla_due_at(p_start timestamptz, p_minutes integer, p_hours_id uuid)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_schedule jsonb;
  v_tz       text;
  v_holidays jsonb;
  v_remaining integer;
  v_cursor   timestamptz;
  v_guard    integer := 0;
  v_local    timestamp;
  v_datestr  text;
  v_dow      double precision;
  v_daykey   text;
  v_entry    jsonb;
  v_closed   boolean;
  v_open_txt text;
  v_close_txt text;
  v_open_min integer;
  v_close_min integer;
  v_oh integer;
  v_om integer;
  v_open_local timestamp;
  v_close_local timestamp;
  v_open_at  timestamptz;
  v_close_at timestamptz;
  v_avail    integer;
  v_take     integer;
  v_h        jsonb;
  v_hdate    text;
  v_is_holiday boolean;
begin
  if p_start is null or p_minutes is null then
    return null;
  end if;
  if p_minutes <= 0 then
    return p_start;
  end if;
  if p_hours_id is null then
    return p_start + (p_minutes * interval '1 minute');
  end if;
  if pg_catalog.to_regclass('comms.business_hours') is null then
    return p_start + (p_minutes * interval '1 minute');
  end if;

  select h.schedule, coalesce(h.timezone, 'UTC'), coalesce(h.holidays, '[]'::jsonb)
    into v_schedule, v_tz, v_holidays
    from comms.business_hours h
   where h.id = p_hours_id
     and h.deleted_at is null;

  if v_schedule is null or pg_catalog.jsonb_typeof(v_schedule) <> 'object' or v_schedule = '{}'::jsonb then
    return p_start + (p_minutes * interval '1 minute');
  end if;

  begin
    perform pg_catalog.timezone(v_tz, now());
  exception when others then
    v_tz := 'UTC';
  end;

  v_remaining := p_minutes;
  v_cursor := p_start;

  loop
    exit when v_remaining <= 0;
    v_guard := v_guard + 1;
    if v_guard > 1500 then
      exit;
    end if;

    v_local := pg_catalog.timezone(v_tz, v_cursor);
    v_datestr := pg_catalog.to_char(v_local, 'YYYY-MM-DD');
    v_dow := pg_catalog.date_part('dow', v_local);
    v_daykey := case v_dow
      when 0 then 'sun' when 1 then 'mon' when 2 then 'tue'
      when 3 then 'wed' when 4 then 'thu' when 5 then 'fri'
      else 'sat' end;

    -- Holidays close the matching calendar date in the schedule's timezone.
    v_is_holiday := false;
    if pg_catalog.jsonb_typeof(v_holidays) = 'array' then
      for v_h in select * from pg_catalog.jsonb_array_elements(v_holidays) loop
        if pg_catalog.jsonb_typeof(v_h) = 'string' then
          v_hdate := v_h #>> '{}';
        elsif pg_catalog.jsonb_typeof(v_h) = 'object' then
          v_hdate := v_h ->> 'date';
        else
          v_hdate := null;
        end if;
        if v_hdate is not null and left(v_hdate, 10) = v_datestr then
          v_is_holiday := true;
          exit;
        end if;
      end loop;
    end if;

    v_entry := v_schedule -> v_daykey;
    v_closed := false;
    if v_entry is null
      or pg_catalog.jsonb_typeof(v_entry) <> 'object' then
      v_cursor := pg_catalog.timezone(v_tz, pg_catalog.date_trunc('day', v_local) + interval '1 day');
      continue;
    end if;
    case lower(coalesce(v_entry ->> 'closed', 'false'))
      when 'true' then v_closed := true;
      when 't' then v_closed := true;
      when 'yes' then v_closed := true;
      when 'on' then v_closed := true;
      when '1' then v_closed := true;
      else v_closed := false;
    end case;
    if v_is_holiday or v_closed then
      v_cursor := pg_catalog.timezone(v_tz, pg_catalog.date_trunc('day', v_local) + interval '1 day');
      continue;
    end if;

    v_open_txt := v_entry ->> 'open';
    v_close_txt := v_entry ->> 'close';
    v_open_min := null;
    v_close_min := null;
    if v_open_txt ~ '^\d{1,2}:\d{2}$' then
      v_oh := pg_catalog.split_part(v_open_txt, ':', 1)::integer;
      v_om := pg_catalog.split_part(v_open_txt, ':', 2)::integer;
      if v_oh between 0 and 23 and v_om between 0 and 59 then
        v_open_min := v_oh * 60 + v_om;
      end if;
    end if;
    if v_close_txt ~ '^\d{1,2}:\d{2}$' then
      v_oh := pg_catalog.split_part(v_close_txt, ':', 1)::integer;
      v_om := pg_catalog.split_part(v_close_txt, ':', 2)::integer;
      if v_oh between 0 and 23 and v_om between 0 and 59 then
        v_close_min := v_oh * 60 + v_om;
      end if;
    end if;

    if v_open_min is null or v_close_min is null or v_close_min <= v_open_min then
      v_cursor := pg_catalog.timezone(v_tz, pg_catalog.date_trunc('day', v_local) + interval '1 day');
      continue;
    end if;

    v_open_local := pg_catalog.date_trunc('day', v_local) + (v_open_min * interval '1 minute');
    v_close_local := pg_catalog.date_trunc('day', v_local) + (v_close_min * interval '1 minute');
    v_open_at := pg_catalog.timezone(v_tz, v_open_local);
    v_close_at := pg_catalog.timezone(v_tz, v_close_local);

    if v_cursor < v_open_at then
      v_cursor := v_open_at;
    end if;
    if v_cursor >= v_close_at then
      v_cursor := pg_catalog.timezone(v_tz, pg_catalog.date_trunc('day', v_local) + interval '1 day');
      continue;
    end if;

    v_avail := pg_catalog.floor(pg_catalog.date_part('epoch', v_close_at - v_cursor) / 60)::integer;
    if v_avail <= 0 then
      v_cursor := pg_catalog.timezone(v_tz, pg_catalog.date_trunc('day', v_local) + interval '1 day');
      continue;
    end if;

    v_take := least(v_remaining, v_avail);
    v_cursor := v_cursor + (v_take * interval '1 minute');
    v_remaining := v_remaining - v_take;
  end loop;

  return v_cursor;
exception when others then
  return p_start + (p_minutes * interval '1 minute');
end;
$$;
revoke all on function comms.sla_due_at(timestamptz, integer, uuid) from public, anon;
grant execute on function comms.sla_due_at(timestamptz, integer, uuid) to authenticated, service_role;

create or replace function comms.conversations_apply_sla()
returns trigger
language plpgsql
set search_path = ''
as $$
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
$$;
revoke all on function comms.conversations_apply_sla() from public, anon;
grant execute on function comms.conversations_apply_sla() to authenticated, service_role;

drop trigger if exists conversations_apply_sla on comms.conversations;
create trigger conversations_apply_sla
before insert or update on comms.conversations
for each row execute function comms.conversations_apply_sla();

-- ---- grants + project-scoped RLS --------------------------------------------

revoke all on comms.business_hours from public, anon;
grant all on comms.business_hours to authenticated, service_role;

alter table comms.business_hours enable row level security;
drop policy if exists business_hours_project_scope on comms.business_hours;
create policy business_hours_project_scope on comms.business_hours for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

-- @down

-- Forget-only on purpose: business_hours, the SLA columns and the SLA functions
-- predate this file on the live database, so rolling back drops the ledger row
-- and nothing else.
select 1;
