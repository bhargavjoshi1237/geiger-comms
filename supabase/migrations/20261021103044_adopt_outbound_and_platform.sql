-- Adopt outbound and platform
--
-- Brings into the repo the Proactive, Integrations and admin tables the lost
-- outbound, platform and platform_aux migrations created (ledger versions
-- 20260910015413, 20260910020726, 20260910020849), and the seat type they added
-- to project members. This file re-declares their exact live DDL, idempotently:
-- on the live database every statement is a no-op or a same-definition replace;
-- on a fresh one it builds them.
--
-- Owns:
--   comms.messages_outbound, message_events  banners, tours, posts, … and their
--                                            delivery events
--   comms.contact_devices                    push tokens per contact
--   comms.api_keys, webhooks, webhook_deliveries, integration_installs,
--   mcp_servers, data_connectors              Integrations
--   comms.imports, import_errors, sandbox_snapshots  Import & Migration, Sandbox
--   comms.project_members.seat_type (+ project_members_seat_type_check,
--     project_members_seat_type_idx)
--   (tables, constraints, indexes, touch triggers, RLS, grants)
--
-- Depends on (owned elsewhere, all earlier versions):
--   comms.can_access_project(uuid)  20260821182908_adopt_rbac
--   comms.contacts                  20260705072403_comms
--   comms.project_members           20260825112725_rbac_team_management
--
-- messages_outbound.brand_id has no foreign key, exactly as live. Every table
-- is empty live; api_keys stores only a key hash and a display prefix.

-- @up

create extension if not exists pgcrypto;
create schema if not exists comms;
grant usage on schema comms to anon, authenticated, service_role;

create or replace function comms.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ---- messages_outbound ------------------------------------------------------

create table if not exists comms.messages_outbound (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  type text not null default 'banner',
  title text not null default '',
  body jsonb not null default '{}'::jsonb,
  audience jsonb not null default '{}'::jsonb,
  schedule jsonb not null default '{}'::jsonb,
  state text not null default 'draft',
  brand_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint messages_outbound_pkey primary key (id),
  constraint messages_outbound_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint messages_outbound_state_check check (state = any (array['draft', 'scheduled', 'live', 'paused', 'done'])),
  constraint messages_outbound_type_check check (type = any (array['banner', 'tooltip', 'post', 'checklist', 'tour', 'survey', 'campaign', 'push']))
);

alter table comms.messages_outbound
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists type text not null default 'banner',
  add column if not exists title text not null default '',
  add column if not exists body jsonb not null default '{}'::jsonb,
  add column if not exists audience jsonb not null default '{}'::jsonb,
  add column if not exists schedule jsonb not null default '{}'::jsonb,
  add column if not exists state text not null default 'draft',
  add column if not exists brand_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists messages_outbound_project_idx on comms.messages_outbound (project_id) where deleted_at is null;
create index if not exists messages_outbound_project_state_idx on comms.messages_outbound (project_id, state) where deleted_at is null;

drop trigger if exists messages_outbound_touch_updated_at on comms.messages_outbound;
create trigger messages_outbound_touch_updated_at
before update on comms.messages_outbound
for each row execute function comms.touch_updated_at();

-- ---- message_events ---------------------------------------------------------

create table if not exists comms.message_events (
  id uuid not null default gen_random_uuid(),
  outbound_id uuid not null,
  contact_id uuid,
  event text not null,
  created_at timestamptz not null default now(),
  constraint message_events_pkey primary key (id),
  constraint message_events_outbound_id_fkey foreign key (outbound_id) references comms.messages_outbound(id) on delete cascade,
  constraint message_events_event_check check (event = any (array['send', 'impression', 'click', 'dismiss', 'complete']))
);

alter table comms.message_events
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists outbound_id uuid not null,
  add column if not exists contact_id uuid,
  add column if not exists event text not null,
  add column if not exists created_at timestamptz not null default now();

