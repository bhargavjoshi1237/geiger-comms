-- Segments
--
-- Moves Customers > Segments from per-browser localStorage into the database
-- and evaluates a segment's rules in SQL, so a segment's members and counts are
-- the same for every teammate and reusable by views, workflows and targeting.
--
-- Owns:
--   comms.segments                         table, index, trigger, RLS
--   comms.contact_matches_rule(contacts, jsonb)
--   comms.contact_matches_rules(contacts, jsonb)
--   comms.segment_contacts(uuid, jsonb, integer, integer)
--   comms.segment_counts(uuid, jsonb, uuid)
--
-- Depends on (owned elsewhere, all earlier versions):
--   comms.can_access_project(uuid)         20260821182908_adopt_rbac
--   comms.contacts                         20260705072403_comms
--
-- A rule is {field, operator, value}; a segment matches a person when every
-- rule does. Fields mirror SEGMENT_FIELDS in
-- components/internal/screens/customers/constants.js:
--   lifecycle, company, location, custom:<key>   is | is_not | contains (case-insensitive)
--   tag                                         is | is_not | contains, over metadata.tags
--   emailOpt                                    value "out" = unsubscribed, anything else = subscribed
--   created                                     created within the last <value> days (default 7)
-- A blank rule is no constraint; an unknown field matches nobody. The functions
-- run as the caller, so contacts RLS still decides who is visible.

-- @up

create extension if not exists pgcrypto;
create schema if not exists comms;
grant usage on schema comms to anon, authenticated, service_role;

create or replace function comms.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists comms.segments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  description text not null default '',
  rules jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint segments_name_present check (btrim(name) <> ''),
  constraint segments_rules_array check (jsonb_typeof(rules) = 'array')
);

create index if not exists segments_project_idx
  on comms.segments (project_id, updated_at desc)
  where deleted_at is null;

drop trigger if exists segments_touch_updated_at on comms.segments;
create trigger segments_touch_updated_at
before update on comms.segments
for each row execute function comms.touch_updated_at();

revoke all on comms.segments from public, anon;
grant select, insert, update, delete on comms.segments to authenticated;

alter table comms.segments enable row level security;
drop policy if exists segments_project_scope on comms.segments;
create policy segments_project_scope on comms.segments for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

-- One rule against one contact.
create or replace function comms.contact_matches_rule(p_contact comms.contacts, p_rule jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  with r as (
    select
      coalesce(p_rule ->> 'field', '') as field,
      coalesce(p_rule ->> 'operator', 'is') as op,
      lower(btrim(coalesce(p_rule ->> 'value', ''))) as val
  ),
  t as (
    select r.*,
      case
        when r.field = 'lifecycle' then lower(coalesce(nullif(p_contact.metadata ->> 'lifecycle', ''), 'lead'))
        when r.field = 'company' then lower(coalesce(p_contact.company, ''))
        when r.field = 'location' then lower(coalesce(p_contact.metadata ->> 'location', ''))
        when r.field like 'custom:%' then lower(coalesce(p_contact.metadata -> 'custom' ->> substr(r.field, 8), ''))
      end as subject
    from r
  )
  select case
    when t.field = '' then true
    when t.field = 'tag' then (
      exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(p_contact.metadata -> 'tags') = 'array'
            then p_contact.metadata -> 'tags' else '[]'::jsonb end
        ) as e(tag)
        cross join lateral (
          select lower(case jsonb_typeof(e.tag)
            when 'string' then e.tag #>> '{}'
            when 'object' then coalesce(e.tag ->> 'name', '')
            else '' end) as name
        ) as n
        where case when t.op = 'contains' then strpos(n.name, t.val) > 0 else n.name = t.val end
      )
    ) <> (t.op = 'is_not')
    when t.field = 'emailOpt' then
      coalesce((p_contact.metadata -> 'subscribedEmail') = 'false'::jsonb, false) = (t.val = 'out')
    when t.field = 'created' then
      p_contact.created_at >= now() - make_interval(days => case when t.val ~ '^[0-9]{1,5}$' then t.val::integer else 7 end)
    when t.subject is null then false
    when t.op = 'contains' then strpos(t.subject, t.val) > 0
    when t.op = 'is_not' then t.subject <> t.val
    else t.subject = t.val
  end
  from t
$$;

-- Every rule matches (an empty or non-array rule list matches everyone).
create or replace function comms.contact_matches_rules(p_contact comms.contacts, p_rules jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (
    select 1
    from jsonb_array_elements(case when jsonb_typeof(p_rules) = 'array' then p_rules else '[]'::jsonb end) as r(rule)
    where not comms.contact_matches_rule(p_contact, r.rule)
  )
$$;

-- A page of the live people in p_project matching p_rules, newest first.
create or replace function comms.segment_contacts(
  p_project uuid,
  p_rules   jsonb,
  p_limit   integer default 50,
  p_offset  integer default 0
)
returns setof comms.contacts
language sql
stable
set search_path = ''
as $$
  select c.*
  from comms.contacts c
  where c.deleted_at is null
    and c.project_id = p_project
    and comms.contact_matches_rules(c, p_rules)
  order by c.created_at desc, c.id
  limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Match counts for many rule sets in one call: p_sets = {"<key>": [rules], ...}.
-- With p_contact, each count is 1 or 0 — that person's segment membership.
create or replace function comms.segment_counts(
  p_project uuid,
  p_sets    jsonb,
  p_contact uuid default null
)
returns table (key text, matched bigint)
language sql
stable
set search_path = ''
as $$
  select s.key, count(c.id)
  from jsonb_each(case when jsonb_typeof(p_sets) = 'object' then p_sets else '{}'::jsonb end) as s(key, rules)
  left join comms.contacts c
    on c.deleted_at is null
   and c.project_id = p_project
   and (p_contact is null or c.id = p_contact)
   and comms.contact_matches_rules(c, s.rules)
  group by s.key
$$;

-- PUBLIC gets EXECUTE on every new function, so revoke it (and anon) before granting.
revoke all on function comms.contact_matches_rule(comms.contacts, jsonb) from public, anon;
revoke all on function comms.contact_matches_rules(comms.contacts, jsonb) from public, anon;
revoke all on function comms.segment_contacts(uuid, jsonb, integer, integer) from public, anon;
revoke all on function comms.segment_counts(uuid, jsonb, uuid) from public, anon;
grant execute on function comms.contact_matches_rule(comms.contacts, jsonb) to authenticated, service_role;
grant execute on function comms.contact_matches_rules(comms.contacts, jsonb) to authenticated, service_role;
grant execute on function comms.segment_contacts(uuid, jsonb, integer, integer) to authenticated, service_role;
grant execute on function comms.segment_counts(uuid, jsonb, uuid) to authenticated, service_role;

-- @down

-- Refuses on the shared database: it drops every saved segment.
do $$
begin
  if coalesce(current_setting('comms.allow_destructive_down', true), '') <> 'on' then
    raise exception 'segments @down is destructive on the shared database; set comms.allow_destructive_down=on on a disposable database';
  end if;
end;
$$;

drop function if exists comms.segment_counts(uuid, jsonb, uuid);
drop function if exists comms.segment_contacts(uuid, jsonb, integer, integer);
drop function if exists comms.contact_matches_rules(comms.contacts, jsonb);
drop function if exists comms.contact_matches_rule(comms.contacts, jsonb);
drop table if exists comms.segments cascade;
