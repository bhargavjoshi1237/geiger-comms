-- RBAC trust hardening
--
-- Spec 2026-10-18-knowledge-base-and-ai-providers-design §1.7 (b) and (c), Phase 0b.
-- Comms stops trusting the self-asserted public.organization_users.role. Today any
-- signed-in suite user who knows an org id can insert themselves as 'Owner', and
-- comms maps that row straight to the project's owner role. Part (a), restricting
-- that self-insert in geiger-dash, is a separate suite request; until it lands a
-- self-inserted org Owner still passes has_org_ability('projects.update') and can
-- rewrite projects.created_by, so this migration narrows the hole but cannot close
-- it alone.
--
-- Becomes the owner of:
--   comms.rbac_role_for_member(uuid, uuid)    from 20260825112725_rbac_team_management
--   comms.rbac_ensure_membership(uuid, uuid)  from 20260825112725_rbac_team_management
--   comms.can_access_project(uuid)            from 20260821182908_adopt_rbac
--   the comms write policy on public.roles    roles_write, from 20260821182908_adopt_rbac
-- Owns (new):
--   comms.is_project_owner(uuid)  creator, verified org owner, or holder of a "*" grant
--   comms_roles_write on public.roles
--
-- Depends on (owned elsewhere):
--   comms.rbac_allows(), comms.role_grants  20260821182908_adopt_rbac
--   comms.project_members                   20260825112725_rbac_team_management
--   public.projects, organizations, organization_users, is_org_member()  suite (geiger-dash)
--
-- Behaviour change (spec §17 Q14, default "approve"):
--   * Owner comes only from trusted facts: the project's creator (projects.created_by)
--     or the org's owner (organizations.owner or created_by). Any other org member,
--     including org Admins and Managers, lands as a comms Member until a comms Owner
--     promotes them.
--   * The "first person into an unadministered project claims Owner" rule is gone,
--     so only the creator claims Owner. Invitations and p_default_role still fill
--     the gap, but only with a live, non-owner role of the same project.
--   * A project with no organization is reachable only by its creator. Live, that
--     is 208cf229 ("My Project", created_by null, 6 conversations and 6 contacts):
--     it closes to every signed-in user and stays reachable to service_role only.
--   * comms.sync_project_team (owned by 20261021103419_team_invite_claim) resolves
--     roles through rbac_role_for_member, so roster syncs follow the same rules.
--   * public.roles writes from comms need an Owner, or comms.role.manage for a role
--     without "*". roles_write (for all, using true) was the shared catch-all that
--     assets, campaign, content and events adoptions also created. Dropping it removes
--     the open write path for every product: their role writes must now pass this
--     policy or content's roles_workspace_write, plus the grey and events restrictive
--     guards that already apply.
--   * Existing grants are untouched.
--
-- rbac_role_for_member is now executable only by service_role; the SECURITY DEFINER
-- functions that call it run as owner. Rolling back is guarded (spec §1.8) and never
-- recreates roles_write.

-- @up

-- An org-less project is open only to its creator, because is_org_member(null) is false.
create or replace function comms.can_access_project(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, comms, auth
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target
      and (
        public.is_org_member(p.organization_id)
        or p.created_by = auth.uid()
      )
  );
$$;
revoke all on function comms.can_access_project(uuid) from public, anon;
grant execute on function comms.can_access_project(uuid) to authenticated, service_role;

