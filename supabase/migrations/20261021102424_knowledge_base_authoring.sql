-- Knowledge base authoring
--
-- Articles, help centers and collections become authoring objects (KB spec §7.2-§7.6): staged drafts on
-- published articles, a database-derived articles.published (the Messenger's only gate), version history,
-- view/reaction stores, and the publish permission enforced in the database.
-- Owns:
--   columns: articles author_id, author_name, read_minutes, collection_title, draft, content_updated_at,
--     translated_from_at, audience, ai_enabled, updated_by; article_collections help_center_id, parent_id, icon;
--     help_center_articles.collection_id; help_centers is_default, is_live, domain_verified_at
--   tables: comms.article_versions, comms.article_views, comms.article_reactions
--   functions: article_tsv, or_tsquery, article_messenger_visible, article_collection_title, articles_derive,
--     articles_rederive, articles_stamp, articles_guard_publish, articles_snapshot_version,
--     article_collections_guard, article_collections_rederive, help_center_articles_guard,
--     help_center_articles_rederive, help_centers_guard, help_centers_rederive, help_centers_after_soft_delete,
--     set_default_help_center, article_view_counts, article_insights, search_articles, jsonb_deep_merge,
--     help_center_merge, article_merge_meta, article_log_ai_assist, soft_delete_article, create_translation,
--     move_collection, move_placement
--   the recreated articles_touch_updated_at trigger and the restrictive publish policies
-- Attaches comms.forbid_project_change() (owned by ai_providers; created here only when missing).
-- Depends on: the KB tables (20261021102003_adopt_knowledge_base); comms.can_access_project(), comms.rbac_allows()
--   (20260821182908_adopt_rbac); comms.teammates (20260825120523_inbox_identity).
-- Data changes (flagged): the oldest live center per project becomes its default, content_updated_at is
--   backfilled from updated_at, and every article is re-derived once (expected to flip 0 published flags).

-- @up

create extension if not exists pgcrypto;
create schema if not exists comms;
grant usage on schema comms to anon, authenticated, service_role;

create or replace function comms.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- Owned by ai_providers; created here only when missing so this file stays self-contained.
do $do$
begin
  if to_regprocedure('comms.forbid_project_change()') is null then
    execute $fn$
create function comms.forbid_project_change()
returns trigger
language plpgsql
set search_path = ''
as $body$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'PROJECT_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$body$
$fn$;
    revoke execute on function comms.forbid_project_change() from public, anon;
  end if;
end;
$do$;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table comms.articles
  add column if not exists author_id          uuid references comms.teammates(id) on delete set null,
  add column if not exists author_name        text not null default '',
  add column if not exists read_minutes       integer not null default 1,
  add column if not exists collection_title   text,
  add column if not exists draft              jsonb,
  add column if not exists content_updated_at timestamptz,
  add column if not exists translated_from_at timestamptz,
  add column if not exists audience           text not null default 'everyone',
  add column if not exists ai_enabled         boolean not null default true,
  add column if not exists updated_by         uuid;
alter table comms.articles alter column locale set default 'en-US';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'comms.articles'::regclass and conname = 'articles_audience_check'
  ) then
    alter table comms.articles add constraint articles_audience_check check (audience in
      ('everyone', 'users', 'leads', 'visitors', 'users_and_leads', 'visitors_and_leads'));
  end if;
end;
$$;

comment on column comms.articles.collection_id is
  'Deprecated since the 2026-10 KB spec: a collection belongs to a help-center placement now.';
comment on column comms.articles.position is
  'Deprecated since the 2026-10 KB spec: order lives on help_center_articles.position.';
comment on column comms.articles.published is
  'Derived by articles_derive: listed in the Messenger. Write state, never this column.';

alter table comms.article_collections
  add column if not exists help_center_id uuid references comms.help_centers(id) on delete cascade,
  add column if not exists parent_id      uuid references comms.article_collections(id) on delete set null,
  add column if not exists icon           text;

alter table comms.help_center_articles
  add column if not exists collection_id uuid references comms.article_collections(id) on delete set null;
comment on column comms.help_center_articles.is_published is
  'Unused since the 2026-10 KB spec; Messenger visibility derives from articles.state + placement.';

alter table comms.help_centers
  add column if not exists is_default boolean not null default false,
  add column if not exists is_live    boolean not null default true,
  add column if not exists domain_verified_at timestamptz;
alter table comms.help_centers alter column locales set default '{en-US}'::text[];

-- Backfill: the oldest live center of a project without a default becomes its default.
update comms.help_centers hc
   set is_default = true
 where hc.deleted_at is null
   and hc.project_id is not null
   and hc.id = (
     select h2.id from comms.help_centers h2
      where h2.project_id = hc.project_id and h2.deleted_at is null
      order by h2.created_at, h2.id
      limit 1)
   and not exists (
     select 1 from comms.help_centers h3
      where h3.project_id = hc.project_id and h3.is_default and h3.deleted_at is null);

-- ---------------------------------------------------------------------------
-- Search helpers
-- ---------------------------------------------------------------------------
create or replace function comms.article_tsv(p_title text, p_summary text, p_body text)
returns tsvector
language sql
immutable
parallel safe
set search_path = ''
as $$
  select setweight(to_tsvector('pg_catalog.simple', coalesce(p_title, '')), 'A')
      || setweight(to_tsvector('pg_catalog.simple', coalesce(p_summary, '')), 'B')
      || setweight(to_tsvector('pg_catalog.simple', coalesce(p_body, '')), 'C')
$$;

