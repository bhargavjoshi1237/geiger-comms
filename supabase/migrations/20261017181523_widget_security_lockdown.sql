-- Widget security lockdown (messenger-widget spec §3.2, §6, §10)
--
-- Owns: every anon privilege in the comms schema (tables, sequences, routines, default privileges) — revoked.
-- Owns: the comms demo policies' role lists — rewritten from "anon, authenticated" to "authenticated" only.
-- Owns: browser-role access to comms.widget_apps (none) and the ledger table (none).
-- Owns: realtime.messages widget_conversation_read, now backed by comms.widget_topic_allowed().
-- Owns: comms.widget_list_conversations() (visitor-facing list: notes and deleted messages excluded).
-- Owns: comms.post_message body (follow-up to 20260825120524_inbox_state.sql): notes no longer broadcast.
-- Owns: conversations.visitor_last_read_at and widget_apps.previous_secret_hash/previous_secret_expires_at/last_boot_at.
-- Owns: comms-widget bucket hardening (no list policy, octet-stream only, 10 MB cap).
-- New comms functions are still executable by PUBLIC via Postgres' global default; their migrations must revoke it.

-- @up

create extension if not exists pgcrypto;
create schema if not exists comms;

-- anon keeps schema usage only (the realtime policy helper below needs it); every object privilege goes.
grant usage on schema comms to anon, authenticated, service_role;
revoke all on all tables in schema comms from anon;
revoke all on all sequences in schema comms from anon;
revoke execute on all routines in schema comms from public, anon;
grant execute on all routines in schema comms to authenticated, service_role;
alter default privileges in schema comms revoke all on tables from anon;
alter default privileges in schema comms revoke all on sequences from anon;
alter default privileges in schema comms revoke all on routines from anon;

-- Demo-open policies become authenticated-only; an anon-only policy is dropped outright.
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname, roles
    from pg_policies
    where schemaname = 'comms' and 'anon'::name = any (roles)
  loop
    if 'authenticated'::name = any (p.roles) then
      execute format('alter policy %I on %I.%I to authenticated', p.policyname, p.schemaname, p.tablename);
    else
      execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    end if;
  end loop;
end;
$$;

-- widget_apps is reachable only through the server routes (service role): no browser role may touch it.
drop policy if exists comms_widget_apps_auth_all on comms.widget_apps;
revoke all on comms.widget_apps from anon, authenticated;

-- The migration ledger is not browser data either.
do $$
begin
  if to_regclass('comms.geiger_migrations') is not null then
    execute 'revoke all on comms.geiger_migrations from anon, authenticated';
  end if;
end;
$$;

-- Server-only elevated function: only the widget API (service role) merges visitors.
revoke execute on function comms.merge_visitor(uuid, uuid) from public, anon, authenticated;
grant execute on function comms.merge_visitor(uuid, uuid) to service_role;

-- Visitor-side read state, separate from the agent-side unread flag.
alter table comms.conversations add column if not exists visitor_last_read_at timestamptz;

-- Rotation grace and install status as columns, so boot never read-modify-writes the metadata bag.
alter table comms.widget_apps add column if not exists previous_secret_hash text;
alter table comms.widget_apps add column if not exists previous_secret_expires_at timestamptz;
alter table comms.widget_apps add column if not exists last_boot_at timestamptz;

update comms.widget_apps
set last_boot_at = (metadata ->> 'last_boot_at')::timestamptz
where last_boot_at is null
  and metadata ->> 'last_boot_at' ~ '^\d{4}-\d{2}-\d{2}T';

-- A legacy unbounded grace becomes a bounded 24h one from now.
update comms.widget_apps
set previous_secret_hash = metadata ->> 'previous_secret',
    previous_secret_expires_at = now() + interval '24 hours'
where previous_secret_hash is null
  and coalesce(metadata ->> 'previous_secret', '') <> '';

update comms.widget_apps
set metadata = metadata - 'previous_secret' - 'last_boot_at'
where metadata ?| array['previous_secret', 'last_boot_at'];

