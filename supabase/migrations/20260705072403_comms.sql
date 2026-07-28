-- Imported from comms.sql by geiger-orm.
-- No @down section — this migration cannot be rolled back.

-- @up
-- ===========================================================================
-- Geiger Comms — conversations store (Intercom-style shared inbox).
--
-- Self-contained and idempotent: safe to run repeatedly. Creates the `comms`
-- schema + grants, the touch_updated_at trigger fn, the conversations /
-- messages / contacts tables (each with a metadata jsonb expansion bag),
-- indexes, an OPEN demo RLS policy (the playground runs unauthenticated on the
-- anon key), and seeds a handful of demo conversations with stable UUIDs so the
-- landing playground looks alive. Org-scoped RLS is deferred (see notes) — swap
-- the demo policies for a comms.can_access_project() policy when auth lands.
--
-- Apply via `npm run db:push` (scripts/run-sqls.js) against STRING_URI.
-- ===========================================================================

create extension if not exists pgcrypto;

-- This app's objects live in the dedicated `comms` schema. The schema is
-- already in PostgREST's exposed-schemas list (managed at the project level).
create schema if not exists comms;
grant usage on schema comms to anon, authenticated, service_role;
alter default privileges in schema comms grant all on tables to anon, authenticated, service_role;
alter default privileges in schema comms grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema comms grant all on routines to anon, authenticated, service_role;

