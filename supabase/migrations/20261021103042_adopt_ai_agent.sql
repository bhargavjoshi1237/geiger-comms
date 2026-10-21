-- Adopt the AI agent tables
--
-- Brings into the repo the AI Agent configuration tables the lost ai_agent and
-- quality migrations created (ledger versions 20260910015334, 20260910020723)
-- that 20261021102003_adopt_knowledge_base does not cover. This file
-- re-declares their exact live DDL, idempotently: on the live database every
-- statement is a no-op or a same-definition replace; on a fresh one it builds
-- them.
--
-- Owns:
--   comms.agent_actions, agent_guardrails, agent_policies, agent_procedures
--                            per-version agent configuration
--   comms.agent_tests, agent_test_runs     regression tests and their runs
--   comms.agent_scorecards, agent_scores   AI answer grading
--   comms.guardrail_hits                   guardrail trigger log
--   (tables, constraints, indexes, touch triggers, RLS, grants)
--
-- Depends on (owned elsewhere, all earlier versions):
--   comms.can_access_project(uuid)  20260821182908_adopt_rbac
--   comms.conversations             20260705072403_comms
--
-- version_id references comms.agent_versions (20261021102003_adopt_knowledge_base)
-- by convention only: live has no foreign key there. All nine tables are empty
-- live.

-- @up

create extension if not exists pgcrypto;
create schema if not exists comms;
grant usage on schema comms to anon, authenticated, service_role;

create or replace function comms.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ---- agent_actions ----------------------------------------------------------