-- Realtime topic check for the widget's anon realtime token; definer so anon needs no table access.
create or replace function comms.widget_topic_allowed(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_topic like 'conversation:%', false)
    and (auth.jwt() ->> 'app_id') is not null
    and exists (
      select 1
      from comms.conversations c
      where c.id::text = split_part(p_topic, ':', 2)
        and c.deleted_at is null
        and case
          when nullif(auth.jwt() ->> 'contact_id', '') is not null
            then c.contact_id::text = auth.jwt() ->> 'contact_id'
          else c.visitor_id::text = auth.jwt() ->> 'visitor_id'
            and exists (
              select 1 from comms.visitors v
              where v.id = c.visitor_id and v.contact_id is null
            )
        end
    );
$$;

revoke all on function comms.widget_topic_allowed(text) from public, authenticated;
grant execute on function comms.widget_topic_allowed(text) to anon, service_role;

drop policy if exists widget_conversation_read on realtime.messages;
create policy widget_conversation_read on realtime.messages
for select to anon using (
  realtime.messages.extension = 'broadcast'
  and comms.widget_topic_allowed(realtime.topic())
);

-- Visitor-facing conversation list: ownership, preview, agent name and unread from visible comments only.
-- An anonymous caller (no contact) owns a conversation only while its visitor row is still unclaimed.
create or replace function comms.widget_list_conversations(
  p_contact uuid,
  p_visitor uuid,
  p_limit   integer default 50,
  p_id      uuid default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(page.payload order by page.sort_at desc), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'id', c.id,
        'subject', c.subject,
        'status', c.status,
        'created_at', c.created_at,
        'last_message_at', coalesce(last_msg.created_at, c.created_at),
        'preview', coalesce(left(last_msg.body, 140), ''),
        'last_author_role', last_msg.author_role,
        'agent_name', last_agent.author_name,
        'unread_count', unread.n
      ) as payload,
      coalesce(last_msg.created_at, c.created_at) as sort_at
    from comms.conversations c
    left join lateral (
      select m.body, m.created_at, m.author_role
      from comms.messages m
      where m.conversation_id = c.id and m.message_type = 'comment' and m.deleted_at is null
      order by m.created_at desc
      limit 1
    ) last_msg on true
    left join lateral (
      select m.author_name
      from comms.messages m
      where m.conversation_id = c.id and m.message_type = 'comment' and m.deleted_at is null
        and m.author_role in ('agent', 'ai_agent')
      order by m.created_at desc
      limit 1
    ) last_agent on true
    cross join lateral (
      select count(*)::integer as n
      from comms.messages m
      where m.conversation_id = c.id and m.message_type = 'comment' and m.deleted_at is null
        and m.author_role in ('agent', 'ai_agent')
        and (c.visitor_last_read_at is null or m.created_at > c.visitor_last_read_at)
    ) unread
    where c.deleted_at is null
      and (p_id is null or c.id = p_id)
      and (
        (p_contact is not null and c.contact_id = p_contact)
        or (
          p_contact is null and p_visitor is not null and c.visitor_id = p_visitor
          and exists (
            select 1 from comms.visitors v
            where v.id = p_visitor and v.contact_id is null
          )
        )
      )
    order by sort_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
  ) page;
$$;

revoke all on function comms.widget_list_conversations(uuid, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function comms.widget_list_conversations(uuid, uuid, integer, uuid) to service_role;

-- post_message: unchanged from 20260825120524_inbox_state.sql except internal notes are never broadcast to the visitor topic.
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

  -- Notes are internal: they touch neither the customer-facing conversation surface nor the visitor's topic.
  if p_message_type <> 'note' then
    update comms.conversations c
    set last_message_at = now(),
        preview = left(p_body, 140),
        waiting_on_us = (p_author_role = 'customer'),
        first_response_at = case
          when c.first_response_at is null and p_author_role in ('agent', 'ai_agent')
            then now() else c.first_response_at end
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
      -- Realtime is a best-effort notification; clients always re-fetch via the API.
      null;
    end;
  end if;

  return v_message;
end;
$$;

revoke execute on function comms.post_message(uuid, text, text, text, text, uuid, jsonb, uuid, text, uuid) from public, anon;
grant execute on function comms.post_message(uuid, text, text, text, text, uuid, jsonb, uuid, text, uuid) to authenticated, service_role;

-- Attachments: public object URLs keep working (public bucket), but nobody can list the bucket.
drop policy if exists comms_widget_uploads_read on storage.objects;
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['application/octet-stream']
where id = 'comms-widget';

-- @down

update storage.buckets
set file_size_limit = null,
    allowed_mime_types = null
where id = 'comms-widget';
drop policy if exists comms_widget_uploads_read on storage.objects;
create policy comms_widget_uploads_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'comms-widget');

