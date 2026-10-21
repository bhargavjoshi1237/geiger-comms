-- Adopt the inbox extensions
--
-- Brings into the repo the inbox-side data model the lost custom_fields,
-- channel_events and ticket_states migrations created (ledger versions
-- 20260909194514, 20260909194543, 20260910020753). This file re-declares
-- their exact live DDL, idempotently: on the live database every statement is a
-- no-op or a same-definition replace; on a fresh one it builds them.
--
-- Owns:
--   comms.channel_events     raw provider events per channel, deduped on
--                            (channel_id, provider_message_id)
--   comms.ticket_states      per-project ticket state catalog, and
--                            comms.tickets.state_id / merged_into_id (+ FKs, indexes)
--   comms.custom_fields      attribute definitions for contacts, companies,
--                            tickets and conversations
--   comms.custom_objects, comms.custom_records
--   (tables, constraints, indexes, touch triggers, RLS, grants)
--
-- Depends on (owned elsewhere, all earlier versions):
--   comms.can_access_project(uuid)  20260821182908_adopt_rbac
--   comms.channels                  20260821220650_channels
--   comms.conversations, comms.contacts, comms.tickets
--                                   20260705072403_comms … 20260825120525_inbox_views_tickets
--
-- ticket_states carries two identical unique constraints on (project_id, name),
-- exactly as live. custom_fields' audit trigger is owned by
-- 20261021103045_adopt_audit_log. The lost message_search index
-- (messages_body_trgm_idx) is adopted by 20261021103241_inbox_message_search.

-- @up

create extension if not exists pgcrypto;
create schema if not exists comms;
grant usage on schema comms to anon, authenticated, service_role;

create or replace function comms.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ---- channel_events ---------------------------------------------------------

