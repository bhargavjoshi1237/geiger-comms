-- Email outbox
--
-- Owns comms.email_outbox: one row per customer-facing reply to deliver by email. Rows are drained by the /api/email/outbox/drain
-- server route, which sends through geiger-dash's suite email API and reports back through comms.email_outbox_finish().
-- Owns comms.email_outbox_enqueue() + the messages_email_outbox trigger: an agent comment (a teammate's reply, or a workflow's
-- via post_automated_message; never a note) on a conversation linked to a connected email channel whose config.sendReplies
-- is true, with a contact email, is queued at insert time — so replies queue no matter which client inserted them.
-- Owns comms.email_delivery_note(): the message's metadata.delivery ({ channel, status, error, at }) mirrors the outbox row.
-- Owns comms.email_outbox_claim() / comms.email_outbox_finish() (service role only): leased claims; a lease that ran out
-- mid-send may have reached the provider, so it becomes 'uncertain' and is never resent.
-- Data: email channels' config.simulated flips to false — replies really go out once sendReplies is on (channels spec §1.1).
-- RLS: project members read their project's rows; nothing but the trigger and the service role writes.
-- Depends on: comms.can_access_project() (20260821182908_adopt_rbac); comms.channels, conversations, contacts, messages (earlier comms migrations).

-- @up

create extension if not exists pgcrypto;
create schema if not exists comms;
grant usage on schema comms to authenticated, service_role;

create or replace function comms.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists comms.email_outbox (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  channel_id uuid references comms.channels(id) on delete set null,
  conversation_id uuid not null references comms.conversations(id) on delete cascade,
  message_id uuid not null references comms.messages(id) on delete cascade,
  to_address text not null,
  status text not null default 'queued',  -- queued | sending | sent | failed | uncertain
  attempts integer not null default 0,
  lease_id uuid,
  leased_until timestamptz,
  log_id uuid,                            -- geiger-dash email.messages row
  provider_id text,                       -- the provider's message id, as geiger-dash reports it
  error text,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'email_outbox_status_check' and conrelid = 'comms.email_outbox'::regclass
  ) then
    alter table comms.email_outbox
      add constraint email_outbox_status_check
      check (status in ('queued', 'sending', 'sent', 'failed', 'uncertain'));
  end if;
end;
$$;

create unique index if not exists email_outbox_message_uniq on comms.email_outbox (message_id);
create index if not exists email_outbox_queued_idx
  on comms.email_outbox (created_at) where status = 'queued' and deleted_at is null;
create index if not exists email_outbox_project_idx on comms.email_outbox (project_id, created_at desc);

drop trigger if exists email_outbox_touch_updated_at on comms.email_outbox;
create trigger email_outbox_touch_updated_at
before update on comms.email_outbox
for each row execute function comms.touch_updated_at();

alter table comms.email_outbox enable row level security;
revoke all on comms.email_outbox from anon, authenticated;
grant select on comms.email_outbox to authenticated;
grant all on comms.email_outbox to service_role;

drop policy if exists email_outbox_project_read on comms.email_outbox;
create policy email_outbox_project_read on comms.email_outbox for select to authenticated
  using (comms.can_access_project(project_id));

