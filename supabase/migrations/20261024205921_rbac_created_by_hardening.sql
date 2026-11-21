-- RBAC created_by hardening
--
-- Closes the Comms Owner self-promotion left open after 20261021103047_rbac_trust_hardening, 20261021103419_team_invite_claim
-- and 20261021110405_role_grants_owner_guard.
-- * projects.created_by counts only for a project with no organization. The org "projects" module is open, so any org
--   member can rewrite created_by and became Comms Owner (or handed a second account outside the org access + Owner).
--   Org-less projects can't be updated from a session, matching public.is_project_member and the grey/events role guards.
-- * Grants come only from comms.rbac_role_for_member. p_default_role, an invitation's role_id and a roster row's user_id are
--   member-writable, yet sync_project_team granted p_default_role (e.g. Admin) to any user_id planted in the roster.
--   p_default_role stays in both signatures and still labels the roster row. Existing grants are untouched.
--
-- Becomes the owner of (all from 20261021103047_rbac_trust_hardening unless noted):
--   comms.can_access_project(uuid), comms.rbac_role_for_member(uuid, uuid), comms.rbac_ensure_membership(uuid, uuid),
--   comms.is_project_owner(uuid), comms.sync_project_team(uuid, uuid) (from 20261021103419_team_invite_claim).
-- comms_roles_write, comms.role_grant_allowed and role_grants_assign are unchanged and inherit the fix.
-- Depends on: public.projects, organizations, organization_users, is_org_member() (geiger-dash); public.roles;
--   comms.role_grants (20260821182908_adopt_rbac); comms.project_members (20260825112725_rbac_team_management).
-- @down restores the 20261021103047 / 20261021103419 bodies verbatim and is guarded like theirs (it reopens the hole).

-- @up

-- An org-less project is open only to its creator; inside an org, membership alone decides (created_by is member-writable there).
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
        or (p.organization_id is null and p.created_by = auth.uid())
      )
  );
$$;
revoke all on function comms.can_access_project(uuid) from public, anon;
grant execute on function comms.can_access_project(uuid) to authenticated, service_role;

-- Suite membership -> comms role id: Owner only for the creator of an org-less project or the verified org owner, else Member at most.
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

  -- created_by counts only without an org: any org member can rewrite it through the open projects module.
  v_key := case
    when v_org is null and v_creator = p_user then 'owner'
    when v_org_owner then 'owner'
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

-- The caller's own first grant: existing grant > never revive revoked > the suite-role map. Caller-supplied roles never pick it.
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

  -- Owner or Member from the suite facts only; p_default_role and an invitation's role_id are caller-controlled and ignored.
  v_role := comms.rbac_role_for_member(p_project_id, v_uid);

  if v_role is null then
    return null;   -- roles not seeded yet; the next pass picks it up
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
           and (
             (p.organization_id is null and p.created_by = auth.uid())
             or o.owner = auth.uid()
             or o.created_by = auth.uid()
           )
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

-- Roster sync: converts claimed invitations and adds org members; grants come only from rbac_role_for_member.
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
  v_inserted integer := 0;
  v_member_role uuid;
  v_default uuid;
  v_role uuid;
  v_invite record;
