-- Widget leads
--
-- Owns comms.leads: one row per offline message (email + message) the Messenger captures while the team is away,
-- written by POST /api/widget/leads with the service role. The route already writes it, but no migration created
-- the table, so every offline submission failed with write_failed. A lead keeps the contact or visitor that sent it;
-- the widget spec defines no lead-to-contact conversion, so none is made here.
-- RLS: project members work their project's leads; anon has no privileges, like every widget table.
-- Depends on: comms.can_access_project() (20260821182908_adopt_rbac); comms.widget_apps, visitors (20260821225308_widget), comms.contacts.

-- @up

create extension if not exists pgcrypto;
create schema if not exists comms;
grant usage on schema comms to authenticated, service_role;

create or replace function comms.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists comms.leads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  app_id uuid references comms.widget_apps(id) on delete set null,
  contact_id uuid references comms.contacts(id) on delete set null,
  visitor_id uuid references comms.visitors(id) on delete set null,
  email text not null,
  body text not null,
  source text not null default 'widget',
  state text not null default 'new',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists leads_project_idx
  on comms.leads (project_id, created_at desc) where deleted_at is null;

drop trigger if exists leads_touch_updated_at on comms.leads;
create trigger leads_touch_updated_at
before update on comms.leads
for each row execute function comms.touch_updated_at();

alter table comms.leads enable row level security;
revoke all on comms.leads from anon, authenticated;
grant select, insert, update, delete on comms.leads to authenticated;
grant all on comms.leads to service_role;

drop policy if exists leads_project_scope on comms.leads;
create policy leads_project_scope on comms.leads for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

-- @down

do $$
begin
  if coalesce(current_setting('comms.allow_destructive_down', true), '') <> 'on' then
    raise exception 'widget_leads @down is destructive on the shared database; set comms.allow_destructive_down=on on a disposable database';
  end if;
end;
$$;

drop table if exists comms.leads cascade;
