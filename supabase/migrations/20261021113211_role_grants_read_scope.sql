-- Role grants read scope
--
-- role_grants_read was `for select to authenticated using (deleted_at is null)`, so any signed-in suite user could
-- read every project's grants (who holds which role where). Reads are now scoped to projects the caller can reach,
-- the same check every project-scoped comms table makes. Live, the client only ever reads one project's grants
-- (lib/supabase/rbac.js), and the functions that read across projects (rbac_allows, rbac_ensure_membership,
-- sync_project_team, is_project_owner, role_grant_allowed) are SECURITY DEFINER and bypass RLS, so nothing else moves.
--
-- Becomes the owner of: role_grants_read on comms.role_grants (from 20260821182908_adopt_rbac, retargeted to
--   authenticated by 20261017181523_widget_security_lockdown).
-- Depends on: comms.can_access_project(uuid) (20260821182908_adopt_rbac, narrowed by 20261021103047_rbac_trust_hardening),
--   comms.role_grants (20260821182908_adopt_rbac).

-- @up

alter table comms.role_grants enable row level security;
drop policy if exists role_grants_read on comms.role_grants;
create policy role_grants_read on comms.role_grants
  for select to authenticated
  using (deleted_at is null and comms.can_access_project(project_id));

-- @down

do $$
begin
  if coalesce(current_setting('comms.allow_destructive_down', true), '') <> 'on' then
    raise exception 'role_grants_read_scope @down lets every signed-in user read every project''s grants again on the shared database; set comms.allow_destructive_down=on on a disposable database';
  end if;
end;
$$;

-- The previous policy, verbatim from the live catalog.
drop policy if exists role_grants_read on comms.role_grants;
create policy role_grants_read on comms.role_grants
  for select to authenticated
  using (deleted_at is null);
