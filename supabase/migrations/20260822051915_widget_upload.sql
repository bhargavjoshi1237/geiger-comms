-- Widget attachments: storage bucket + post_message metadata fold-in.
--
-- Owns the comms-widget storage bucket (public read, download-only semantics),
-- its anon read policy, and redefines comms.post_message so p_attachments is
-- persisted on the message row's metadata bag. Extends
-- 20260821225308_widget.sql without editing it; this file is now the owner of
-- comms.post_message per MIGRATION_CONVENTIONS §5.

-- @up

-- Public bucket for chat attachments. Files are uploaded through the public
-- API with the service role only, stored as application/octet-stream and
-- served as downloads, so nothing uploaded ever executes or inline-renders.
insert into storage.buckets (id, name, public)
values ('comms-widget', 'comms-widget', true)
on conflict (id) do nothing;

drop policy if exists comms_widget_uploads_read on storage.objects;
create policy comms_widget_uploads_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'comms-widget');

-- Fold the attachment list into messages.metadata.attachments so a thread can
-- render links to them; everything else about post_message is unchanged from
-- 20260821225308_widget.sql.
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

  insert into comms.messages (conversation_id, author_role, author_name, body, metadata)
  values (
    p_conversation, p_author_role, coalesce(p_author_name, ''), p_body,
    case when jsonb_typeof(p_attachments) = 'array' and p_attachments <> '[]'::jsonb
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
    -- Realtime is a best-effort notification; clients always re-fetch via API.
    null;
  end;

  return v_message;
end;
$$;

-- @down

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
    null;
  end;

  return v_message;
end;
$$;

drop policy if exists comms_widget_uploads_read on storage.objects;
delete from storage.buckets where id = 'comms-widget';
