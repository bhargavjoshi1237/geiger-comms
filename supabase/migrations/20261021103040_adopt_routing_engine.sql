-- Adopt the routing engine
--
-- Brings into the repo the assignment engine the lost routing_rules and
-- routing_assign_hours migrations (ledger versions 20260909194558,
-- 20260909202918) created, plus three indexes adopt_automation missed.
-- This file re-declares their exact live DDL, idempotently: on the live database
-- every statement is a no-op or a same-definition replace.
--
-- Owns:
--   comms.is_team_open(uuid, timestamptz)  is a team inside its business hours?
--   comms.assign_next(uuid)                assigns a conversation by the first
--                                          match-all routing rule
--   routing_rules_project_position_idx, macros_project_idx, macros_project_scope_idx
--
-- Depends on (owned elsewhere, all earlier versions):
--   comms.business_hours            20261021103039_adopt_business_hours_and_sla
--   comms.routing_rules, comms.macros  20261018184858_adopt_automation
--   comms.teammates                 20260825120523_inbox_identity
--   comms.project_members           20260825112725_rbac_team_management
--   comms.conversations             20260705072403_comms
--
-- is_team_open is open when any enabled hours row whose team_id matches is open,
-- or when no row matches; as live, a null team matches team-less rows of every
-- project. assign_next honours direct, round_robin and load strategies and skips
-- away teammates whose hours are closed. It is SECURITY DEFINER and, as live,
-- executable by authenticated with no project check.

-- @up

create extension if not exists pgcrypto;
create schema if not exists comms;
grant usage on schema comms to anon, authenticated, service_role;

-- ---- indexes missed by adopt_automation -------------------------------------

create index if not exists routing_rules_project_position_idx on comms.routing_rules (project_id, position) where deleted_at is null;
create index if not exists macros_project_idx on comms.macros (project_id) where deleted_at is null;
create index if not exists macros_project_scope_idx on comms.macros (project_id, scope) where deleted_at is null;

-- ---- is_team_open -----------------------------------------------------------

create or replace function comms.is_team_open(p_team_id uuid, p_at timestamptz default now())
returns boolean
language plpgsql
stable
set search_path = ''
as $$
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
$$;
revoke all on function comms.is_team_open(uuid, timestamptz) from public, anon;
grant execute on function comms.is_team_open(uuid, timestamptz) to authenticated, service_role;

-- ---- assign_next ------------------------------------------------------------

create or replace function comms.assign_next(p_conversation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
$$;
revoke all on function comms.assign_next(uuid) from public, anon;
grant execute on function comms.assign_next(uuid) to authenticated, service_role;

-- @down

-- Forget-only on purpose: these functions and indexes predate this file on the
-- live database, so rolling back drops the ledger row and nothing else.
select 1;
