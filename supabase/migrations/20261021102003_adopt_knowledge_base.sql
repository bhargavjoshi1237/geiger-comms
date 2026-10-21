-- Adopt the Knowledge Base + AI tables from the lost September migrations
--
-- Re-declares, exactly as introspected live on 2026-10-18 (re-verified 2026-10-21), the objects created by the
-- ledgered-but-lost 20260909210317_articles_authoring, 20260909210353_help_centers,
-- 20260909210425_brands, 20260909210524_rls_project_scope, 20260910015332_metrics and
-- 20260910015334_ai_agent migrations, so a fresh database builds them identically and the
-- shared database is a no-op.
-- Owns: comms.article_collections, comms.help_centers, comms.help_center_articles, comms.brands,
--   comms.knowledge_sources, comms.knowledge_chunks, comms.topics, comms.conversation_topics,
--   comms.recommendations, comms.ai_outcomes, comms.agent_versions (tables, constraints, indexes,
--   triggers, RLS, policies, grants); comms.articles collection_id/position/group_id/state and
--   the articles/posts project-scope policies; channels.brand_id and conversations.brand_id.
-- Does not own comms.can_access_project() (20260821182908_adopt_rbac) — it is only created here
--   when missing; comms.touch_updated_at() is re-declared locally per convention.
-- NEVER roll this back on the shared database: @down drops tables that predate this file there,
--   so it refuses unless comms.allow_destructive_down=on (set it only on a disposable database).

-- @up

create extension if not exists pgcrypto;
create extension if not exists vector with schema public;
create schema if not exists comms;
grant usage on schema comms to anon, authenticated, service_role;

-- Body matches the live prosrc (last declared by 20261018184858_adopt_automation), so the replace is a no-op.
create or replace function comms.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

revoke execute on function comms.touch_updated_at() from public, anon;
grant execute on function comms.touch_updated_at() to authenticated, service_role;

-- Created only when missing so adopt_rbac stays its single owner; body is byte-identical to it.
do $do$
begin
  if to_regprocedure('comms.can_access_project(uuid)') is null then
    -- Body lines stay flush-left so prosrc is byte-identical to the live function.
    execute $fn$
