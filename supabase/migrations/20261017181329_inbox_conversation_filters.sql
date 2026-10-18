-- Inbox conversation filters
--
-- Takes ownership of comms.list_conversations() from 20260825120525 and adds
-- comms.filter_conversations() (the ONE shared filter predicate),
-- comms.count_conversations() (per-view counts), comms.mark_conversation_read()
-- (server-clock read marker) and three small helpers. List and count both read
-- filter_conversations(), so their filter semantics cannot drift.
--
-- Fixes in list_conversations: ORDER BY now runs before LIMIT (the old page was
-- an arbitrary 50 rows), and keyset pagination uses a per-sort compound cursor
-- (p_cursor = {at, id, priority}) instead of a newest-only timestamp. The old
-- p_before timestamptz argument is replaced, so the old signature is dropped.
--
-- Filter keys (all optional; omitted/empty = no constraint):
--   status, channel, priority: [text]   channelId: uuid (or [uuid])
--   assignee: "me" | "unassigned" | "<teammateId>" | null
--   tagIds: [uuid] — match ANY          unread: true | false | null
--   mentioned: true — p_teammate was @mentioned in the thread
--   search: text (ILIKE over subject + preview, wildcards escaped)
--   sort: "newest" (default) | "oldest" | "priority"
-- "me", unread and mentioned resolve against p_teammate; with no teammate,
-- unread falls back to the legacy global conversations.unread flag.

-- @up

