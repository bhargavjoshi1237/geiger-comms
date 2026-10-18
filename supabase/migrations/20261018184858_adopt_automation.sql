-- Adopt automation
--
-- Brings the five Automation tables into the repo. They were created on the
-- shared database by the September migrations whose files were lost (ledger
-- versions 20260909194512 … 20260910020849 — workflows, macros, routing_rules,
-- sla_policies), so a database built from the repo alone never had them. This
-- file re-declares their exact live DDL, idempotently: on the live database
-- every statement is a no-op or a same-definition replace; on a fresh one it
-- builds them.
--
-- Owns:
--   comms.workflows, comms.workflow_runs, comms.macros, comms.routing_rules,
--   comms.sla_policies (tables, indexes, triggers, RLS)
--   comms.touch_workflow_on_run()   bumps a workflow's run_count per run
--
-- Depends on (owned elsewhere, all earlier versions):
--   comms.can_access_project(uuid)  20260821182908_adopt_rbac
--   comms.conversations             20260705072403_comms
--   comms.teammates                 20260825120523_inbox_identity
--   comms.member_groups             20260825112725_rbac_team_management
--   comms.audit_write()             lost audit_log migration — its triggers are
--                                   only attached when the function exists
--
-- The engines that read these tables (comms.assign_next, the
-- conversations_apply_sla trigger, comms.sla_due_at) are not adopted here.

-- @up

create extension if not exists pgcrypto;
create schema if not exists comms;
grant usage on schema comms to anon, authenticated, service_role;

create or replace function comms.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ---- workflows ---------------------------------------------------------------

create table if not exists comms.workflows (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null default 'Untitled workflow',
  trigger text not null default 'created',
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  position integer not null default 0,
  run_count integer not null default 0,
  last_run_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint workflows_status_check check (status = any (array['draft', 'live', 'archived'])),
  constraint workflows_trigger_check check (trigger = any (array['created', 'replied', 'tagged', 'state_changed']))
);

alter table comms.workflows add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table comms.workflows add column if not exists name text not null default 'Untitled workflow';
alter table comms.workflows add column if not exists trigger text not null default 'created';
alter table comms.workflows add column if not exists conditions jsonb not null default '{}'::jsonb;
alter table comms.workflows add column if not exists actions jsonb not null default '[]'::jsonb;
alter table comms.workflows add column if not exists status text not null default 'draft';
alter table comms.workflows add column if not exists position integer not null default 0;
alter table comms.workflows add column if not exists run_count integer not null default 0;
alter table comms.workflows add column if not exists last_run_at timestamptz;
alter table comms.workflows add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table comms.workflows add column if not exists created_by uuid;
alter table comms.workflows add column if not exists created_at timestamptz not null default now();
alter table comms.workflows add column if not exists updated_at timestamptz not null default now();
alter table comms.workflows add column if not exists deleted_at timestamptz;

create index if not exists workflows_project_status_idx
  on comms.workflows (project_id, status) where deleted_at is null;
create index if not exists workflows_project_position_idx
  on comms.workflows (project_id, position) where deleted_at is null;

drop trigger if exists workflows_touch_updated_at on comms.workflows;
create trigger workflows_touch_updated_at
before update on comms.workflows
for each row execute function comms.touch_updated_at();

-- ---- workflow_runs -----------------------------------------------------------