begin
  if p_project_id is null then
    return 0;
  end if;

  -- The same check every project-scoped table's RLS makes: nobody syncs a project they cannot reach.
  if not comms.can_access_project(p_project_id) then
    return 0;
  end if;

  select organization_id, created_by
    into v_org, v_creator
    from public.projects
   where id = p_project_id;

  select r.id into v_member_role
    from public.roles r
   where r.project_id = p_project_id and r.key = 'member' and r.deleted_at is null
   limit 1;

  -- The caller's fallback fills only the roster's display role, and only as a live, non-owner-grade role of this project.
  select r.id into v_default
    from public.roles r
   where r.id = p_default_role
     and r.project_id = p_project_id
     and r.deleted_at is null
     and r.key is distinct from 'owner'
     and not ('*' = any (r.permissions));
  v_default := coalesce(v_default, v_member_role);

  if v_org is not null then
    for v_invite in
      -- organization_users has no unique (organization, "user"), so one invitation can join twice.
      select distinct on (m.id)
        m.id as member_id,
        u.id as user_id,
        u.raw_user_meta_data as meta,
        r.id as invite_role
      from comms.project_members m
      join auth.users u on lower(u.email) = lower(m.email)
      join public.organization_users ou on ou."user" = u.id and ou."organization" = v_org
      left join public.roles r
        on r.id = m.role_id
       and r.project_id = p_project_id
       and r.deleted_at is null
       and r.key is distinct from 'owner'
       and not ('*' = any (r.permissions))
      where m.project_id = p_project_id
        and m.user_id is null
        and m.status = 'invited'
        and m.email <> ''
        and m.deleted_at is null
        and not exists (
          select 1 from comms.project_members x
          where x.project_id = p_project_id
            and x.user_id = u.id
            and x.deleted_at is null
        )
        and not exists (
          select 1 from comms.role_grants g
          where g.project_id = p_project_id
            and g.user_id = u.id
        )
      order by m.id
    loop
      -- The grant is the suite-role map's alone; the invitation's role and the fallback only label the roster row.
      v_role := comms.rbac_role_for_member(p_project_id, v_invite.user_id);

      update comms.project_members
         set user_id = v_invite.user_id,
             role_id = coalesce(v_role, v_invite.invite_role, v_default),
             status = 'active',
             name = case
               when name = '' then coalesce(
                 nullif(v_invite.meta ->> 'full_name', ''),
                 nullif(v_invite.meta ->> 'name', ''),
                 split_part(email, '@', 1)
               )
               else name
             end,
             avatar_url = coalesce(avatar_url, nullif(v_invite.meta ->> 'avatar_url', '')),
             joined_at = coalesce(joined_at, now())
       where id = v_invite.member_id;

      if v_role is not null then
        insert into comms.role_grants (project_id, user_id, role_id, status)
        values (p_project_id, v_invite.user_id, v_role, 'active')
        on conflict do nothing;
      end if;

      v_count := v_count + 1;
    end loop;

    -- Same duplicate org rows: without distinct, the second copy hits comms_project_members_user_uniq.
    insert into comms.project_members (
      project_id, user_id, role_id, status, email, name, avatar_url, joined_at
    )
    select distinct on (u.id)
      p_project_id,
      u.id,
      coalesce(comms.rbac_role_for_member(p_project_id, u.id), v_default),
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
      )
      and not exists (
        select 1 from comms.project_members m
        where m.project_id = p_project_id
          and m.email <> ''
          and lower(m.email) = lower(coalesce(u.email, ''))
          and m.deleted_at is null
      );

    get diagnostics v_inserted = row_count;
    v_count := v_count + v_inserted;
  end if;

  if v_creator is not null then
    insert into comms.project_members (
      project_id, user_id, role_id, status, email, name, avatar_url, joined_at
    )
    select
      p_project_id, u.id,
      coalesce(comms.rbac_role_for_member(p_project_id, u.id), v_default),
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
      )
      and not exists (
        select 1 from comms.project_members m
        where m.project_id = p_project_id
          and m.email <> ''
          and lower(m.email) = lower(coalesce(u.email, ''))
          and m.deleted_at is null
      );
  end if;

  -- Any project member can write a roster row's user_id, so a user the suite-role map does not resolve gets no grant.
  insert into comms.role_grants (project_id, user_id, role_id, status)
  select
    p_project_id,
    m.user_id,
    comms.rbac_role_for_member(p_project_id, m.user_id),
    'active'
  from comms.project_members m
  where m.project_id = p_project_id
    and m.user_id is not null
    and m.deleted_at is null
    and not exists (
      select 1 from comms.role_grants g
      where g.project_id = p_project_id
        and g.user_id = m.user_id
    )
    and comms.rbac_role_for_member(p_project_id, m.user_id) is not null;

  return v_count;
exception
  when others then
    -- A shared-schema shape change must not take the screen down with it.
    return 0;
end;
$$;

revoke execute on function comms.sync_project_team(uuid, uuid) from public, anon;
grant execute on function comms.sync_project_team(uuid, uuid) to authenticated, service_role;

-- @down

-- Restoring the previous bodies reopens the created_by self-promotion, so it runs only on a disposable database.
do $$
begin
  if coalesce(current_setting('comms.allow_destructive_down', true), '') <> 'on' then
    raise exception 'rbac_created_by_hardening @down lets an org member become Comms Owner by rewriting projects.created_by on the shared database; set comms.allow_destructive_down=on on a disposable database';
  end if;
end;
$$;

-- The bodies, verbatim from the @up of 20261021103047_rbac_trust_hardening and 20261021103419_team_invite_claim.

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
  v_inserted integer := 0;
  v_member_role uuid;
  v_default uuid;
  v_role uuid;
  v_invite record;