-- Writes the message's metadata.delivery view of its outbox row.
create or replace function comms.email_delivery_note(p_message uuid, p_status text, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update comms.messages m
     set metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object(
       'delivery', jsonb_build_object('channel', 'email', 'status', p_status, 'error', p_error, 'at', now())
     )
   where m.id = p_message;
$$;

create or replace function comms.email_outbox_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation comms.conversations;
  v_to text;
begin
  if new.author_role <> 'agent' or new.message_type <> 'comment' or new.deleted_at is not null then
    return new;
  end if;

  select c.* into v_conversation
    from comms.conversations c
    join comms.channels ch on ch.id = c.channel_id
   where c.id = new.conversation_id
     and c.deleted_at is null
     and ch.kind = 'email'
     and ch.deleted_at is null
     and ch.status = 'connected'
     and ch.config ->> 'sendReplies' = 'true';
  if not found then
    return new;
  end if;

  -- The linked contact's address wins over the denormalised conversation column.
  select nullif(btrim(ct.email), '') into v_to
    from comms.contacts ct
   where ct.id = v_conversation.contact_id and ct.deleted_at is null;
  v_to := lower(coalesce(v_to, nullif(btrim(v_conversation.contact_email), '')));
  if v_to is null or position('@' in v_to) = 0 then
    return new;
  end if;

  insert into comms.email_outbox (project_id, channel_id, conversation_id, message_id, to_address)
  values (v_conversation.project_id, v_conversation.channel_id, new.conversation_id, new.id, v_to)
  on conflict (message_id) do nothing;

  if found then
    perform comms.email_delivery_note(new.id, 'queued', null);
  end if;
  return new;
end;
$$;

drop trigger if exists messages_email_outbox on comms.messages;
create trigger messages_email_outbox
after insert on comms.messages
for each row execute function comms.email_outbox_enqueue();

create or replace function comms.email_outbox_claim(p_limit integer, p_lease uuid)
returns setof comms.email_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired record;
begin
  if p_lease is null then
    raise exception 'lease_required';
  end if;

  for v_expired in
    update comms.email_outbox o
       set status = 'uncertain',
           error = 'The send was interrupted, so delivery is unconfirmed. It was not retried.',
           lease_id = null,
           leased_until = null
     where o.status = 'sending' and o.leased_until < now()
    returning o.message_id, o.error
  loop
    perform comms.email_delivery_note(v_expired.message_id, 'uncertain', v_expired.error);
  end loop;

  return query
  update comms.email_outbox o
     set status = 'sending',
         lease_id = p_lease,
         leased_until = now() + interval '5 minutes',
         attempts = o.attempts + 1
   where o.id in (
     select q.id
       from comms.email_outbox q
      where q.status = 'queued' and q.deleted_at is null
      order by q.created_at
      limit greatest(1, least(coalesce(p_limit, 1), 50))
      for update skip locked
   )
  returning o.*;
end;
$$;

-- Records one claimed row's outcome; false when the lease is no longer this worker's.
create or replace function comms.email_outbox_finish(
  p_id uuid,
  p_lease uuid,
  p_status text,
  p_log_id uuid default null,
  p_provider_id text default null,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message uuid;
begin
  if p_status not in ('sent', 'failed', 'uncertain') then
    raise exception 'invalid_status';
  end if;

  update comms.email_outbox o
     set status = p_status,
         log_id = p_log_id,
         provider_id = p_provider_id,
         error = left(p_error, 500),
         sent_at = case when p_status = 'sent' then now() else null end,
         lease_id = null,
         leased_until = null
   where o.id = p_id and o.lease_id = p_lease and o.status = 'sending'
  returning o.message_id into v_message;

  if v_message is null then
    return false;
  end if;

  perform comms.email_delivery_note(v_message, p_status, left(p_error, 500));
  return true;
end;
$$;

revoke execute on function comms.email_delivery_note(uuid, text, text) from public, anon, authenticated;
revoke execute on function comms.email_outbox_enqueue() from public, anon, authenticated;
revoke execute on function comms.email_outbox_claim(integer, uuid) from public, anon, authenticated;
revoke execute on function comms.email_outbox_finish(uuid, uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function comms.email_delivery_note(uuid, text, text) to service_role;
grant execute on function comms.email_outbox_claim(integer, uuid) to service_role;
grant execute on function comms.email_outbox_finish(uuid, uuid, text, uuid, text, text) to service_role;

update comms.channels
   set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('simulated', false)
 where kind = 'email'
   and (config ->> 'simulated') is distinct from 'false';

-- @down

-- Dropping the outbox erases every project's email delivery history on the shared database.
do $$ begin
  if coalesce(current_setting('comms.allow_destructive_down', true), '') <> 'on' then
    raise exception 'email_outbox @down is destructive on the shared database; set comms.allow_destructive_down=on on a disposable database';
  end if;
end $$;

drop trigger if exists messages_email_outbox on comms.messages;
drop function if exists comms.email_outbox_finish(uuid, uuid, text, uuid, text, text);
drop function if exists comms.email_outbox_claim(integer, uuid);
drop function if exists comms.email_outbox_enqueue();
drop table if exists comms.email_outbox cascade;
drop function if exists comms.email_delivery_note(uuid, text, text);

update comms.channels
   set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('simulated', true)
 where kind = 'email'
   and (config ->> 'simulated') is distinct from 'true';
