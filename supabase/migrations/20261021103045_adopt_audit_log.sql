-- Adopt the audit log
--
-- Brings into the repo the config audit trail the lost audit_log and
-- audit_triggers_backfill migrations created (ledger versions 20260909194516,
-- 20260909195021). This file re-declares their exact live DDL, idempotently: on
-- the live database every statement is a no-op or a same-definition replace; on
-- a fresh one it builds them.
--
-- Owns:
--   comms.audit_log      append-only before/after log (table, indexes, RLS, grants)
--   comms.audit_write()  trigger function; TG_ARGV[0] names the entity type
--   the *_audit_write triggers on comms.business_hours, custom_fields, macros,
--   routing_rules and sla_policies. adopt_automation attaches the last three only
--   when audit_write() already exists, which a fresh database never has at its
--   version; this file attaches them unconditionally.
--
-- Depends on (owned elsewhere, all earlier versions):
--   comms.can_access_project(uuid)  20260821182908_adopt_rbac
--   comms.macros, comms.routing_rules, comms.sla_policies
--                                   20261018184858_adopt_automation
--   comms.business_hours            20261021103039_adopt_business_hours_and_sla
--   comms.custom_fields             20261021103041_adopt_inbox_extensions
--
-- audit_write() is SECURITY DEFINER so a write is logged whoever makes it, and
-- never aborts the write it records. The actor is the row's actor_id /
-- updated_by / created_by, else auth.uid(). Browsers may read and append rows
-- in projects they can reach; there is no update or delete policy.

-- @up

create extension if not exists pgcrypto;
create schema if not exists comms;
grant usage on schema comms to anon, authenticated, service_role;

-- ---- audit_log --------------------------------------------------------------

create table if not exists comms.audit_log (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  actor_id uuid,
  actor_name text not null default '',
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb not null default '{}'::jsonb,
  after jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_log_pkey primary key (id),
  constraint audit_log_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.audit_log
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists actor_id uuid,
  add column if not exists actor_name text not null default '',
  add column if not exists action text not null,
  add column if not exists entity_type text not null,
  add column if not exists entity_id uuid,
  add column if not exists before jsonb not null default '{}'::jsonb,
  add column if not exists after jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

create index if not exists audit_log_entity_idx on comms.audit_log (entity_type, entity_id);
create index if not exists audit_log_project_created_idx on comms.audit_log (project_id, created_at desc);

-- Named constraints, each added only when a pre-existing table lacks it.
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('comms.audit_log', 'audit_log_pkey', 'primary key (id)'),
      ('comms.audit_log', 'audit_log_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade')
    ) as v(tbl, name, def)
  loop
    if not exists (select 1 from pg_constraint where conrelid = c.tbl::regclass and conname = c.name) then
      execute format('alter table %s add constraint %I %s', c.tbl, c.name, c.def);
    end if;
  end loop;
end;
$$;

-- ---- audit_write ------------------------------------------------------------

create or replace function comms.audit_write()
returns trigger
language plpgsql
security definer
set search_path = public, comms
as $$
declare
  v_entity text := TG_ARGV[0];
  v_action text;
  v_new jsonb := '{}'::jsonb;
  v_old jsonb := '{}'::jsonb;
  v_project uuid;
  v_entity_id uuid;
  v_actor uuid;
  v_actor_name text := '';
begin
  if v_entity is null or v_entity = '' then
    raise exception 'comms.audit_write: missing entity_type TG_ARGV[0]';
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := coalesce(row_to_json(NEW)::jsonb, '{}'::jsonb);
  end if;
  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := coalesce(row_to_json(OLD)::jsonb, '{}'::jsonb);
  end if;

  if TG_NARGS >= 2 and TG_ARGV[1] is not null and TG_ARGV[1] <> '' then
    v_action := TG_ARGV[1];
  else
    v_action := v_entity || '.' || case TG_OP
      when 'INSERT' then 'create'
      when 'UPDATE' then 'update'
      when 'DELETE' then 'delete'
      else lower(TG_OP)
    end;
  end if;

  begin
    v_project := nullif(coalesce(v_new->>'project_id', v_old->>'project_id'), '')::uuid;
  exception when others then
    v_project := null;
  end;

  begin
    v_entity_id := nullif(coalesce(v_new->>'id', v_old->>'id'), '')::uuid;
  exception when others then
    v_entity_id := null;
  end;

  begin
    v_actor := nullif(coalesce(
      v_new->>'actor_id', v_new->>'updated_by', v_new->>'created_by',
      v_old->>'actor_id', v_old->>'updated_by', v_old->>'created_by'
    ), '')::uuid;
  exception when others then
    v_actor := null;
  end;

  if v_actor is null then
    begin
      v_actor := auth.uid();
    exception when others then
      v_actor := null;
    end;
  end if;

  v_actor_name := coalesce(nullif(v_new->>'actor_name', ''), nullif(v_old->>'actor_name', ''), '');

  insert into comms.audit_log (project_id, actor_id, actor_name, action, entity_type, entity_id, before, after)
  values (v_project, v_actor, v_actor_name, v_action, v_entity, v_entity_id, v_old, v_new);

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
exception when others then
  -- The audit row is best-effort: never abort the triggering config write.
  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;
revoke all on function comms.audit_write() from public, anon;
grant execute on function comms.audit_write() to authenticated, service_role;

-- ---- audit triggers ---------------------------------------------------------

drop trigger if exists business_hours_audit_write on comms.business_hours;
create trigger business_hours_audit_write
after insert or update on comms.business_hours
for each row execute function comms.audit_write('business_hours');

drop trigger if exists custom_fields_audit_write on comms.custom_fields;
create trigger custom_fields_audit_write
after insert or update on comms.custom_fields
for each row execute function comms.audit_write('custom_fields');

drop trigger if exists macros_audit_write on comms.macros;
create trigger macros_audit_write
after insert or update on comms.macros
for each row execute function comms.audit_write('macros');

drop trigger if exists routing_rules_audit_write on comms.routing_rules;
create trigger routing_rules_audit_write
after insert or update on comms.routing_rules
for each row execute function comms.audit_write('routing_rules');

drop trigger if exists sla_policies_audit_write on comms.sla_policies;
create trigger sla_policies_audit_write
after insert or update on comms.sla_policies
for each row execute function comms.audit_write('sla_policies');

-- ---- grants + project-scoped RLS --------------------------------------------

revoke all on comms.audit_log from public, anon;
grant all on comms.audit_log to authenticated, service_role;

alter table comms.audit_log enable row level security;
drop policy if exists audit_log_project_scope_insert on comms.audit_log;
create policy audit_log_project_scope_insert on comms.audit_log for insert to authenticated
  with check (comms.can_access_project(project_id));
drop policy if exists audit_log_project_scope_select on comms.audit_log;
create policy audit_log_project_scope_select on comms.audit_log for select to authenticated
  using (comms.can_access_project(project_id));

-- @down

-- Forget-only on purpose: audit_log, audit_write() and its triggers predate
-- this file on the live database, so rolling back drops the ledger row and
-- nothing else.
select 1;
