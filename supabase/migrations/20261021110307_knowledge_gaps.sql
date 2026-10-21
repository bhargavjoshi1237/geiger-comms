-- Knowledge gaps
--
-- The Knowledge Gaps backlog (KB spec §7.8, §11): one signal per scanned conversation (later also Messenger questions
-- and reactions), a per-project refresh lease with resumable progress, and one recommendation per gap topic.
-- Owns: comms.knowledge_gap_signals, comms.knowledge_gap_refresh (tables, indexes, triggers, RLS, grants);
--   recommendations_topic_uniq; comms.claim_gap_refresh(), comms.release_gap_refresh(), comms.gap_candidates().
-- Uses as-is: comms.topics (metadata.kind = 'knowledge_gap'), comms.conversation_topics, comms.recommendations.
-- Depends on: those tables (20261021102003_adopt_knowledge_base), comms.can_access_project() (20260821182908_adopt_rbac).

-- @up

create extension if not exists pgcrypto;
create schema if not exists comms;
grant usage on schema comms to anon, authenticated, service_role;

create or replace function comms.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists comms.knowledge_gap_signals (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects(id) on delete cascade,
  source             text not null,
  outcome            text not null,
  question           text not null default '',
  conversation_id    uuid references comms.conversations(id) on delete cascade,
  matched_article_id uuid references comms.articles(id) on delete set null,
  match_score        numeric,
  topic_id           uuid references comms.topics(id) on delete set null,
  locale             text,
  occurred_at        timestamptz not null default now(),
  metadata           jsonb not null default '{}'::jsonb,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint knowledge_gap_signals_source_check check (source in ('conversation', 'ask', 'search', 'reaction')),
  constraint knowledge_gap_signals_outcome_check check (outcome in
    ('covered', 'no_match', 'weak_match', 'escalated', 'negative_reaction'))
);
comment on column comms.knowledge_gap_signals.question is
  'PII-redacted (lib/kb/gap_text.js), whitespace-collapsed, at most 500 characters.';

create unique index if not exists knowledge_gap_signals_conversation_uniq
  on comms.knowledge_gap_signals (conversation_id) where source = 'conversation' and deleted_at is null;
create index if not exists knowledge_gap_signals_project_idx
  on comms.knowledge_gap_signals (project_id, occurred_at desc) where deleted_at is null;
create index if not exists knowledge_gap_signals_topic_idx
  on comms.knowledge_gap_signals (topic_id) where deleted_at is null;

-- One row per project: the refresh lease, resumable progress and the "Last refreshed" time.
create table if not exists comms.knowledge_gap_refresh (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  lease_until timestamptz,
  started_at  timestamptz,
  finished_at timestamptz,
  progress    jsonb not null default '{}'::jsonb,
  metadata    jsonb not null default '{}'::jsonb,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint knowledge_gap_refresh_project_key unique (project_id)
);

-- One recommendation per gap topic, so two refreshes can't create duplicates.
create unique index if not exists recommendations_topic_uniq
  on comms.recommendations (project_id, (detail ->> 'topicId'))
  where deleted_at is null and detail ? 'topicId';

do $$
declare
  t text;
begin
  foreach t in array array['knowledge_gap_signals', 'knowledge_gap_refresh'] loop
    execute format('drop trigger if exists %I on comms.%I', t || '_touch_updated_at', t);
    execute format(
      'create trigger %I before update on comms.%I for each row execute function comms.touch_updated_at()',
      t || '_touch_updated_at', t
    );
    execute format('alter table comms.%I enable row level security', t);
    execute format('drop policy if exists %I on comms.%I', t || '_project_scope', t);
    execute format(
      'create policy %I on comms.%I for all to authenticated '
      'using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id))',
      t || '_project_scope', t
    );
  end loop;
end;
$$;

