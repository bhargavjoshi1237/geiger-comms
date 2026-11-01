-- Adopt project-scope RLS
--
-- Brings the lost rls_project_scope migration's policies on the core inbox and
-- team tables into the repo (ledger version 20260909210524; its policies on the
-- KB tables are in 20261021102003_adopt_knowledge_base, on the automation tables
-- in 20261018184858_adopt_automation). Live, each of these tables carries one
-- project-scoped policy and none of the demo-open ones the repo created, so a
-- database built from the repo alone still had every row readable by every
-- signed-in user. On the live database every statement is a no-op or a
-- same-definition replace.
--
-- Owns:
--   the *_project_scope policies on comms.channels, contacts, conversations,
--   conversation_reads, conversation_tags, messages, mentions, tags, teammates,
--   tickets, ticket_links, views, visitors, project_members, member_groups,
--   member_activity; the retirement of their demo-open policies
--
-- Depends on (owned elsewhere, all earlier versions):
--   comms.can_access_project(uuid)  20260821182908_adopt_rbac
--   the tables themselves           20260705072403_comms … 20260825120525_inbox_views_tickets
--   anon's table privileges are already revoked by 20261017181523_widget_security_lockdown
--
-- Child tables are scoped through their parent row: reads, tags, messages and
-- mentions through the conversation, ticket links through the ticket, visitors
-- through their widget app. Each drop/create briefly takes an ACCESS EXCLUSIVE
-- lock on its table, including the busy conversations and messages.

-- @up

alter table comms.channels enable row level security;
drop policy if exists comms_channels_demo_all on comms.channels;
drop policy if exists channels_project_scope on comms.channels;
create policy channels_project_scope on comms.channels for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.contacts enable row level security;
drop policy if exists comms_contacts_demo_all on comms.contacts;
drop policy if exists contacts_project_scope on comms.contacts;
create policy contacts_project_scope on comms.contacts for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.conversations enable row level security;
drop policy if exists comms_conversations_demo_all on comms.conversations;
drop policy if exists conversations_project_scope on comms.conversations;
create policy conversations_project_scope on comms.conversations for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.conversation_reads enable row level security;
drop policy if exists comms_conversation_reads_demo_all on comms.conversation_reads;
drop policy if exists conversation_reads_project_scope on comms.conversation_reads;
create policy conversation_reads_project_scope on comms.conversation_reads for all to authenticated
  using (exists (
    select 1 from comms.conversations c
    where c.id = conversation_reads.conversation_id and comms.can_access_project(c.project_id)
  ))
  with check (exists (
    select 1 from comms.conversations c
    where c.id = conversation_reads.conversation_id and comms.can_access_project(c.project_id)
  ));

alter table comms.conversation_tags enable row level security;
drop policy if exists comms_conversation_tags_demo_all on comms.conversation_tags;
drop policy if exists conversation_tags_project_scope on comms.conversation_tags;
create policy conversation_tags_project_scope on comms.conversation_tags for all to authenticated
  using (exists (
    select 1 from comms.conversations c
    where c.id = conversation_tags.conversation_id and comms.can_access_project(c.project_id)
  ))
  with check (exists (
    select 1 from comms.conversations c
    where c.id = conversation_tags.conversation_id and comms.can_access_project(c.project_id)
  ));

alter table comms.messages enable row level security;
drop policy if exists comms_messages_demo_all on comms.messages;
drop policy if exists messages_project_scope on comms.messages;
create policy messages_project_scope on comms.messages for all to authenticated
  using (exists (
    select 1 from comms.conversations c
    where c.id = messages.conversation_id and comms.can_access_project(c.project_id)
  ))
  with check (exists (
    select 1 from comms.conversations c
    where c.id = messages.conversation_id and comms.can_access_project(c.project_id)
  ));

alter table comms.mentions enable row level security;
drop policy if exists comms_mentions_demo_all on comms.mentions;
drop policy if exists mentions_project_scope on comms.mentions;
create policy mentions_project_scope on comms.mentions for all to authenticated
  using (exists (
    select 1 from comms.conversations c
    where c.id = mentions.conversation_id and comms.can_access_project(c.project_id)
  ))
  with check (exists (
    select 1 from comms.conversations c
    where c.id = mentions.conversation_id and comms.can_access_project(c.project_id)
  ));

alter table comms.tags enable row level security;
drop policy if exists comms_tags_demo_all on comms.tags;
drop policy if exists tags_project_scope on comms.tags;
create policy tags_project_scope on comms.tags for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.teammates enable row level security;
drop policy if exists comms_teammates_demo_all on comms.teammates;
drop policy if exists teammates_project_scope on comms.teammates;
create policy teammates_project_scope on comms.teammates for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.tickets enable row level security;
drop policy if exists comms_tickets_demo_all on comms.tickets;
drop policy if exists tickets_project_scope on comms.tickets;
create policy tickets_project_scope on comms.tickets for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.ticket_links enable row level security;
drop policy if exists comms_ticket_links_demo_all on comms.ticket_links;
drop policy if exists ticket_links_project_scope on comms.ticket_links;
create policy ticket_links_project_scope on comms.ticket_links for all to authenticated
  using (exists (
    select 1 from comms.tickets t
    where t.id = ticket_links.ticket_id and comms.can_access_project(t.project_id)
  ))
  with check (exists (
    select 1 from comms.tickets t
    where t.id = ticket_links.ticket_id and comms.can_access_project(t.project_id)
  ));

alter table comms.views enable row level security;
drop policy if exists comms_views_demo_all on comms.views;
drop policy if exists views_project_scope on comms.views;
create policy views_project_scope on comms.views for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.visitors enable row level security;
drop policy if exists comms_visitors_demo_all on comms.visitors;
drop policy if exists visitors_project_scope on comms.visitors;
create policy visitors_project_scope on comms.visitors for all to authenticated
  using (exists (
    select 1 from comms.widget_apps a
    where a.id = visitors.app_id and comms.can_access_project(a.project_id)
  ))
  with check (exists (
    select 1 from comms.widget_apps a
    where a.id = visitors.app_id and comms.can_access_project(a.project_id)
  ));

alter table comms.project_members enable row level security;
drop policy if exists project_members_demo_all on comms.project_members;
drop policy if exists project_members_project_scope on comms.project_members;
create policy project_members_project_scope on comms.project_members for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.member_groups enable row level security;
drop policy if exists member_groups_demo_all on comms.member_groups;
drop policy if exists member_groups_project_scope on comms.member_groups;
create policy member_groups_project_scope on comms.member_groups for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

alter table comms.member_activity enable row level security;
drop policy if exists member_activity_demo_all on comms.member_activity;
drop policy if exists member_activity_project_scope on comms.member_activity;
create policy member_activity_project_scope on comms.member_activity for all to authenticated
  using (comms.can_access_project(project_id)) with check (comms.can_access_project(project_id));

-- @down

-- Forget-only on purpose: these policies predate this file on the live
-- database, so rolling back drops the ledger row and nothing else.
select 1;
