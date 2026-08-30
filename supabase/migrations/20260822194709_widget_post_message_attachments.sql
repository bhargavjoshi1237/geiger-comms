-- post_message: persist attachments in the metadata bag
--
-- Follow-up to 20260821225308_widget.sql (whose body this file now owns, per
-- MIGRATION_CONVENTIONS §5). The first cut accepted p_attachments but never
-- stored it. comms.messages has no attachments column yet (the Inbox migration
-- adds it), so the list folds into messages.metadata.attachments — the same
-- shape 20260822051915_widget_upload.sql chose; normalizeMessage already
-- surfaces metadata keys as first-class fields.

-- @up

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
    -- Realtime is a best-effort notification; clients always re-fetch via API.
    null;
  end;

  return v_message;
end;
$$;

-- @down

-- Restore the owner migration's original body (attachments accepted but not
-- persisted), so rollback returns the database to its prior state.
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
