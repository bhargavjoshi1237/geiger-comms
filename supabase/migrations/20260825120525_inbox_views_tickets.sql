-- Inbox saved views + ticket links (inbox spec §2.3, §3.3, §3.4)
--
-- Owns comms.views (saved §3.3 filters), comms.ticket_links (a tracker ticket
-- spans many customer conversations), and adds tickets.assignee_id — the
-- comms.tickets table itself arrived with 20260821225308_widget.sql in this
-- spec's §2.3 shape, minus the assignee FK that needed comms.teammates.
--
-- Also owns comms.list_conversations(): the filtered/sorted/page query behind
-- listConversations. PostgREST cannot express the per-agent unread rule (§3.4)
-- cleanly, so it lives here as one plpgsql function returning a jsonb page
-- with contact/assignee embedded.

-- @up

create extension if not exists pgcrypto;

create table if not exists comms.views (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Untitled view',
  icon       text,
  filter     jsonb not null default '{}'::jsonb,   -- see inbox spec §3.3 for the shape
  sort       text not null default 'newest',
  owner_id   uuid references comms.teammates(id) on delete cascade,
  shared     boolean not null default false,
  position   integer not null default 0,
  project_id uuid references public.projects(id) on delete cascade,
  metadata   jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table comms.views add column if not exists icon text;
alter table comms.views add column if not exists filter jsonb not null default '{}'::jsonb;
alter table comms.views add column if not exists sort text not null default 'newest';
alter table comms.views add column if not exists owner_id uuid references comms.teammates(id) on delete cascade;
alter table comms.views add column if not exists shared boolean not null default false;
alter table comms.views add column if not exists position integer not null default 0;
alter table comms.views add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table comms.views add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table comms.views add column if not exists created_by uuid;
alter table comms.views add column if not exists updated_at timestamptz not null default now();
alter table comms.views add column if not exists deleted_at timestamptz;

drop trigger if exists views_touch_updated_at on comms.views;
create trigger views_touch_updated_at
before update on comms.views
for each row execute function comms.touch_updated_at();

-- A tracker ticket spans many customer conversations (one bug, many reporters).
create table if not exists comms.ticket_links (
  ticket_id       uuid not null references comms.tickets(id)        on delete cascade,
  conversation_id uuid not null references comms.conversations(id)  on delete cascade,
  primary key (ticket_id, conversation_id)
);

-- The widget migration created comms.tickets without the assignee FK (it needs
-- comms.teammates, which landed one migration ago).
alter table comms.tickets
  add column if not exists assignee_id uuid references comms.teammates(id) on delete set null;

create index if not exists tickets_assignee_idx
  on comms.tickets (assignee_id) where deleted_at is null;

alter table comms.views enable row level security;
alter table comms.ticket_links enable row level security;

drop policy if exists comms_views_demo_all on comms.views;
create policy comms_views_demo_all on comms.views
  for all to anon, authenticated using (true) with check (true);

drop policy if exists comms_ticket_links_demo_all on comms.ticket_links;
create policy comms_ticket_links_demo_all on comms.ticket_links
  for all to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- list_conversations — the filtered, sorted page behind listConversations.
--
-- p_filter keys (all optional; omitted/empty = no constraint):
--   status: ["Open"|"Snoozed"|"Closed"], channel: [text], priority: [text],
--   assignee: "me" | "unassigned" | "<teammateId>" | null,
--   tagIds: [uuid], unread: true|false|null,
--   search: text (ILIKE over subject + preview),
--   sort: "newest" (default) | "oldest" | "priority"
--
-- Returns a jsonb array of conversation rows; each carries its contact and
-- assignee embedded (no N+1 at the client) plus `unread` resolved for
-- p_teammate: no conversation_reads row, or one older than the last message.
-- p_before is the keyset cursor (last_message_at of the last held row).
-- ---------------------------------------------------------------------------
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

-- @down

drop function if exists comms.list_conversations(uuid, uuid, jsonb, integer, timestamptz);

drop policy if exists comms_ticket_links_demo_all on comms.ticket_links;
drop policy if exists comms_views_demo_all on comms.views;

drop index if exists comms.tickets_assignee_idx;
alter table comms.tickets drop column if exists assignee_id;

drop table if exists comms.ticket_links cascade;
drop trigger if exists views_touch_updated_at on comms.views;
drop table if exists comms.views cascade;
