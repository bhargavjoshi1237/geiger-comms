-- Conversation merge
--
-- Owns conversations.merged_into_id and comms.merge_conversations(): merging a duplicate closes it, links it to the
-- conversation it was merged into, and leaves an internal note in both threads. Messages, tags and ticket links stay
-- where they are (Intercom parity). Security invoker, so project-scoped RLS decides which conversations a caller may merge.
-- Depends on: comms.rbac_allows() (20260821182908_adopt_rbac); comms.conversations, messages, teammates (earlier comms/inbox migrations).

-- @up

alter table comms.conversations
  add column if not exists merged_into_id uuid references comms.conversations(id) on delete set null;

create index if not exists conversations_merged_into_idx
  on comms.conversations (merged_into_id) where merged_into_id is not null;

-- Closes p_source, links it to p_target and notes both threads; returns the closed source row.
create or replace function comms.merge_conversations(p_source uuid, p_target uuid)
returns comms.conversations
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_source   comms.conversations;
  v_target   comms.conversations;
  v_mate_id  uuid;
  v_mate     text;
begin
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'invalid_merge';
  end if;

  -- Lock both rows in id order so two opposite merges can't deadlock.
  perform 1 from comms.conversations c
  where c.id in (p_source, p_target) and c.deleted_at is null
  order by c.id
  for update;

  select * into v_source from comms.conversations c where c.id = p_source and c.deleted_at is null;
  select * into v_target from comms.conversations c where c.id = p_target and c.deleted_at is null;
  if v_source.id is null or v_target.id is null then
    raise exception 'conversation_not_found';
  end if;
  if v_source.project_id is distinct from v_target.project_id then
    raise exception 'different_projects';
  end if;
  if v_source.merged_into_id is not null then
    raise exception 'already_merged';
  end if;
  if v_target.merged_into_id is not null then
    raise exception 'target_already_merged';
  end if;
  if not comms.rbac_allows('comms.conversation.close', v_source.project_id) then
    raise exception 'not_allowed';
  end if;

  select t.id, t.name into v_mate_id, v_mate
  from comms.teammates t
  where t.user_id = auth.uid() and t.project_id is not distinct from v_source.project_id and t.deleted_at is null
  limit 1;

  update comms.conversations c
  set status = 'Closed',
      closed_at = now(),
      snoozed_until = null,
      merged_into_id = p_target
  where c.id = p_source
  returning * into v_source;

  insert into comms.messages (conversation_id, author_role, author_name, author_id, body, message_type)
  values
    (p_source, 'agent', coalesce(v_mate, ''), v_mate_id,
     'Merged into “' || coalesce(nullif(btrim(v_target.subject), ''), 'another conversation') || '”', 'note'),
    (p_target, 'agent', coalesce(v_mate, ''), v_mate_id,
     'Merged “' || coalesce(nullif(btrim(v_source.subject), ''), 'a conversation') || '” into this conversation', 'note');

  return v_source;
end;
$$;

revoke execute on function comms.merge_conversations(uuid, uuid) from public, anon;
grant execute on function comms.merge_conversations(uuid, uuid) to authenticated, service_role;

-- @down

-- Refuses on the shared database: it erases which conversation every merged duplicate was merged into.
do $$
begin
  if coalesce(current_setting('comms.allow_destructive_down', true), '') <> 'on' then
    raise exception 'conversation_merge @down is destructive on the shared database; set comms.allow_destructive_down=on on a disposable database';
  end if;
end;
$$;

drop function if exists comms.merge_conversations(uuid, uuid);
drop index if exists comms.conversations_merged_into_idx;
alter table comms.conversations drop column if exists merged_into_id;