-- Filter value -> text[]: array keeps its non-empty elements, a string is one element, anything else is empty.
create or replace function comms.filter_text_list(p_value jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case jsonb_typeof(p_value)
    when 'array' then coalesce(
      (select array_agg(e.value) from jsonb_array_elements_text(p_value) as e(value) where e.value <> ''),
      '{}'::text[]
    )
    when 'string' then case when p_value #>> '{}' = '' then '{}'::text[] else array[p_value #>> '{}'] end
    else '{}'::text[]
  end
$$;

-- Priority sort weight: Urgent > Normal > Low > anything else.
create or replace function comms.conversation_priority_weight(p_priority text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_priority when 'Urgent' then 3 when 'Normal' then 2 when 'Low' then 1 else 0 end
$$;

-- Per-teammate unread (inbox spec §3.4): no read marker at/after the last activity; no teammate -> legacy flag.
create or replace function comms.conversation_is_unread(
  p_conversation uuid,
  p_activity_at  timestamptz,
  p_legacy       boolean,
  p_teammate     uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when p_teammate is null then coalesce(p_legacy, false)
    else not exists (
      select 1 from comms.conversation_reads r
      where r.conversation_id = p_conversation
        and r.teammate_id = p_teammate
        and r.last_read_at >= p_activity_at
    )
  end
$$;

-- The shared §3.3 predicate: every live conversation in p_project matching p_filter, unordered.
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

drop function if exists comms.list_conversations(uuid, uuid, jsonb, integer, timestamptz);

-- The sorted, keyset-paged list behind listConversations; contact + assignee embedded, unread resolved per teammate.
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

-- How many conversations a §3.3 filter matches — identical semantics to list_conversations.
create or replace function comms.count_conversations(
  p_teammate uuid,
  p_filter   jsonb default '{}'::jsonb,
  p_project  uuid default null
)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from comms.filter_conversations(p_project, p_teammate, coalesce(p_filter, '{}'::jsonb))
$$;

-- Read marker at the server clock, never behind the last activity, so client clock skew can't leave a read thread unread.
create or replace function comms.mark_conversation_read(p_conversation uuid, p_teammate uuid)
returns boolean
language sql
volatile
set search_path = ''
as $$
  insert into comms.conversation_reads as r (conversation_id, teammate_id, last_read_at)
  select c.id, p_teammate, greatest(now(), coalesce(c.last_message_at, c.created_at))
  from comms.conversations c
  where c.id = p_conversation and p_teammate is not null
  on conflict (conversation_id, teammate_id)
  do update set last_read_at = greatest(excluded.last_read_at, r.last_read_at)
  returning true
$$;

-- @down

drop function if exists comms.mark_conversation_read(uuid, uuid);
drop function if exists comms.count_conversations(uuid, jsonb, uuid);
drop function if exists comms.list_conversations(uuid, uuid, jsonb, integer, jsonb);
drop function if exists comms.filter_conversations(uuid, uuid, jsonb);
drop function if exists comms.conversation_is_unread(uuid, timestamptz, boolean, uuid);
drop function if exists comms.conversation_priority_weight(text);
drop function if exists comms.filter_text_list(jsonb);

-- Restore list_conversations exactly as 20260825120525 defined it.
create or replace function comms.list_conversations(
  p_project  uuid,
  p_teammate uuid,
  p_filter   jsonb default '{}'::jsonb,
  p_limit    integer default 50,
  p_before   timestamptz default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  with base as (
    select c.*
    from comms.conversations c
    where c.deleted_at is null
      and (p_project is null or c.project_id = p_project)
      and (
        coalesce(p_filter -> 'status', '[]'::jsonb) = '[]'::jsonb
        or c.status in (
          select value from jsonb_array_elements_text(coalesce(p_filter -> 'status', '[]'::jsonb))
        )
      )
      and (
        coalesce(p_filter -> 'channel', '[]'::jsonb) = '[]'::jsonb
        or c.channel in (
          select value from jsonb_array_elements_text(coalesce(p_filter -> 'channel', '[]'::jsonb))
        )
      )
      and (
        coalesce(p_filter -> 'priority', '[]'::jsonb) = '[]'::jsonb
        or c.priority in (
          select value from jsonb_array_elements_text(coalesce(p_filter -> 'priority', '[]'::jsonb))
        )
      )
      and (
        p_filter ->> 'assignee' is null                      -- absent / explicit null
        or (p_filter ->> 'assignee' = 'me' and p_teammate is not null
            and c.assignee_id = p_teammate)
        or (p_filter ->> 'assignee' = 'unassigned' and c.assignee_id is null)
        or c.assignee_id::text = p_filter ->> 'assignee'
      )
      -- Every listed tag must be present (AND semantics).
      and (
        coalesce(p_filter -> 'tagIds', '[]'::jsonb) = '[]'::jsonb
        or not exists (
          select 1
          from jsonb_array_elements_text(coalesce(p_filter -> 'tagIds', '[]'::jsonb)) wanted(tag)
          where not exists (
            select 1 from comms.conversation_tags ct
            where ct.conversation_id = c.id and ct.tag_id::text = wanted.tag
          )
        )
      )
      and (
        p_filter ->> 'unread' is null
        or jsonb_typeof(p_filter -> 'unread') <> 'boolean'
        or (
          p_filter ->> 'unread' = 'true'
          and not exists (
            select 1 from comms.conversation_reads r
            where r.conversation_id = c.id
              and r.teammate_id = p_teammate
              and r.last_read_at >= coalesce(c.last_message_at, c.created_at)
          )
        )
        or (
          p_filter ->> 'unread' = 'false'
          and exists (
            select 1 from comms.conversation_reads r
            where r.conversation_id = c.id
              and r.teammate_id = p_teammate
              and r.last_read_at >= coalesce(c.last_message_at, c.created_at)
          )
        )
      )
      and (
        coalesce(p_filter ->> 'search', '') = ''
        -- Parenthesise the extraction: || and ->> share a precedence level,
        -- so unbracketed, '%' would concatenate onto the jsonb first.
        or c.subject ilike '%' || (p_filter ->> 'search') || '%'
        or coalesce(c.preview, '') ilike '%' || (p_filter ->> 'search') || '%'
      )
      -- Keyset pagination ("newest"); ignored by the other sorts.
      and (p_before is null or c.last_message_at < p_before)
  )
  select coalesce(jsonb_agg(payload order by payload_sort), '[]'::jsonb)
  into v_result
  from (
    select
      to_jsonb(b)
        || jsonb_build_object(
          'contact',
          case when k.id is null then null
               else jsonb_build_object('id', k.id, 'name', k.name, 'email', k.email, 'avatar_url', k.avatar_url) end,
          'assignee',
          case when t.id is null then null
               else jsonb_build_object('id', t.id, 'name', t.name, 'avatar_url', t.avatar_url) end,
          'unread',
          not exists (
            select 1 from comms.conversation_reads r
            where r.conversation_id = b.id
              and r.teammate_id = p_teammate
              and r.last_read_at >= coalesce(b.last_message_at, b.created_at)
          )
        ) as payload,
      -- One numeric key per sort so jsonb_agg's ascending ORDER BY yields the
      -- right page: negate epochs for descending-time sorts; priority sorts
      -- weight-major, time-minor, also descending.
      case coalesce(p_filter ->> 'sort', 'newest')
        when 'oldest' then
          extract(epoch from coalesce(b.last_message_at, b.created_at))
        when 'priority' then
          -((case b.priority when 'Urgent' then 3 when 'Normal' then 2 when 'Low' then 1 else 0 end)::double precision * 1e12
            + extract(epoch from coalesce(b.last_message_at, b.created_at)))
        else
          -extract(epoch from coalesce(b.last_message_at, b.created_at))
      end as payload_sort
    from base b
    left join comms.contacts  k on k.id = b.contact_id
    left join comms.teammates t on t.id = b.assignee_id
    limit greatest(coalesce(p_limit, 50), 1)
  ) page;

  return v_result;
end;
$$;
