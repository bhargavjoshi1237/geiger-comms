-- Companies
--
-- Makes a company a real, project-scoped account record. Until now the
-- Customers > Companies screen grouped people by the free-text
-- comms.contacts.company, so creating or deleting a company saved nothing.
--
-- Owns:
--   comms.companies                    table, indexes, triggers, RLS
--   comms.contacts.company_id          the person's company (contacts.company stays the denormalised name)
--   comms.companies_sync_people()      keeps linked people's company name in step; unlinks them on soft delete
--
-- Depends on (owned elsewhere, all earlier versions):
--   comms.can_access_project(uuid)     20260821182908_adopt_rbac
--   comms.contacts                     20260705072403_comms
--
-- Dedupe keys for CSV import: domain (case-insensitive) and external_id, each
-- unique per project among live rows. Standard attributes beyond name/domain/
-- external_id (website, industry, size, plan, monthly spend, owner) and custom
-- attribute values (metadata.custom, keyed by comms.custom_fields entity
-- 'company') live in the metadata bag, the same shape as comms.contacts.

-- @up

create extension if not exists pgcrypto;
create schema if not exists comms;
grant usage on schema comms to anon, authenticated, service_role;

create or replace function comms.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists comms.companies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  domain text,
  external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint companies_name_present check (btrim(name) <> '')
);

create unique index if not exists companies_project_domain_key
  on comms.companies (project_id, lower(domain))
  where deleted_at is null and domain is not null;
create unique index if not exists companies_project_external_key
  on comms.companies (project_id, external_id)
  where deleted_at is null and external_id is not null;
create index if not exists companies_project_name_idx
  on comms.companies (project_id, lower(name))
  where deleted_at is null;

drop trigger if exists companies_touch_updated_at on comms.companies;
create trigger companies_touch_updated_at
before update on comms.companies
for each row execute function comms.touch_updated_at();

alter table comms.contacts
  add column if not exists company_id uuid references comms.companies(id) on delete set null;
create index if not exists contacts_company_idx
  on comms.contacts (company_id)
  where deleted_at is null;

-- A rename rewrites linked people's company name; a soft delete unlinks them.
create or replace function comms.companies_sync_people()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update comms.contacts set company_id = null, company = null where company_id = new.id;
  elsif new.deleted_at is null and new.name is distinct from old.name then
    update comms.contacts set company = new.name where company_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists companies_sync_people on comms.companies;
create trigger companies_sync_people
after update of name, deleted_at on comms.companies
for each row execute function comms.companies_sync_people();

revoke all on comms.companies from public, anon;
grant select, insert, update, delete on comms.companies to authenticated;

-- The comms default privileges and PUBLIC would otherwise let anyone execute the trigger function.
revoke all on function comms.companies_sync_people() from public, anon, authenticated;

alter table comms.companies enable row level security;
drop policy if exists companies_project_scope on comms.companies;
create policy companies_project_scope on comms.companies for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

-- @down

-- Refuses on the shared database: it drops every company and every person's company link.
do $$
begin
  if coalesce(current_setting('comms.allow_destructive_down', true), '') <> 'on' then
    raise exception 'companies @down is destructive on the shared database; set comms.allow_destructive_down=on on a disposable database';
  end if;
end;
$$;

drop trigger if exists companies_sync_people on comms.companies;
drop function if exists comms.companies_sync_people();
drop index if exists comms.contacts_company_idx;
alter table comms.contacts drop column if exists company_id;
drop table if exists comms.companies cascade;
