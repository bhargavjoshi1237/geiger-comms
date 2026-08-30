-- Messenger widget: installable apps, visitors, public content, realtime.
--
-- Owns comms.widget_apps, comms.visitors, comms.articles, comms.posts,
-- comms.tickets (the Inbox spec's shape, created here so the widget's /tickets
-- route works standalone — the Inbox migration no-ops over it), the widget
-- columns on comms.contacts / comms.conversations, the comms.merge_visitor()
-- and comms.post_message() functions, and the private-broadcast read policy on
-- realtime.messages. See docs/specs/2026-08-22-messenger-widget-design.md §3-§6.

-- @up

create extension if not exists pgcrypto;

-- Declared locally so this file stands alone; create-or-replace is a no-op when
-- an earlier migration already created it.
create or replace function comms.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- widget_apps. public_id is what customers embed; secret_hash is the argon2/
-- bcrypt of their JWT signing secret and never leaves the server (spec §10.1).
-- RLS is enabled deliberately WITHOUT an anon policy — secret_hash must not be
-- selectable by anon; authenticated keeps the suite demo posture until scoped
-- policies land, and the public API reads through the service role only.
-- ---------------------------------------------------------------------------
create table if not exists comms.widget_apps (
  id               uuid primary key default gen_random_uuid(),
  public_id        text not null unique,          -- short, URL-safe, e.g. "wg_7fk2p9"
  name             text not null default 'Website',
  secret_hash      text not null,
  secret_last4     text,                          -- "…a91f" display only
  allowed_origins  text[] not null default '{}',  -- exact scheme://host[:port]
  channel_id       uuid references comms.channels(id) on delete set null,
  project_id       uuid references public.projects(id) on delete cascade,
  metadata         jsonb not null default '{}'::jsonb,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

alter table comms.widget_apps add column if not exists name text not null default 'Website';
alter table comms.widget_apps add column if not exists secret_last4 text;
alter table comms.widget_apps add column if not exists allowed_origins text[] not null default '{}';
alter table comms.widget_apps add column if not exists channel_id uuid references comms.channels(id) on delete set null;
alter table comms.widget_apps add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table comms.widget_apps add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table comms.widget_apps add column if not exists created_by uuid;
alter table comms.widget_apps add column if not exists updated_at timestamptz not null default now();
alter table comms.widget_apps add column if not exists deleted_at timestamptz;

drop trigger if exists widget_apps_touch_updated_at on comms.widget_apps;
create trigger widget_apps_touch_updated_at
before update on comms.widget_apps
for each row execute function comms.touch_updated_at();

alter table comms.widget_apps enable row level security;

drop policy if exists comms_widget_apps_auth_all on comms.widget_apps;
create policy comms_widget_apps_auth_all on comms.widget_apps
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on comms.widget_apps to authenticated;

-- ---------------------------------------------------------------------------
-- visitors. An anonymous browser; promoted onto a contact at identify time.
-- ---------------------------------------------------------------------------
create table if not exists comms.visitors (
  id           uuid primary key default gen_random_uuid(),
  anonymous_id text not null,                     -- opaque, generated host-side
  app_id       uuid not null references comms.widget_apps(id) on delete cascade,
  contact_id   uuid references comms.contacts(id) on delete set null,
  user_agent   text,
  last_seen_at timestamptz not null default now(),
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create unique index if not exists visitors_anon_app_idx
  on comms.visitors (anonymous_id, app_id);
create index if not exists visitors_contact_idx
  on comms.visitors (contact_id);

drop trigger if exists visitors_touch_updated_at on comms.visitors;
create trigger visitors_touch_updated_at
before update on comms.visitors
for each row execute function comms.touch_updated_at();

alter table comms.visitors enable row level security;

drop policy if exists comms_visitors_demo_all on comms.visitors;
create policy comms_visitors_demo_all on comms.visitors
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on comms.visitors to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Map a customer's own user id onto our contact, and mark conversations that
-- started from the widget.
-- ---------------------------------------------------------------------------
alter table comms.contacts
  add column if not exists external_id text,
  add column if not exists app_id uuid references comms.widget_apps(id) on delete set null;

create unique index if not exists contacts_external_app_idx
  on comms.contacts (external_id, app_id) where deleted_at is null and external_id is not null;

alter table comms.conversations
  add column if not exists visitor_id uuid references comms.visitors(id) on delete set null,
  add column if not exists source     text not null default 'workspace', -- workspace | widget
  -- Owned here until the Inbox migration lands (both statements no-op then).
  add column if not exists contact_id uuid references comms.contacts(id) on delete set null,
  add column if not exists first_response_at timestamptz;

create index if not exists conversations_contact_idx
  on comms.conversations (contact_id) where deleted_at is null;

create index if not exists conversations_visitor_idx
  on comms.conversations (visitor_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Minimal Help and News content (spec §1.2). Knowledge Base / Proactive own
-- authoring later and extend these; the public API reads published rows only.
-- ---------------------------------------------------------------------------
create table if not exists comms.articles (
  id           uuid primary key default gen_random_uuid(),
  title        text not null default '',
  slug         text,
  body         text not null default '',      -- markdown
  summary      text not null default '',
  published    boolean not null default false,
  locale       text not null default 'en',
  project_id   uuid references public.projects(id) on delete cascade,
  metadata     jsonb not null default '{}'::jsonb,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists articles_project_published_idx
  on comms.articles (project_id) where deleted_at is null and published;

drop trigger if exists articles_touch_updated_at on comms.articles;
create trigger articles_touch_updated_at
before update on comms.articles
for each row execute function comms.touch_updated_at();

alter table comms.articles enable row level security;

drop policy if exists comms_articles_demo_all on comms.articles;
create policy comms_articles_demo_all on comms.articles
  for all to anon, authenticated using (true) with check (true);

create table if not exists comms.posts (
  id           uuid primary key default gen_random_uuid(),
  title        text not null default '',
  body         text not null default '',
  published_at timestamptz,
  project_id   uuid references public.projects(id) on delete cascade,
  metadata     jsonb not null default '{}'::jsonb,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists posts_project_published_idx
  on comms.posts (project_id) where deleted_at is null and published_at is not null;

drop trigger if exists posts_touch_updated_at on comms.posts;
create trigger posts_touch_updated_at
before update on comms.posts
for each row execute function comms.touch_updated_at();

alter table comms.posts enable row level security;

drop policy if exists comms_posts_demo_all on comms.posts;
create policy comms_posts_demo_all on comms.posts
  for all to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- tickets (Inbox spec §2.3 shape, minus assignee_id which the Inbox migration
-- adds together with comms.teammates and its FK). The widget lists a caller's
-- tickets read-only.
-- ---------------------------------------------------------------------------
create table if not exists comms.tickets (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references comms.conversations(id) on delete set null,
  type            text not null default 'customer',   -- customer | back_office | tracker
  state           text not null default 'submitted',  -- submitted | in_progress | waiting | resolved
  title           text not null default '',
  description     text not null default '',
  attributes      jsonb not null default '{}'::jsonb,
  project_id      uuid references public.projects(id) on delete cascade,
  metadata        jsonb not null default '{}'::jsonb,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists tickets_conversation_idx
  on comms.tickets (conversation_id) where deleted_at is null;

drop trigger if exists tickets_touch_updated_at on comms.tickets;
create trigger tickets_touch_updated_at
before update on comms.tickets
for each row execute function comms.touch_updated_at();

alter table comms.tickets enable row level security;

drop policy if exists comms_tickets_demo_all on comms.tickets;
create policy comms_tickets_demo_all on comms.tickets
  for all to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- merge_visitor — one-way, atomic anonymous → identified merge (spec §4.2).
-- Returns true when the visitor now belongs to p_contact. When the browser's
-- anonymous id is already claimed by a DIFFERENT contact we never move history
-- onto that account: the old row keeps its history under a rotated anonymous id
-- and the caller starts a fresh visitor instead.
-- ---------------------------------------------------------------------------
create or replace function comms.merge_visitor(p_visitor uuid, p_contact uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_contact uuid;
begin
  if p_visitor is null or p_contact is null then
    return false;
  end if;

  select contact_id into v_current_contact
  from comms.visitors
  where id = p_visitor
  for update;

  if v_current_contact is null then
    update comms.visitors
    set contact_id = p_contact, last_seen_at = now()
    where id = p_visitor;
    update comms.conversations
    set contact_id = p_contact
    where visitor_id = p_visitor;
    return true;
  end if;

  if v_current_contact = p_contact then
    return true;
  end if;

  -- Different contact claims this browser: free the anonymous id so the caller
  -- can upsert a fresh visitor for it; history stays with the old contact.
  update comms.visitors
  set anonymous_id = 'rotated:' || gen_random_uuid()::text
  where id = p_visitor;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- post_message — the single write path for messages (widget and workspace).
-- Inserts the message, updates the parent conversation atomically (preview,
-- last_message_at, waiting_on_us, first_response_at; notes touch none of them),
-- and broadcasts a content-free envelope on conversation:<id> so connected
-- widgets re-fetch through the API (spec §6). Owner of this function per
-- MIGRATION_CONVENTIONS §5.
-- ---------------------------------------------------------------------------
create or replace function comms.post_message(
  p_conversation uuid,
  p_body         text,
  p_author_role  text,                    -- customer | agent | ai_agent
  p_author_name  text,
  p_message_type text default 'comment',  -- comment | note
  p_author_id    uuid default null,
  p_attachments  jsonb default '[]'::jsonb,
  p_visitor_id   uuid default null,
  p_source       text default 'workspace'
)
returns comms.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message comms.messages;
begin
  if p_conversation is null or p_body is null then
    raise exception 'conversation_and_body_required';
  end if;
  if p_author_role not in ('customer', 'agent', 'ai_agent') then
    raise exception 'invalid_author_role';
  end if;
  if p_message_type not in ('comment', 'note') then
    raise exception 'invalid_message_type';
  end if;

  if not exists (
    select 1 from comms.conversations c
    where c.id = p_conversation and c.deleted_at is null
  ) then
    raise exception 'conversation_not_found';
  end if;

  insert into comms.messages (conversation_id, author_role, author_name, body)
  values (p_conversation, p_author_role, coalesce(p_author_name, ''), p_body)
  returning * into v_message;

  if p_message_type <> 'note' then
    update comms.conversations c
    set last_message_at = now(),
        preview = left(p_body, 140),
        waiting_on_us = (p_author_role = 'customer'),
        first_response_at = case
          when c.first_response_at is null and p_author_role in ('agent', 'ai_agent')
            then now() else c.first_response_at end
    where c.id = p_conversation;
  end if;

  begin
    perform realtime.send(
      jsonb_build_object(
        'type', 'message.created',
        'conversationId', p_conversation::text,
        'messageId', v_message.id::text
      ),
      'message.created',
      'conversation:' || p_conversation::text,
      true
    );
  exception when others then
    -- Realtime is a best-effort notification; clients always re-fetch via API.
    null;
  end;

  return v_message;
end;
$$;

-- ---------------------------------------------------------------------------
-- Private-broadcast read authorization (spec §6): a connecting JWT may read
-- topic conversation:<id> only when that conversation belongs to its visitor or
-- contact claim. Read-only — the widget never broadcasts, only the server
-- publishes with the service role, so there is deliberately no insert policy.
-- RLS on realtime.messages ships enabled by default (owned by
-- supabase_realtime_admin; migrations cannot alter that table, only add
-- policies).
-- ---------------------------------------------------------------------------
drop policy if exists widget_conversation_read on realtime.messages;
create policy widget_conversation_read on realtime.messages
for select to anon using (
  realtime.topic() like 'conversation:%'
  and exists (
    select 1 from comms.conversations c
    where c.id::text = split_part(realtime.topic(), ':', 2)
      and c.deleted_at is null
      and (
        c.visitor_id::text = (auth.jwt() ->> 'visitor_id')
        or (auth.jwt() ->> 'contact_id') is not null
           and c.contact_id::text = (auth.jwt() ->> 'contact_id')
      )
  )
);

-- @down

drop policy if exists widget_conversation_read on realtime.messages;

drop function if exists comms.post_message(uuid, text, text, text, text, uuid, jsonb, uuid, text);
drop function if exists comms.merge_visitor(uuid, uuid);

drop policy if exists comms_tickets_demo_all on comms.tickets;
drop trigger if exists tickets_touch_updated_at on comms.tickets;
drop index if exists comms.tickets_conversation_idx;
drop table if exists comms.tickets cascade;

drop policy if exists comms_posts_demo_all on comms.posts;
drop trigger if exists posts_touch_updated_at on comms.posts;
drop index if exists comms.posts_project_published_idx;
drop table if exists comms.posts cascade;

drop policy if exists comms_articles_demo_all on comms.articles;
drop trigger if exists articles_touch_updated_at on comms.articles;
drop index if exists comms.articles_project_published_idx;
drop table if exists comms.articles cascade;

drop index if exists comms.conversations_visitor_idx;
drop index if exists comms.conversations_contact_idx;
alter table comms.conversations drop column if exists visitor_id;
alter table comms.conversations drop column if exists source;
alter table comms.conversations drop column if exists contact_id;
alter table comms.conversations drop column if exists first_response_at;

drop index if exists comms.contacts_external_app_idx;
alter table comms.contacts drop column if exists external_id;
alter table comms.contacts drop column if exists app_id;

drop policy if exists comms_visitors_demo_all on comms.visitors;
drop trigger if exists visitors_touch_updated_at on comms.visitors;
drop index if exists comms.visitors_contact_idx;
drop index if exists comms.visitors_anon_app_idx;
drop table if exists comms.visitors cascade;

drop policy if exists comms_widget_apps_auth_all on comms.widget_apps;
drop trigger if exists widget_apps_touch_updated_at on comms.widget_apps;
drop table if exists comms.widget_apps cascade;
