-- Role grants owner guard
--
-- role_grants_assign let any comms.team.assign holder (a Manager) grant or revoke an owner-grade role, or pair a grant
-- with another project's role, which rbac_allows() honours. Live has no cross-project grants.
--
-- Becomes the owner of: role_grants_assign on comms.role_grants (from 20260825112725_rbac_team_management).
-- Owns (new): comms.role_grant_allowed(uuid, uuid).
-- Depends on: comms.can_access_project/is_project_owner (20261021103047_rbac_trust_hardening), comms.rbac_allows and
-- comms.role_grants (20260821182908_adopt_rbac), public.roles (suite).
--
-- Behaviour change:
--   * Owner-grade is key 'owner' or a "*" permission, rbac_ensure_membership's guard; only a project owner moves a grant to or from one.
--   * A grant's role must belong to the grant's project, on both the existing and the new row.
--   * Assigners must reach the project (comms.can_access_project), as comms_roles_write requires.
--   * The SECURITY DEFINER join, sync and invite-claim functions run as the table owner and are unaffected.

-- @up

-- Definer so it reads public.roles past the suite's shared read policies, soft-deleted roles included (their grants stay revocable).
create or replace function comms.role_grant_allowed(p_project uuid, p_role uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.roles r
     where r.id = p_role
       and r.project_id = p_project
       and (
         (r.key is distinct from 'owner' and not '*' = any (r.permissions))
         or comms.is_project_owner(p_project)
       )
  );
$$;
revoke all on function comms.role_grant_allowed(uuid, uuid) from public, anon;
grant execute on function comms.role_grant_allowed(uuid, uuid) to authenticated, service_role;

drop policy if exists role_grants_assign on comms.role_grants;
create policy role_grants_assign on comms.role_grants
  for all to authenticated
  using (
    comms.can_access_project(project_id)
    and comms.rbac_allows('comms.team.assign', project_id)
    and comms.role_grant_allowed(project_id, role_id)
  )
  with check (
    comms.can_access_project(project_id)
    and comms.rbac_allows('comms.team.assign', project_id)
    and comms.role_grant_allowed(project_id, role_id)
  );

-- @down

do $$
begin
  if coalesce(current_setting('comms.allow_destructive_down', true), '') <> 'on' then
    raise exception 'role_grants_owner_guard @down lets a Manager grant the Owner role again on the shared database; set comms.allow_destructive_down=on on a disposable database';
  end if;
end;
$$;

-- The previous policy, verbatim from the live catalog (created by 20260825112725_rbac_team_management).
drop policy if exists role_grants_assign on comms.role_grants;
create policy role_grants_assign on comms.role_grants
  for all to authenticated
  using (comms.rbac_allows('comms.team.assign', project_id))
  with check (comms.rbac_allows('comms.team.assign', project_id));

drop function if exists comms.role_grant_allowed(uuid, uuid);
