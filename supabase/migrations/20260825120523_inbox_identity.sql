-- Inbox identity (inbox spec §2.1)
--
-- Owns comms.teammates, and gives conversations real identity: assignee_id ->
-- comms.teammates and contact_id -> comms.contacts. The legacy free-text
-- `assignee` / denormalised contact_* columns stay — Overview still reads them
-- and MIGRATION_CONVENTIONS §5 forbids dropping live columns in a feature
-- change. Writes move to the FK columns; normalizeConversation prefers the
-- joined row and falls back to the legacy text.
--
-- Back-fill is idempotent (on conflict do nothing) so a re-run is a no-op.

-- @up

create extension if not exists pgcrypto;

create table if not exists comms.teammates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid,                                   -- auth user id; plain uuid, no FK
  name         text not null default '',
  email        text,
  avatar_url   text,
  availability text not null default 'available',      -- available | away | offline
  project_id   uuid references public.projects(id) on delete cascade,
  metadata     jsonb not null default '{}'::jsonb,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

alter table comms.teammates add column if not exists email text;
alter table comms.teammates add column if not exists avatar_url text;
alter table comms.teammates add column if not exists availability text not null default 'available';
alter table comms.teammates add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table comms.teammates add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table comms.teammates add column if not exists created_by uuid;
alter table comms.teammates add column if not exists updated_at timestamptz not null default now();
alter table comms.teammates add column if not exists deleted_at timestamptz;

create unique index if not exists teammates_user_project_idx
  on comms.teammates (user_id, project_id) where deleted_at is null;

drop trigger if exists teammates_touch_updated_at on comms.teammates;
create trigger teammates_touch_updated_at
before update on comms.teammates
for each row execute function comms.touch_updated_at();

alter table comms.conversations
  add column if not exists assignee_id uuid references comms.teammates(id) on delete set null,
  add column if not exists contact_id  uuid references comms.contacts(id)  on delete set null;

create index if not exists conversations_assignee_idx
  on comms.conversations (assignee_id) where deleted_at is null;
create index if not exists conversations_contact_idx
  on comms.conversations (contact_id) where deleted_at is null;

-- Back-fill: one teammate per distinct legacy assignee name that is not
-- 'Unassigned'/'', then point the conversation at it.
-- (user_id, project_id) are null for these backfilled rows, and Postgres
-- treats nulls as distinct in unique indexes — so the not-exists guard, not
-- on conflict, is what makes a re-run a no-op.
insert into comms.teammates (name, availability)
select distinct c.assignee, 'available'
from comms.conversations c
where c.assignee is not null and c.assignee <> '' and c.assignee <> 'Unassigned'
  and not exists (
    select 1 from comms.teammates t
    where t.name = c.assignee and t.user_id is null and t.deleted_at is null
  )
on conflict do nothing;

update comms.conversations c
set assignee_id = t.id
from comms.teammates t
where c.assignee_id is null
  and t.name = c.assignee
  and c.assignee is not null and c.assignee <> '' and c.assignee <> 'Unassigned'
  and t.deleted_at is null;

-- Back-fill: one contact per distinct contact_email, then point the
-- conversation at it. Name/avatar come from the first conversation seen.
insert into comms.contacts (name, email, avatar_url)
select distinct on (c.contact_email) c.contact_name, c.contact_email, nullif(c.contact_avatar, '')
from comms.conversations c
where c.contact_email is not null and c.contact_email <> ''
  and not exists (
    select 1 from comms.contacts k
    where k.email = c.contact_email and k.deleted_at is null
  )
on conflict do nothing;

update comms.conversations c
set contact_id = k.id
from comms.contacts k
where c.contact_id is null
  and k.email = c.contact_email
  and c.contact_email is not null and c.contact_email <> ''
  and k.deleted_at is null;

alter table comms.teammates enable row level security;

drop policy if exists comms_teammates_demo_all on comms.teammates;
create policy comms_teammates_demo_all on comms.teammates
  for all to anon, authenticated using (true) with check (true);

-- @down

drop policy if exists comms_teammates_demo_all on comms.teammates;

drop index if exists comms.conversations_contact_idx;
drop index if exists comms.conversations_assignee_idx;
alter table comms.conversations drop column if exists contact_id;
alter table comms.conversations drop column if exists assignee_id;

drop trigger if exists teammates_touch_updated_at on comms.teammates;
drop index if exists comms.teammates_user_project_idx;
drop table if exists comms.teammates cascade;