-- Port of grey.or_tsquery on the 'simple' config article_tsv uses: ORs the terms, quotes each lexeme so user
-- punctuation never becomes a tsquery operator, and returns null when nothing is left.
create or replace function comms.or_tsquery(p_query text)
returns tsquery
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (
    select pg_catalog.string_agg(
             '''' || replace(replace(t.lexeme, '\', '\\'), '''', '''''') || '''', ' | ')
      from (
        select lexeme
          from pg_catalog.unnest(to_tsvector('pg_catalog.simple', coalesce(p_query, '')))
         limit 64
      ) t
  )::tsquery
$$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create unique index if not exists articles_group_locale_uniq
  on comms.articles (group_id, locale) where deleted_at is null and group_id is not null;
create index if not exists articles_search_idx
  on comms.articles using gin (comms.article_tsv(title, summary, body));

drop index if exists comms.article_collections_project_slug_idx;
create unique index if not exists article_collections_center_slug_uniq
  on comms.article_collections (help_center_id, slug) where deleted_at is null;
create index if not exists article_collections_center_parent_idx
  on comms.article_collections (help_center_id, parent_id, position) where deleted_at is null;

create index if not exists help_center_articles_collection_idx
  on comms.help_center_articles (collection_id, position) where deleted_at is null;

create unique index if not exists help_centers_default_uniq
  on comms.help_centers (project_id) where is_default and deleted_at is null;
create unique index if not exists help_centers_project_domain_uniq
  on comms.help_centers (project_id, lower(domain)) where domain <> '' and deleted_at is null;
create unique index if not exists help_centers_verified_domain_uniq
  on comms.help_centers (lower(domain))
  where domain <> '' and domain_verified_at is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------
create table if not exists comms.article_versions (
  id         uuid primary key default gen_random_uuid(),
  article_id uuid not null references comms.articles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind       text not null default 'published',
  title      text not null default '',
  summary    text not null default '',
  body       text not null default '',
  locale     text not null default 'en-US',
  metadata   jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint article_versions_kind_check check (kind in ('published', 'snapshot'))
);
create index if not exists article_versions_article_idx
  on comms.article_versions (article_id, created_at desc) where deleted_at is null;

-- The widget's popular query embeds this exact name (lib/widget/data.js).
create table if not exists comms.article_views (
  id         uuid primary key default gen_random_uuid(),
  article_id uuid not null references comms.articles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  source     text not null default 'messenger',
  visitor_id uuid,
  contact_id uuid,
  locale     text,
  metadata   jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint article_views_source_check check (source in ('messenger', 'ask_source', 'help_center'))
);
create index if not exists article_views_article_idx on comms.article_views (article_id, created_at);
create index if not exists article_views_project_idx on comms.article_views (project_id, created_at);

-- Written from Phase 5; the widget's thumbs map up -> happy, down -> sad.
create table if not exists comms.article_reactions (
  id         uuid primary key default gen_random_uuid(),
  article_id uuid not null references comms.articles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  reaction   text not null,
  visitor_id uuid,
  contact_id uuid,
  source     text not null default 'messenger',
  metadata   jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint article_reactions_reaction_check check (reaction in ('sad', 'neutral', 'happy'))
);
create unique index if not exists article_reactions_viewer_uniq
  on comms.article_reactions (article_id, coalesce(contact_id, visitor_id)) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Messenger visibility: the derived articles.published (§7.3)
-- ---------------------------------------------------------------------------
-- The widget's only gate. Invoker rights: placements and centers are visible to project members.
create or replace function comms.article_messenger_visible(
  p_id uuid, p_state text, p_deleted_at timestamptz, p_group_id uuid, p_audience text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_state = 'published'
     and p_deleted_at is null
     and (p_group_id is null or p_group_id = p_id)
     and p_audience = 'everyone'
     and exists (
       select 1
         from comms.help_center_articles hca
         join comms.help_centers hc on hc.id = hca.center_id
        where hca.article_id = p_id
          and hca.deleted_at is null
          and hc.deleted_at is null
          and hc.is_default
          and hc.is_live
          and hc.visibility = 'public')
$$;

-- The article's collection name in its default center first, then in the oldest center that has one.
create or replace function comms.article_collection_title(p_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select ac.name
    from comms.help_center_articles hca
    join comms.help_centers hc on hc.id = hca.center_id and hc.deleted_at is null
    join comms.article_collections ac on ac.id = hca.collection_id and ac.deleted_at is null
   where hca.article_id = p_id
     and hca.deleted_at is null
   order by hc.is_default desc, hc.created_at, hc.id
   limit 1
$$;

create or replace function comms.articles_derive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Legacy writers only flip `published`; map that onto `state` first.
  if tg_op = 'INSERT' then
    if new.published and new.state = 'draft' then new.state := 'published'; end if;
    new.content_updated_at := now();
  else
    if new.published is distinct from old.published and new.state is not distinct from old.state then
      new.state := case when new.published then 'published' else 'draft' end;
    end if;
    if (new.title, new.summary, new.body) is distinct from (old.title, old.summary, old.body) then
      new.content_updated_at := now();
    end if;
  end if;
  new.read_minutes := greatest(1, round(coalesce(array_length(
    regexp_split_to_array(btrim(new.body), '\s+'), 1), 0) / 200.0)::int);
  new.author_name := coalesce((select t.name from comms.teammates t where t.id = new.author_id), '');
  new.collection_title := comms.article_collection_title(new.id);
  new.published := comms.article_messenger_visible(new.id, new.state, new.deleted_at, new.group_id, new.audience);
  return new;
end;
$$;

-- Re-derive only rows whose derived values actually change (a no-op write lets articles_derive recompute).
create or replace function comms.articles_rederive(p_ids uuid[])
returns void
language sql
set search_path = ''
as $$
  update comms.articles a
     set published = a.published
   where a.id = any(p_ids)
     and (a.published is distinct from
            comms.article_messenger_visible(a.id, a.state, a.deleted_at, a.group_id, a.audience)
          or a.collection_title is distinct from comms.article_collection_title(a.id));
$$;

-- ---------------------------------------------------------------------------
-- Audit stamps, publish guard and version history (§7.2, §7.4, §7.6)
-- ---------------------------------------------------------------------------
-- Browser writes get server-side stamps; definer and service-role writes keep theirs.
create or replace function comms.articles_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
  end if;
  if tg_table_name = 'articles' then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

-- Anything that changes what the Messenger or AI answers show for a published article needs comms.article.publish.
-- group_id is compared as coalesce(group_id, id): a source joining its own group changes nothing visible.
create or replace function comms.articles_guard_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.state = 'published' and not comms.rbac_allows('comms.article.publish', new.project_id) then
      raise exception 'ARTICLE_PUBLISH_FORBIDDEN' using errcode = '42501';
    end if;
    return new;
  end if;
  if (old.state = 'published' or new.state = 'published')
     and (new.state, new.deleted_at, new.published, new.title, new.summary, new.body, new.audience,
          new.ai_enabled, coalesce(new.group_id, new.id), new.locale, new.author_id, new.project_id)
         is distinct from
         (old.state, old.deleted_at, old.published, old.title, old.summary, old.body, old.audience,
          old.ai_enabled, coalesce(old.group_id, old.id), old.locale, old.author_id, old.project_id)
     and not (comms.rbac_allows('comms.article.publish', old.project_id)
              and comms.rbac_allows('comms.article.publish', new.project_id)) then
    raise exception 'ARTICLE_PUBLISH_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Definer so published history can only be written here, never forged by a browser insert.
create or replace function comms.articles_snapshot_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.state = 'published'
     and new.deleted_at is null
     and new.project_id is not null
     and (tg_op = 'INSERT'
          or old.state is distinct from new.state
          or (new.title, new.summary, new.body) is distinct from (old.title, old.summary, old.body)) then
    insert into comms.article_versions (article_id, project_id, kind, title, summary, body, locale, created_by)
    values (new.id, new.project_id, 'published', new.title, new.summary, new.body, new.locale,
            coalesce(auth.uid(), new.updated_by));
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Collections and placements (§7.2)
-- ---------------------------------------------------------------------------
-- Same project as the center, parent in the same center, at most 3 levels, no cycle.
create or replace function comms.article_collections_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_project uuid;
  v_parent_center uuid;
  v_cursor uuid := new.parent_id;
  v_depth int := 1;
  v_below int;
begin
  if new.deleted_at is not null then
    return new;
  end if;
  select hc.project_id into v_project from comms.help_centers hc where hc.id = new.help_center_id;
  if v_project is null or v_project is distinct from new.project_id then
    raise exception 'COLLECTION_PROJECT_MISMATCH' using errcode = '23514';
  end if;
  if new.parent_id is not null then
    select ac.help_center_id into v_parent_center
      from comms.article_collections ac where ac.id = new.parent_id and ac.deleted_at is null;
    if v_parent_center is distinct from new.help_center_id then
      raise exception 'COLLECTION_PARENT_MISMATCH' using errcode = '23514';
    end if;
  end if;
  while v_cursor is not null loop
    if v_cursor = new.id then
      raise exception 'COLLECTION_CYCLE' using errcode = '23514';
    end if;
    v_depth := v_depth + 1;
    if v_depth > 3 then
      raise exception 'COLLECTION_TOO_DEEP' using errcode = '23514';
    end if;
    select ac.parent_id into v_cursor from comms.article_collections ac where ac.id = v_cursor;
  end loop;
  if tg_op = 'UPDATE' then
    v_below := coalesce((
      with recursive below as (
        select ac.id, 1 as d from comms.article_collections ac
         where ac.parent_id = new.id and ac.deleted_at is null
        union all
        select ac.id, b.d + 1 from comms.article_collections ac
          join below b on ac.parent_id = b.id
         where ac.deleted_at is null and b.d < 3
      )
      select max(below.d) from below), 0);
    if v_depth + v_below > 3 then
      raise exception 'COLLECTION_TOO_DEEP' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- Invoker rights: another project's article or center is invisible here, so the check fails closed.
create or replace function comms.help_center_articles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_center_project uuid;
  v_article_project uuid;
  v_group uuid;
  v_collection_center uuid;
begin
  if new.deleted_at is not null then
    return new;
  end if;
  select hc.project_id into v_center_project from comms.help_centers hc where hc.id = new.center_id;
  select a.project_id, a.group_id into v_article_project, v_group
    from comms.articles a where a.id = new.article_id;
  if v_center_project is null or v_article_project is distinct from v_center_project then
    raise exception 'PLACEMENT_PROJECT_MISMATCH' using errcode = '23514';
  end if;
  if v_group is not null and v_group <> new.article_id then
    raise exception 'PLACEMENT_TRANSLATION' using errcode = '23514';
  end if;
  if new.collection_id is not null then
    select ac.help_center_id into v_collection_center
      from comms.article_collections ac where ac.id = new.collection_id and ac.deleted_at is null;
    if v_collection_center is distinct from new.center_id then
      raise exception 'PLACEMENT_COLLECTION_MISMATCH' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function comms.help_center_articles_rederive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform comms.articles_rederive(array[new.article_id]);
  elsif tg_op = 'DELETE' then
    perform comms.articles_rederive(array[old.article_id]);
  else
    perform comms.articles_rederive(array[old.article_id, new.article_id]);
  end if;
  return null;
end;
$$;

-- A soft-deleted collection moves its placements to Unassigned and soft-deletes its children (each recurses).
create or replace function comms.article_collections_rederive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update comms.help_center_articles set collection_id = null where collection_id = new.id;
    update comms.article_collections set deleted_at = new.deleted_at
     where parent_id = new.id and deleted_at is null;
  else
    perform comms.articles_rederive(array(
      select hca.article_id from comms.help_center_articles hca
       where hca.collection_id = new.id and hca.deleted_at is null));
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Help centers (§7.2)
-- ---------------------------------------------------------------------------
create or replace function comms.help_centers_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null and old.is_default then
    raise exception 'DEFAULT_HELP_CENTER' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function comms.help_centers_rederive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform comms.articles_rederive(array(
    select hca.article_id from comms.help_center_articles hca where hca.center_id = new.id));
  return null;
end;
$$;

-- Definer: once the center is deleted, the placement policy can no longer see its rows.
create or replace function comms.help_centers_after_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is null or old.deleted_at is not null then
    return null;
  end if;
  update comms.article_collections set deleted_at = new.deleted_at
   where help_center_id = new.id and deleted_at is null;
  update comms.help_center_articles set deleted_at = new.deleted_at
   where center_id = new.id and deleted_at is null;
  return null;
end;
$$;

create or replace function comms.set_default_help_center(p_center uuid)
returns comms.help_centers
language plpgsql
set search_path = ''
as $$
declare
  v_project uuid;
  v_row comms.help_centers;
begin
  select hc.project_id into v_project
    from comms.help_centers hc where hc.id = p_center and hc.deleted_at is null;
  if v_project is null then
    raise exception 'HELP_CENTER_NOT_FOUND' using errcode = 'P0002';
  end if;
  update comms.help_centers set is_default = false
   where project_id = v_project and is_default and id <> p_center and deleted_at is null;
  update comms.help_centers set is_default = true where id = p_center returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Insights, search and merge RPCs (all invoker; RLS applies inside)
-- ---------------------------------------------------------------------------
-- One row per article plus a project total (article_id null), so distinct viewers are never summed across articles.
create or replace function comms.article_view_counts(p_project uuid, p_since timestamptz)
returns table (article_id uuid, views bigint, viewers bigint)
language sql
stable
set search_path = ''
as $$
  select v.article_id,
         count(*)::bigint,
         count(distinct coalesce(v.contact_id, v.visitor_id))::bigint
    from comms.article_views v
   where v.project_id = p_project
     and v.created_at >= p_since
     and v.deleted_at is null
   group by grouping sets ((v.article_id), ())
$$;

create or replace function comms.article_insights(p_article uuid, p_days int default 30)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select (current_date - (greatest(1, least(coalesce(p_days, 30), 365)) - 1))::date as since
  ), views as (
    select v.created_at::date as day, coalesce(v.contact_id, v.visitor_id) as viewer
      from comms.article_views v, bounds b
     where v.article_id = p_article and v.deleted_at is null and v.created_at >= b.since
  ), reactions as (
    select r.reaction from comms.article_reactions r, bounds b
     where r.article_id = p_article and r.deleted_at is null and r.created_at >= b.since
  )
  select jsonb_build_object(
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object('day', g.ts::date, 'views',
               (select count(*) from views v where v.day = g.ts::date)) order by g.ts), '[]'::jsonb)
        from bounds b, generate_series(b.since, current_date, interval '1 day') as g(ts)),
    'views', (select count(*) from views),
    'viewers', (select count(distinct viewer) from views),
    'reactions', jsonb_build_object(
      'happy', (select count(*) from reactions where reaction = 'happy'),
      'neutral', (select count(*) from reactions where reaction = 'neutral'),
      'sad', (select count(*) from reactions where reaction = 'sad')))
