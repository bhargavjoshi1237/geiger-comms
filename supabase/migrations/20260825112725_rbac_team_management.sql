-- Team & Roles: the roster overlay and the real gates
--
-- Ports the geiger-events team/roles architecture onto comms. The adopt_rbac
-- migration (20260821182908) created the storage — public.roles,
-- comms.role_grants, comms.rbac_allows(), comms.rbac_ensure_membership() — but
-- deliberately kept no member roster, which is why there was no Team screen.
-- This migration adds it, transferring ownership of:
--
--   comms.project_members            roster + invitation overlay
--   comms.member_groups              sub-teams (membership rides group_ids[])
--   comms.member_activity            append-only audit feed
--   comms.rbac_role_for_member       suite org role -> comms role id
--   comms.sync_project_team          org -> roster + bootstrap grants
--   comms.rbac_ensure_membership     claim invitations, suite-role aware
--   comms.role_grants write policy   who may assign roles
--
-- ROLE AUTHORITY STAYS WITH GRANTS. project_members.role_id is display only —
-- stamped for invited-but-unregistered rows that have no user_id to grant to.
-- The suite org link is public.organization_users("user", "organization")
-- (quoted: both are reserved-ish); identity lives in auth.users.

-- @up

-- ---------------------------------------------------------------------------
-- Roster overlay. created_by / invited_by are plain uuids per convention.
-- ---------------------------------------------------------------------------

create table if not exists comms.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid,
  role_id uuid references public.roles(id) on delete set null,
  status text not null default 'active',   -- active | invited | suspended
  email text not null default '',
  name text not null default '',
  avatar_url text,
  group_ids uuid[] not null default '{}',
  invited_by uuid,
  invited_at timestamptz,
  joined_at timestamptz,
  last_active_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists comms_project_members_project_idx
  on comms.project_members (project_id) where deleted_at is null;
create index if not exists comms_project_members_groups_idx
  on comms.project_members using gin (group_ids);
-- One overlay row per user / per invited email within a project.
create unique index if not exists comms_project_members_user_uniq
  on comms.project_members (project_id, user_id) where user_id is not null and deleted_at is null;
create unique index if not exists comms_project_members_email_uniq
  on comms.project_members (project_id, lower(email)) where email <> '' and deleted_at is null;

drop trigger if exists project_members_touch_updated_at on comms.project_members;
create trigger project_members_touch_updated_at
before update on comms.project_members
for each row execute function comms.touch_updated_at();

alter table comms.project_members enable row level security;
drop policy if exists project_members_demo_all on comms.project_members;
create policy project_members_demo_all on comms.project_members for all to anon, authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Sub-teams. Membership is stored as an array on the member, so no join table.
-- ---------------------------------------------------------------------------

create table if not exists comms.member_groups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null default 'Untitled group',
  description text not null default '',
  color text not null default 'slate',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists comms_member_groups_project_idx
  on comms.member_groups (project_id) where deleted_at is null;

drop trigger if exists member_groups_touch_updated_at on comms.member_groups;
create trigger member_groups_touch_updated_at
before update on comms.member_groups
for each row execute function comms.touch_updated_at();

alter table comms.member_groups enable row level security;
drop policy if exists member_groups_demo_all on comms.member_groups;
create policy member_groups_demo_all on comms.member_groups for all to anon, authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Append-only audit feed (no updated_at / soft delete). action: invited |
-- role_changed | status_changed | removed | group_changed | role_created |
-- role_updated | role_deleted | group_created
-- ---------------------------------------------------------------------------

create table if not exists comms.member_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  actor_user_id uuid,
  actor_name text not null default '',
  target_member_id uuid,
  target_name text not null default '',
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists comms_member_activity_project_idx
  on comms.member_activity (project_id, created_at desc);

alter table comms.member_activity enable row level security;
drop policy if exists member_activity_demo_all on comms.member_activity;
create policy member_activity_demo_all on comms.member_activity for all to anon, authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Suite org role -> comms role id. Conservative; lands on the seeded roles:
-- Owner -> owner ("*"), admin -> admin, manager -> manager, else member.
-- Returns null when they are neither in the project's org nor its creator.
-- ---------------------------------------------------------------------------

