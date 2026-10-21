-- Inbox message search
--
-- Takes ownership of comms.filter_conversations() and comms.list_conversations() from
-- 20261017181329_inbox_conversation_filters.sql. The inbox search box now matches message bodies
-- (replies and internal notes) and the contact's name/email, not just subject + preview, and
-- list_conversations returns the newest matching message as `search_match` so a row can show why it matched.
-- Owns comms.filter_search_like() (the one LIKE-pattern builder both functions share) and the
-- contacts name/email trigram indexes. Adopts messages_body_trgm_idx from the lost 20260910020748_message_search
-- (live already has it; created here only so a fresh database matches).
-- Depends on: comms.filter_text_list(), conversation_is_unread(), conversation_priority_weight() (20261017181329_inbox_conversation_filters);
-- comms.conversations, contacts, messages, mentions, conversation_tags, teammates (earlier comms/inbox migrations).

-- @up

create extension if not exists pg_trgm with schema public;

create index if not exists messages_body_trgm_idx on comms.messages using gin (body public.gin_trgm_ops);
create index if not exists contacts_name_trgm_idx on comms.contacts using gin (name public.gin_trgm_ops);
create index if not exists contacts_email_trgm_idx on comms.contacts using gin (email public.gin_trgm_ops);

-- filter.search -> an ILIKE pattern with \ % _ escaped, or null when there is nothing to search for.
create or replace function comms.filter_search_like(p_filter jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when btrim(coalesce(p_filter ->> 'search', '')) = '' then null
    else '%' || replace(replace(replace(btrim(p_filter ->> 'search'), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end
$$;

revoke execute on function comms.filter_search_like(jsonb) from public, anon;
grant execute on function comms.filter_search_like(jsonb) to authenticated, service_role;

-- The shared §3.3 predicate; search spans subject, preview, the contact and every live message body.
create or replace function comms.filter_conversations(
  p_project  uuid,
  p_teammate uuid,
  p_filter   jsonb default '{}'::jsonb
)
returns setof comms.conversations
language sql
stable
set search_path = ''
as $$
  with f as materialized (
    select
      comms.filter_text_list(p_filter -> 'status')    as statuses,
      comms.filter_text_list(p_filter -> 'channel')   as channels,
      comms.filter_text_list(p_filter -> 'priority')  as priorities,
      comms.filter_text_list(p_filter -> 'channelId') as channel_ids,
      comms.filter_text_list(p_filter -> 'tagIds')    as tag_ids,
      nullif(p_filter ->> 'assignee', '')             as assignee,
      case when jsonb_typeof(p_filter -> 'unread') = 'boolean'
        then (p_filter ->> 'unread')::boolean end     as unread,
      coalesce((p_filter -> 'mentioned') = 'true'::jsonb, false) as mentioned,
      comms.filter_search_like(p_filter)              as search_like
  )
  select c.*
  from comms.conversations c
  cross join f
  where c.deleted_at is null
    and (p_project is null or c.project_id = p_project)
    and (cardinality(f.statuses) = 0 or c.status = any (f.statuses))
    and (cardinality(f.channels) = 0 or c.channel = any (f.channels))
    and (cardinality(f.priorities) = 0 or c.priority = any (f.priorities))
    and (cardinality(f.channel_ids) = 0 or c.channel_id::text = any (f.channel_ids))
    and (
      f.assignee is null
      or (f.assignee = 'me' and p_teammate is not null and c.assignee_id = p_teammate)
      or (f.assignee = 'unassigned' and c.assignee_id is null)
      or c.assignee_id::text = f.assignee
    )
    and (
      cardinality(f.tag_ids) = 0
      or exists (
        select 1 from comms.conversation_tags ct
        where ct.conversation_id = c.id and ct.tag_id::text = any (f.tag_ids)
      )
    )
    and (
      f.unread is null
      or comms.conversation_is_unread(c.id, coalesce(c.last_message_at, c.created_at), c.unread, p_teammate) = f.unread
    )
    and (
      not f.mentioned
      or (
        p_teammate is not null
        and exists (
          select 1 from comms.mentions m
          where m.conversation_id = c.id and m.teammate_id = p_teammate
        )
      )
    )
    and (
      f.search_like is null
      or coalesce(c.subject, '') ilike f.search_like
      or coalesce(c.preview, '') ilike f.search_like
      or coalesce(c.contact_name, '') ilike f.search_like
      or coalesce(c.contact_email, '') ilike f.search_like
      or exists (
        select 1 from comms.contacts k
        where k.id = c.contact_id
          and (coalesce(k.name, '') ilike f.search_like or coalesce(k.email, '') ilike f.search_like)
      )
      or exists (
        select 1 from comms.messages msg
        where msg.conversation_id = c.id
          and msg.deleted_at is null
          and msg.body ilike f.search_like
      )
    )
$$;

-- The sorted, keyset-paged list behind listConversations; while searching, each row carries its newest matching message.
create or replace function comms.list_conversations(
  p_project  uuid,
  p_teammate uuid,
  p_filter   jsonb default '{}'::jsonb,
  p_limit    integer default 50,
  p_cursor   jsonb default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_sort   text := coalesce(nullif(p_filter ->> 'sort', ''), 'newest');
  v_search text := comms.filter_search_like(p_filter);
  v_at     timestamptz;
  v_id     uuid;
  v_weight integer;
  v_result jsonb;
begin
  if v_sort not in ('newest', 'oldest', 'priority') then
    v_sort := 'newest';
  end if;

  -- Cursor = the last row already held: {at: last activity, id, priority}.
  if jsonb_typeof(p_cursor) = 'object' then
    v_at := nullif(p_cursor ->> 'at', '')::timestamptz;
    v_id := nullif(p_cursor ->> 'id', '')::uuid;
    v_weight := comms.conversation_priority_weight(p_cursor ->> 'priority');
  end if;

  with page as (
    select
      c as conv,
      row_number() over (
        order by
          case when v_sort = 'priority' then comms.conversation_priority_weight(c.priority) end desc,
          case when v_sort = 'oldest' then coalesce(c.last_message_at, c.created_at) end asc,
          case when v_sort <> 'oldest' then coalesce(c.last_message_at, c.created_at) end desc,
          case when v_sort = 'oldest' then c.id end asc,
          case when v_sort <> 'oldest' then c.id end desc
      ) as ord
    from comms.filter_conversations(p_project, p_teammate, p_filter) c
    where v_at is null
      or (v_sort = 'newest'
          and (coalesce(c.last_message_at, c.created_at), c.id) < (v_at, v_id))
      or (v_sort = 'oldest'
          and (coalesce(c.last_message_at, c.created_at), c.id) > (v_at, v_id))
      or (v_sort = 'priority'
          and (comms.conversation_priority_weight(c.priority), coalesce(c.last_message_at, c.created_at), c.id)
              < (v_weight, v_at, v_id))
    order by ord
    limit greatest(coalesce(p_limit, 50), 1)
  )
  select coalesce(
    jsonb_agg(
      to_jsonb(p.conv)
        || jsonb_build_object(
          'contact',
          case when k.id is null then null
               else jsonb_build_object('id', k.id, 'name', k.name, 'email', k.email, 'avatar_url', k.avatar_url) end,
          'assignee',
          case when t.id is null then null
               else jsonb_build_object('id', t.id, 'name', t.name, 'avatar_url', t.avatar_url) end,
          'unread',
          comms.conversation_is_unread(
            (p.conv).id,
            coalesce((p.conv).last_message_at, (p.conv).created_at),
            (p.conv).unread,
            p_teammate
          ),
          'search_match',
          case when v_search is null then null else (
            select jsonb_build_object('body', msg.body, 'type', msg.message_type)
            from comms.messages msg
            where msg.conversation_id = (p.conv).id
              and msg.deleted_at is null
              and msg.body ilike v_search
            order by msg.created_at desc
            limit 1
          ) end
        )
      order by p.ord
    ),
    '[]'::jsonb
  )
  into v_result
  from page p
  left join comms.contacts  k on k.id = (p.conv).contact_id
  left join comms.teammates t on t.id = (p.conv).assignee_id;

  return v_result;
end;
$$;

-- @down

-- Restore both bodies exactly as 20261017181329_inbox_conversation_filters.sql defined them.
create or replace function comms.filter_conversations(
  p_project  uuid,
  p_teammate uuid,
  p_filter   jsonb default '{}'::jsonb
)
returns setof comms.conversations
language sql
stable
set search_path = ''
as $$
  with f as materialized (
    select
      comms.filter_text_list(p_filter -> 'status')    as statuses,
      comms.filter_text_list(p_filter -> 'channel')   as channels,
      comms.filter_text_list(p_filter -> 'priority')  as priorities,
      comms.filter_text_list(p_filter -> 'channelId') as channel_ids,
      comms.filter_text_list(p_filter -> 'tagIds')    as tag_ids,
      nullif(p_filter ->> 'assignee', '')             as assignee,
      case when jsonb_typeof(p_filter -> 'unread') = 'boolean'
        then (p_filter ->> 'unread')::boolean end     as unread,
      coalesce((p_filter -> 'mentioned') = 'true'::jsonb, false) as mentioned,
      case when btrim(coalesce(p_filter ->> 'search', '')) = '' then null
        else '%' || replace(replace(replace(btrim(p_filter ->> 'search'), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      end                                             as search_like
  )
  select c.*
  from comms.conversations c
  cross join f
  where c.deleted_at is null
    and (p_project is null or c.project_id = p_project)
    and (cardinality(f.statuses) = 0 or c.status = any (f.statuses))
    and (cardinality(f.channels) = 0 or c.channel = any (f.channels))
    and (cardinality(f.priorities) = 0 or c.priority = any (f.priorities))
    and (cardinality(f.channel_ids) = 0 or c.channel_id::text = any (f.channel_ids))
    and (
      f.assignee is null
      or (f.assignee = 'me' and p_teammate is not null and c.assignee_id = p_teammate)
      or (f.assignee = 'unassigned' and c.assignee_id is null)
      or c.assignee_id::text = f.assignee
    )
    and (
      cardinality(f.tag_ids) = 0
      or exists (
        select 1 from comms.conversation_tags ct
        where ct.conversation_id = c.id and ct.tag_id::text = any (f.tag_ids)
      )
    )
    and (
      f.unread is null
      or comms.conversation_is_unread(c.id, coalesce(c.last_message_at, c.created_at), c.unread, p_teammate) = f.unread
    )
    and (
      not f.mentioned
      or (
        p_teammate is not null
        and exists (
          select 1 from comms.mentions m
          where m.conversation_id = c.id and m.teammate_id = p_teammate
        )
      )
    )
    and (
      f.search_like is null
      or coalesce(c.subject, '') ilike f.search_like
      or coalesce(c.preview, '') ilike f.search_like
    )
$$;

create or replace function comms.list_conversations(
  p_project  uuid,
  p_teammate uuid,
  p_filter   jsonb default '{}'::jsonb,
  p_limit    integer default 50,
  p_cursor   jsonb default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_sort   text := coalesce(nullif(p_filter ->> 'sort', ''), 'newest');
  v_at     timestamptz;
  v_id     uuid;
  v_weight integer;
  v_result jsonb;
begin
  if v_sort not in ('newest', 'oldest', 'priority') then
    v_sort := 'newest';
  end if;

  -- Cursor = the last row already held: {at: last activity, id, priority}.
  if jsonb_typeof(p_cursor) = 'object' then
    v_at := nullif(p_cursor ->> 'at', '')::timestamptz;
    v_id := nullif(p_cursor ->> 'id', '')::uuid;
    v_weight := comms.conversation_priority_weight(p_cursor ->> 'priority');
  end if;

  with page as (
    select
      c as conv,
      row_number() over (
        order by
          case when v_sort = 'priority' then comms.conversation_priority_weight(c.priority) end desc,
          case when v_sort = 'oldest' then coalesce(c.last_message_at, c.created_at) end asc,
          case when v_sort <> 'oldest' then coalesce(c.last_message_at, c.created_at) end desc,
          case when v_sort = 'oldest' then c.id end asc,
          case when v_sort <> 'oldest' then c.id end desc
      ) as ord
    from comms.filter_conversations(p_project, p_teammate, p_filter) c
    where v_at is null
      or (v_sort = 'newest'
          and (coalesce(c.last_message_at, c.created_at), c.id) < (v_at, v_id))
      or (v_sort = 'oldest'
          and (coalesce(c.last_message_at, c.created_at), c.id) > (v_at, v_id))
      or (v_sort = 'priority'
          and (comms.conversation_priority_weight(c.priority), coalesce(c.last_message_at, c.created_at), c.id)
              < (v_weight, v_at, v_id))
    order by ord
    limit greatest(coalesce(p_limit, 50), 1)
  )
  select coalesce(
    jsonb_agg(
      to_jsonb(p.conv)
        || jsonb_build_object(
          'contact',
          case when k.id is null then null
               else jsonb_build_object('id', k.id, 'name', k.name, 'email', k.email, 'avatar_url', k.avatar_url) end,
          'assignee',
          case when t.id is null then null
               else jsonb_build_object('id', t.id, 'name', t.name, 'avatar_url', t.avatar_url) end,
          'unread',
          comms.conversation_is_unread(
            (p.conv).id,
            coalesce((p.conv).last_message_at, (p.conv).created_at),
            (p.conv).unread,
            p_teammate
          )
        )
      order by p.ord
    ),
    '[]'::jsonb
  )
  into v_result
  from page p
  left join comms.contacts  k on k.id = (p.conv).contact_id
  left join comms.teammates t on t.id = (p.conv).assignee_id;

  return v_result;
end;
$$;

drop function if exists comms.filter_search_like(jsonb);
drop index if exists comms.contacts_email_trgm_idx;
drop index if exists comms.contacts_name_trgm_idx;
-- messages_body_trgm_idx predates this file on live (lost message_search migration), so it stays.