$$;

-- p_scope 'published': state = published, any locale. 'messenger': Messenger-eligible source rows, listed or
-- unlisted; `listed` (articles.published) says whether a row may be cited with a link. Rank is normalised to 0..1.
create or replace function comms.search_articles(
  p_project uuid, p_query text, p_scope text default 'published', p_limit int default 5)
returns table (article_id uuid, title text, rank real, listed boolean)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_query tsquery := comms.or_tsquery(p_query);
begin
  if v_query is null or p_scope is null or p_scope not in ('published', 'messenger') then
    return;
  end if;
  return query
    select a.id, a.title, ts_rank_cd(comms.article_tsv(a.title, a.summary, a.body), v_query, 32)::real, a.published
      from comms.articles a
     where a.project_id = p_project
       and a.deleted_at is null
       and a.state = 'published'
       and comms.article_tsv(a.title, a.summary, a.body) @@ v_query
       and (p_scope = 'published'
            or ((a.group_id is null or a.group_id = a.id) and a.ai_enabled and a.audience = 'everyone'))
     order by 3 desc, a.id
     limit greatest(1, least(coalesce(p_limit, 5), 50));
end;
$$;

-- Objects merge recursively; arrays, scalars and JSON null in b replace; a SQL-null b keeps a.
create or replace function comms.jsonb_deep_merge(a jsonb, b jsonb)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  merged jsonb;
begin
  if b is null then
    return a;
  end if;
  if a is null or jsonb_typeof(a) <> 'object' or jsonb_typeof(b) <> 'object' then
    return b;
  end if;
  merged := a;
  for k, v in select e.key, e.value from jsonb_each(b) e loop
    if jsonb_typeof(v) = 'object' and jsonb_typeof(merged -> k) = 'object' then
      merged := merged || jsonb_build_object(k, comms.jsonb_deep_merge(merged -> k, v));
    else
      merged := merged || jsonb_build_object(k, v);
    end if;
  end loop;
  return merged;