create function comms.can_access_project(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, comms, auth
as $body$
  select exists (
    select 1
    from public.projects p
    where p.id = target
      and (
        p.organization_id is null
        or public.is_org_member(p.organization_id)
        or p.created_by = auth.uid()
      )
  );
$body$
$fn$;
  end if;
end;
$do$;

revoke execute on function comms.can_access_project(uuid) from public, anon;
grant execute on function comms.can_access_project(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- brands
-- ---------------------------------------------------------------------------
create table if not exists comms.brands (
  id          uuid not null default gen_random_uuid(),
  project_id  uuid,
  name        text not null default '',
  slug        text not null default '',
  logo_url    text,
  color       text,
  reply_from  text,
  signature   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint brands_pkey primary key (id),
  constraint brands_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint brands_project_slug_key unique (project_id, slug)
);

alter table comms.brands
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists name text not null default '',
  add column if not exists slug text not null default '',
  add column if not exists logo_url text,
  add column if not exists color text,
  add column if not exists reply_from text,
  add column if not exists signature text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- article_collections (flat, project-scoped)
-- ---------------------------------------------------------------------------
create table if not exists comms.article_collections (
  id          uuid not null default gen_random_uuid(),
  project_id  uuid,
  name        text not null default 'Untitled collection',
  slug        text,
  description text not null default '',
  position    integer not null default 0,
  metadata    jsonb not null default '{}'::jsonb,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint article_collections_pkey primary key (id),
  constraint article_collections_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.article_collections
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists name text not null default 'Untitled collection',
  add column if not exists slug text,
  add column if not exists description text not null default '',
  add column if not exists position integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- articles (base table owned by 20260821225308_widget; authoring columns adopted here)
-- ---------------------------------------------------------------------------
create table if not exists comms.articles (
  id            uuid not null default gen_random_uuid(),
  title         text not null default '',
  slug          text,
  body          text not null default '',
  summary       text not null default '',
  published     boolean not null default false,
  locale        text not null default 'en',
  project_id    uuid,
  metadata      jsonb not null default '{}'::jsonb,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  collection_id uuid,
  position      integer not null default 0,
  group_id      uuid,
  state         text not null default 'draft',
  constraint articles_pkey primary key (id),
  constraint articles_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.articles
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists title text not null default '',
  add column if not exists slug text,
  add column if not exists body text not null default '',
  add column if not exists summary text not null default '',
  add column if not exists published boolean not null default false,
  add column if not exists locale text not null default 'en',
  add column if not exists project_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add column if not exists collection_id uuid,
  add column if not exists position integer not null default 0,
  add column if not exists group_id uuid;

-- state is added with a one-time backfill from the legacy published flag; skipped entirely when present.
do $$
begin
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'comms.articles'::regclass and attname = 'state' and not attisdropped
  ) then
    alter table comms.articles add column state text not null default 'draft';
    update comms.articles set state = 'published' where published;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- help_centers (brand_id deliberately has no FK — matches live)
-- ---------------------------------------------------------------------------
create table if not exists comms.help_centers (
  id             uuid not null default gen_random_uuid(),
  project_id     uuid,
  brand_id       uuid,
  slug           text not null default '',
  name           text not null default 'Untitled help center',
  domain         text not null default '',
  theme          jsonb not null default '{}'::jsonb,
  locales        text[] not null default '{en}'::text[],
  visibility     text not null default 'public',
  portal_enabled boolean not null default false,
  ticket_scope   text not null default 'own',
  metadata       jsonb not null default '{}'::jsonb,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint help_centers_pkey primary key (id),
  constraint help_centers_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint help_centers_ticket_scope_check check (ticket_scope in ('own', 'company')),
  constraint help_centers_visibility_check check (visibility in ('public', 'private'))
);

alter table comms.help_centers
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists brand_id uuid,
  add column if not exists slug text not null default '',
  add column if not exists name text not null default 'Untitled help center',
  add column if not exists domain text not null default '',
  add column if not exists theme jsonb not null default '{}'::jsonb,
  add column if not exists locales text[] not null default '{en}'::text[],
  add column if not exists visibility text not null default 'public',
  add column if not exists portal_enabled boolean not null default false,
  add column if not exists ticket_scope text not null default 'own',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- help_center_articles (per-center publication of an article)
-- ---------------------------------------------------------------------------
create table if not exists comms.help_center_articles (
  id           uuid not null default gen_random_uuid(),
  center_id    uuid not null,
  article_id   uuid not null,
  is_published boolean not null default false,
  position     integer not null default 0,
  metadata     jsonb not null default '{}'::jsonb,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint help_center_articles_pkey primary key (id),
  constraint help_center_articles_center_id_fkey foreign key (center_id) references comms.help_centers(id) on delete cascade,
  constraint help_center_articles_article_id_fkey foreign key (article_id) references comms.articles(id) on delete cascade
);

alter table comms.help_center_articles
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists center_id uuid not null,
  add column if not exists article_id uuid not null,
  add column if not exists is_published boolean not null default false,
  add column if not exists position integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- posts (owned by 20260821225308_widget; only its project-scope policy is adopted here)
-- ---------------------------------------------------------------------------
create table if not exists comms.posts (
  id           uuid not null default gen_random_uuid(),
  title        text not null default '',
  body         text not null default '',
  published_at timestamptz,
  project_id   uuid,
  metadata     jsonb not null default '{}'::jsonb,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint posts_pkey primary key (id),
  constraint posts_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.posts
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists title text not null default '',
  add column if not exists body text not null default '',
  add column if not exists published_at timestamptz,
  add column if not exists project_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- agent_versions
-- ---------------------------------------------------------------------------
create table if not exists comms.agent_versions (
  id          uuid not null default gen_random_uuid(),
  project_id  uuid,
  state       text not null default 'draft',
  rollout_pct integer not null default 0,
  note        text not null default '',
  snapshot    jsonb not null default '{}'::jsonb,
  metadata    jsonb not null default '{}'::jsonb,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint agent_versions_pkey primary key (id),
  constraint agent_versions_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint agent_versions_state_check check (state in ('draft', 'staged', 'live', 'archived'))
);

alter table comms.agent_versions
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists state text not null default 'draft',
  add column if not exists rollout_pct integer not null default 0,
  add column if not exists note text not null default '',
  add column if not exists snapshot jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- knowledge_sources (version_id has no FK — matches live)
-- ---------------------------------------------------------------------------
create table if not exists comms.knowledge_sources (
  id             uuid not null default gen_random_uuid(),
  project_id     uuid,
  version_id     uuid,
  kind           text not null,
  ref            jsonb not null default '{}'::jsonb,
  include        boolean not null default true,
  sync_state     text not null default 'idle',
  last_synced_at timestamptz,
  chunk_count    integer not null default 0,
  metadata       jsonb not null default '{}'::jsonb,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint knowledge_sources_pkey primary key (id),
  constraint knowledge_sources_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint knowledge_sources_kind_check check (kind in ('article', 'url', 'file', 'snippet'))
);

alter table comms.knowledge_sources
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists version_id uuid,
  add column if not exists kind text not null,
  add column if not exists ref jsonb not null default '{}'::jsonb,
  add column if not exists include boolean not null default true,
  add column if not exists sync_state text not null default 'idle',
  add column if not exists last_synced_at timestamptz,
  add column if not exists chunk_count integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- knowledge_chunks (pgvector, fixed 1536 dims, no ANN index — matches live)
-- ---------------------------------------------------------------------------
create table if not exists comms.knowledge_chunks (
  id          uuid not null default gen_random_uuid(),
  source_id   uuid,
  project_id  uuid,
  content     text not null default '',
  embedding   vector(1536),
  token_count integer not null default 0,
  position    integer not null default 0,
  metadata    jsonb not null default '{}'::jsonb,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint knowledge_chunks_pkey primary key (id),
  constraint knowledge_chunks_source_id_fkey foreign key (source_id) references comms.knowledge_sources(id) on delete cascade,
  constraint knowledge_chunks_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.knowledge_chunks
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists source_id uuid,
  add column if not exists project_id uuid,
  add column if not exists content text not null default '',
  add column if not exists embedding vector(1536),
  add column if not exists token_count integer not null default 0,
  add column if not exists position integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- topics / conversation_topics
-- ---------------------------------------------------------------------------
create table if not exists comms.topics (
  id          uuid not null default gen_random_uuid(),
  project_id  uuid,
  label       text not null default '',
  volume      integer not null default 0,
  trend       text not null default 'flat',
  metadata    jsonb not null default '{}'::jsonb,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint topics_pkey primary key (id),
  constraint topics_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.topics
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists label text not null default '',
  add column if not exists volume integer not null default 0,
  add column if not exists trend text not null default 'flat',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create table if not exists comms.conversation_topics (
  conversation_id uuid not null,
  topic_id        uuid not null,
  score           numeric not null default 1,
  constraint conversation_topics_pkey primary key (conversation_id, topic_id),
  constraint conversation_topics_conversation_id_fkey foreign key (conversation_id) references comms.conversations(id) on delete cascade,
  constraint conversation_topics_topic_id_fkey foreign key (topic_id) references comms.topics(id) on delete cascade
);

alter table comms.conversation_topics
  add column if not exists conversation_id uuid not null,
  add column if not exists topic_id uuid not null,
  add column if not exists score numeric not null default 1;

-- ---------------------------------------------------------------------------
-- recommendations (Knowledge Gaps backlog) / ai_outcomes
-- ---------------------------------------------------------------------------
create table if not exists comms.recommendations (
  id             uuid not null default gen_random_uuid(),
  project_id     uuid,
  kind           text not null default 'missing_content',
  title          text not null default '',
  detail         jsonb not null default '{}'::jsonb,
  state          text not null default 'new',
  dismiss_reason text,
  metadata       jsonb not null default '{}'::jsonb,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint recommendations_pkey primary key (id),
  constraint recommendations_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint recommendations_state_check check (state in ('new', 'accepted', 'dismissed'))
);

alter table comms.recommendations
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists kind text not null default 'missing_content',
  add column if not exists title text not null default '',
  add column if not exists detail jsonb not null default '{}'::jsonb,
  add column if not exists state text not null default 'new',
  add column if not exists dismiss_reason text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create table if not exists comms.ai_outcomes (
  id              uuid not null default gen_random_uuid(),
  conversation_id uuid not null,
  project_id      uuid,
  version_id      uuid,
  outcome         text not null,
  cost_cents      integer not null default 0,
  verified_by     text not null default 'heuristic',
  created_at      timestamptz not null default now(),
  constraint ai_outcomes_pkey primary key (id),
  constraint ai_outcomes_conversation_id_fkey foreign key (conversation_id) references comms.conversations(id) on delete cascade,
  constraint ai_outcomes_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint ai_outcomes_conversation_key unique (conversation_id),
  constraint ai_outcomes_outcome_check check (outcome in ('resolution', 'deflection', 'escalation', 'human'))
);

alter table comms.ai_outcomes
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists conversation_id uuid not null,
  add column if not exists project_id uuid,
  add column if not exists version_id uuid,
  add column if not exists outcome text not null,
  add column if not exists cost_cents integer not null default 0,
  add column if not exists verified_by text not null default 'heuristic',
  add column if not exists created_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- brand_id on channels / conversations (added by the lost brands migration)
-- ---------------------------------------------------------------------------
alter table comms.channels add column if not exists brand_id uuid;
alter table comms.conversations add column if not exists brand_id uuid;

-- ---------------------------------------------------------------------------
-- Constraints for tables that pre-existed without them; each is skipped when its name exists.
-- ---------------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('comms.brands', 'brands_pkey', 'primary key (id)'),
      ('comms.brands', 'brands_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.brands', 'brands_project_slug_key', 'unique (project_id, slug)'),
      ('comms.article_collections', 'article_collections_pkey', 'primary key (id)'),
      ('comms.article_collections', 'article_collections_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.articles', 'articles_pkey', 'primary key (id)'),
      ('comms.articles', 'articles_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.articles', 'articles_collection_id_fkey', 'foreign key (collection_id) references comms.article_collections(id) on delete set null'),
      ('comms.articles', 'articles_state_check', $c$check (state in ('draft', 'published', 'archived'))$c$),
      ('comms.help_centers', 'help_centers_pkey', 'primary key (id)'),
      ('comms.help_centers', 'help_centers_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.help_centers', 'help_centers_ticket_scope_check', $c$check (ticket_scope in ('own', 'company'))$c$),
      ('comms.help_centers', 'help_centers_visibility_check', $c$check (visibility in ('public', 'private'))$c$),
      ('comms.help_center_articles', 'help_center_articles_pkey', 'primary key (id)'),
      ('comms.help_center_articles', 'help_center_articles_center_id_fkey', 'foreign key (center_id) references comms.help_centers(id) on delete cascade'),
      ('comms.help_center_articles', 'help_center_articles_article_id_fkey', 'foreign key (article_id) references comms.articles(id) on delete cascade'),
      ('comms.posts', 'posts_pkey', 'primary key (id)'),
      ('comms.posts', 'posts_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.agent_versions', 'agent_versions_pkey', 'primary key (id)'),
      ('comms.agent_versions', 'agent_versions_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.agent_versions', 'agent_versions_state_check', $c$check (state in ('draft', 'staged', 'live', 'archived'))$c$),
      ('comms.knowledge_sources', 'knowledge_sources_pkey', 'primary key (id)'),
      ('comms.knowledge_sources', 'knowledge_sources_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.knowledge_sources', 'knowledge_sources_kind_check', $c$check (kind in ('article', 'url', 'file', 'snippet'))$c$),
      ('comms.knowledge_chunks', 'knowledge_chunks_pkey', 'primary key (id)'),
      ('comms.knowledge_chunks', 'knowledge_chunks_source_id_fkey', 'foreign key (source_id) references comms.knowledge_sources(id) on delete cascade'),
      ('comms.knowledge_chunks', 'knowledge_chunks_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.topics', 'topics_pkey', 'primary key (id)'),
      ('comms.topics', 'topics_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.conversation_topics', 'conversation_topics_pkey', 'primary key (conversation_id, topic_id)'),
      ('comms.conversation_topics', 'conversation_topics_conversation_id_fkey', 'foreign key (conversation_id) references comms.conversations(id) on delete cascade'),
      ('comms.conversation_topics', 'conversation_topics_topic_id_fkey', 'foreign key (topic_id) references comms.topics(id) on delete cascade'),
      ('comms.recommendations', 'recommendations_pkey', 'primary key (id)'),
      ('comms.recommendations', 'recommendations_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.recommendations', 'recommendations_state_check', $c$check (state in ('new', 'accepted', 'dismissed'))$c$),
      ('comms.ai_outcomes', 'ai_outcomes_pkey', 'primary key (id)'),
      ('comms.ai_outcomes', 'ai_outcomes_conversation_id_fkey', 'foreign key (conversation_id) references comms.conversations(id) on delete cascade'),
      ('comms.ai_outcomes', 'ai_outcomes_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.ai_outcomes', 'ai_outcomes_conversation_key', 'unique (conversation_id)'),
      ('comms.ai_outcomes', 'ai_outcomes_outcome_check', $c$check (outcome in ('resolution', 'deflection', 'escalation', 'human'))$c$),
      ('comms.channels', 'channels_brand_id_fkey', 'foreign key (brand_id) references comms.brands(id) on delete set null'),
      ('comms.conversations', 'conversations_brand_id_fkey', 'foreign key (brand_id) references comms.brands(id) on delete set null')
    ) as v(tbl, name, def)
  loop
    if not exists (select 1 from pg_constraint where conrelid = c.tbl::regclass and conname = c.name) then
      execute format('alter table %s add constraint %I %s', c.tbl, c.name, c.def);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists brands_project_idx on comms.brands (project_id) where deleted_at is null;
create index if not exists article_collections_project_position_idx on comms.article_collections (project_id, position) where deleted_at is null;
create unique index if not exists article_collections_project_slug_idx on comms.article_collections (project_id, slug) where deleted_at is null;
create index if not exists articles_project_published_idx on comms.articles (project_id) where deleted_at is null and published;
create index if not exists articles_collection_position_idx on comms.articles (collection_id, position) where deleted_at is null;
create index if not exists articles_group_idx on comms.articles (group_id) where deleted_at is null;
create index if not exists help_centers_project_idx on comms.help_centers (project_id) where deleted_at is null;
create unique index if not exists help_centers_project_slug_uniq on comms.help_centers (project_id, slug) where deleted_at is null;
create index if not exists help_centers_slug_idx on comms.help_centers (slug) where deleted_at is null;
create index if not exists help_center_articles_article_idx on comms.help_center_articles (article_id) where deleted_at is null;
create unique index if not exists help_center_articles_center_article_uniq on comms.help_center_articles (center_id, article_id) where deleted_at is null;
create index if not exists help_center_articles_center_idx on comms.help_center_articles (center_id, position) where deleted_at is null;
create index if not exists posts_project_published_idx on comms.posts (project_id) where deleted_at is null and published_at is not null;
create index if not exists agent_versions_project_idx on comms.agent_versions (project_id) where deleted_at is null;
create index if not exists knowledge_sources_project_idx on comms.knowledge_sources (project_id) where deleted_at is null;
create index if not exists knowledge_sources_project_version_idx on comms.knowledge_sources (project_id, version_id) where deleted_at is null;
create index if not exists knowledge_chunks_project_idx on comms.knowledge_chunks (project_id) where deleted_at is null;
create index if not exists knowledge_chunks_source_position_idx on comms.knowledge_chunks (source_id, position) where deleted_at is null;
create index if not exists topics_project_idx on comms.topics (project_id) where deleted_at is null;
create index if not exists conversation_topics_topic_idx on comms.conversation_topics (topic_id);
create index if not exists recommendations_project_idx on comms.recommendations (project_id) where deleted_at is null;
create index if not exists ai_outcomes_project_idx on comms.ai_outcomes (project_id, created_at);
create index if not exists channels_brand_id_idx on comms.channels (brand_id) where deleted_at is null;
create index if not exists conversations_brand_id_idx on comms.conversations (brand_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- updated_at triggers (conversation_topics and ai_outcomes have none)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'brands', 'article_collections', 'articles', 'help_centers', 'help_center_articles', 'posts',
    'agent_versions', 'knowledge_sources', 'knowledge_chunks', 'topics', 'recommendations'
  ] loop
    execute format('drop trigger if exists %I on comms.%I', t || '_touch_updated_at', t);
    execute format(
      'create trigger %I before update on comms.%I for each row execute function comms.touch_updated_at()',
      t || '_touch_updated_at', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS + project-scoped policies (exact live names; the widget's demo policies are retired)
-- ---------------------------------------------------------------------------
drop policy if exists comms_articles_demo_all on comms.articles;
drop policy if exists comms_posts_demo_all on comms.posts;

do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('brands', 'brands_project_all'),
      ('article_collections', 'article_collections_project_scoped'),
      ('articles', 'articles_project_scope'),
      ('help_centers', 'help_centers_project_all'),
      ('posts', 'posts_project_scope'),
      ('agent_versions', 'agent_versions_project_scope'),
      ('knowledge_sources', 'knowledge_sources_project_scope'),
      ('knowledge_chunks', 'knowledge_chunks_project_scope'),
      ('topics', 'topics_project_all'),
      ('recommendations', 'recommendations_project_all'),
      ('ai_outcomes', 'ai_outcomes_project_all')
    ) as v(tbl, pol)
  loop
    execute format('alter table comms.%I enable row level security', p.tbl);
    execute format('drop policy if exists %I on comms.%I', p.pol, p.tbl);
    execute format(
      'create policy %I on comms.%I for all to authenticated '
      'using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id))',
      p.pol, p.tbl
    );
  end loop;
end;
$$;

alter table comms.help_center_articles enable row level security;
drop policy if exists help_center_articles_project_all on comms.help_center_articles;
create policy help_center_articles_project_all on comms.help_center_articles
  for all to authenticated
  using (exists (
    select 1 from comms.help_centers hc
    where hc.id = help_center_articles.center_id
      and hc.deleted_at is null
      and comms.can_access_project(hc.project_id)
  ))
  with check (exists (
    select 1 from comms.help_centers hc
    where hc.id = help_center_articles.center_id
      and hc.deleted_at is null
      and comms.can_access_project(hc.project_id)
  ));

alter table comms.conversation_topics enable row level security;
drop policy if exists conversation_topics_project_scope on comms.conversation_topics;
create policy conversation_topics_project_scope on comms.conversation_topics
  for all to authenticated
  using (exists (
    select 1 from comms.conversations c
    where c.id = conversation_topics.conversation_id
      and comms.can_access_project(c.project_id)
  ))
  with check (exists (
    select 1 from comms.conversations c
    where c.id = conversation_topics.conversation_id
      and comms.can_access_project(c.project_id)
  ));

-- ---------------------------------------------------------------------------
-- Grants: browser access is authenticated-only (anon reaches content via the service-role routes).
-- ---------------------------------------------------------------------------
revoke all on
  comms.brands, comms.article_collections, comms.articles, comms.help_centers, comms.help_center_articles,
  comms.posts, comms.agent_versions, comms.knowledge_sources, comms.knowledge_chunks, comms.topics,
  comms.conversation_topics, comms.recommendations, comms.ai_outcomes
  from public, anon;
grant all on
  comms.brands, comms.article_collections, comms.articles, comms.help_centers, comms.help_center_articles,
  comms.posts, comms.agent_versions, comms.knowledge_sources, comms.knowledge_chunks, comms.topics,
  comms.conversation_topics, comms.recommendations, comms.ai_outcomes
  to authenticated, service_role;

-- @down

-- Refuses on the shared database: these tables, columns and the conversation_metrics FK predate this file there.
do $$
begin
  if coalesce(current_setting('comms.allow_destructive_down', true), '') <> 'on' then
    raise exception 'adopt_knowledge_base @down is destructive on the shared database; set comms.allow_destructive_down=on on a disposable database';
  end if;
end;
$$;

-- articles_project_scope / posts_project_scope stay: restoring the demo-open policies would reopen every project's rows.
drop policy if exists conversation_topics_project_scope on comms.conversation_topics;
drop policy if exists help_center_articles_project_all on comms.help_center_articles;

drop index if exists comms.conversations_brand_id_idx;
drop index if exists comms.channels_brand_id_idx;
alter table comms.conversations drop constraint if exists conversations_brand_id_fkey;
alter table comms.channels drop constraint if exists channels_brand_id_fkey;
alter table comms.conversations drop column if exists brand_id;
alter table comms.channels drop column if exists brand_id;

drop table if exists comms.ai_outcomes cascade;
drop table if exists comms.recommendations cascade;
drop table if exists comms.conversation_topics cascade;
drop table if exists comms.topics cascade;
drop table if exists comms.knowledge_chunks cascade;
drop table if exists comms.knowledge_sources cascade;
drop table if exists comms.agent_versions cascade;
drop table if exists comms.help_center_articles cascade;
drop table if exists comms.help_centers cascade;

drop index if exists comms.articles_group_idx;
drop index if exists comms.articles_collection_position_idx;
alter table comms.articles drop constraint if exists articles_state_check;
alter table comms.articles drop constraint if exists articles_collection_id_fkey;
alter table comms.articles drop column if exists state;
alter table comms.articles drop column if exists group_id;
alter table comms.articles drop column if exists position;
alter table comms.articles drop column if exists collection_id;

drop table if exists comms.article_collections cascade;
drop table if exists comms.brands cascade;
