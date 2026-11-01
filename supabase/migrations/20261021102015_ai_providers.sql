-- AI providers (knowledge-base-and-ai-providers spec §4)
--
-- Bring-your-own model providers: each project connects its own vendor accounts; keys live in Supabase Vault
-- under the name comms_provider_<model_providers.id> (no secret id is stored) and only the service role reads them.
-- Owns: comms.model_providers, comms.ai_settings, comms.ai_usage_events (tables, indexes, triggers, RLS, grants).
-- Owns: comms.guard_provider_secret_columns(), comms.model_providers_purge_secret(), comms.set_provider_secret(uuid, uuid, text),
--   comms.get_provider_secret(uuid, uuid), comms.ai_settings_guard(), comms.ai_usage_count(uuid, text, timestamptz),
--   comms.ai_usage_summary(uuid, timestamptz) and comms.forbid_project_change() (knowledge_base_authoring only attaches it).
-- Depends on: comms.can_access_project(uuid) and comms.rbac_allows(text, uuid, …) (20260821182908_adopt_rbac);
--   comms.knowledge_chunks (20261021102003_adopt_knowledge_base), read at run time by ai_settings_guard.
-- Rolling back erases every project's provider keys, so the down section refuses unless comms.allow_destructive_down=on.

-- @up

create extension if not exists pgcrypto;
create schema if not exists comms;
grant usage on schema comms to anon, authenticated, service_role;

-- Body matches the live prosrc, so the replace is a no-op.
create or replace function comms.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists comms.model_providers (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  name            text not null default '',
  provider        text not null,
  base_url        text,
  has_key         boolean not null default false,
  key_last4       text,
  status          text not null default 'unverified',
  last_checked_at timestamptz,
  models          text[] not null default '{}',
  metadata        jsonb not null default '{}'::jsonb,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint model_providers_provider_check check (provider in
    ('openai', 'anthropic', 'google', 'openrouter', 'openai_compatible', 'cohere', 'voyage')),
  constraint model_providers_status_check check (status in ('unverified', 'ok', 'error'))
);
create index if not exists model_providers_project_idx
  on comms.model_providers (project_id) where deleted_at is null;
create unique index if not exists model_providers_project_name_uniq
  on comms.model_providers (project_id, lower(name)) where deleted_at is null;

-- One row per project: the default model per capability plus the per-feature switches and daily caps.
create table if not exists comms.ai_settings (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete cascade,
  chat_provider_id    uuid references comms.model_providers(id) on delete set null,
  chat_model          text,
  embed_provider_id   uuid references comms.model_providers(id) on delete set null,
  embed_model         text,
  embed_dims          integer,
  features            jsonb not null default
    '{"articleAssist":true,"translation":true,"gapClustering":true,"messengerAnswers":false}'::jsonb,
  limits              jsonb not null default
    '{"articleAssist":300,"translation":100,"gapClustering":40,"messengerAnswers":0,"perUserPerMinute":10}'::jsonb,
  data_sharing_ack_at timestamptz,
  data_sharing_ack_by uuid,
  metadata            jsonb not null default '{}'::jsonb,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  -- Not partial, so a soft delete can't dodge the embedding lock.
  constraint ai_settings_project_key unique (project_id),
  constraint ai_settings_embed_dims_check check (embed_dims is null or embed_dims between 64 and 4000)
);