end;
$$;

-- Every Help Centers section autosaves through this, so sections never clobber each other's theme keys.
create or replace function comms.help_center_merge(p_id uuid, p_theme jsonb, p_meta jsonb)
returns comms.help_centers
language sql
set search_path = ''
as $$
  update comms.help_centers
     set theme = comms.jsonb_deep_merge(theme, p_theme),
         metadata = metadata || coalesce(p_meta, '{}'::jsonb)
   where id = p_id and deleted_at is null
  returning *
$$;

create or replace function comms.article_merge_meta(p_id uuid, p_patch jsonb)
returns comms.articles
language sql
set search_path = ''
as $$
  update comms.articles
     set metadata = metadata || coalesce(p_patch, '{}'::jsonb)
   where id = p_id and deleted_at is null
  returning *
$$;

-- Appends to metadata.aiAssisted and keeps the last 20, in one statement.
create or replace function comms.article_log_ai_assist(p_id uuid, p_entry jsonb)
returns void
language sql
set search_path = ''
as $$
  update comms.articles a
     set metadata = jsonb_set(a.metadata, '{aiAssisted}', (
       select coalesce(jsonb_agg(t.e order by t.ord), '[]'::jsonb)
         from (
           select x.e, x.ord
             from jsonb_array_elements(
                    case when jsonb_typeof(a.metadata -> 'aiAssisted') = 'array'
                         then a.metadata -> 'aiAssisted' else '[]'::jsonb end
                    || jsonb_build_array(p_entry)) with ordinality as x(e, ord)
            order by x.ord desc
            limit 20) t))
   where a.id = p_id and a.deleted_at is null
