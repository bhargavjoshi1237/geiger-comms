-- Channels
--
-- Owns comms.channels: one row per configured destination (email, messenger,
-- whatsapp, sms, social, slack). All six are simulated connections — the config
-- jsonb carries per-kind settings plus `simulated: true` (see
-- docs/specs/2026-08-22-channels-design.md §1.1); real providers flip that flag
-- later with no schema change.
--
-- Also adds comms.conversations.channel_id: WHICH connected channel a
-- conversation belongs to. The existing free-text `channel` column stays — it
-- is the display kind and Overview reads it.

-- @up

create extension if not exists pgcrypto;

-- Declared locally so this file stands alone; create-or-replace is a no-op when
-- the earlier migration already created it.
create or replace function comms.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists comms.channels (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,                        -- email | messenger | whatsapp | sms | social | slack
  name        text not null default '',             -- "Support inbox", "@acme on Instagram"
  status      text not null default 'disconnected', -- connected | disconnected | error
  config      jsonb not null default '{}'::jsonb,   -- per-kind shape, see spec §3
  project_id  uuid references public.projects(id) on delete cascade,
  metadata    jsonb not null default '{}'::jsonb,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

alter table comms.channels add column if not exists name text not null default '';
alter table comms.channels add column if not exists status text not null default 'disconnected';
alter table comms.channels add column if not exists config jsonb not null default '{}'::jsonb;
alter table comms.channels add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table comms.channels add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table comms.channels add column if not exists created_by uuid;
alter table comms.channels add column if not exists updated_at timestamptz not null default now();
alter table comms.channels add column if not exists deleted_at timestamptz;

create index if not exists channels_kind_idx
  on comms.channels (project_id, kind) where deleted_at is null;

drop trigger if exists channels_touch_updated_at on comms.channels;
create trigger channels_touch_updated_at
before update on comms.channels
for each row execute function comms.touch_updated_at();

alter table comms.conversations
  add column if not exists channel_id uuid references comms.channels(id) on delete set null;

create index if not exists conversations_channel_id_idx
  on comms.conversations (channel_id) where deleted_at is null;

alter table comms.channels enable row level security;

drop policy if exists comms_channels_demo_all on comms.channels;
create policy comms_channels_demo_all on comms.channels
  for all to anon, authenticated using (true) with check (true);

-- @down

drop index if exists comms.conversations_channel_id_idx;
alter table comms.conversations drop column if exists channel_id;

drop policy if exists comms_channels_demo_all on comms.channels;
drop index if exists comms.channels_kind_idx;
drop trigger if exists channels_touch_updated_at on comms.channels;
drop table if exists comms.channels cascade;