create table if not exists comms.agent_actions (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  version_id uuid,
  name text not null default '',
  description text not null default '',
  input_schema jsonb not null default '{}'::jsonb,
  target jsonb not null default '{}'::jsonb,
  rate_limit_per_min integer not null default 60,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint agent_actions_pkey primary key (id),
  constraint agent_actions_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.agent_actions
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists version_id uuid,
  add column if not exists name text not null default '',
  add column if not exists description text not null default '',
  add column if not exists input_schema jsonb not null default '{}'::jsonb,
  add column if not exists target jsonb not null default '{}'::jsonb,
  add column if not exists rate_limit_per_min integer not null default 60,
  add column if not exists enabled boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists agent_actions_project_idx on comms.agent_actions (project_id) where deleted_at is null;
create index if not exists agent_actions_project_version_idx on comms.agent_actions (project_id, version_id) where deleted_at is null;

drop trigger if exists agent_actions_touch_updated_at on comms.agent_actions;
create trigger agent_actions_touch_updated_at
before update on comms.agent_actions
for each row execute function comms.touch_updated_at();

-- ---- agent_guardrails -------------------------------------------------------

create table if not exists comms.agent_guardrails (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  version_id uuid,
  kind text not null,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint agent_guardrails_pkey primary key (id),
  constraint agent_guardrails_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint agent_guardrails_kind_check check (kind = any (array['blocked_topic', 'disclaimer', 'escalation', 'failsafe']))
);

alter table comms.agent_guardrails
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists version_id uuid,
  add column if not exists kind text not null,
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists enabled boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists agent_guardrails_project_idx on comms.agent_guardrails (project_id) where deleted_at is null;
create index if not exists agent_guardrails_project_version_idx on comms.agent_guardrails (project_id, version_id) where deleted_at is null;

drop trigger if exists agent_guardrails_touch_updated_at on comms.agent_guardrails;
create trigger agent_guardrails_touch_updated_at
before update on comms.agent_guardrails
for each row execute function comms.touch_updated_at();

-- ---- agent_policies ---------------------------------------------------------

create table if not exists comms.agent_policies (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  version_id uuid,
  title text not null default '',
  body text not null default '',
  priority integer not null default 0,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint agent_policies_pkey primary key (id),
  constraint agent_policies_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.agent_policies
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists version_id uuid,
  add column if not exists title text not null default '',
  add column if not exists body text not null default '',
  add column if not exists priority integer not null default 0,
  add column if not exists enabled boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists agent_policies_project_idx on comms.agent_policies (project_id) where deleted_at is null;
create index if not exists agent_policies_project_version_idx on comms.agent_policies (project_id, version_id) where deleted_at is null;

drop trigger if exists agent_policies_touch_updated_at on comms.agent_policies;
create trigger agent_policies_touch_updated_at
before update on comms.agent_policies
for each row execute function comms.touch_updated_at();

-- ---- agent_procedures -------------------------------------------------------

create table if not exists comms.agent_procedures (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  version_id uuid,
  name text not null default '',
  steps jsonb not null default '[]'::jsonb,
  triggers jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint agent_procedures_pkey primary key (id),
  constraint agent_procedures_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.agent_procedures
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists version_id uuid,
  add column if not exists name text not null default '',
  add column if not exists steps jsonb not null default '[]'::jsonb,
  add column if not exists triggers jsonb not null default '{}'::jsonb,
  add column if not exists enabled boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists agent_procedures_project_idx on comms.agent_procedures (project_id) where deleted_at is null;
create index if not exists agent_procedures_project_version_idx on comms.agent_procedures (project_id, version_id) where deleted_at is null;

drop trigger if exists agent_procedures_touch_updated_at on comms.agent_procedures;
create trigger agent_procedures_touch_updated_at
before update on comms.agent_procedures
for each row execute function comms.touch_updated_at();

-- ---- agent_tests ------------------------------------------------------------

create table if not exists comms.agent_tests (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  input text not null default '',
  expected jsonb not null default '{}'::jsonb,
  sources text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint agent_tests_pkey primary key (id),
  constraint agent_tests_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.agent_tests
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists input text not null default '',
  add column if not exists expected jsonb not null default '{}'::jsonb,
  add column if not exists sources text[] not null default '{}'::text[],
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists agent_tests_project_idx on comms.agent_tests (project_id) where deleted_at is null;

drop trigger if exists agent_tests_touch_updated_at on comms.agent_tests;
create trigger agent_tests_touch_updated_at
before update on comms.agent_tests
for each row execute function comms.touch_updated_at();

-- ---- agent_test_runs --------------------------------------------------------

create table if not exists comms.agent_test_runs (
  id uuid not null default gen_random_uuid(),
  test_id uuid,
  version_id uuid,
  status text not null,
  output jsonb not null default '{}'::jsonb,
  diff jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint agent_test_runs_pkey primary key (id),
  constraint agent_test_runs_test_id_fkey foreign key (test_id) references comms.agent_tests(id) on delete cascade,
  constraint agent_test_runs_status_check check (status = any (array['pass', 'fail', 'error']))
);

alter table comms.agent_test_runs
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists test_id uuid,
  add column if not exists version_id uuid,
  add column if not exists status text not null,
  add column if not exists output jsonb not null default '{}'::jsonb,
  add column if not exists diff jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists agent_test_runs_test_idx on comms.agent_test_runs (test_id) where deleted_at is null;

drop trigger if exists agent_test_runs_touch_updated_at on comms.agent_test_runs;
create trigger agent_test_runs_touch_updated_at
before update on comms.agent_test_runs
for each row execute function comms.touch_updated_at();

-- ---- agent_scorecards -------------------------------------------------------

create table if not exists comms.agent_scorecards (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  name text not null default '',
  criteria jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint agent_scorecards_pkey primary key (id),
  constraint agent_scorecards_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.agent_scorecards
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists name text not null default '',
  add column if not exists criteria jsonb not null default '[]'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists agent_scorecards_project_idx on comms.agent_scorecards (project_id) where deleted_at is null;

drop trigger if exists agent_scorecards_touch_updated_at on comms.agent_scorecards;
create trigger agent_scorecards_touch_updated_at
before update on comms.agent_scorecards
for each row execute function comms.touch_updated_at();

-- ---- agent_scores -----------------------------------------------------------

create table if not exists comms.agent_scores (
  id uuid not null default gen_random_uuid(),
  scorecard_id uuid,
  conversation_id uuid,
  version_id uuid,
  score numeric,
  rationale text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint agent_scores_pkey primary key (id),
  constraint agent_scores_conversation_id_fkey foreign key (conversation_id) references comms.conversations(id) on delete set null,
  constraint agent_scores_scorecard_id_fkey foreign key (scorecard_id) references comms.agent_scorecards(id) on delete cascade
);

alter table comms.agent_scores
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists scorecard_id uuid,
  add column if not exists conversation_id uuid,
  add column if not exists version_id uuid,
  add column if not exists score numeric,
  add column if not exists rationale text not null default '',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists agent_scores_scorecard_idx on comms.agent_scores (scorecard_id) where deleted_at is null;

drop trigger if exists agent_scores_touch_updated_at on comms.agent_scores;
create trigger agent_scores_touch_updated_at
before update on comms.agent_scores
for each row execute function comms.touch_updated_at();

-- ---- guardrail_hits ---------------------------------------------------------

create table if not exists comms.guardrail_hits (
  id uuid not null default gen_random_uuid(),
  guardrail_id uuid,
  conversation_id uuid,
  detail jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint guardrail_hits_pkey primary key (id),
  constraint guardrail_hits_conversation_id_fkey foreign key (conversation_id) references comms.conversations(id) on delete set null,
  constraint guardrail_hits_guardrail_id_fkey foreign key (guardrail_id) references comms.agent_guardrails(id) on delete cascade
);

alter table comms.guardrail_hits
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists guardrail_id uuid,
  add column if not exists conversation_id uuid,
  add column if not exists detail jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists guardrail_hits_guardrail_idx on comms.guardrail_hits (guardrail_id) where deleted_at is null;

drop trigger if exists guardrail_hits_touch_updated_at on comms.guardrail_hits;
create trigger guardrail_hits_touch_updated_at
before update on comms.guardrail_hits
for each row execute function comms.touch_updated_at();

-- ---- constraints ------------------------------------------------------------

-- Named constraints, each added only when a pre-existing table lacks it.
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('comms.agent_actions', 'agent_actions_pkey', 'primary key (id)'),
      ('comms.agent_guardrails', 'agent_guardrails_pkey', 'primary key (id)'),
      ('comms.agent_policies', 'agent_policies_pkey', 'primary key (id)'),
      ('comms.agent_procedures', 'agent_procedures_pkey', 'primary key (id)'),
      ('comms.agent_tests', 'agent_tests_pkey', 'primary key (id)'),
      ('comms.agent_test_runs', 'agent_test_runs_pkey', 'primary key (id)'),
      ('comms.agent_scorecards', 'agent_scorecards_pkey', 'primary key (id)'),
      ('comms.agent_scores', 'agent_scores_pkey', 'primary key (id)'),
      ('comms.guardrail_hits', 'guardrail_hits_pkey', 'primary key (id)'),
      ('comms.agent_actions', 'agent_actions_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.agent_guardrails', 'agent_guardrails_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.agent_policies', 'agent_policies_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.agent_procedures', 'agent_procedures_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.agent_tests', 'agent_tests_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.agent_test_runs', 'agent_test_runs_test_id_fkey', 'foreign key (test_id) references comms.agent_tests(id) on delete cascade'),
      ('comms.agent_scorecards', 'agent_scorecards_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.agent_scores', 'agent_scores_conversation_id_fkey', 'foreign key (conversation_id) references comms.conversations(id) on delete set null'),
      ('comms.agent_scores', 'agent_scores_scorecard_id_fkey', 'foreign key (scorecard_id) references comms.agent_scorecards(id) on delete cascade'),
      ('comms.guardrail_hits', 'guardrail_hits_conversation_id_fkey', 'foreign key (conversation_id) references comms.conversations(id) on delete set null'),
      ('comms.guardrail_hits', 'guardrail_hits_guardrail_id_fkey', 'foreign key (guardrail_id) references comms.agent_guardrails(id) on delete cascade'),
      ('comms.agent_guardrails', 'agent_guardrails_kind_check', $c$check (kind = any (array['blocked_topic', 'disclaimer', 'escalation', 'failsafe']))$c$),
      ('comms.agent_test_runs', 'agent_test_runs_status_check', $c$check (status = any (array['pass', 'fail', 'error']))$c$)
    ) as v(tbl, name, def)
  loop
    if not exists (select 1 from pg_constraint where conrelid = c.tbl::regclass and conname = c.name) then
      execute format('alter table %s add constraint %I %s', c.tbl, c.name, c.def);
    end if;
  end loop;
end;
$$;

-- ---- grants + project-scoped RLS --------------------------------------------

revoke all on
  comms.agent_actions, comms.agent_guardrails, comms.agent_policies, comms.agent_procedures,
  comms.agent_tests, comms.agent_test_runs, comms.agent_scorecards, comms.agent_scores,
  comms.guardrail_hits
  from public, anon;
grant all on
  comms.agent_actions, comms.agent_guardrails, comms.agent_policies, comms.agent_procedures,
  comms.agent_tests, comms.agent_test_runs, comms.agent_scorecards, comms.agent_scores,
  comms.guardrail_hits
  to authenticated, service_role;

alter table comms.agent_actions enable row level security;
drop policy if exists agent_actions_project_scope on comms.agent_actions;
create policy agent_actions_project_scope on comms.agent_actions for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.agent_guardrails enable row level security;
drop policy if exists agent_guardrails_project_scope on comms.agent_guardrails;
create policy agent_guardrails_project_scope on comms.agent_guardrails for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.agent_policies enable row level security;
drop policy if exists agent_policies_project_scope on comms.agent_policies;
create policy agent_policies_project_scope on comms.agent_policies for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.agent_procedures enable row level security;
drop policy if exists agent_procedures_project_scope on comms.agent_procedures;
create policy agent_procedures_project_scope on comms.agent_procedures for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.agent_tests enable row level security;
drop policy if exists agent_tests_project_scope on comms.agent_tests;
create policy agent_tests_project_scope on comms.agent_tests for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.agent_test_runs enable row level security;
drop policy if exists agent_test_runs_project_scope on comms.agent_test_runs;
create policy agent_test_runs_project_scope on comms.agent_test_runs for all to authenticated
  using (exists (
    select 1 from comms.agent_tests t
    where t.id = agent_test_runs.test_id and comms.can_access_project(t.project_id)
  ))
  with check (exists (
    select 1 from comms.agent_tests t
    where t.id = agent_test_runs.test_id and comms.can_access_project(t.project_id)
  ));

alter table comms.agent_scorecards enable row level security;
drop policy if exists agent_scorecards_project_scope on comms.agent_scorecards;
create policy agent_scorecards_project_scope on comms.agent_scorecards for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.agent_scores enable row level security;
drop policy if exists agent_scores_project_scope on comms.agent_scores;
create policy agent_scores_project_scope on comms.agent_scores for all to authenticated
  using (exists (
    select 1 from comms.agent_scorecards s
    where s.id = agent_scores.scorecard_id and comms.can_access_project(s.project_id)
  ))
  with check (exists (
    select 1 from comms.agent_scorecards s
    where s.id = agent_scores.scorecard_id and comms.can_access_project(s.project_id)
  ));

alter table comms.guardrail_hits enable row level security;
drop policy if exists guardrail_hits_project_scope on comms.guardrail_hits;
create policy guardrail_hits_project_scope on comms.guardrail_hits for all to authenticated
  using (exists (
    select 1 from comms.agent_guardrails g
    where g.id = guardrail_hits.guardrail_id and comms.can_access_project(g.project_id)
  ))
  with check (exists (
    select 1 from comms.agent_guardrails g
    where g.id = guardrail_hits.guardrail_id and comms.can_access_project(g.project_id)
  ));

-- @down

-- Forget-only on purpose: these tables predate this file on the live database,
-- so rolling back drops the ledger row and nothing else.
select 1;