begin
  if p_project_id is null then
    return 0;
  end if;

  -- The same check every project-scoped table's RLS makes: nobody syncs a project they cannot reach.
  if not comms.can_access_project(p_project_id) then
    return 0;
  end if;

  select organization_id, created_by
    into v_org, v_creator
    from public.projects
   where id = p_project_id;

  select r.id into v_member_role
    from public.roles r
   where r.project_id = p_project_id and r.key = 'member' and r.deleted_at is null
   limit 1;

  -- The caller's fallback counts only when it is a live, non-owner-grade role of this project.
  select r.id into v_default
    from public.roles r
   where r.id = p_default_role
     and r.project_id = p_project_id
     and r.deleted_at is null
     and r.key is distinct from 'owner'
     and not ('*' = any (r.permissions));
  v_default := coalesce(v_default, v_member_role);

  if v_org is not null then
    for v_invite in
      -- organization_users has no unique (organization, "user"), so one invitation can join twice.
      select distinct on (m.id)
        m.id as member_id,
        u.id as user_id,
        u.raw_user_meta_data as meta,
        r.id as invite_role
      from comms.project_members m
      join auth.users u on lower(u.email) = lower(m.email)
      join public.organization_users ou on ou."user" = u.id and ou."organization" = v_org
      left join public.roles r
        on r.id = m.role_id
       and r.project_id = p_project_id
       and r.deleted_at is null
       and r.key is distinct from 'owner'
       and not ('*' = any (r.permissions))
      where m.project_id = p_project_id
        and m.user_id is null
        and m.status = 'invited'
        and m.email <> ''
        and m.deleted_at is null
        and not exists (
          select 1 from comms.project_members x
          where x.project_id = p_project_id
            and x.user_id = u.id
            and x.deleted_at is null
        )
        and not exists (
          select 1 from comms.role_grants g
          where g.project_id = p_project_id
            and g.user_id = u.id
        )
      order by m.id
    loop
      v_role := coalesce(
        comms.rbac_role_for_member(p_project_id, v_invite.user_id),
        v_invite.invite_role,
        v_default
      );

      update comms.project_members
         set user_id = v_invite.user_id,
             role_id = v_role,
             status = 'active',
             name = case
               when name = '' then coalesce(
                 nullif(v_invite.meta ->> 'full_name', ''),
                 nullif(v_invite.meta ->> 'name', ''),
                 split_part(email, '@', 1)
               )
               else name
             end,
             avatar_url = coalesce(avatar_url, nullif(v_invite.meta ->> 'avatar_url', '')),
             joined_at = coalesce(joined_at, now())
       where id = v_invite.member_id;

      if v_role is not null then
        insert into comms.role_grants (project_id, user_id, role_id, status)
        values (p_project_id, v_invite.user_id, v_role, 'active')
        on conflict do nothing;
      end if;

      v_count := v_count + 1;
    end loop;

    -- Same duplicate org rows: without distinct, the second copy hits comms_project_members_user_uniq.
    insert into comms.project_members (
      project_id, user_id, role_id, status, email, name, avatar_url, joined_at
    )
    select distinct on (u.id)
      p_project_id,
      u.id,
      coalesce(comms.rbac_role_for_member(p_project_id, u.id), v_default),
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
      )
      and not exists (
        select 1 from comms.project_members m
        where m.project_id = p_project_id
          and m.email <> ''
          and lower(m.email) = lower(coalesce(u.email, ''))
          and m.deleted_at is null
      );

    get diagnostics v_inserted = row_count;
    v_count := v_count + v_inserted;
  end if;

  if v_creator is not null then
    insert into comms.project_members (
      project_id, user_id, role_id, status, email, name, avatar_url, joined_at
    )
    select
      p_project_id, u.id,
      coalesce(comms.rbac_role_for_member(p_project_id, u.id), v_default),
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
      )
      and not exists (
        select 1 from comms.project_members m
        where m.project_id = p_project_id
          and m.email <> ''
          and lower(m.email) = lower(coalesce(u.email, ''))
          and m.deleted_at is null
      );
  end if;

  insert into comms.role_grants (project_id, user_id, role_id, status)
  select
    p_project_id,
    m.user_id,
    coalesce(comms.rbac_role_for_member(p_project_id, m.user_id), v_default),
    'active'
  from comms.project_members m
  where m.project_id = p_project_id
    and m.user_id is not null
    and m.deleted_at is null
    and not exists (
      select 1 from comms.role_grants g
      where g.project_id = p_project_id
        and g.user_id = m.user_id
    )
    -- Unseeded roles leave nothing to grant; one unresolved member must not abort everyone else's grant.
    and coalesce(comms.rbac_role_for_member(p_project_id, m.user_id), v_default) is not null;

  return v_count;
exception
  when others then
    -- A shared-schema shape change must not take the screen down with it.
    return 0;
end;
$$;

revoke execute on function comms.sync_project_team(uuid, uuid) from public, anon;
grant execute on function comms.sync_project_team(uuid, uuid) to authenticated, service_role;
