-- Team invite claim
--
-- Owns comms.sync_project_team(uuid, uuid); this file supersedes the 20260825112725_rbac_team_management definition.
-- Why: a Team invite now mints a suite org invite (accepted at geiger-dash /invite/<token>). Once the invitee is an org
-- member, the old body inserted them as a second roster row, hit comms_project_members_email_uniq against their pending
-- invitation, and the exception handler silently turned the whole sync into a no-op until they opened Comms themselves.
-- Now an org member's pending invitation is converted in place (as rbac_ensure_membership does), and neither insert
-- collides with a live row that already holds the email.
-- Security (closes an escalation in the old body, which granted an unchecked p_default_role to anyone who called it):
-- callers must pass comms.can_access_project; roles resolve only through comms.rbac_role_for_member, and the invite's
-- role_id or p_default_role is used only when that mapping returns null and the role is a live, non-owner-grade role of
-- this project (key is not 'owner', no "*"), else the project's member role — the guard 20261021103047 applies to
-- invite roles in rbac_ensure_membership. A revoked grant is never re-minted, so such an invitation stays pending.
-- SECURITY DEFINER, search_path and grants are unchanged from the live function.
-- Depends on: comms.can_access_project(), comms.rbac_role_for_member() (either body: adopt_rbac/rbac_team_management or
-- 20261021103047_rbac_trust_hardening), comms.project_members, comms.role_grants, public.roles/organization_users, auth.users.

-- @up

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

-- @down

-- The previous body reopens the unchecked-default-role escalation, so it is restored only on a disposable database.
do $$ begin
  if coalesce(current_setting('comms.allow_destructive_down', true), '') <> 'on' then
    raise exception 'team_invite_claim @down restores an escalation-prone function on the shared database; set comms.allow_destructive_down=on on a disposable database';
  end if;
end $$;

-- Restores the 20260825112725 body verbatim (identical to the live catalog before this migration).
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

revoke execute on function comms.sync_project_team(uuid, uuid) from public, anon;
grant execute on function comms.sync_project_team(uuid, uuid) to authenticated, service_role;