revoke all on comms.knowledge_gap_signals, comms.knowledge_gap_refresh from public, anon;
grant select, insert, update, delete on comms.knowledge_gap_signals, comms.knowledge_gap_refresh to authenticated;
grant all on comms.knowledge_gap_signals, comms.knowledge_gap_refresh to service_role;

-- Single flight: takes the project's 90-second lease when it is free, else returns null (another refresh is running).
create or replace function comms.claim_gap_refresh(p_project uuid)
returns comms.knowledge_gap_refresh
language sql
set search_path = ''
as $$
  insert into comms.knowledge_gap_refresh (project_id) values (p_project)
  on conflict (project_id) do nothing;
  update comms.knowledge_gap_refresh r
     set lease_until = now() + interval '90 seconds',
         started_at = case
           when r.started_at is null or (r.finished_at is not null and r.finished_at >= r.started_at) then now()
           else r.started_at
         end
   where r.project_id = p_project
     and (r.lease_until is null or r.lease_until < now())
  returning r.*;
$$;

create or replace function comms.release_gap_refresh(p_project uuid, p_done boolean, p_progress jsonb)
returns void
language sql
set search_path = ''
as $$
  update comms.knowledge_gap_refresh
     set lease_until = null,
         progress = coalesce(p_progress, progress),
         finished_at = case when p_done then now() else finished_at end
   where project_id = p_project;
$$;

-- Conversations a human had to answer, not yet scanned: closed or quiet for 24 h, with at least one agent reply.
-- The question is the conversation's first customer comment of at least 8 characters; newest conversations first.
create or replace function comms.gap_candidates(p_project uuid, p_since timestamptz, p_limit int default 500)
returns table (conversation_id uuid, question text, occurred_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select c.id, q.body, coalesce(c.closed_at, c.last_message_at, c.updated_at)
    from comms.conversations c
    cross join lateral (
      select m.body
        from comms.messages m
       where m.conversation_id = c.id
         and m.deleted_at is null
         and m.author_role = 'customer'
         and m.message_type = 'comment'
         and length(btrim(m.body)) >= 8
       order by m.created_at
       limit 1
    ) q
   where c.project_id = p_project
     and c.deleted_at is null
     and coalesce(c.closed_at, c.last_message_at, c.updated_at) >= p_since
     and (lower(c.status) = 'closed' or coalesce(c.last_message_at, c.updated_at) < now() - interval '24 hours')
     and exists (
       select 1 from comms.messages m
        where m.conversation_id = c.id and m.deleted_at is null
          and m.author_role = 'agent' and m.message_type = 'comment')
     and not exists (
       select 1 from comms.knowledge_gap_signals s
        where s.conversation_id = c.id and s.source = 'conversation' and s.deleted_at is null)
   order by coalesce(c.closed_at, c.last_message_at, c.updated_at) desc
   limit greatest(1, least(coalesce(p_limit, 500), 500))
$$;

revoke execute on function
  comms.claim_gap_refresh(uuid),
  comms.release_gap_refresh(uuid, boolean, jsonb),
  comms.gap_candidates(uuid, timestamptz, int)
  from public, anon;
grant execute on function
  comms.claim_gap_refresh(uuid),
  comms.release_gap_refresh(uuid, boolean, jsonb),
  comms.gap_candidates(uuid, timestamptz, int)
  to authenticated, service_role;

-- @down

-- Refuses on the shared database: it drops every stored customer question and the refresh history.
do $$
begin
  if coalesce(current_setting('comms.allow_destructive_down', true), '') <> 'on' then
    raise exception 'knowledge_gaps @down is destructive on the shared database; set comms.allow_destructive_down=on on a disposable database';
  end if;
end;
$$;

drop function if exists comms.gap_candidates(uuid, timestamptz, int);
drop function if exists comms.release_gap_refresh(uuid, boolean, jsonb);
drop function if exists comms.claim_gap_refresh(uuid);
drop index if exists comms.recommendations_topic_uniq;
drop table if exists comms.knowledge_gap_refresh cascade;
drop table if exists comms.knowledge_gap_signals cascade;