create table if not exists comms.channel_events (
  id uuid not null default gen_random_uuid(),
  channel_id uuid,
  project_id uuid,
  provider text not null default 'generic',
  provider_message_id text not null,
  event_type text not null default 'inbound',
  payload jsonb not null default '{}'::jsonb,
  conversation_id uuid,
  processed_at timestamptz,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint channel_events_pkey primary key (id),
  constraint channel_events_channel_id_fkey foreign key (channel_id) references comms.channels(id) on delete set null,
  constraint channel_events_conversation_id_fkey foreign key (conversation_id) references comms.conversations(id) on delete set null,
  constraint channel_events_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.channel_events
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists channel_id uuid,
  add column if not exists project_id uuid,
  add column if not exists provider text not null default 'generic',
  add column if not exists provider_message_id text not null,
  add column if not exists event_type text not null default 'inbound',
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists conversation_id uuid,
  add column if not exists processed_at timestamptz,
  add column if not exists error text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists channel_events_conversation_idx on comms.channel_events (conversation_id) where deleted_at is null;
create unique index if not exists channel_events_provider_idx on comms.channel_events (channel_id, provider_message_id);
create index if not exists channel_events_unprocessed_idx on comms.channel_events (created_at) where processed_at is null and deleted_at is null;

drop trigger if exists channel_events_touch_updated_at on comms.channel_events;
create trigger channel_events_touch_updated_at
before update on comms.channel_events
for each row execute function comms.touch_updated_at();

-- ---- ticket_states ----------------------------------------------------------

create table if not exists comms.ticket_states (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  name text not null,
  label text not null default '',
  color text not null default 'slate',
  position integer not null default 0,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint ticket_states_pkey primary key (id),
  constraint ticket_states_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint ticket_states_project_id_name_key unique (project_id, name),
  constraint ticket_states_project_name_unique unique (project_id, name)
);

alter table comms.ticket_states
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists name text not null,
  add column if not exists label text not null default '',
  add column if not exists color text not null default 'slate',
  add column if not exists position integer not null default 0,
  add column if not exists is_closed boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists ticket_states_project_position_idx on comms.ticket_states (project_id, position) where deleted_at is null;

drop trigger if exists ticket_states_touch_updated_at on comms.ticket_states;
create trigger ticket_states_touch_updated_at
before update on comms.ticket_states
for each row execute function comms.touch_updated_at();

-- ---- custom_fields ----------------------------------------------------------

create table if not exists comms.custom_fields (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  entity text not null,
  key text not null,
  label text not null default '',
  type text not null default 'text',
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  required_on_close boolean not null default false,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint custom_fields_pkey primary key (id),
  constraint custom_fields_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint custom_fields_project_entity_key_unique unique (project_id, entity, key),
  constraint custom_fields_entity_check check (entity = any (array['contact', 'company', 'ticket', 'conversation'])),
  constraint custom_fields_type_check check (type = any (array['text', 'number', 'date', 'select', 'boolean']))
);

alter table comms.custom_fields
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists entity text not null,
  add column if not exists key text not null,
  add column if not exists label text not null default '',
  add column if not exists type text not null default 'text',
  add column if not exists options jsonb not null default '[]'::jsonb,
  add column if not exists required boolean not null default false,
  add column if not exists required_on_close boolean not null default false,
  add column if not exists position integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists custom_fields_created_at_idx on comms.custom_fields (created_at desc);
create index if not exists custom_fields_project_entity_idx on comms.custom_fields (project_id, entity) where deleted_at is null;

drop trigger if exists custom_fields_touch_updated_at on comms.custom_fields;
create trigger custom_fields_touch_updated_at
before update on comms.custom_fields
for each row execute function comms.touch_updated_at();

-- ---- custom_objects ---------------------------------------------------------

create table if not exists comms.custom_objects (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  name text not null default '',
  plural text not null default '',
  icon text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint custom_objects_pkey primary key (id),
  constraint custom_objects_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.custom_objects
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists name text not null default '',
  add column if not exists plural text not null default '',
  add column if not exists icon text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists custom_objects_project_idx on comms.custom_objects (project_id) where deleted_at is null;

drop trigger if exists custom_objects_touch_updated_at on comms.custom_objects;
create trigger custom_objects_touch_updated_at
before update on comms.custom_objects
for each row execute function comms.touch_updated_at();

-- ---- custom_records ---------------------------------------------------------

create table if not exists comms.custom_records (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  object_id uuid,
  "values" jsonb not null default '{}'::jsonb,
  linked_contact_id uuid,
  linked_conversation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint custom_records_pkey primary key (id),
  constraint custom_records_linked_contact_id_fkey foreign key (linked_contact_id) references comms.contacts(id) on delete set null,
  constraint custom_records_linked_conversation_id_fkey foreign key (linked_conversation_id) references comms.conversations(id) on delete set null,
  constraint custom_records_object_id_fkey foreign key (object_id) references comms.custom_objects(id) on delete cascade,
  constraint custom_records_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade
);

alter table comms.custom_records
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists project_id uuid,
  add column if not exists object_id uuid,
  add column if not exists "values" jsonb not null default '{}'::jsonb,
  add column if not exists linked_contact_id uuid,
  add column if not exists linked_conversation_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists custom_records_object_idx on comms.custom_records (object_id) where deleted_at is null;
create index if not exists custom_records_project_idx on comms.custom_records (project_id) where deleted_at is null;

drop trigger if exists custom_records_touch_updated_at on comms.custom_records;
create trigger custom_records_touch_updated_at
before update on comms.custom_records
for each row execute function comms.touch_updated_at();

-- ---- tickets: state and merge columns ---------------------------------------

alter table comms.tickets add column if not exists state_id uuid;
alter table comms.tickets add column if not exists merged_into_id uuid;

create index if not exists tickets_state_idx on comms.tickets (state_id) where deleted_at is null;
create index if not exists tickets_merged_into_idx on comms.tickets (merged_into_id) where deleted_at is null;

-- ---- constraints ------------------------------------------------------------

-- Named constraints, each added only when a pre-existing table lacks it.
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('comms.channel_events', 'channel_events_pkey', 'primary key (id)'),
      ('comms.ticket_states', 'ticket_states_pkey', 'primary key (id)'),
      ('comms.custom_fields', 'custom_fields_pkey', 'primary key (id)'),
      ('comms.custom_objects', 'custom_objects_pkey', 'primary key (id)'),
      ('comms.custom_records', 'custom_records_pkey', 'primary key (id)'),
      ('comms.ticket_states', 'ticket_states_project_id_name_key', 'unique (project_id, name)'),
      ('comms.ticket_states', 'ticket_states_project_name_unique', 'unique (project_id, name)'),
      ('comms.custom_fields', 'custom_fields_project_entity_key_unique', 'unique (project_id, entity, key)'),
      ('comms.channel_events', 'channel_events_channel_id_fkey', 'foreign key (channel_id) references comms.channels(id) on delete set null'),
      ('comms.channel_events', 'channel_events_conversation_id_fkey', 'foreign key (conversation_id) references comms.conversations(id) on delete set null'),
      ('comms.channel_events', 'channel_events_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.ticket_states', 'ticket_states_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.custom_fields', 'custom_fields_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.custom_objects', 'custom_objects_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.custom_records', 'custom_records_linked_contact_id_fkey', 'foreign key (linked_contact_id) references comms.contacts(id) on delete set null'),
      ('comms.custom_records', 'custom_records_linked_conversation_id_fkey', 'foreign key (linked_conversation_id) references comms.conversations(id) on delete set null'),
      ('comms.custom_records', 'custom_records_object_id_fkey', 'foreign key (object_id) references comms.custom_objects(id) on delete cascade'),
      ('comms.custom_records', 'custom_records_project_id_fkey', 'foreign key (project_id) references public.projects(id) on delete cascade'),
      ('comms.tickets', 'tickets_merged_into_id_fkey', 'foreign key (merged_into_id) references comms.tickets(id) on delete set null'),
      ('comms.tickets', 'tickets_state_id_fkey', 'foreign key (state_id) references comms.ticket_states(id) on delete set null'),
      ('comms.custom_fields', 'custom_fields_entity_check', $c$check (entity = any (array['contact', 'company', 'ticket', 'conversation']))$c$),
      ('comms.custom_fields', 'custom_fields_type_check', $c$check (type = any (array['text', 'number', 'date', 'select', 'boolean']))$c$)
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
  comms.channel_events, comms.ticket_states, comms.custom_fields, comms.custom_objects,
  comms.custom_records
  from public, anon;
grant all on
  comms.channel_events, comms.ticket_states, comms.custom_fields, comms.custom_objects,
  comms.custom_records
  to authenticated, service_role;

alter table comms.channel_events enable row level security;
drop policy if exists channel_events_project_scope on comms.channel_events;
create policy channel_events_project_scope on comms.channel_events for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.ticket_states enable row level security;
drop policy if exists ticket_states_project_scope on comms.ticket_states;
create policy ticket_states_project_scope on comms.ticket_states for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.custom_fields enable row level security;
drop policy if exists custom_fields_project_scope on comms.custom_fields;
create policy custom_fields_project_scope on comms.custom_fields for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.custom_objects enable row level security;
drop policy if exists custom_objects_project_scope on comms.custom_objects;
create policy custom_objects_project_scope on comms.custom_objects for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.custom_records enable row level security;
drop policy if exists custom_records_project_scope on comms.custom_records;
create policy custom_records_project_scope on comms.custom_records for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

-- @down

-- Forget-only on purpose: these tables, columns and indexes predate this file
-- on the live database, so rolling back drops the ledger row and nothing else.
select 1;