-- Append-only metering. BYOK: no cost is stored; the vendor bills the customer.
create table if not exists comms.ai_usage_events (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  provider_id   uuid references comms.model_providers(id) on delete set null,
  feature       text not null,
  capability    text not null default 'chat',
  model         text,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  latency_ms    integer,
  ok            boolean not null default true,
  error_code    text,
  metadata      jsonb not null default '{"byok":true}'::jsonb,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists ai_usage_events_project_idx
  on comms.ai_usage_events (project_id, created_at desc) where deleted_at is null;
create index if not exists ai_usage_events_quota_idx
  on comms.ai_usage_events (project_id, feature, created_at desc) where deleted_at is null;

drop trigger if exists model_providers_touch_updated_at on comms.model_providers;
create trigger model_providers_touch_updated_at before update on comms.model_providers
for each row execute function comms.touch_updated_at();
drop trigger if exists ai_settings_touch_updated_at on comms.ai_settings;
create trigger ai_settings_touch_updated_at before update on comms.ai_settings
for each row execute function comms.touch_updated_at();
drop trigger if exists ai_usage_events_touch_updated_at on comms.ai_usage_events;
create trigger ai_usage_events_touch_updated_at before update on comms.ai_usage_events
for each row execute function comms.touch_updated_at();

-- Browser roles never write has_key / key_last4 (only set_provider_secret does), and a stored key belongs to the
-- endpoint it was saved for: any base_url or kind change clears it, whoever makes the change.
create or replace function comms.guard_provider_secret_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.has_key := false;
      new.key_last4 := null;
    else
      new.has_key := old.has_key;
      new.key_last4 := old.key_last4;
    end if;
  end if;
  if tg_op = 'UPDATE'
     and (new.base_url is distinct from old.base_url or new.provider is distinct from old.provider) then
    new.has_key := false;
    new.key_last4 := null;
    new.status := 'unverified';
  end if;
  return new;
end;
$$;

drop trigger if exists model_providers_secret_guard on comms.model_providers;
create trigger model_providers_secret_guard before insert or update on comms.model_providers
for each row execute function comms.guard_provider_secret_columns();

-- Erases the Vault secret when the key is cleared or the provider is deleted (soft, hard or by project cascade),
-- and releases the defaults that pointed at a deleted provider.
create or replace function comms.model_providers_purge_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where name = 'comms_provider_' || old.id::text;
  if tg_op = 'DELETE' or new.deleted_at is not null then
    update comms.ai_settings set chat_provider_id = null where chat_provider_id = old.id;
    update comms.ai_settings set embed_provider_id = null where embed_provider_id = old.id;
  end if;
  return null;
end;
$$;

-- No column list: it would miss the has_key flips the BEFORE guard makes, hence the WHEN.
drop trigger if exists model_providers_purge_secret_on_update on comms.model_providers;
create trigger model_providers_purge_secret_on_update after update on comms.model_providers
for each row
when ((old.has_key and not new.has_key) or (old.deleted_at is null and new.deleted_at is not null))
execute function comms.model_providers_purge_secret();
drop trigger if exists model_providers_purge_secret_on_delete on comms.model_providers;
create trigger model_providers_purge_secret_on_delete after delete on comms.model_providers
for each row execute function comms.model_providers_purge_secret();

-- Stores (or rotates) a provider's key in Vault by name. Service role only.
create or replace function comms.set_provider_secret(p_provider uuid, p_project uuid, p_secret text)
returns comms.model_providers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := 'comms_provider_' || p_provider::text;
  v_secret_id uuid;
  r comms.model_providers;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'set_provider_secret is service-role only' using errcode = '42501';
  end if;
  if coalesce(p_secret, '') = '' then
    raise exception 'SECRET_REQUIRED' using errcode = '22023';
  end if;

  perform 1 from comms.model_providers
   where id = p_provider and project_id = p_project and deleted_at is null
   for update;
  if not found then
    raise exception 'PROVIDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  select s.id into v_secret_id from vault.secrets s where s.name = v_name;
  if v_secret_id is null then
    perform vault.create_secret(p_secret, v_name);
  else
    perform vault.update_secret(v_secret_id, p_secret);
  end if;

  update comms.model_providers
     set has_key = true,
         key_last4 = case when length(p_secret) >= 12 then right(p_secret, 4) end,
         status = 'unverified'
   where id = p_provider
  returning * into r;
  return r;
end;
$$;

-- Reads a provider's key for one engine call. Service role only, scoped to the project, never for a cleared key.
create or replace function comms.get_provider_secret(p_provider uuid, p_project uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'get_provider_secret is service-role only' using errcode = '42501';
  end if;
  select ds.decrypted_secret into v
    from comms.model_providers mp
    join vault.decrypted_secrets ds on ds.name = 'comms_provider_' || mp.id::text
   where mp.id = p_provider and mp.project_id = p_project and mp.deleted_at is null and mp.has_key;
  return v;
end;
$$;

-- Locks the embedding model while indexed chunks exist (the route turns EMBEDDING_IN_USE into a re-index
-- confirmation), refuses soft deletes, and stamps the data-sharing acknowledgement from the session.
create or replace function comms.ai_settings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    raise exception 'SETTINGS_NOT_DELETABLE' using errcode = 'P0001';
  end if;

  if new.embed_provider_id is not null
     and (tg_op = 'INSERT'
          or (new.embed_provider_id, new.embed_model, new.embed_dims)
             is distinct from (old.embed_provider_id, old.embed_model, old.embed_dims))
     and exists (
       select 1 from comms.knowledge_chunks c
        where c.project_id = new.project_id and c.deleted_at is null
     ) then
    raise exception 'EMBEDDING_IN_USE' using errcode = 'P0001';
  end if;

  if new.data_sharing_ack_at is null then
    new.data_sharing_ack_by := null;
  elsif tg_op = 'INSERT' or old.data_sharing_ack_at is null then
    new.data_sharing_ack_at := now();
    new.data_sharing_ack_by := auth.uid();
  else
    new.data_sharing_ack_at := old.data_sharing_ack_at;
    new.data_sharing_ack_by := old.data_sharing_ack_by;
  end if;
  return new;
end;
$$;

drop trigger if exists ai_settings_guard on comms.ai_settings;
create trigger ai_settings_guard before insert or update on comms.ai_settings
for each row execute function comms.ai_settings_guard();

create or replace function comms.forbid_project_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'PROJECT_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists model_providers_forbid_project_change on comms.model_providers;
create trigger model_providers_forbid_project_change before update on comms.model_providers
for each row execute function comms.forbid_project_change();
drop trigger if exists ai_settings_forbid_project_change on comms.ai_settings;
create trigger ai_settings_forbid_project_change before update on comms.ai_settings
for each row execute function comms.forbid_project_change();

-- Rolling-window request count behind the daily caps (spec §5.9).
create or replace function comms.ai_usage_count(p_project uuid, p_feature text, p_since timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
    from comms.ai_usage_events
   where project_id = p_project and feature = p_feature and created_at >= p_since and deleted_at is null;
$$;

-- Per UTC day, feature, provider and outcome since p_since, for the Usage card and the per-provider request counts.
-- Invoker rights: the caller's RLS decides which project it can read.
create or replace function comms.ai_usage_summary(p_project uuid, p_since timestamptz)
returns table (day date, feature text, provider_id uuid, ok boolean, requests integer, input_tokens bigint, output_tokens bigint)
language sql
stable
set search_path = ''
as $$
  select (e.created_at at time zone 'utc')::date, e.feature, e.provider_id, e.ok,
         count(*)::integer, sum(e.input_tokens)::bigint, sum(e.output_tokens)::bigint
    from comms.ai_usage_events e
   where e.project_id = p_project and e.created_at >= p_since and e.deleted_at is null
   group by 1, 2, 3, 4;
$$;

alter table comms.model_providers enable row level security;
drop policy if exists model_providers_project_scope on comms.model_providers;
create policy model_providers_project_scope on comms.model_providers for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));
drop policy if exists model_providers_view_guard on comms.model_providers;
create policy model_providers_view_guard on comms.model_providers as restrictive for select to authenticated
  using (comms.rbac_allows('comms.settings.view', project_id));
drop policy if exists model_providers_insert_guard on comms.model_providers;
create policy model_providers_insert_guard on comms.model_providers as restrictive for insert to authenticated
  with check (comms.rbac_allows('comms.settings.manage', project_id));
drop policy if exists model_providers_update_guard on comms.model_providers;
create policy model_providers_update_guard on comms.model_providers as restrictive for update to authenticated
  using (comms.rbac_allows('comms.settings.manage', project_id))
  with check (comms.rbac_allows('comms.settings.manage', project_id));

alter table comms.ai_settings enable row level security;
drop policy if exists ai_settings_project_scope on comms.ai_settings;
create policy ai_settings_project_scope on comms.ai_settings for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));
drop policy if exists ai_settings_insert_guard on comms.ai_settings;
create policy ai_settings_insert_guard on comms.ai_settings as restrictive for insert to authenticated
  with check (comms.rbac_allows('comms.settings.manage', project_id));
