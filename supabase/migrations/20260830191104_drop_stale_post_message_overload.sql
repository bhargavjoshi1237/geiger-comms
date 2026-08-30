-- Drop stale post_message overload
--
-- Owns comms.post_message's argument signature. 20260825120524_inbox_state.sql
-- redefined post_message with a 10th argument (p_id) via `create or replace`.
-- Postgres identifies a function by its full argument list, so that created a
-- SECOND overload instead of replacing the 9-argument one, and both survived.
--
-- Every caller that omits p_id then matches both candidates, and PostgREST
-- refuses the ambiguity with PGRST203 ("Could not choose the best candidate
-- function") -> HTTP 300. That is exactly the widget's send path
-- (lib/widget/data.js passes 7 named args, no p_id), which has been answering
-- 500 write_failed since 2026-08-25; the workspace path
-- (lib/supabase/comms.js) passes p_id and so resolved unambiguously and kept
-- working.
--
-- Dropping the 9-argument version leaves the 10-argument one as the single
-- owner. It is a strict superset: p_id defaults to null, and the two vestigial
-- params (p_visitor_id, p_source) were never persisted by any version of the
-- body -- visitor_id/source are columns on comms.conversations, not
-- comms.messages -- so no caller loses behaviour.

-- @up

drop function if exists comms.post_message(uuid, text, text, text, text, uuid, jsonb, uuid, text);

-- @down

-- Recreate the 9-argument overload exactly as 20260822194709 left it, so the
-- ambiguity (and the pre-fix behaviour) is faithfully restored.
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

  if not exists (
    select 1 from comms.conversations c
    where c.id = p_conversation and c.deleted_at is null
  ) then
    raise exception 'conversation_not_found';
  end if;

  insert into comms.messages (conversation_id, author_role, author_name, body)
  values (p_conversation, p_author_role, coalesce(p_author_name, ''), p_body)
  returning * into v_message;

  update comms.conversations c
  set last_message_at = now(),
      preview = left(p_body, 140),
      waiting_on_us = (p_author_role = 'customer')
  where c.id = p_conversation;

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