-- Shared "touch updated_at" trigger function (suite convention). Defined here
-- so this migration doesn't depend on another migration having run.
create or replace function comms.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- contacts (people who write in). Kept light for now; the Contacts screen is
-- a placeholder this pass.
-- --------------------------------------------------------------------------
create table if not exists comms.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Unknown',
  email text,
  avatar_url text,
  company text,
  project_id uuid references public.projects(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- --------------------------------------------------------------------------
-- conversations (the inbox rows)
-- --------------------------------------------------------------------------
create table if not exists comms.conversations (
  id uuid primary key default gen_random_uuid(),
  subject text not null default '',
  contact_name text not null default 'Unknown',
  contact_email text,
  contact_avatar text,
  channel text not null default 'Chat',        -- Chat | Email | Slack | WhatsApp | Instagram
  status text not null default 'Open',          -- Open | Snoozed | Closed
  priority text not null default 'Normal',       -- Urgent | Normal | Low
  assignee text,
  preview text,                                  -- last message snippet
  unread boolean not null default false,
  waiting_on_us boolean not null default false,  -- last message is from the customer
  last_message_at timestamptz,
  project_id uuid references public.projects(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Tolerate older copies by back-filling any missing columns.
alter table comms.conversations add column if not exists waiting_on_us boolean not null default false;
alter table comms.conversations add column if not exists last_message_at timestamptz;
alter table comms.conversations add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table comms.conversations add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table comms.conversations add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table comms.conversations add column if not exists deleted_at timestamptz;

-- --------------------------------------------------------------------------
-- messages (thread inside a conversation)
-- --------------------------------------------------------------------------
create table if not exists comms.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references comms.conversations(id) on delete cascade,
  author_role text not null default 'customer',  -- customer | agent
  author_name text not null default '',
  body text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

drop trigger if exists comms_conversations_touch_updated_at on comms.conversations;
create trigger comms_conversations_touch_updated_at
before update on comms.conversations
for each row execute function comms.touch_updated_at();

drop trigger if exists comms_contacts_touch_updated_at on comms.contacts;
create trigger comms_contacts_touch_updated_at
before update on comms.contacts
for each row execute function comms.touch_updated_at();

create index if not exists comms_conversations_status_idx
  on comms.conversations (status) where deleted_at is null;
create index if not exists comms_conversations_last_msg_idx
  on comms.conversations (last_message_at desc);
create index if not exists comms_messages_conversation_idx
  on comms.messages (conversation_id, created_at);

-- --------------------------------------------------------------------------
-- RLS. The comms inbox currently runs unauthenticated (anon key) so the demo
-- playground can read the seeded rows. Replace these open policies with an
-- organization-scoped policy (comms.can_access_project via public.projects ->
-- organization_id) when auth lands, then drop the demo policies.
-- --------------------------------------------------------------------------
alter table comms.conversations enable row level security;
alter table comms.messages enable row level security;
alter table comms.contacts enable row level security;

drop policy if exists comms_conversations_demo_all on comms.conversations;
create policy comms_conversations_demo_all on comms.conversations
  for all to anon, authenticated using (true) with check (true);

drop policy if exists comms_messages_demo_all on comms.messages;
create policy comms_messages_demo_all on comms.messages
  for all to anon, authenticated using (true) with check (true);

drop policy if exists comms_contacts_demo_all on comms.contacts;
create policy comms_contacts_demo_all on comms.contacts
  for all to anon, authenticated using (true) with check (true);

-- --------------------------------------------------------------------------
-- Demo seed. Stable UUIDs so the playground always resolves the same threads.
-- project_id is left null (demo runs project-less under the open policy).
-- --------------------------------------------------------------------------
insert into comms.conversations
  (id, subject, contact_name, contact_email, contact_avatar, channel, status, priority, assignee, preview, unread, waiting_on_us, last_message_at)
values
  ('c0000000-0000-4000-a000-000000000001', 'Refund for duplicate charge', 'Maya Chen', 'maya@northwind.io', '', 'Email', 'Open', 'Urgent', 'You', 'I was charged twice this month — can you refund the extra?', true, true, now() - interval '4 minutes'),
  ('c0000000-0000-4000-a000-000000000002', 'How do I invite my team?', 'Devon Parker', 'devon@lumen.app', '', 'Chat', 'Open', 'Normal', 'Aria', 'Thanks! And can teammates have different roles?', false, true, now() - interval '22 minutes'),
  ('c0000000-0000-4000-a000-000000000003', 'API rate limit questions', 'Priya Nair', 'priya@grovehq.com', '', 'Slack', 'Open', 'Normal', 'You', 'Perfect, that clears it up. Appreciate the quick reply!', false, false, now() - interval '1 hour'),
  ('c0000000-0000-4000-a000-000000000004', 'Mobile app keeps logging me out', 'Tomas Ruiz', 'tomas@fielded.co', '', 'WhatsApp', 'Open', 'Urgent', 'Unassigned', 'Still happening on the latest build, screenshot attached.', true, true, now() - interval '2 hours'),
  ('c0000000-0000-4000-a000-000000000005', 'Loving the new dashboard', 'Hannah Feld', 'hannah@brightloop.io', '', 'Instagram', 'Snoozed', 'Low', 'Marco', 'Just wanted to say the redesign is beautiful 🙌', false, false, now() - interval '5 hours'),
  ('c0000000-0000-4000-a000-000000000006', 'Cancel my subscription', 'Owen Blake', 'owen@harborline.com', '', 'Email', 'Closed', 'Normal', 'Aria', 'All sorted, thank you for the help.', false, false, now() - interval '1 day')
on conflict (id) do nothing;

insert into comms.messages
  (id, conversation_id, author_role, author_name, body, created_at)
values
  ('11110000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000001', 'customer', 'Maya Chen', 'Hi — I noticed two identical charges on my card this month for the Pro plan.', now() - interval '20 minutes'),
  ('11110000-0000-4000-a000-000000000002', 'c0000000-0000-4000-a000-000000000001', 'agent', 'You', 'Hi Maya, so sorry about that! Let me take a look at your billing history now.', now() - interval '12 minutes'),
  ('11110000-0000-4000-a000-000000000003', 'c0000000-0000-4000-a000-000000000001', 'customer', 'Maya Chen', 'I was charged twice this month — can you refund the extra?', now() - interval '4 minutes'),

  ('11110000-0000-4000-a000-000000000004', 'c0000000-0000-4000-a000-000000000002', 'customer', 'Devon Parker', 'How do I invite my team to the workspace?', now() - interval '40 minutes'),
  ('11110000-0000-4000-a000-000000000005', 'c0000000-0000-4000-a000-000000000002', 'agent', 'Aria', 'You can invite them from Settings → Teammates. Want the direct link?', now() - interval '30 minutes'),
  ('11110000-0000-4000-a000-000000000006', 'c0000000-0000-4000-a000-000000000002', 'customer', 'Devon Parker', 'Thanks! And can teammates have different roles?', now() - interval '22 minutes'),

  ('11110000-0000-4000-a000-000000000007', 'c0000000-0000-4000-a000-000000000003', 'customer', 'Priya Nair', 'What is the API rate limit on the Growth plan?', now() - interval '1 hour 20 minutes'),
  ('11110000-0000-4000-a000-000000000008', 'c0000000-0000-4000-a000-000000000003', 'agent', 'You', 'Growth is 600 requests/min per token, bursting to 1000 for short windows.', now() - interval '1 hour 5 minutes'),
  ('11110000-0000-4000-a000-000000000009', 'c0000000-0000-4000-a000-000000000003', 'customer', 'Priya Nair', 'Perfect, that clears it up. Appreciate the quick reply!', now() - interval '1 hour'),

  ('11110000-0000-4000-a000-000000000010', 'c0000000-0000-4000-a000-000000000004', 'customer', 'Tomas Ruiz', 'The mobile app keeps logging me out every few minutes.', now() - interval '3 hours'),
  ('11110000-0000-4000-a000-000000000011', 'c0000000-0000-4000-a000-000000000004', 'customer', 'Tomas Ruiz', 'Still happening on the latest build, screenshot attached.', now() - interval '2 hours'),

  ('11110000-0000-4000-a000-000000000012', 'c0000000-0000-4000-a000-000000000005', 'customer', 'Hannah Feld', 'Just wanted to say the redesign is beautiful 🙌', now() - interval '5 hours'),

  ('11110000-0000-4000-a000-000000000013', 'c0000000-0000-4000-a000-000000000006', 'customer', 'Owen Blake', 'I would like to cancel my subscription please.', now() - interval '1 day 1 hour'),
  ('11110000-0000-4000-a000-000000000014', 'c0000000-0000-4000-a000-000000000006', 'agent', 'Aria', 'Done — your plan will remain active until the end of the cycle. Anything else?', now() - interval '1 day 30 minutes'),
  ('11110000-0000-4000-a000-000000000015', 'c0000000-0000-4000-a000-000000000006', 'customer', 'Owen Blake', 'All sorted, thank you for the help.', now() - interval '1 day')
on conflict (id) do nothing;