create or replace function comms.rbac_role_for_member(
  p_project_id uuid,
  p_user uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = public, comms, auth
as $$
declare
  v_org uuid;
  v_creator uuid;
  v_org_role text;
  v_key text;
  v_role uuid;
begin
  if p_project_id is null or p_user is null then
    return null;
  end if;

  select organization_id, created_by
    into v_org, v_creator
    from public.projects
   where id = p_project_id;

  if v_org is not null then
    select lower(ou.role::text) into v_org_role
      from public.organization_users ou
     where ou."organization" = v_org
       and ou."user" = p_user
     limit 1;
  end if;

  v_key := case
    when v_org_role = 'owner' then 'owner'
    when v_org_role = 'admin' then 'admin'
    when v_org_role = 'manager' then 'manager'
    when v_org_role is not null then 'member'
    else null
  end;

  -- Creating the project still earns Owner: an unowned project has no suite
  -- role to read, and its creator is the only sensible administrator.
  if v_key is null and v_creator = p_user then
    v_key := 'owner';
  end if;

  if v_key is null then
    return null;
  end if;

  select r.id into v_role
    from public.roles r
   where r.project_id = p_project_id
     and r.key = v_key
     and r.deleted_at is null
   limit 1;

  -- The mapped role may not be seeded yet (the app seeds from the catalog on
  -- first load). Fall back to member, then to nothing.
  if v_role is null and v_key <> 'member' then
    select r.id into v_role
      from public.roles r
     where r.project_id = p_project_id
       and r.key = 'member'
       and r.deleted_at is null
     limit 1;
  end if;

  return v_role;
end;
$$;

grant execute on function comms.rbac_role_for_member(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Org-member sync: SECURITY DEFINER so it can read the shared tables regardless
-- of their RLS. Exception-guarded — a shared-schema mismatch degrades to a
-- no-op rather than taking the Team screen down. A grant for every roster
-- member who never held one (`not exists` sees soft-deleted rows too, so a
-- revocation sticks across syncs).
-- ---------------------------------------------------------------------------

create or replace function comms.sync_project_team(
  p_project_id uuid,
  p_default_role uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, comms, auth
as $$
declare
  v_org uuid;
  v_creator uuid;
  v_count integer := 0;
begin
  if p_project_id is null then
    return 0;
  end if;

  select organization_id, created_by
    into v_org, v_creator
    from public.projects
   where id = p_project_id;

  if v_org is not null then
    insert into comms.project_members (
      project_id, user_id, role_id, status, email, name, avatar_url, joined_at
    )
    select
      p_project_id,
      u.id,
      coalesce(comms.rbac_role_for_member(p_project_id, u.id), p_default_role),
      'active',
      coalesce(u.email, ''),
      coalesce(
        nullif(u.raw_user_meta_data ->> 'full_name', ''),
        nullif(u.raw_user_meta_data ->> 'name', ''),
        split_part(coalesce(u.email, ''), '@', 1)
      ),
      nullif(u.raw_user_meta_data ->> 'avatar_url', ''),
      now()
    from public.organization_users ou
    join auth.users u on u.id = ou."user"
    where ou."organization" = v_org
      and not exists (
        select 1 from comms.project_members m
        where m.project_id = p_project_id
          and m.user_id = u.id
          and m.deleted_at is null
      );

    get diagnostics v_count = row_count;
  end if;

  if v_creator is not null then
    insert into comms.project_members (
      project_id, user_id, role_id, status, email, name, avatar_url, joined_at
    )
    select
      p_project_id, u.id,
      coalesce(comms.rbac_role_for_member(p_project_id, u.id), p_default_role),
      'active',
      coalesce(u.email, ''),
      coalesce(
        nullif(u.raw_user_meta_data ->> 'full_name', ''),
        nullif(u.raw_user_meta_data ->> 'name', ''),
        split_part(coalesce(u.email, ''), '@', 1)
      ),
      nullif(u.raw_user_meta_data ->> 'avatar_url', ''),
      now()
    from auth.users u
    where u.id = v_creator
      and not exists (
        select 1 from comms.project_members m
        where m.project_id = p_project_id
          and m.user_id = v_creator
          and m.deleted_at is null
      );
  end if;

  insert into comms.role_grants (project_id, user_id, role_id, status)
  select
    p_project_id,
    m.user_id,
    coalesce(comms.rbac_role_for_member(p_project_id, m.user_id), p_default_role),
    'active'
  from comms.project_members m
  where m.project_id = p_project_id
    and m.user_id is not null
    and m.deleted_at is null
    and not exists (
      select 1 from comms.role_grants g
      where g.project_id = p_project_id
        and g.user_id = m.user_id
    );

  return v_count;
exception
  when others then
    -- A shared-schema shape change must not take the screen down with it.
    return 0;
end;
$$;

grant execute on function comms.sync_project_team(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The caller's own membership. Redefines the body owned by 20260821182908
-- (which cannot be edited): claims pending invitations by email instead of
-- colliding with comms_project_members_email_uniq, prefers the suite-role map,
-- and keeps the roster row in step so a joiner is visible on the Team screen
-- even when the org read is unavailable.
--
-- Precedence for a first join: existing grant > never revive revoked >
-- creator-or-first-administrator owner > suite org role > invite-time role >
-- caller's default > project's member role.
-- ---------------------------------------------------------------------------

create or replace function comms.rbac_ensure_membership(
  p_project_id uuid,
  p_default_role uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, comms, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
  v_avatar text;
  v_role uuid;
  v_existing uuid;
  v_ever integer;
  v_invite comms.project_members%rowtype;
begin
  if p_project_id is null or v_uid is null then
    return null;
  end if;

  -- The same access check every gated table's RLS makes: a grant can never be
  -- minted for somebody who could not already reach the project's rows.
  if not comms.can_access_project(p_project_id) then
    return null;
  end if;

  select
    coalesce(u.email, ''),
    coalesce(
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(u.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(u.email, ''), '@', 1)
    ),
    nullif(u.raw_user_meta_data ->> 'avatar_url', '')
    into v_email, v_name, v_avatar
    from auth.users u
   where u.id = v_uid;

  select role_id into v_existing
    from comms.role_grants
   where project_id = p_project_id
     and user_id = v_uid
     and deleted_at is null
     and status = 'active'
   limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  -- A revoked grant is a decision, not a gap. Never hand one back.
  select count(*) into v_ever
    from comms.role_grants
   where project_id = p_project_id
     and user_id = v_uid;

  if v_ever > 0 then
    return null;
  end if;

  -- An invitation waiting on this email, addressed to nobody yet.
  select * into v_invite
    from comms.project_members
   where project_id = p_project_id
     and user_id is null
     and v_email <> ''
     and lower(email) = lower(v_email)
     and deleted_at is null
   limit 1;

  -- What their suite role entitles them to.
  v_role := comms.rbac_role_for_member(p_project_id, v_uid);

  -- Then an explicit invitation, then the caller's default. An invite only
  -- fills the gap — it must never quietly demote an org Owner.
  if v_role is null then
    v_role := coalesce(v_invite.role_id, p_default_role);
  end if;

  -- First person into a project nobody administers claims it, so an ownerless
  -- workspace can never deadlock: reachable by everyone, administrable by none.
  if v_role is null or not exists (
    select 1 from comms.role_grants
     where project_id = p_project_id and deleted_at is null and status = 'active'
  ) then
    select r.id into v_existing
      from public.roles r
     where r.project_id = p_project_id and r.key = 'owner' and r.deleted_at is null
     limit 1;
    v_role := coalesce(v_existing, v_role);
  end if;

  if v_role is null then
    select r.id into v_role
      from public.roles r
     where r.project_id = p_project_id and r.key = 'member' and r.deleted_at is null
     limit 1;
  end if;

  if v_role is null then
    return null;   -- roles not seeded yet; the next pass picks it up
  end if;

  insert into comms.role_grants (project_id, user_id, role_id, status)
  values (p_project_id, v_uid, v_role, 'active')
  on conflict do nothing;

  if v_invite.id is not null then
    -- Convert the invitation in place. Inserting instead would collide with
    -- comms_project_members_email_uniq and abort the join.
    update comms.project_members
       set user_id = v_uid,
           role_id = v_role,
           status = 'active',
           name = case when name = '' then v_name else name end,
           avatar_url = coalesce(avatar_url, v_avatar),
           joined_at = coalesce(joined_at, now())
     where id = v_invite.id;
  else
    insert into comms.project_members (
      project_id, user_id, role_id, status, email, name, avatar_url, joined_at
    )
    select p_project_id, v_uid, v_role, 'active', v_email, v_name, v_avatar, now()
    where not exists (
      select 1 from comms.project_members m
      where m.project_id = p_project_id
        and m.user_id = v_uid
        and m.deleted_at is null
    );
  end if;

  return v_role;
end;
$$;

grant execute on function comms.rbac_ensure_membership(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Who may assign roles. The demo policy let any authenticated user rewrite
-- anyone's grants, which would make the UI gate decorative. Writes now require
-- comms.team.assign in the project being written to — Owner holds it through
-- "*". Reads stay open so the Team screen can render the roster. The two RPCs
-- above are SECURITY DEFINER and unaffected: joining a project must work
-- before you hold any permission at all.
-- ---------------------------------------------------------------------------

drop policy if exists role_grants_write on comms.role_grants;
create policy role_grants_assign on comms.role_grants
  for all to authenticated
  using (comms.rbac_allows('comms.team.assign', project_id))
  with check (comms.rbac_allows('comms.team.assign', project_id));

-- Backfill: every live project gets its members synced and granted, so
-- enforcement does not land on an empty grants table.
do $$
declare
  p record;
begin
  for p in select id from public.projects where deleted_at is null loop
    perform comms.sync_project_team(p.id, null);
  end loop;
end;
$$;

-- @down

drop policy if exists role_grants_assign on comms.role_grants;
create policy role_grants_write on comms.role_grants
  for all to authenticated using (true) with check (true);

drop table if exists comms.member_activity;
drop table if exists comms.member_groups;
drop table if exists comms.project_members;

drop function if exists comms.rbac_ensure_membership(uuid, uuid);
drop function if exists comms.sync_project_team(uuid, uuid);
drop function if exists comms.rbac_role_for_member(uuid, uuid);