drop policy if exists ai_settings_update_guard on comms.ai_settings;
create policy ai_settings_update_guard on comms.ai_settings as restrictive for update to authenticated
  using (comms.rbac_allows('comms.settings.manage', project_id))
  with check (comms.rbac_allows('comms.settings.manage', project_id));

alter table comms.ai_usage_events enable row level security;
drop policy if exists ai_usage_events_project_select on comms.ai_usage_events;
create policy ai_usage_events_project_select on comms.ai_usage_events for select to authenticated
  using (comms.can_access_project(project_id));

-- Soft delete only on the two editable tables, so the purge and guard triggers always see it; usage is service-role written.
revoke all on comms.model_providers, comms.ai_settings, comms.ai_usage_events from public, anon;
grant select, insert, update on comms.model_providers, comms.ai_settings to authenticated;
revoke delete, truncate on comms.model_providers, comms.ai_settings from authenticated;
grant select on comms.ai_usage_events to authenticated;
revoke insert, update, delete, truncate on comms.ai_usage_events from authenticated;
grant all on comms.model_providers, comms.ai_settings, comms.ai_usage_events to service_role;

-- The comms default privileges grant authenticated EXECUTE on every new function: revoke it from all but the invoker RPC.
revoke all on function comms.guard_provider_secret_columns() from public, anon, authenticated;
revoke all on function comms.model_providers_purge_secret() from public, anon, authenticated;
revoke all on function comms.ai_settings_guard() from public, anon, authenticated;
revoke all on function comms.forbid_project_change() from public, anon, authenticated;
revoke all on function comms.set_provider_secret(uuid, uuid, text) from public, anon, authenticated;
grant execute on function comms.set_provider_secret(uuid, uuid, text) to service_role;
revoke all on function comms.get_provider_secret(uuid, uuid) from public, anon, authenticated;
grant execute on function comms.get_provider_secret(uuid, uuid) to service_role;
revoke all on function comms.ai_usage_count(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function comms.ai_usage_count(uuid, text, timestamptz) to service_role;
revoke all on function comms.ai_usage_summary(uuid, timestamptz) from public, anon;
grant execute on function comms.ai_usage_summary(uuid, timestamptz) to authenticated, service_role;

-- @down

do $$ begin
  if coalesce(current_setting('comms.allow_destructive_down', true), '') <> 'on' then
    raise exception 'ai_providers @down is destructive on the shared database; set comms.allow_destructive_down=on on a disposable database';
  end if;
end $$;

drop trigger if exists ai_settings_forbid_project_change on comms.ai_settings;
drop trigger if exists model_providers_forbid_project_change on comms.model_providers;
drop trigger if exists ai_settings_guard on comms.ai_settings;
drop trigger if exists model_providers_purge_secret_on_delete on comms.model_providers;
drop trigger if exists model_providers_purge_secret_on_update on comms.model_providers;
drop trigger if exists model_providers_secret_guard on comms.model_providers;
drop trigger if exists ai_usage_events_touch_updated_at on comms.ai_usage_events;
drop trigger if exists ai_settings_touch_updated_at on comms.ai_settings;
drop trigger if exists model_providers_touch_updated_at on comms.model_providers;

drop function if exists comms.ai_usage_summary(uuid, timestamptz);
drop function if exists comms.ai_usage_count(uuid, text, timestamptz);
-- Fails while a later migration still attaches it, which is the intended order.
drop function if exists comms.forbid_project_change();
drop function if exists comms.ai_settings_guard();
drop function if exists comms.get_provider_secret(uuid, uuid);
drop function if exists comms.set_provider_secret(uuid, uuid, text);
drop function if exists comms.model_providers_purge_secret();
drop function if exists comms.guard_provider_secret_columns();

delete from vault.secrets where starts_with(name, 'comms_provider_');

drop table if exists comms.ai_usage_events cascade;
drop table if exists comms.ai_settings cascade;
drop table if exists comms.model_providers cascade;
