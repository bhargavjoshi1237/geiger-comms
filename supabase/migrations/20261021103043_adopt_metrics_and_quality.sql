-- Adopt metrics and quality
--
-- Brings into the repo the reporting tables the lost metrics, measure_aux and
-- quality migrations created (ledger versions 20260910015332, 20260910020005,
-- 20260910020723) that 20261021102003_adopt_knowledge_base does not cover. This
-- file re-declares their exact live DDL, idempotently: on the live database
-- every statement is a no-op or a same-definition replace; on a fresh one it
-- builds them.
--
-- Owns:
--   comms.conversation_metrics  daily rollup per (project, day, channel, team, topic)
--   comms.monitors, monitor_events  metric threshold alerts and their firings
--   comms.dashboards            saved custom report layouts
--   comms.qa_scorecards, qa_reviews  conversation quality reviews
--   (tables, constraints, indexes, touch triggers, RLS, grants)
--
-- Depends on (owned elsewhere, all earlier versions):
--   comms.can_access_project(uuid)  20260821182908_adopt_rbac
--   comms.conversations             20260705072403_comms
--   comms.member_groups             20260825112725_rbac_team_management
--   comms.topics                    20261021102003_adopt_knowledge_base (its @down
--                                   drops topics with cascade, which takes
--                                   conversation_metrics_topic_id_fkey with it)
--
-- conversation_metrics has no id; its grain is the unique key. All six tables
-- are empty live.

-- @up

create extension if not exists pgcrypto;
create schema if not exists comms;
grant usage on schema comms to anon, authenticated, service_role;

create or replace function comms.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ---- conversation_metrics ---------------------------------------------------

create table if not exists comms.conversation_metrics (
  project_id uuid,
  day date not null,
  channel text not null default 'all',
  team_id uuid,
  topic_id uuid,
  volume integer not null default 0,
  resolved integer not null default 0,
  deflected integer not null default 0,
  escalated integer not null default 0,
  csat_sum numeric not null default 0,
  csat_n integer not null default 0,
  frt_secs_sum bigint not null default 0,
  frt_n integer not null default 0,
  constraint conversation_metrics_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint conversation_metrics_team_id_fkey foreign key (team_id) references comms.member_groups(id) on delete set null,
  constraint conversation_metrics_topic_id_fkey foreign key (topic_id) references comms.topics(id) on delete set null,
  constraint conversation_metrics_grain_key unique (project_id, day, channel, team_id, topic_id)
);

alter table comms.conversation_metrics
  add column if not exists project_id uuid,
  add column if not exists day date not null,
  add column if not exists channel text not null default 'all',
  add column if not exists team_id uuid,
  add column if not exists topic_id uuid,
  add column if not exists volume integer not null default 0,
  add column if not exists resolved integer not null default 0,
  add column if not exists deflected integer not null default 0,
  add column if not exists escalated integer not null default 0,
  add column if not exists csat_sum numeric not null default 0,
  add column if not exists csat_n integer not null default 0,
  add column if not exists frt_secs_sum bigint not null default 0,
  add column if not exists frt_n integer not null default 0;

create index if not exists conversation_metrics_project_day_idx on comms.conversation_metrics (project_id, day);

-- ---- monitors ---------------------------------------------------------------

create table if not exists comms.monitors (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  name text not null default '',
  metric text not null default 'resolution_rate',
  op text not null default 'below',
  threshold numeric not null default 0,
  scope jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint monitors_pkey primary key (id),
  constraint monitors_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint monitors_op_check check (op = any (array['above', 'below']))
);

alter table comms.monitors
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists name text not null default '',
  add column if not exists metric text not null default 'resolution_rate',
  add column if not exists op text not null default 'below',
  add column if not exists threshold numeric not null default 0,
  add column if not exists scope jsonb not null default '{}'::jsonb,
  add column if not exists enabled boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists monitors_project_idx on comms.monitors (project_id) where deleted_at is null;

drop trigger if exists monitors_touch_updated_at on comms.monitors;
create trigger monitors_touch_updated_at
before update on comms.monitors
for each row execute function comms.touch_updated_at();

-- ---- monitor_events ---------------------------------------------------------

create table if not exists comms.monitor_events (
  id uuid not null default gen_random_uuid(),
  monitor_id uuid not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint monitor_events_pkey primary key (id),
  constraint monitor_events_monitor_id_fkey foreign key (monitor_id) references comms.monitors(id) on delete cascade
);

alter table comms.monitor_events
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists monitor_id uuid not null,
  add column if not exists value jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

create index if not exists monitor_events_monitor_idx on comms.monitor_events (monitor_id, created_at desc);

-- ---- dashboards -------------------------------------------------------------

create table if not exists comms.dashboards (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  name text not null default '',
  layout jsonb not null default '[]'::jsonb,
  is_private boolean not null default true,
  team_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint dashboards_pkey primary key (id),
  constraint dashboards_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint dashboards_team_id_fkey foreign key (team_id) references comms.member_groups(id) on delete set null
);

alter table comms.dashboards
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists name text not null default '',
  add column if not exists layout jsonb not null default '[]'::jsonb,
  add column if not exists is_private boolean not null default true,
  add column if not exists team_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists dashboards_project_idx on comms.dashboards (project_id) where deleted_at is null;

drop trigger if exists dashboards_touch_updated_at on comms.dashboards;
create trigger dashboards_touch_updated_at
before update on comms.dashboards
for each row execute function comms.touch_updated_at();

-- ---- qa_scorecards ----------------------------------------------------------

