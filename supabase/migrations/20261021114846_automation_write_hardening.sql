-- Automation write hardening
--
-- Closes three write gaps in the automation area (docs/specs/2026-10-21-automation-engines-design.md):
--   * workflow_runs_project_scope was `for all`, but the browser only reads runs (lib/supabase/workflow_runs.js) and the
--     executor writes them as the service role (lib/automation), which bypasses RLS. Authenticated is now read-only.
--   * Any project member could write workflows (which can call webhooks), routing rules, SLA policies and shared macros.
--     Writes now need comms.settings.manage: the Automation screens check no operation key of their own, and spec
--     2026-10-18 §1.5 reuses existing keys. A teammate keeps writing their own personal macros. Reads are unchanged.
--   * metadata.automation on comms.messages marks a workflow's own message, and messages_automation and the tick trust
--     it, so a teammate could set it to keep teammate_replied from firing. Only the service role may set or change it.
--
-- Owns (new):
--   workflow_runs_project_read on comms.workflow_runs     select-only replacement for workflow_runs_project_scope
--   <table>_settings_insert / _update / _delete            restrictive write guards on comms.workflows, routing_rules,
--                                                          sla_policies and macros
--   comms.messages_automation_guard() and its trigger      BEFORE insert/update on comms.messages
-- Becomes the owner of: workflow_runs_project_scope (dropped) and authenticated's insert/update/delete/truncate on
--   comms.workflow_runs (revoked), both from 20261018184858_adopt_automation.
--
-- Depends on (owned elsewhere, all earlier versions):
--   comms.can_access_project(uuid), comms.rbac_allows(text, uuid, text, uuid)   20260821182908_adopt_rbac
--   comms.workflows, workflow_runs, routing_rules, sla_policies, macros         20261018184858_adopt_automation
--   comms.messages_automation (the AFTER INSERT enqueue that reads the marker)   20261021105041_automation_engine

-- @up

-- ---- workflow runs: read-only for authenticated --------------------------------------

alter table comms.workflow_runs enable row level security;
drop policy if exists workflow_runs_project_scope on comms.workflow_runs;
drop policy if exists workflow_runs_project_read on comms.workflow_runs;
create policy workflow_runs_project_read on comms.workflow_runs for select to authenticated
  using (comms.can_access_project(project_id));
revoke insert, update, delete, truncate on comms.workflow_runs from authenticated;

-- ---- automation config: writes need comms.settings.manage -------------------------------

drop policy if exists workflows_settings_insert on comms.workflows;
create policy workflows_settings_insert on comms.workflows as restrictive for insert to authenticated
  with check (comms.rbac_allows('comms.settings.manage', project_id));
drop policy if exists workflows_settings_update on comms.workflows;
create policy workflows_settings_update on comms.workflows as restrictive for update to authenticated
  using (comms.rbac_allows('comms.settings.manage', project_id))
  with check (comms.rbac_allows('comms.settings.manage', project_id));
drop policy if exists workflows_settings_delete on comms.workflows;
create policy workflows_settings_delete on comms.workflows as restrictive for delete to authenticated
  using (comms.rbac_allows('comms.settings.manage', project_id));

drop policy if exists routing_rules_settings_insert on comms.routing_rules;
create policy routing_rules_settings_insert on comms.routing_rules as restrictive for insert to authenticated
  with check (comms.rbac_allows('comms.settings.manage', project_id));
drop policy if exists routing_rules_settings_update on comms.routing_rules;
create policy routing_rules_settings_update on comms.routing_rules as restrictive for update to authenticated
  using (comms.rbac_allows('comms.settings.manage', project_id))
  with check (comms.rbac_allows('comms.settings.manage', project_id));
drop policy if exists routing_rules_settings_delete on comms.routing_rules;
create policy routing_rules_settings_delete on comms.routing_rules as restrictive for delete to authenticated
  using (comms.rbac_allows('comms.settings.manage', project_id));

drop policy if exists sla_policies_settings_insert on comms.sla_policies;
create policy sla_policies_settings_insert on comms.sla_policies as restrictive for insert to authenticated
  with check (comms.rbac_allows('comms.settings.manage', project_id));
