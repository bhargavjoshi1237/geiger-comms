-- Knowledge index
--
-- Article retrieval for Knowledge Gaps matching and later Messenger answers (KB spec §7.7), ported from grey's
-- retrieval migration. BYO embedding models have different native sizes, so knowledge_chunks.embedding becomes
-- an untyped public.halfvec with its length in embedding_dims, indexed by one partial HNSW index per common size.
-- Owns: knowledge_chunks embedding (halfvec), embedding_dims, article_id, content_hash and
--   knowledge_chunks_embedding_dims_check; the knowledge_chunks HNSW/lookup indexes; knowledge_sources_article_uniq;
--   comms.match_knowledge_chunks().
-- Keyword retrieval stays in comms.search_articles (owned by knowledge_base_authoring); callers fall back to it
-- when the project has no embedding default or no index yet.
-- The halfvec conversion refuses to run once any chunk holds a vector (the table is empty on live).
-- Depends on: comms.knowledge_chunks/knowledge_sources (20261021102003_adopt_knowledge_base); articles state, audience and
-- ai_enabled (20261021102424_knowledge_base_authoring); pgvector >= 0.8 for halfvec and hnsw.iterative_scan (live: 0.8.0).

-- @up

create extension if not exists vector with schema public;

do $$
declare
  v_type oid;
  v_mod int;
begin
  select a.atttypid, a.atttypmod into v_type, v_mod
    from pg_attribute a
   where a.attrelid = 'comms.knowledge_chunks'::regclass and a.attname = 'embedding' and not a.attisdropped;
  if v_type is distinct from 'public.halfvec'::regtype or v_mod <> -1 then
    if exists (select 1 from comms.knowledge_chunks where embedding is not null) then
      raise exception 'knowledge_index: knowledge_chunks already holds vectors; convert them deliberately';
    end if;
    alter table comms.knowledge_chunks alter column embedding type public.halfvec using embedding::public.halfvec;
  end if;
end;
$$;

alter table comms.knowledge_chunks
  add column if not exists embedding_dims smallint,
  add column if not exists article_id uuid references comms.articles(id) on delete cascade,
  add column if not exists content_hash text;

-- A vector must carry its length, or the expression indexes (and every search) would never see it.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'comms.knowledge_chunks'::regclass and conname = 'knowledge_chunks_embedding_dims_check'
  ) then
    alter table comms.knowledge_chunks add constraint knowledge_chunks_embedding_dims_check check (
      embedding is null
      or (embedding_dims between 1 and 4000 and public.vector_dims(embedding) = embedding_dims));
  end if;
end;
$$;

create index if not exists knowledge_chunks_article_idx
  on comms.knowledge_chunks (article_id) where deleted_at is null;
create index if not exists knowledge_chunks_source_hash_idx
  on comms.knowledge_chunks (source_id, content_hash) where deleted_at is null;
create unique index if not exists knowledge_sources_article_uniq
  on comms.knowledge_sources (project_id, (ref ->> 'articleId')) where kind = 'article' and deleted_at is null;

-- One partial expression HNSW index per common dimension; other sizes (64-4000) still work by exact search.
do $$
declare
  n int;
begin
  foreach n in array array[256, 384, 512, 768, 1024, 1536, 2048, 3072] loop
    execute format(
      'create index if not exists %I on comms.knowledge_chunks '
      'using hnsw ((embedding::public.halfvec(%s)) public.halfvec_cosine_ops) with (m = 16, ef_construction = 64) '
      'where embedding_dims = %s and deleted_at is null',
      'knowledge_chunks_embedding_hnsw_' || n, n, n);
  end loop;
end;
$$;

-- p_scope 'messenger': Messenger-eligible source rows (audience Everyone), listed or unlisted — `listed`
-- (articles.published) says whether a hit may be cited with a link. 'published': any published locale.
-- p_dims is validated, then formatted into the statement so the cast matches the partial expression index.
create or replace function comms.match_knowledge_chunks(
  p_project uuid, p_query public.halfvec, p_dims int, p_limit int default 8, p_scope text default 'messenger')
returns table (chunk_id uuid, article_id uuid, content text, similarity real, listed boolean)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_dims is null or p_dims < 64 or p_dims > 4000 then
    raise exception 'BAD_DIMS' using errcode = '22023';
  end if;
  if p_scope is null or p_scope not in ('messenger', 'published') then
    raise exception 'BAD_SCOPE' using errcode = '22023';
  end if;
  perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  perform set_config('hnsw.ef_search', '100', true);
  return query execute format($q$
    select c.id, c.article_id, c.content,
           (1 - (c.embedding::public.halfvec(%1$s) operator(public.<=>) $1::public.halfvec(%1$s)))::real,
           a.published
      from comms.knowledge_chunks c
      join comms.articles a on a.id = c.article_id and a.project_id = c.project_id
     where c.project_id = $2
       and c.deleted_at is null
       and c.embedding_dims = %1$s
       and a.deleted_at is null
       and a.state = 'published'
       and a.ai_enabled
       and ($3 = 'published' or ((a.group_id is null or a.group_id = a.id) and a.audience = 'everyone'))
     order by c.embedding::public.halfvec(%1$s) operator(public.<=>) $1::public.halfvec(%1$s)
     limit $4$q$, p_dims)
  using p_query, p_project, p_scope, greatest(1, least(coalesce(p_limit, 8), 50));
end;
$$;

revoke execute on function comms.match_knowledge_chunks(uuid, public.halfvec, int, int, text) from public, anon;
grant execute on function comms.match_knowledge_chunks(uuid, public.halfvec, int, int, text) to authenticated, service_role;

-- @down

-- Refuses on the shared database: it destroys every vector that isn't 1536-dimensional.
do $$
begin
  if coalesce(current_setting('comms.allow_destructive_down', true), '') <> 'on' then
    raise exception 'knowledge_index @down is destructive on the shared database; set comms.allow_destructive_down=on on a disposable database';
  end if;
end;
$$;

drop function if exists comms.match_knowledge_chunks(uuid, public.halfvec, int, int, text);

do $$
declare
  n int;
begin
  foreach n in array array[256, 384, 512, 768, 1024, 1536, 2048, 3072] loop
    execute format('drop index if exists comms.%I', 'knowledge_chunks_embedding_hnsw_' || n);
  end loop;
end;
$$;

drop index if exists comms.knowledge_sources_article_uniq;
drop index if exists comms.knowledge_chunks_source_hash_idx;
drop index if exists comms.knowledge_chunks_article_idx;
alter table comms.knowledge_chunks drop constraint if exists knowledge_chunks_embedding_dims_check;

update comms.knowledge_chunks set embedding = null
 where embedding is not null and public.vector_dims(embedding) <> 1536;
alter table comms.knowledge_chunks alter column embedding type public.vector(1536) using embedding::public.vector(1536);

alter table comms.knowledge_chunks
  drop column if exists content_hash,
  drop column if exists article_id,
  drop column if exists embedding_dims;