create index if not exists message_events_contact_idx on comms.message_events (contact_id) where contact_id is not null;
create index if not exists message_events_outbound_event_idx on comms.message_events (outbound_id, event);

-- ---- contact_devices --------------------------------------------------------

create table if not exists comms.contact_devices (
  id uuid not null default gen_random_uuid(),
  contact_id uuid not null,
  platform text not null default '',
  token text not null,
  opted_out boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint contact_devices_pkey primary key (id),
  constraint contact_devices_contact_id_fkey foreign key (contact_id) references comms.contacts(id) on delete cascade,
  constraint contact_devices_token_key unique (token)
);

alter table comms.contact_devices
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists contact_id uuid not null,
  add column if not exists platform text not null default '',
  add column if not exists token text not null,
  add column if not exists opted_out boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists contact_devices_contact_idx on comms.contact_devices (contact_id) where deleted_at is null;

drop trigger if exists contact_devices_touch_updated_at on comms.contact_devices;
create trigger contact_devices_touch_updated_at
before update on comms.contact_devices
for each row execute function comms.touch_updated_at();

-- ---- api_keys ---------------------------------------------------------------

create table if not exists comms.api_keys (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  name text not null default '',
  key_prefix text not null default '',
  key_hash text not null,
  scopes text[] not null default '{}'::text[],
  last_used_at timestamptz,
  revoked boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint api_keys_pkey primary key (id),
  constraint api_keys_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.api_keys
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists name text not null default '',
  add column if not exists key_prefix text not null default '',
  add column if not exists key_hash text not null,
  add column if not exists scopes text[] not null default '{}'::text[],
  add column if not exists last_used_at timestamptz,
  add column if not exists revoked boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists api_keys_project_idx on comms.api_keys (project_id) where deleted_at is null;

drop trigger if exists api_keys_touch_updated_at on comms.api_keys;
create trigger api_keys_touch_updated_at
before update on comms.api_keys
for each row execute function comms.touch_updated_at();

-- ---- webhooks ---------------------------------------------------------------

create table if not exists comms.webhooks (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  url text not null default '',
  secret text not null default '',
  events text[] not null default '{}'::text[],
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint webhooks_pkey primary key (id),
  constraint webhooks_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.webhooks
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists url text not null default '',
  add column if not exists secret text not null default '',
  add column if not exists events text[] not null default '{}'::text[],
  add column if not exists enabled boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists webhooks_project_idx on comms.webhooks (project_id) where deleted_at is null;

drop trigger if exists webhooks_touch_updated_at on comms.webhooks;
create trigger webhooks_touch_updated_at
before update on comms.webhooks
for each row execute function comms.touch_updated_at();

-- ---- webhook_deliveries -----------------------------------------------------

create table if not exists comms.webhook_deliveries (
  id uuid not null default gen_random_uuid(),
  webhook_id uuid not null,
  event jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_retry_at timestamptz,
  response_code integer,
  created_at timestamptz not null default now(),
  constraint webhook_deliveries_pkey primary key (id),
  constraint webhook_deliveries_webhook_id_fkey foreign key (webhook_id) references comms.webhooks(id) on delete cascade,
  constraint webhook_deliveries_status_check check (status = any (array['pending', 'ok', 'failed']))
);

alter table comms.webhook_deliveries
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists webhook_id uuid not null,
  add column if not exists event jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'pending',
  add column if not exists attempts integer not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists response_code integer,
  add column if not exists created_at timestamptz not null default now();

create index if not exists webhook_deliveries_retry_idx on comms.webhook_deliveries (next_retry_at) where status = 'pending';
create index if not exists webhook_deliveries_webhook_idx on comms.webhook_deliveries (webhook_id);

-- ---- integration_installs ---------------------------------------------------

create table if not exists comms.integration_installs (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  key text not null default '',
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  health text not null default 'unknown',
  last_sync_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint integration_installs_pkey primary key (id),
  constraint integration_installs_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint integration_installs_project_key_key unique (project_id, key)
);

alter table comms.integration_installs
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists key text not null default '',
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists enabled boolean not null default true,
  add column if not exists health text not null default 'unknown',
  add column if not exists last_sync_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists integration_installs_project_idx on comms.integration_installs (project_id) where deleted_at is null;

drop trigger if exists integration_installs_touch_updated_at on comms.integration_installs;
create trigger integration_installs_touch_updated_at
before update on comms.integration_installs
for each row execute function comms.touch_updated_at();

-- ---- mcp_servers ------------------------------------------------------------

create table if not exists comms.mcp_servers (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  name text not null default '',
  url text not null default '',
  enabled boolean not null default true,
  tools jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint mcp_servers_pkey primary key (id),
  constraint mcp_servers_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.mcp_servers
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists name text not null default '',
  add column if not exists url text not null default '',
  add column if not exists enabled boolean not null default true,
  add column if not exists tools jsonb not null default '[]'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists mcp_servers_project_idx on comms.mcp_servers (project_id) where deleted_at is null;

drop trigger if exists mcp_servers_touch_updated_at on comms.mcp_servers;
create trigger mcp_servers_touch_updated_at
before update on comms.mcp_servers
for each row execute function comms.touch_updated_at();

-- ---- data_connectors --------------------------------------------------------

create table if not exists comms.data_connectors (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  name text not null default '',
  kind text not null default 'rest',
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint data_connectors_pkey primary key (id),
  constraint data_connectors_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.data_connectors
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists name text not null default '',
  add column if not exists kind text not null default 'rest',
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists enabled boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists data_connectors_project_idx on comms.data_connectors (project_id) where deleted_at is null;

drop trigger if exists data_connectors_touch_updated_at on comms.data_connectors;
create trigger data_connectors_touch_updated_at
before update on comms.data_connectors
for each row execute function comms.touch_updated_at();

-- ---- imports ----------------------------------------------------------------

create table if not exists comms.imports (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  source text not null default 'csv',
  status text not null default 'pending',
  total integer not null default 0,
  done_count integer not null default 0,
  error_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint imports_pkey primary key (id),
  constraint imports_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint imports_source_check check (source = any (array['csv', 'zendesk', 'intercom', 'front'])),
  constraint imports_status_check check (status = any (array['pending', 'running', 'done', 'error']))
);

alter table comms.imports
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists source text not null default 'csv',
  add column if not exists status text not null default 'pending',
  add column if not exists total integer not null default 0,
  add column if not exists done_count integer not null default 0,
  add column if not exists error_count integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists imports_project_idx on comms.imports (project_id) where deleted_at is null;

drop trigger if exists imports_touch_updated_at on comms.imports;
create trigger imports_touch_updated_at
before update on comms.imports
for each row execute function comms.touch_updated_at();

-- ---- import_errors ----------------------------------------------------------

create table if not exists comms.import_errors (
  id uuid not null default gen_random_uuid(),
  import_id uuid not null,
  row_ref text not null default '',
  message text not null default '',
  created_at timestamptz not null default now(),
  constraint import_errors_pkey primary key (id),
  constraint import_errors_import_id_fkey foreign key (import_id) references comms.imports(id) on delete cascade
);

alter table comms.import_errors
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists import_id uuid not null,
  add column if not exists row_ref text not null default '',
  add column if not exists message text not null default '',
  add column if not exists created_at timestamptz not null default now();

create index if not exists import_errors_import_idx on comms.import_errors (import_id, created_at);

-- ---- sandbox_snapshots ------------------------------------------------------

create table if not exists comms.sandbox_snapshots (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  name text not null default '',
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint sandbox_snapshots_pkey primary key (id),
  constraint sandbox_snapshots_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.sandbox_snapshots
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists name text not null default '',
  add column if not exists snapshot jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now();

create index if not exists sandbox_snapshots_project_idx on comms.sandbox_snapshots (project_id, created_at desc);

-- ---- project_members: seat type ---------------------------------------------

alter table comms.project_members add column if not exists seat_type text not null default 'full';

create index if not exists project_members_seat_type_idx on comms.project_members (project_id, seat_type) where deleted_at is null;

-- ---- constraints ------------------------------------------------------------

-- Named constraints, each added only when a pre-existing table lacks it.
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('comms.messages_outbound', 'messages_outbound_pkey', 'primary key (id)'),
      ('comms.message_events', 'message_events_pkey', 'primary key (id)'),
      ('comms.contact_devices', 'contact_devices_pkey', 'primary key (id)'),
      ('comms.api_keys', 'api_keys_pkey', 'primary key (id)'),
      ('comms.webhooks', 'webhooks_pkey', 'primary key (id)'),
      ('comms.webhook_deliveries', 'webhook_deliveries_pkey', 'primary key (id)'),
      ('comms.integration_installs', 'integration_installs_pkey', 'primary key (id)'),
      ('comms.mcp_servers', 'mcp_servers_pkey', 'primary key (id)'),
      ('comms.data_connectors', 'data_connectors_pkey', 'primary key (id)'),
      ('comms.imports', 'imports_pkey', 'primary key (id)'),
      ('comms.import_errors', 'import_errors_pkey', 'primary key (id)'),
      ('comms.sandbox_snapshots', 'sandbox_snapshots_pkey', 'primary key (id)'),
      ('comms.contact_devices', 'contact_devices_token_key', 'unique (token)'),
      ('comms.integration_installs', 'integration_installs_project_key_key', 'unique (project_id, key)'),
      ('comms.messages_outbound', 'messages_outbound_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.message_events', 'message_events_outbound_id_fkey', 'foreign key (outbound_id) references comms.messages_outbound(id) on delete cascade'),
      ('comms.contact_devices', 'contact_devices_contact_id_fkey', 'foreign key (contact_id) references comms.contacts(id) on delete cascade'),
      ('comms.api_keys', 'api_keys_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.webhooks', 'webhooks_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.webhook_deliveries', 'webhook_deliveries_webhook_id_fkey', 'foreign key (webhook_id) references comms.webhooks(id) on delete cascade'),
      ('comms.integration_installs', 'integration_installs_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.mcp_servers', 'mcp_servers_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.data_connectors', 'data_connectors_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.imports', 'imports_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.import_errors', 'import_errors_import_id_fkey', 'foreign key (import_id) references comms.imports(id) on delete cascade'),
      ('comms.sandbox_snapshots', 'sandbox_snapshots_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.messages_outbound', 'messages_outbound_state_check', $c$check (state = any (array['draft', 'scheduled', 'live', 'paused', 'done']))$c$),
      ('comms.messages_outbound', 'messages_outbound_type_check', $c$check (type = any (array['banner', 'tooltip', 'post', 'checklist', 'tour', 'survey', 'campaign', 'push']))$c$),
      ('comms.message_events', 'message_events_event_check', $c$check (event = any (array['send', 'impression', 'click', 'dismiss', 'complete']))$c$),
      ('comms.webhook_deliveries', 'webhook_deliveries_status_check', $c$check (status = any (array['pending', 'ok', 'failed']))$c$),
      ('comms.imports', 'imports_source_check', $c$check (source = any (array['csv', 'zendesk', 'intercom', 'front']))$c$),
      ('comms.imports', 'imports_status_check', $c$check (status = any (array['pending', 'running', 'done', 'error']))$c$),
      ('comms.project_members', 'project_members_seat_type_check', $c$check (seat_type = any (array['full', 'lite', 'collaborator']))$c$)
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
  comms.messages_outbound, comms.message_events, comms.contact_devices, comms.api_keys,
  comms.webhooks, comms.webhook_deliveries, comms.integration_installs, comms.mcp_servers,
  comms.data_connectors, comms.imports, comms.import_errors, comms.sandbox_snapshots
  from public, anon;
grant all on
  comms.messages_outbound, comms.message_events, comms.contact_devices, comms.api_keys,
  comms.webhooks, comms.webhook_deliveries, comms.integration_installs, comms.mcp_servers,
  comms.data_connectors, comms.imports, comms.import_errors, comms.sandbox_snapshots
  to authenticated, service_role;

alter table comms.messages_outbound enable row level security;
drop policy if exists messages_outbound_project_all on comms.messages_outbound;
create policy messages_outbound_project_all on comms.messages_outbound for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.message_events enable row level security;
drop policy if exists message_events_project_scope on comms.message_events;
create policy message_events_project_scope on comms.message_events for all to authenticated
  using (exists (
    select 1 from comms.messages_outbound o
    where o.id = message_events.outbound_id and comms.can_access_project(o.project_id)
  ))
  with check (exists (
    select 1 from comms.messages_outbound o
    where o.id = message_events.outbound_id and comms.can_access_project(o.project_id)
  ));

alter table comms.contact_devices enable row level security;
drop policy if exists contact_devices_project_scope on comms.contact_devices;
create policy contact_devices_project_scope on comms.contact_devices for all to authenticated
  using (exists (
    select 1 from comms.contacts c
    where c.id = contact_devices.contact_id and comms.can_access_project(c.project_id)
  ))
  with check (exists (
    select 1 from comms.contacts c
    where c.id = contact_devices.contact_id and comms.can_access_project(c.project_id)
  ));

alter table comms.api_keys enable row level security;
drop policy if exists api_keys_project_all on comms.api_keys;
create policy api_keys_project_all on comms.api_keys for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.webhooks enable row level security;
drop policy if exists webhooks_project_all on comms.webhooks;
create policy webhooks_project_all on comms.webhooks for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.webhook_deliveries enable row level security;
drop policy if exists webhook_deliveries_project_scope on comms.webhook_deliveries;
create policy webhook_deliveries_project_scope on comms.webhook_deliveries for all to authenticated
  using (exists (
    select 1 from comms.webhooks w
    where w.id = webhook_deliveries.webhook_id and comms.can_access_project(w.project_id)
  ))
  with check (exists (
    select 1 from comms.webhooks w
    where w.id = webhook_deliveries.webhook_id and comms.can_access_project(w.project_id)
  ));

alter table comms.integration_installs enable row level security;
drop policy if exists integration_installs_project_all on comms.integration_installs;
create policy integration_installs_project_all on comms.integration_installs for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.mcp_servers enable row level security;
drop policy if exists mcp_servers_project_all on comms.mcp_servers;
create policy mcp_servers_project_all on comms.mcp_servers for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.data_connectors enable row level security;
drop policy if exists data_connectors_project_all on comms.data_connectors;
create policy data_connectors_project_all on comms.data_connectors for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.imports enable row level security;
drop policy if exists imports_project_all on comms.imports;
create policy imports_project_all on comms.imports for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.import_errors enable row level security;
drop policy if exists import_errors_project_scope on comms.import_errors;
create policy import_errors_project_scope on comms.import_errors for all to authenticated
  using (exists (
    select 1 from comms.imports i
    where i.id = import_errors.import_id and comms.can_access_project(i.project_id)
  ))
  with check (exists (
    select 1 from comms.imports i
    where i.id = import_errors.import_id and comms.can_access_project(i.project_id)
  ));

alter table comms.sandbox_snapshots enable row level security;
drop policy if exists sandbox_snapshots_project_all on comms.sandbox_snapshots;
create policy sandbox_snapshots_project_all on comms.sandbox_snapshots for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

-- @down

-- Forget-only on purpose: these tables and the seat_type column predate this
-- file on the live database, so rolling back drops the ledger row and nothing
-- else.
select 1;