create table if not exists comms.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references comms.workflows(id) on delete cascade,
  conversation_id uuid references comms.conversations(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  status text not null default 'ok',
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table comms.workflow_runs add column if not exists conversation_id uuid references comms.conversations(id) on delete set null;
alter table comms.workflow_runs add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table comms.workflow_runs add column if not exists status text not null default 'ok';
alter table comms.workflow_runs add column if not exists input jsonb not null default '{}'::jsonb;
alter table comms.workflow_runs add column if not exists output jsonb not null default '{}'::jsonb;
alter table comms.workflow_runs add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table comms.workflow_runs add column if not exists created_at timestamptz not null default now();

create index if not exists workflow_runs_workflow_idx
  on comms.workflow_runs (workflow_id, created_at desc);
create index if not exists workflow_runs_conversation_idx
  on comms.workflow_runs (conversation_id, created_at desc);
create index if not exists workflow_runs_project_idx
  on comms.workflow_runs (project_id, created_at desc);

-- Each recorded run bumps its workflow's counters.
create or replace function comms.touch_workflow_on_run()
returns trigger
language plpgsql
as $$
begin
  update comms.workflows
     set run_count = coalesce(run_count, 0) + 1,
         last_run_at = now()
   where id = new.workflow_id;
  return new;
end;
$$;
revoke all on function comms.touch_workflow_on_run() from public, anon;
grant execute on function comms.touch_workflow_on_run() to authenticated, service_role;

drop trigger if exists workflow_runs_touch_workflow on comms.workflow_runs;
create trigger workflow_runs_touch_workflow
after insert on comms.workflow_runs
for each row execute function comms.touch_workflow_on_run();

-- ---- macros ------------------------------------------------------------------

create table if not exists comms.macros (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  body text not null default '',
  scope text not null default 'personal',
  actions jsonb not null default '[]'::jsonb,
  usage_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint macros_scope_check check (scope = any (array['personal', 'team']))
);

alter table comms.macros add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table comms.macros add column if not exists body text not null default '';
alter table comms.macros add column if not exists scope text not null default 'personal';
alter table comms.macros add column if not exists actions jsonb not null default '[]'::jsonb;
alter table comms.macros add column if not exists usage_count integer not null default 0;
alter table comms.macros add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table comms.macros add column if not exists created_by uuid;
alter table comms.macros add column if not exists created_at timestamptz not null default now();
alter table comms.macros add column if not exists updated_at timestamptz not null default now();
alter table comms.macros add column if not exists deleted_at timestamptz;

drop trigger if exists macros_touch_updated_at on comms.macros;
create trigger macros_touch_updated_at
before update on comms.macros
for each row execute function comms.touch_updated_at();

-- ---- routing_rules -----------------------------------------------------------

create table if not exists comms.routing_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null default 'Untitled rule',
  match jsonb not null default '{}'::jsonb,
  strategy text not null default 'round_robin',
  team_id uuid references comms.member_groups(id) on delete set null,
  fallback_assignee uuid references comms.teammates(id) on delete set null,
  position integer not null default 0,
  enabled boolean not null default true,
  last_assignee_id uuid references comms.teammates(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint routing_rules_strategy_check check (strategy = any (array['round_robin', 'direct', 'load']))
);

alter table comms.routing_rules add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table comms.routing_rules add column if not exists name text not null default 'Untitled rule';
alter table comms.routing_rules add column if not exists match jsonb not null default '{}'::jsonb;
alter table comms.routing_rules add column if not exists strategy text not null default 'round_robin';
alter table comms.routing_rules add column if not exists team_id uuid references comms.member_groups(id) on delete set null;
alter table comms.routing_rules add column if not exists fallback_assignee uuid references comms.teammates(id) on delete set null;
alter table comms.routing_rules add column if not exists position integer not null default 0;
alter table comms.routing_rules add column if not exists enabled boolean not null default true;
alter table comms.routing_rules add column if not exists last_assignee_id uuid references comms.teammates(id) on delete set null;
alter table comms.routing_rules add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table comms.routing_rules add column if not exists created_by uuid;
alter table comms.routing_rules add column if not exists created_at timestamptz not null default now();
alter table comms.routing_rules add column if not exists updated_at timestamptz not null default now();
alter table comms.routing_rules add column if not exists deleted_at timestamptz;

drop trigger if exists routing_rules_touch_updated_at on comms.routing_rules;
create trigger routing_rules_touch_updated_at
before update on comms.routing_rules
for each row execute function comms.touch_updated_at();

-- ---- sla_policies ------------------------------------------------------------

create table if not exists comms.sla_policies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null default '',
  first_response_mins integer default 60,
  next_response_mins integer,
  resolution_mins integer default 1440,
  scope jsonb not null default '{}'::jsonb,
  business_hours_id uuid,
  enabled boolean not null default true,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table comms.sla_policies add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table comms.sla_policies add column if not exists name text not null default '';
alter table comms.sla_policies add column if not exists first_response_mins integer default 60;
alter table comms.sla_policies add column if not exists next_response_mins integer;
alter table comms.sla_policies add column if not exists resolution_mins integer default 1440;
alter table comms.sla_policies add column if not exists scope jsonb not null default '{}'::jsonb;
alter table comms.sla_policies add column if not exists business_hours_id uuid;
alter table comms.sla_policies add column if not exists enabled boolean not null default true;
alter table comms.sla_policies add column if not exists position integer not null default 0;
alter table comms.sla_policies add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table comms.sla_policies add column if not exists created_by uuid;
alter table comms.sla_policies add column if not exists created_at timestamptz not null default now();
alter table comms.sla_policies add column if not exists updated_at timestamptz not null default now();
alter table comms.sla_policies add column if not exists deleted_at timestamptz;

drop trigger if exists sla_policies_touch_updated_at on comms.sla_policies;
create trigger sla_policies_touch_updated_at
before update on comms.sla_policies
for each row execute function comms.touch_updated_at();

-- ---- audit triggers (only where the lost audit_write() exists) -----------------

do $$
begin
  if to_regprocedure('comms.audit_write()') is not null then
    drop trigger if exists macros_audit_write on comms.macros;
    create trigger macros_audit_write after insert or update on comms.macros
      for each row execute function comms.audit_write('macros');
    drop trigger if exists routing_rules_audit_write on comms.routing_rules;
    create trigger routing_rules_audit_write after insert or update on comms.routing_rules
      for each row execute function comms.audit_write('routing_rules');
    drop trigger if exists sla_policies_audit_write on comms.sla_policies;
    create trigger sla_policies_audit_write after insert or update on comms.sla_policies
      for each row execute function comms.audit_write('sla_policies');
  end if;
end;
$$;

-- ---- grants + project-scoped RLS ------------------------------------------------

revoke all on comms.workflows, comms.workflow_runs, comms.macros, comms.routing_rules, comms.sla_policies from anon;
grant select, insert, update, delete, truncate, references, trigger
  on comms.workflows, comms.workflow_runs, comms.macros, comms.routing_rules, comms.sla_policies
  to authenticated, service_role;

alter table comms.workflows enable row level security;
drop policy if exists workflows_project_scope on comms.workflows;
create policy workflows_project_scope on comms.workflows for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.workflow_runs enable row level security;
drop policy if exists workflow_runs_project_scope on comms.workflow_runs;
create policy workflow_runs_project_scope on comms.workflow_runs for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.macros enable row level security;
drop policy if exists macros_project_scope on comms.macros;
create policy macros_project_scope on comms.macros for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.routing_rules enable row level security;
drop policy if exists routing_rules_project_scope on comms.routing_rules;
create policy routing_rules_project_scope on comms.routing_rules for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.sla_policies enable row level security;
drop policy if exists sla_policies_project_scope on comms.sla_policies;
create policy sla_policies_project_scope on comms.sla_policies for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

-- @down

-- Forget-only on purpose: these tables and their rows predate this file on the
-- live database, so rolling back drops the ledger row and nothing else.
select 1;
