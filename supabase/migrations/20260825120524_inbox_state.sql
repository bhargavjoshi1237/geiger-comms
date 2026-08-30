-- Inbox state (inbox spec §2.2)
--
-- Owns comms.conversation_reads, comms.mentions, comms.tags,
-- comms.conversation_tags; adds per-conversation lifecycle timestamps
-- (snoozed_until, closed_at, first_response_at) and the message columns the
-- shared inbox needs (message_type, author_id, attachments, updated_at,
-- deleted_at).
--
-- Also re-owns comms.post_message (follow-up to 20260821225308_widget.sql /
-- 20260822194709_widget_post_message_attachments.sql, per MIGRATION_CONVENTIONS
-- §5): with real columns available, message_type/attachments/author_id are now
-- persisted as columns instead of a metadata fold-in, and a caller-supplied
-- p_id is honored so an optimistic row and the DB row share a UUID (spec §5.3).
-- The signature only gains trailing defaulted params, so existing widget-API
-- callers are unaffected.

-- @up

alter table comms.conversations
  add column if not exists snoozed_until     timestamptz,
  add column if not exists closed_at         timestamptz,
  add column if not exists first_response_at timestamptz;

-- Per-agent read state. Absent row = never read.
create table if not exists comms.conversation_reads (
  conversation_id uuid not null references comms.conversations(id) on delete cascade,
  teammate_id     uuid not null references comms.teammates(id)     on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, teammate_id)
);

create table if not exists comms.mentions (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references comms.conversations(id) on delete cascade,
  message_id      uuid not null references comms.messages(id)      on delete cascade,
  teammate_id     uuid not null references comms.teammates(id)     on delete cascade,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists mentions_teammate_idx
  on comms.mentions (teammate_id, read_at, created_at desc);

create table if not exists comms.tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text not null default 'slate',
  project_id uuid references public.projects(id) on delete cascade,
  metadata   jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists tags_name_project_idx
  on comms.tags (lower(name), project_id) where deleted_at is null;

create table if not exists comms.conversation_tags (
  conversation_id uuid not null references comms.conversations(id) on delete cascade,
  tag_id          uuid not null references comms.tags(id)          on delete cascade,
  primary key (conversation_id, tag_id)
);

alter table comms.messages
  add column if not exists message_type text not null default 'comment', -- comment | note
  add column if not exists author_id    uuid references comms.teammates(id) on delete set null,
  add column if not exists attachments  jsonb not null default '[]'::jsonb,
  add column if not exists updated_at   timestamptz not null default now(),
  add column if not exists deleted_at   timestamptz;

drop trigger if exists messages_touch_updated_at on comms.messages;
create trigger messages_touch_updated_at
before update on comms.messages
for each row execute function comms.touch_updated_at();

drop trigger if exists tags_touch_updated_at on comms.tags;
create trigger tags_touch_updated_at
before update on comms.tags
for each row execute function comms.touch_updated_at();

-- Back-fill from the metadata fold-in the widget migration used, then keep the
-- bag clean (normalizeMessage reads the column once it exists).
update comms.messages
set attachments = metadata -> 'attachments'
where metadata ? 'attachments'
  and jsonb_typeof(metadata -> 'attachments') = 'array';

alter table comms.conversation_reads enable row level security;
alter table comms.mentions enable row level security;
alter table comms.tags enable row level security;
alter table comms.conversation_tags enable row level security;

drop policy if exists comms_conversation_reads_demo_all on comms.conversation_reads;
create policy comms_conversation_reads_demo_all on comms.conversation_reads
  for all to anon, authenticated using (true) with check (true);

drop policy if exists comms_mentions_demo_all on comms.mentions;
create policy comms_mentions_demo_all on comms.mentions
  for all to anon, authenticated using (true) with check (true);

drop policy if exists comms_tags_demo_all on comms.tags;
create policy comms_tags_demo_all on comms.tags
  for all to anon, authenticated using (true) with check (true);

drop policy if exists comms_conversation_tags_demo_all on comms.conversation_tags;
create policy comms_conversation_tags_demo_all on comms.conversation_tags
  for all to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- post_message — single atomic write path for messages (widget + workspace).
-- Changes vs the previous body: honors p_id (optimistic UUID), persists
-- message_type / author_id / attachments as columns.
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
  p_source       text default 'workspace',
  p_id           uuid default null        -- caller-supplied optimistic UUID
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

  insert into comms.messages
    (id, conversation_id, author_role, author_name, author_id, body, message_type, attachments)
  values (
    coalesce(p_id, gen_random_uuid()),
    p_conversation, p_author_role, coalesce(p_author_name, ''), p_author_id, p_body,
    p_message_type,
    case when jsonb_typeof(p_attachments) = 'array' then p_attachments else '[]'::jsonb end
  )
  returning * into v_message;

  -- Notes are internal: never touch the customer-facing conversation surface.
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

-- @down

-- Restore the previous owner's body (attachments folded into metadata, no
-- caller-supplied id), so rollback returns the database to its prior state.
create or replace function comms.post_message(
  p_conversation uuid,
  p_body         text,
  p_author_role  text,
  p_author_name  text,
  p_message_type text default 'comment',
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

  insert into comms.messages (conversation_id, author_role, author_name, body, metadata)
  values (
    p_conversation, p_author_role, coalesce(p_author_name, ''), p_body,
    case when jsonb_typeof(p_attachments) = 'array' and jsonb_array_length(p_attachments) > 0
      then jsonb_build_object('attachments', p_attachments) else '{}'::jsonb end
  )
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
    null;
  end;

  return v_message;
end;
$$;

drop policy if exists comms_conversation_tags_demo_all on comms.conversation_tags;
drop policy if exists comms_tags_demo_all on comms.tags;
drop policy if exists comms_mentions_demo_all on comms.mentions;
drop policy if exists comms_conversation_reads_demo_all on comms.conversation_reads;

drop trigger if exists tags_touch_updated_at on comms.tags;
drop trigger if exists messages_touch_updated_at on comms.messages;

drop table if exists comms.conversation_tags cascade;
drop index if exists comms.tags_name_project_idx;
drop table if exists comms.tags cascade;
drop index if exists comms.mentions_teammate_idx;
drop table if exists comms.mentions cascade;
drop table if exists comms.conversation_reads cascade;

alter table comms.messages drop column if exists deleted_at;
alter table comms.messages drop column if exists updated_at;
alter table comms.messages drop column if exists attachments;
alter table comms.messages drop column if exists author_id;
alter table comms.messages drop column if exists message_type;

alter table comms.conversations drop column if exists first_response_at;
alter table comms.conversations drop column if exists closed_at;
alter table comms.conversations drop column if exists snoozed_until;