-- Suite membership -> comms role id: Owner only for the creator or the verified org owner, else Member at most.
create or replace function comms.rbac_role_for_member(p_project_id uuid, p_user uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, comms, auth
as $$
declare
  v_org uuid;
  v_creator uuid;
  v_org_owner boolean;
  v_org_member boolean;
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
    -- Ownership is read from the organization row; organization_users.role is self-asserted.
    select o.owner = p_user or o.created_by = p_user
      into v_org_owner
      from public.organizations o
     where o.id = v_org;

    -- Every membership source public.is_org_member() accepts, so no org member falls through to a caller-chosen role.
    v_org_member := exists (
      select 1
        from public.organization_users ou
       where ou."organization" = v_org
         and ou."user" = p_user
    ) or exists (
      select 1
        from public.organizations o
       where o.id = v_org
         and jsonb_typeof(o.metadata -> 'members') = 'array'
         and (o.metadata -> 'members') ? p_user::text
    );
  end if;

  v_key := case
    when v_creator = p_user or v_org_owner then 'owner'
    when v_org_member then 'member'
    else null
  end;

  if v_key is null then
    return null;
  end if;

  select r.id into v_role
    from public.roles r
   where r.project_id = p_project_id
     and r.key = v_key
     and r.deleted_at is null
   limit 1;

  -- The owner role may not be seeded yet (the app seeds from the catalog on first load); fall back to member.
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
revoke all on function comms.rbac_role_for_member(uuid, uuid) from public, anon, authenticated;
grant execute on function comms.rbac_role_for_member(uuid, uuid) to service_role;

-- The caller's own first grant: existing grant > never revive revoked > suite-role map > invitation > caller default > member.
create or replace function comms.rbac_ensure_membership(p_project_id uuid, p_default_role uuid default null)
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

  -- The same access check every gated table's RLS makes.
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

  -- Owner comes only from the suite-role map: the project's creator or the verified org owner.
  v_role := comms.rbac_role_for_member(p_project_id, v_uid);

  -- Invitations and p_default_role are caller-controlled: they count only as a live, non-owner role of this project.
  if v_role is null then
    select r.id into v_role
      from public.roles r
     where r.id = coalesce(v_invite.role_id, p_default_role)
       and r.project_id = p_project_id
       and r.deleted_at is null
       and r.key is distinct from 'owner'
       and not '*' = any (r.permissions);
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
    -- Convert the invitation in place; inserting would collide with comms_project_members_email_uniq.
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
revoke all on function comms.rbac_ensure_membership(uuid, uuid) from public, anon;
grant execute on function comms.rbac_ensure_membership(uuid, uuid) to authenticated, service_role;

-- Executable by authenticated because comms_roles_write calls it as the signed-in user.
create or replace function comms.is_project_owner(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and comms.can_access_project(p_project)
    and (
      exists (
        select 1
          from public.projects p
          left join public.organizations o on o.id = p.organization_id
         where p.id = p_project
           and (p.created_by = auth.uid() or o.owner = auth.uid() or o.created_by = auth.uid())
      )
      or exists (
        select 1
          from comms.role_grants g
          join public.roles r on r.id = g.role_id and r.project_id = g.project_id
         where g.project_id = p_project
           and g.user_id = auth.uid()
           and g.status = 'active'
           and g.deleted_at is null
           and r.deleted_at is null
           and '*' = any (r.permissions)
      )
    );
$$;
revoke all on function comms.is_project_owner(uuid) from public, anon;
grant execute on function comms.is_project_owner(uuid) to authenticated, service_role;

-- Project-scoped role writes: Owners anything, comms.role.manage holders only roles without "*" (content's roles_workspace_write shape).
drop policy if exists roles_write on public.roles;
drop policy if exists comms_roles_write on public.roles;
create policy comms_roles_write on public.roles for all to authenticated
  using (
    comms.can_access_project(project_id)
    and (
      comms.is_project_owner(project_id)
      or (comms.rbac_allows('comms.role.manage', project_id) and not '*' = any (permissions))
    )
  )
  with check (
    comms.can_access_project(project_id)
    and (
      comms.is_project_owner(project_id)
      or (comms.rbac_allows('comms.role.manage', project_id) and not '*' = any (permissions))
    )
  );

-- @down

do $$
begin
  if coalesce(current_setting('comms.allow_destructive_down', true), '') <> 'on' then
    raise exception 'rbac_trust_hardening @down reopens owner self-promotion on the shared database; set comms.allow_destructive_down=on on a disposable database';
  end if;
end;
$$;

-- roles_write (using true) is deliberately not recreated: comms role writes fail closed until a scoped policy returns.
drop policy if exists comms_roles_write on public.roles;
drop function if exists comms.is_project_owner(uuid);

-- The previous bodies, verbatim from 20260821182908_adopt_rbac and 20260825112725_rbac_team_management.
create or replace function comms.can_access_project(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, comms, auth
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target
      and (
        p.organization_id is null
        or public.is_org_member(p.organization_id)
        or p.created_by = auth.uid()
      )
  );
$$;
revoke all on function comms.can_access_project(uuid) from public, anon;
grant execute on function comms.can_access_project(uuid) to authenticated, service_role;

create or replace function comms.rbac_role_for_member(p_project_id uuid, p_user uuid)
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
revoke all on function comms.rbac_role_for_member(uuid, uuid) from public, anon;
grant execute on function comms.rbac_role_for_member(uuid, uuid) to authenticated, service_role;

create or replace function comms.rbac_ensure_membership(p_project_id uuid, p_default_role uuid default null)
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
revoke all on function comms.rbac_ensure_membership(uuid, uuid) from public, anon;
grant execute on function comms.rbac_ensure_membership(uuid, uuid) to authenticated, service_role;