-- Restore the inbox_state body of post_message (notes broadcast too).
create or replace function comms.post_message(
  p_conversation uuid,
  p_body         text,
  p_author_role  text,
  p_author_name  text,
  p_message_type text default 'comment',
  p_author_id    uuid default null,
  p_attachments  jsonb default '[]'::jsonb,
  p_visitor_id   uuid default null,
  p_source       text default 'workspace',
  p_id           uuid default null
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

drop function if exists comms.widget_list_conversations(uuid, uuid, integer, uuid);

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
drop function if exists comms.widget_topic_allowed(text);

-- Fold the promoted widget_apps columns back into the metadata bag before dropping them.
update comms.widget_apps
set metadata = metadata
  || case when previous_secret_hash is not null
       then jsonb_build_object('previous_secret', previous_secret_hash) else '{}'::jsonb end
  || case when last_boot_at is not null
       then jsonb_build_object('last_boot_at', to_char(last_boot_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
       else '{}'::jsonb end
where previous_secret_hash is not null or last_boot_at is not null;
alter table comms.widget_apps drop column if exists last_boot_at;
alter table comms.widget_apps drop column if exists previous_secret_expires_at;
alter table comms.widget_apps drop column if exists previous_secret_hash;
alter table comms.conversations drop column if exists visitor_last_read_at;

grant execute on function comms.merge_visitor(uuid, uuid) to public, anon, authenticated;

do $$
begin
  if to_regclass('comms.geiger_migrations') is not null then
    execute 'grant all on comms.geiger_migrations to anon, authenticated';
  end if;
end;
$$;

grant select, insert, update, delete on comms.widget_apps to authenticated;
grant all on comms.widget_apps to anon;
drop policy if exists comms_widget_apps_auth_all on comms.widget_apps;
create policy comms_widget_apps_auth_all on comms.widget_apps
  for all to authenticated using (true) with check (true);

-- Re-open the demo policies this migration narrowed (the ones known when it was written).
do $$
declare
  p record;
begin
  for p in
    select pol.schemaname, pol.tablename, pol.policyname
    from pg_policies pol
    where pol.schemaname = 'comms'
      and pol.policyname in (
        'comms_articles_demo_all', 'comms_channels_demo_all', 'comms_contacts_demo_all',
        'comms_conversation_reads_demo_all', 'comms_conversation_tags_demo_all',
        'comms_conversations_demo_all', 'comms_mentions_demo_all', 'comms_messages_demo_all',
        'comms_posts_demo_all', 'comms_tags_demo_all', 'comms_teammates_demo_all',
        'comms_ticket_links_demo_all', 'comms_tickets_demo_all', 'comms_views_demo_all',
        'comms_visitors_demo_all', 'member_activity_demo_all', 'member_groups_demo_all',
        'project_members_demo_all', 'role_grants_read'
      )
  loop
    execute format('alter policy %I on %I.%I to anon, authenticated', p.policyname, p.schemaname, p.tablename);
  end loop;
end;
$$;

alter default privileges in schema comms grant all on tables to anon;
alter default privileges in schema comms grant all on sequences to anon;
alter default privileges in schema comms grant all on routines to anon;
grant execute on all routines in schema comms to public, anon;
grant all on all sequences in schema comms to anon;
grant all on all tables in schema comms to anon;