$$;

-- A source row takes its translations and placements with it; a translation goes alone. The publish guard runs
-- per row, so a group holding a published row fails as a whole without the permission.
create or replace function comms.soft_delete_article(p_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_group uuid;
  v_ids uuid[];
  v_now timestamptz := now();
  v_count integer;
begin
  select a.group_id into v_group from comms.articles a where a.id = p_id and a.deleted_at is null;
  if not found then
    return 0;
  end if;
  if v_group is null or v_group = p_id then
    select array_agg(a.id) into v_ids
      from comms.articles a where a.deleted_at is null and (a.id = p_id or a.group_id = p_id);
  else
    v_ids := array[p_id];
  end if;
  update comms.help_center_articles set deleted_at = v_now
   where article_id = any(v_ids) and deleted_at is null;
  update comms.articles set deleted_at = v_now where id = any(v_ids) and deleted_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function comms.create_translation(
  p_source uuid, p_id uuid, p_locale text, p_title text, p_summary text, p_body text, p_metadata jsonb)
returns comms.articles
language plpgsql
set search_path = ''
as $$
declare
  v_source comms.articles;
  v_row comms.articles;
begin
  select * into v_source from comms.articles a where a.id = p_source and a.deleted_at is null;
  if not found then
    raise exception 'ARTICLE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_source.group_id is not null and v_source.group_id <> v_source.id then
    raise exception 'NOT_A_SOURCE_ARTICLE' using errcode = '23514';
  end if;
  if v_source.group_id is null then
    update comms.articles set group_id = id where id = p_source;
  end if;
  insert into comms.articles (
    id, project_id, group_id, locale, state, title, summary, body, audience, ai_enabled, metadata,
    translated_from_at)
  values (
    coalesce(p_id, gen_random_uuid()), v_source.project_id, p_source, p_locale, 'draft',
    coalesce(p_title, ''), coalesce(p_summary, ''), coalesce(p_body, ''), v_source.audience,
    v_source.ai_enabled, coalesce(p_metadata, '{}'::jsonb),
    coalesce(v_source.content_updated_at, v_source.updated_at))
  returning * into v_row;
  return v_row;
end;
$$;

-- Reparents (the guard validates) and renumbers both sibling lists in one transaction.
create or replace function comms.move_collection(p_id uuid, p_parent uuid, p_position int)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_center uuid;
  v_old_parent uuid;
begin
  select ac.help_center_id, ac.parent_id into v_center, v_old_parent
    from comms.article_collections ac where ac.id = p_id and ac.deleted_at is null;
  if not found then
    raise exception 'COLLECTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_old_parent is distinct from p_parent then
    update comms.article_collections set parent_id = p_parent where id = p_id;
  end if;
  with others as (
    select ac.id, row_number() over (order by ac.position, ac.created_at, ac.id) - 1 as idx
      from comms.article_collections ac
     where ac.help_center_id = v_center and ac.parent_id is not distinct from p_parent
       and ac.deleted_at is null and ac.id <> p_id
  ), target as (
    select greatest(0, least(coalesce(p_position, 0), (select count(*) from others)::int)) as pos
  ), ordered as (
    select o.id, (case when o.idx < t.pos then o.idx else o.idx + 1 end)::int as pos
      from others o, target t
    union all
    select p_id, t.pos from target t
  )
  update comms.article_collections ac set position = o.pos
    from ordered o where ac.id = o.id and ac.position is distinct from o.pos;
  if v_old_parent is distinct from p_parent then
    with siblings as (
      select ac.id, (row_number() over (order by ac.position, ac.created_at, ac.id) - 1)::int as pos
        from comms.article_collections ac
       where ac.help_center_id = v_center and ac.parent_id is not distinct from v_old_parent
         and ac.deleted_at is null
    )
    update comms.article_collections ac set position = s.pos
      from siblings s where ac.id = s.id and ac.position is distinct from s.pos;
  end if;
end;
$$;

-- Moves a placement into a collection (null = Unassigned) at a position and renumbers both lists atomically.
create or replace function comms.move_placement(p_id uuid, p_collection uuid, p_position int)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_center uuid;
  v_old_collection uuid;
begin
  select hca.center_id, hca.collection_id into v_center, v_old_collection
    from comms.help_center_articles hca where hca.id = p_id and hca.deleted_at is null;
  if not found then
    raise exception 'PLACEMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_old_collection is distinct from p_collection then
    update comms.help_center_articles set collection_id = p_collection where id = p_id;
  end if;
  with others as (
    select hca.id, row_number() over (order by hca.position, hca.created_at, hca.id) - 1 as idx
      from comms.help_center_articles hca
     where hca.center_id = v_center and hca.collection_id is not distinct from p_collection
       and hca.deleted_at is null and hca.id <> p_id
  ), target as (
    select greatest(0, least(coalesce(p_position, 0), (select count(*) from others)::int)) as pos
  ), ordered as (
    select o.id, (case when o.idx < t.pos then o.idx else o.idx + 1 end)::int as pos
      from others o, target t
    union all
    select p_id, t.pos from target t
  )
  update comms.help_center_articles hca set position = o.pos
    from ordered o where hca.id = o.id and hca.position is distinct from o.pos;
  if v_old_collection is distinct from p_collection then
    with siblings as (
      select hca.id, (row_number() over (order by hca.position, hca.created_at, hca.id) - 1)::int as pos
        from comms.help_center_articles hca
       where hca.center_id = v_center and hca.collection_id is not distinct from v_old_collection
         and hca.deleted_at is null
    )
    update comms.help_center_articles hca set position = s.pos
      from siblings s where hca.id = s.id and hca.position is distinct from s.pos;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers (same-timing triggers fire alphabetically: derive, forbid, guard, stamp, touch)
-- ---------------------------------------------------------------------------
drop trigger if exists articles_derive on comms.articles;
create trigger articles_derive before insert or update on comms.articles
for each row execute function comms.articles_derive();

drop trigger if exists articles_forbid_project_change on comms.articles;
create trigger articles_forbid_project_change before update on comms.articles
for each row execute function comms.forbid_project_change();

drop trigger if exists articles_guard_publish on comms.articles;
create trigger articles_guard_publish before insert or update on comms.articles
for each row execute function comms.articles_guard_publish();

drop trigger if exists articles_stamp on comms.articles;
create trigger articles_stamp before insert or update on comms.articles
for each row execute function comms.articles_stamp();

-- updated_at moves only on real changes: derived columns, staged drafts and metadata never reorder the Messenger's
-- Help list, except an article becoming visible (it must rise into the widget's 20 most recent).
drop trigger if exists articles_touch_updated_at on comms.articles;
create trigger articles_touch_updated_at before update on comms.articles for each row
when (((to_jsonb(new) - array['updated_at', 'published', 'collection_title', 'author_name', 'read_minutes',
                              'content_updated_at', 'draft', 'updated_by', 'metadata', 'group_id'])
        || jsonb_build_object('group_id', coalesce(new.group_id, new.id)))
      is distinct from
      ((to_jsonb(old) - array['updated_at', 'published', 'collection_title', 'author_name', 'read_minutes',
                              'content_updated_at', 'draft', 'updated_by', 'metadata', 'group_id'])
        || jsonb_build_object('group_id', coalesce(old.group_id, old.id)))
      or (new.published and not old.published))
execute function comms.touch_updated_at();

drop trigger if exists articles_snapshot_version on comms.articles;
create trigger articles_snapshot_version after insert or update on comms.articles
for each row execute function comms.articles_snapshot_version();

drop trigger if exists article_collections_forbid_project_change on comms.article_collections;
create trigger article_collections_forbid_project_change before update on comms.article_collections
for each row execute function comms.forbid_project_change();

drop trigger if exists article_collections_guard on comms.article_collections;
create trigger article_collections_guard before insert or update on comms.article_collections
for each row execute function comms.article_collections_guard();

drop trigger if exists article_collections_stamp on comms.article_collections;
create trigger article_collections_stamp before insert or update on comms.article_collections
for each row execute function comms.articles_stamp();

drop trigger if exists article_collections_rederive on comms.article_collections;
create trigger article_collections_rederive after update of name, deleted_at on comms.article_collections
for each row execute function comms.article_collections_rederive();

drop trigger if exists help_center_articles_guard on comms.help_center_articles;
create trigger help_center_articles_guard before insert or update on comms.help_center_articles
for each row execute function comms.help_center_articles_guard();

drop trigger if exists help_center_articles_rederive on comms.help_center_articles;
create trigger help_center_articles_rederive
after insert or delete or update of center_id, article_id, collection_id, deleted_at on comms.help_center_articles
for each row execute function comms.help_center_articles_rederive();

drop trigger if exists help_centers_forbid_project_change on comms.help_centers;
create trigger help_centers_forbid_project_change before update on comms.help_centers
for each row execute function comms.forbid_project_change();

drop trigger if exists help_centers_guard on comms.help_centers;
create trigger help_centers_guard before update on comms.help_centers
for each row execute function comms.help_centers_guard();

drop trigger if exists help_centers_stamp on comms.help_centers;
create trigger help_centers_stamp before insert or update on comms.help_centers
for each row execute function comms.articles_stamp();

drop trigger if exists help_centers_after_soft_delete on comms.help_centers;
create trigger help_centers_after_soft_delete after update of deleted_at on comms.help_centers
for each row execute function comms.help_centers_after_soft_delete();

drop trigger if exists help_centers_rederive on comms.help_centers;
create trigger help_centers_rederive
after update of is_live, visibility, deleted_at, is_default on comms.help_centers
for each row execute function comms.help_centers_rederive();

drop trigger if exists article_versions_stamp on comms.article_versions;
create trigger article_versions_stamp before insert or update on comms.article_versions
for each row execute function comms.articles_stamp();

do $$
declare
  t text;
begin
  foreach t in array array['article_versions', 'article_views', 'article_reactions'] loop
    execute format('drop trigger if exists %I on comms.%I', t || '_touch_updated_at', t);
    execute format(
      'create trigger %I before update on comms.%I for each row execute function comms.touch_updated_at()',
      t || '_touch_updated_at', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and policies
-- ---------------------------------------------------------------------------
alter table comms.article_versions enable row level security;
drop policy if exists article_versions_project_select on comms.article_versions;
create policy article_versions_project_select on comms.article_versions
  for select to authenticated using (comms.can_access_project(project_id));
-- Browsers may only add snapshots of their own project's articles; published rows come from the definer trigger.
drop policy if exists article_versions_snapshot_insert on comms.article_versions;
create policy article_versions_snapshot_insert on comms.article_versions
  for insert to authenticated
  with check (
    kind = 'snapshot'
    and created_by = auth.uid()
    and comms.can_access_project(project_id)
    and exists (
      select 1 from comms.articles a
       where a.id = article_versions.article_id and a.project_id = article_versions.project_id));

alter table comms.article_views enable row level security;
drop policy if exists article_views_project_select on comms.article_views;
create policy article_views_project_select on comms.article_views
  for select to authenticated using (comms.can_access_project(project_id));

alter table comms.article_reactions enable row level security;
drop policy if exists article_reactions_project_select on comms.article_reactions;
create policy article_reactions_project_select on comms.article_reactions
  for select to authenticated using (comms.can_access_project(project_id));

-- Help-center settings and collections are publisher work (Intercom's "manage and publish").
drop policy if exists help_centers_publish_insert on comms.help_centers;
create policy help_centers_publish_insert on comms.help_centers as restrictive
  for insert to authenticated
  with check (comms.rbac_allows('comms.article.publish', project_id));
drop policy if exists help_centers_publish_update on comms.help_centers;
create policy help_centers_publish_update on comms.help_centers as restrictive
  for update to authenticated
  using (comms.rbac_allows('comms.article.publish', project_id))
  with check (comms.rbac_allows('comms.article.publish', project_id));
drop policy if exists help_centers_publish_delete on comms.help_centers;
create policy help_centers_publish_delete on comms.help_centers as restrictive
  for delete to authenticated
  using (comms.rbac_allows('comms.article.publish', project_id));

drop policy if exists article_collections_publish_insert on comms.article_collections;
create policy article_collections_publish_insert on comms.article_collections as restrictive
  for insert to authenticated
  with check (comms.rbac_allows('comms.article.publish', project_id));
drop policy if exists article_collections_publish_update on comms.article_collections;
create policy article_collections_publish_update on comms.article_collections as restrictive
  for update to authenticated
  using (comms.rbac_allows('comms.article.publish', project_id))
  with check (comms.rbac_allows('comms.article.publish', project_id));
drop policy if exists article_collections_publish_delete on comms.article_collections;
create policy article_collections_publish_delete on comms.article_collections as restrictive
  for delete to authenticated
  using (comms.rbac_allows('comms.article.publish', project_id));

-- Placement is part of Messenger visibility, so placing a published article needs the publish permission.
drop policy if exists help_center_articles_publish_insert on comms.help_center_articles;
create policy help_center_articles_publish_insert on comms.help_center_articles as restrictive
  for insert to authenticated
  with check (
    not exists (select 1 from comms.articles a
                 where a.id = help_center_articles.article_id and a.state = 'published')
    or comms.rbac_allows('comms.article.publish',
         (select hc.project_id from comms.help_centers hc where hc.id = help_center_articles.center_id)));
drop policy if exists help_center_articles_publish_update on comms.help_center_articles;
create policy help_center_articles_publish_update on comms.help_center_articles as restrictive
  for update to authenticated
  using (
    not exists (select 1 from comms.articles a
                 where a.id = help_center_articles.article_id and a.state = 'published')
    or comms.rbac_allows('comms.article.publish',
         (select hc.project_id from comms.help_centers hc where hc.id = help_center_articles.center_id)))
  with check (
    not exists (select 1 from comms.articles a
                 where a.id = help_center_articles.article_id and a.state = 'published')
    or comms.rbac_allows('comms.article.publish',
         (select hc.project_id from comms.help_centers hc where hc.id = help_center_articles.center_id)));
drop policy if exists help_center_articles_publish_delete on comms.help_center_articles;
create policy help_center_articles_publish_delete on comms.help_center_articles as restrictive
  for delete to authenticated
  using (
    not exists (select 1 from comms.articles a
                 where a.id = help_center_articles.article_id and a.state = 'published')
    or comms.rbac_allows('comms.article.publish',
         (select hc.project_id from comms.help_centers hc where hc.id = help_center_articles.center_id)));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Soft delete only, so the guards and cascades always run.
revoke delete, truncate on comms.articles, comms.help_centers, comms.article_collections from authenticated;

revoke all on comms.article_versions, comms.article_views, comms.article_reactions
  from public, anon, authenticated;
grant select, insert on comms.article_versions to authenticated;
grant select on comms.article_views, comms.article_reactions to authenticated;
grant all on comms.article_versions, comms.article_views, comms.article_reactions to service_role;

-- Every function revokes public/anon; the definer ones also revoke authenticated (comms default privileges grant it).
revoke execute on function
  comms.article_tsv(text, text, text),
  comms.or_tsquery(text),
  comms.article_messenger_visible(uuid, text, timestamptz, uuid, text),
  comms.article_collection_title(uuid),
  comms.articles_derive(),
  comms.articles_rederive(uuid[]),
  comms.articles_stamp(),
  comms.articles_guard_publish(),
  comms.articles_snapshot_version(),
  comms.article_collections_guard(),
  comms.article_collections_rederive(),
  comms.help_center_articles_guard(),
  comms.help_center_articles_rederive(),
  comms.help_centers_guard(),
  comms.help_centers_rederive(),
  comms.help_centers_after_soft_delete(),
  comms.set_default_help_center(uuid),
  comms.article_view_counts(uuid, timestamptz),
  comms.article_insights(uuid, int),
  comms.search_articles(uuid, text, text, int),
  comms.jsonb_deep_merge(jsonb, jsonb),
  comms.help_center_merge(uuid, jsonb, jsonb),
  comms.article_merge_meta(uuid, jsonb),
  comms.article_log_ai_assist(uuid, jsonb),
  comms.soft_delete_article(uuid),
  comms.create_translation(uuid, uuid, text, text, text, text, jsonb),
  comms.move_collection(uuid, uuid, int),
  comms.move_placement(uuid, uuid, int)
  from public, anon;
revoke execute on function
  comms.articles_snapshot_version(),
  comms.help_centers_after_soft_delete()
  from authenticated;
grant execute on function
  comms.set_default_help_center(uuid),
  comms.article_view_counts(uuid, timestamptz),
  comms.article_insights(uuid, int),
  comms.search_articles(uuid, text, text, int),
  comms.help_center_merge(uuid, jsonb, jsonb),
  comms.article_merge_meta(uuid, jsonb),
  comms.article_log_ai_assist(uuid, jsonb),
  comms.soft_delete_article(uuid),
  comms.create_translation(uuid, uuid, text, text, text, text, jsonb),
  comms.move_collection(uuid, uuid, int),
  comms.move_placement(uuid, uuid, int)
  to authenticated, service_role;
grant execute on function
  comms.article_tsv(text, text, text),
  comms.or_tsquery(text),
  comms.jsonb_deep_merge(jsonb, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- One-time backfill: content_updated_at from updated_at, and a full re-derive (author, reading time,
-- collection eyebrow, Messenger flag). On live every article is placed in its project's only center, which
-- just became the default, so no published flag should flip.
-- ---------------------------------------------------------------------------
update comms.articles set content_updated_at = coalesce(content_updated_at, updated_at);

-- @down

-- Refuses on the shared database: it drops version history, views and every authored column.
do $$
begin
  if coalesce(current_setting('comms.allow_destructive_down', true), '') <> 'on' then
    raise exception 'knowledge_base_authoring @down is destructive on the shared database; set comms.allow_destructive_down=on on a disposable database';
  end if;
end;
$$;

grant delete, truncate on comms.articles, comms.help_centers, comms.article_collections to authenticated;

drop policy if exists help_center_articles_publish_delete on comms.help_center_articles;
drop policy if exists help_center_articles_publish_update on comms.help_center_articles;
drop policy if exists help_center_articles_publish_insert on comms.help_center_articles;
drop policy if exists article_collections_publish_delete on comms.article_collections;
drop policy if exists article_collections_publish_update on comms.article_collections;
drop policy if exists article_collections_publish_insert on comms.article_collections;
drop policy if exists help_centers_publish_delete on comms.help_centers;
drop policy if exists help_centers_publish_update on comms.help_centers;
drop policy if exists help_centers_publish_insert on comms.help_centers;

drop trigger if exists help_centers_rederive on comms.help_centers;
drop trigger if exists help_centers_after_soft_delete on comms.help_centers;
drop trigger if exists help_centers_stamp on comms.help_centers;
drop trigger if exists help_centers_guard on comms.help_centers;
drop trigger if exists help_centers_forbid_project_change on comms.help_centers;
drop trigger if exists help_center_articles_rederive on comms.help_center_articles;
drop trigger if exists help_center_articles_guard on comms.help_center_articles;
drop trigger if exists article_collections_rederive on comms.article_collections;
drop trigger if exists article_collections_stamp on comms.article_collections;
drop trigger if exists article_collections_guard on comms.article_collections;
drop trigger if exists article_collections_forbid_project_change on comms.article_collections;
drop trigger if exists articles_snapshot_version on comms.articles;
drop trigger if exists articles_stamp on comms.articles;
drop trigger if exists articles_guard_publish on comms.articles;
drop trigger if exists articles_forbid_project_change on comms.articles;
drop trigger if exists articles_derive on comms.articles;

drop trigger if exists articles_touch_updated_at on comms.articles;
create trigger articles_touch_updated_at before update on comms.articles
for each row execute function comms.touch_updated_at();

drop table if exists comms.article_reactions cascade;
drop table if exists comms.article_views cascade;
drop table if exists comms.article_versions cascade;

drop function if exists comms.move_placement(uuid, uuid, int);
drop function if exists comms.move_collection(uuid, uuid, int);
drop function if exists comms.create_translation(uuid, uuid, text, text, text, text, jsonb);
drop function if exists comms.soft_delete_article(uuid);
drop function if exists comms.article_log_ai_assist(uuid, jsonb);
drop function if exists comms.article_merge_meta(uuid, jsonb);
drop function if exists comms.help_center_merge(uuid, jsonb, jsonb);
drop function if exists comms.jsonb_deep_merge(jsonb, jsonb);
drop function if exists comms.search_articles(uuid, text, text, int);
drop function if exists comms.article_insights(uuid, int);
drop function if exists comms.article_view_counts(uuid, timestamptz);
drop function if exists comms.set_default_help_center(uuid);
drop function if exists comms.help_centers_after_soft_delete();
drop function if exists comms.help_centers_rederive();
drop function if exists comms.help_centers_guard();
drop function if exists comms.article_collections_rederive();
drop function if exists comms.help_center_articles_rederive();
drop function if exists comms.help_center_articles_guard();
drop function if exists comms.article_collections_guard();
drop function if exists comms.articles_snapshot_version();
drop function if exists comms.articles_guard_publish();
drop function if exists comms.articles_stamp();
drop function if exists comms.articles_rederive(uuid[]);
drop function if exists comms.articles_derive();
drop function if exists comms.article_collection_title(uuid);
drop function if exists comms.article_messenger_visible(uuid, text, timestamptz, uuid, text);

drop index if exists comms.help_centers_verified_domain_uniq;
drop index if exists comms.help_centers_project_domain_uniq;
drop index if exists comms.help_centers_default_uniq;
drop index if exists comms.help_center_articles_collection_idx;
drop index if exists comms.article_collections_center_parent_idx;
drop index if exists comms.article_collections_center_slug_uniq;
drop index if exists comms.articles_search_idx;
drop index if exists comms.articles_group_locale_uniq;
create unique index if not exists article_collections_project_slug_idx
  on comms.article_collections (project_id, slug) where deleted_at is null;

-- article_tsv goes only after articles_search_idx, which depends on it.
drop function if exists comms.or_tsquery(text);
drop function if exists comms.article_tsv(text, text, text);

alter table comms.help_centers alter column locales set default '{en}'::text[];
alter table comms.help_centers
  drop column if exists domain_verified_at,
  drop column if exists is_live,
  drop column if exists is_default;

comment on column comms.help_center_articles.is_published is null;
alter table comms.help_center_articles drop column if exists collection_id;

alter table comms.article_collections
  drop column if exists icon,
  drop column if exists parent_id,
  drop column if exists help_center_id;

comment on column comms.articles.published is null;
comment on column comms.articles.position is null;
comment on column comms.articles.collection_id is null;
alter table comms.articles drop constraint if exists articles_audience_check;
alter table comms.articles alter column locale set default 'en';
alter table comms.articles
  drop column if exists updated_by,
  drop column if exists ai_enabled,
  drop column if exists audience,
  drop column if exists translated_from_at,
  drop column if exists content_updated_at,
  drop column if exists draft,
  drop column if exists collection_title,
  drop column if exists read_minutes,
  drop column if exists author_name,
  drop column if exists author_id;