drop policy if exists sla_policies_settings_update on comms.sla_policies;
create policy sla_policies_settings_update on comms.sla_policies as restrictive for update to authenticated
  using (comms.rbac_allows('comms.settings.manage', project_id))
  with check (comms.rbac_allows('comms.settings.manage', project_id));
drop policy if exists sla_policies_settings_delete on comms.sla_policies;
create policy sla_policies_settings_delete on comms.sla_policies as restrictive for delete to authenticated
  using (comms.rbac_allows('comms.settings.manage', project_id));

-- Shared macros are workspace config; a personal macro stays its creator's to write (and can't be shared without the key).
drop policy if exists macros_settings_insert on comms.macros;
create policy macros_settings_insert on comms.macros as restrictive for insert to authenticated
  with check (comms.rbac_allows('comms.settings.manage', project_id) or (scope = 'personal' and created_by = auth.uid()));
drop policy if exists macros_settings_update on comms.macros;
create policy macros_settings_update on comms.macros as restrictive for update to authenticated
  using (comms.rbac_allows('comms.settings.manage', project_id) or (scope = 'personal' and created_by = auth.uid()))
  with check (comms.rbac_allows('comms.settings.manage', project_id) or (scope = 'personal' and created_by = auth.uid()));
drop policy if exists macros_settings_delete on comms.macros;
create policy macros_settings_delete on comms.macros as restrictive for delete to authenticated
  using (comms.rbac_allows('comms.settings.manage', project_id) or (scope = 'personal' and created_by = auth.uid()));

-- ---- messages: only the service role sets metadata.automation ----------------------------

-- Anyone else's insert loses the marker and their update keeps the stored one, so a browser write can't forge or erase it.
create or replace function comms.messages_automation_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or new.metadata is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.metadata ? 'automation' then
    new.metadata := new.metadata || jsonb_build_object('automation', old.metadata -> 'automation');
  else
    new.metadata := new.metadata - 'automation';
  end if;
  return new;
end;
$$;
revoke all on function comms.messages_automation_guard() from public, anon, authenticated;

-- BEFORE, so it always runs ahead of the AFTER messages_automation enqueue; the name also sorts ahead of the other BEFORE triggers.
drop trigger if exists messages_automation_guard on comms.messages;
create trigger messages_automation_guard
before insert or update on comms.messages
for each row execute function comms.messages_automation_guard();

-- @down

-- Refuses on the shared database: it reopens run history, workflows, routing, SLA policies, shared macros and the
-- automation marker to every project member.
do $$
begin
  if coalesce(current_setting('comms.allow_destructive_down', true), '') <> 'on' then
    raise exception 'automation_write_hardening @down is destructive on the shared database; set comms.allow_destructive_down=on on a disposable database';
  end if;
end;
$$;

drop trigger if exists messages_automation_guard on comms.messages;
drop function if exists comms.messages_automation_guard();

drop policy if exists macros_settings_delete on comms.macros;
drop policy if exists macros_settings_update on comms.macros;
drop policy if exists macros_settings_insert on comms.macros;
drop policy if exists sla_policies_settings_delete on comms.sla_policies;
drop policy if exists sla_policies_settings_update on comms.sla_policies;
drop policy if exists sla_policies_settings_insert on comms.sla_policies;
drop policy if exists routing_rules_settings_delete on comms.routing_rules;
drop policy if exists routing_rules_settings_update on comms.routing_rules;
drop policy if exists routing_rules_settings_insert on comms.routing_rules;
drop policy if exists workflows_settings_delete on comms.workflows;
drop policy if exists workflows_settings_update on comms.workflows;
drop policy if exists workflows_settings_insert on comms.workflows;

-- The previous policy and grants, verbatim from the live catalog.
grant insert, update, delete, truncate on comms.workflow_runs to authenticated;
drop policy if exists workflow_runs_project_read on comms.workflow_runs;
drop policy if exists workflow_runs_project_scope on comms.workflow_runs;
create policy workflow_runs_project_scope on comms.workflow_runs for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));