create table if not exists comms.qa_scorecards (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  name text not null default '',
  criteria jsonb not null default '[]'::jsonb,
  sampling jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint qa_scorecards_pkey primary key (id),
  constraint qa_scorecards_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.qa_scorecards
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists name text not null default '',
  add column if not exists criteria jsonb not null default '[]'::jsonb,
  add column if not exists sampling jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists qa_scorecards_project_idx on comms.qa_scorecards (project_id) where deleted_at is null;

drop trigger if exists qa_scorecards_touch_updated_at on comms.qa_scorecards;
create trigger qa_scorecards_touch_updated_at
before update on comms.qa_scorecards
for each row execute function comms.touch_updated_at();

-- ---- qa_reviews -------------------------------------------------------------

create table if not exists comms.qa_reviews (
  id uuid not null default gen_random_uuid(),
  scorecard_id uuid not null,
  conversation_id uuid,
  scores jsonb not null default '{}'::jsonb,
  reviewer text,
  note text,
  created_at timestamptz not null default now(),
  constraint qa_reviews_pkey primary key (id),
  constraint qa_reviews_conversation_id_fkey foreign key (conversation_id) references comms.conversations(id) on delete set null,
  constraint qa_reviews_scorecard_id_fkey foreign key (scorecard_id) references comms.qa_scorecards(id) on delete cascade
);

alter table comms.qa_reviews
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists scorecard_id uuid not null,
  add column if not exists conversation_id uuid,
  add column if not exists scores jsonb not null default '{}'::jsonb,
  add column if not exists reviewer text,
  add column if not exists note text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists qa_reviews_scorecard_idx on comms.qa_reviews (scorecard_id, created_at desc);

-- ---- constraints ------------------------------------------------------------

-- Named constraints, each added only when a pre-existing table lacks it.
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('comms.monitors', 'monitors_pkey', 'primary key (id)'),
      ('comms.monitor_events', 'monitor_events_pkey', 'primary key (id)'),
      ('comms.dashboards', 'dashboards_pkey', 'primary key (id)'),
      ('comms.qa_scorecards', 'qa_scorecards_pkey', 'primary key (id)'),
      ('comms.qa_reviews', 'qa_reviews_pkey', 'primary key (id)'),
      ('comms.conversation_metrics', 'conversation_metrics_grain_key', 'unique (project_id, day, channel, team_id, topic_id)'),
      ('comms.conversation_metrics', 'conversation_metrics_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.conversation_metrics', 'conversation_metrics_team_id_fkey', 'foreign key (team_id) references comms.member_groups(id) on delete set null'),
      ('comms.conversation_metrics', 'conversation_metrics_topic_id_fkey', 'foreign key (topic_id) references comms.topics(id) on delete set null'),
      ('comms.monitors', 'monitors_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.monitor_events', 'monitor_events_monitor_id_fkey', 'foreign key (monitor_id) references comms.monitors(id) on delete cascade'),
      ('comms.dashboards', 'dashboards_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.dashboards', 'dashboards_team_id_fkey', 'foreign key (team_id) references comms.member_groups(id) on delete set null'),
      ('comms.qa_scorecards', 'qa_scorecards_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.qa_reviews', 'qa_reviews_conversation_id_fkey', 'foreign key (conversation_id) references comms.conversations(id) on delete set null'),
      ('comms.qa_reviews', 'qa_reviews_scorecard_id_fkey', 'foreign key (scorecard_id) references comms.qa_scorecards(id) on delete cascade'),
      ('comms.monitors', 'monitors_op_check', $c$check (op = any (array['above', 'below']))$c$)
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
  comms.conversation_metrics, comms.monitors, comms.monitor_events, comms.dashboards,
  comms.qa_scorecards, comms.qa_reviews
  from public, anon;
grant all on
  comms.conversation_metrics, comms.monitors, comms.monitor_events, comms.dashboards,
  comms.qa_scorecards, comms.qa_reviews
  to authenticated, service_role;

alter table comms.conversation_metrics enable row level security;
drop policy if exists conversation_metrics_project_all on comms.conversation_metrics;
create policy conversation_metrics_project_all on comms.conversation_metrics for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.monitors enable row level security;
drop policy if exists monitors_project_all on comms.monitors;
create policy monitors_project_all on comms.monitors for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.monitor_events enable row level security;
drop policy if exists monitor_events_project_scope on comms.monitor_events;
create policy monitor_events_project_scope on comms.monitor_events for all to authenticated
  using (exists (
    select 1 from comms.monitors m
    where m.id = monitor_events.monitor_id and comms.can_access_project(m.project_id)
  ))
  with check (exists (
    select 1 from comms.monitors m
    where m.id = monitor_events.monitor_id and comms.can_access_project(m.project_id)
  ));

alter table comms.dashboards enable row level security;
drop policy if exists dashboards_project_all on comms.dashboards;
create policy dashboards_project_all on comms.dashboards for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.qa_scorecards enable row level security;
drop policy if exists qa_scorecards_project_all on comms.qa_scorecards;
create policy qa_scorecards_project_all on comms.qa_scorecards for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.qa_reviews enable row level security;
drop policy if exists qa_reviews_project_scope on comms.qa_reviews;
create policy qa_reviews_project_scope on comms.qa_reviews for all to authenticated
  using (exists (
    select 1 from comms.qa_scorecards s
    where s.id = qa_reviews.scorecard_id and comms.can_access_project(s.project_id)
  ))
  with check (exists (
    select 1 from comms.qa_scorecards s
    where s.id = qa_reviews.scorecard_id and comms.can_access_project(s.project_id)
  ));

-- @down

-- Forget-only on purpose: these tables predate this file on the live database,
-- so rolling back drops the ledger row and nothing else.
select 1;
