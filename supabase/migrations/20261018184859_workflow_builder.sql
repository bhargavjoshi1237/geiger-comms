-- Workflow builder
--
-- Extends comms.workflows (adopted in 20261018184858_adopt_automation) for the
-- list + canvas builder ported from geiger-events:
--   description   free text shown in the builder's settings
--   steps         canonical ordered steps [{ id, kind, type, config, position }]
--   graph         canvas layout over those steps { nodes, edges, viewport }
--   status        + 'paused' (live → paused → live without losing the draft state)
--   trigger       the Intercom-style trigger catalog in
--                 components/internal/screens/automation/workflow_catalog.js
-- `conditions` / `actions` stay the engine-facing columns; the data layer
-- derives them from `steps` on every save.

-- @up

alter table comms.workflows add column if not exists description text;
alter table comms.workflows add column if not exists steps jsonb not null default '[]'::jsonb;
alter table comms.workflows add column if not exists graph jsonb not null default '{}'::jsonb;

alter table comms.workflows drop constraint if exists workflows_status_check;
alter table comms.workflows add constraint workflows_status_check
  check (status = any (array['draft', 'live', 'paused', 'archived']));

alter table comms.workflows drop constraint if exists workflows_trigger_check;
alter table comms.workflows add constraint workflows_trigger_check
  check (trigger = any (array[
    'created', 'replied', 'teammate_replied', 'assigned', 'tagged', 'state_changed',
    'customer_unresponsive', 'teammate_unresponsive', 'ticket_created', 'ticket_state_changed'
  ]));

-- @down

-- The original checks come back NOT VALID so rows saved with a newer status or
-- trigger survive the rollback; only new writes are held to the old sets.
alter table comms.workflows drop constraint if exists workflows_trigger_check;
alter table comms.workflows add constraint workflows_trigger_check
  check (trigger = any (array['created', 'replied', 'tagged', 'state_changed'])) not valid;

alter table comms.workflows drop constraint if exists workflows_status_check;
alter table comms.workflows add constraint workflows_status_check
  check (status = any (array['draft', 'live', 'archived'])) not valid;

alter table comms.workflows drop column if exists graph;
alter table comms.workflows drop column if exists steps;
alter table comms.workflows drop column if exists description;
