# Spec — Inbox

> **Status:** approved for implementation, 2026-08-22.
> **Scope:** the five `Inbox` destinations in `sidebar_nav.jsx` — Your Inbox,
> All Conversations, Mentions, Views, Tickets — from migration to UI.
> **Companion spec:** `2026-08-22-channels-design.md`. Build this one first;
> Channels depends on the `comms.channels` FK introduced here.
>
> Read before starting: `MODULE_CONVENTIONS.md`, `SUPABASE_CONVENTIONS.md`,
> `MIGRATION_CONVENTIONS.md`, `crafting.md`. This spec assumes those rules and
> only calls out where the Inbox deviates from them.

---

## 1. What already exists

**Do not rebuild these. Extend them.**

| Thing | Where | State |
|---|---|---|
| `comms` schema, `conversations` / `messages` / `contacts` | `supabase/migrations/20260705072403_comms.sql` | applied, seeded with 6 demo conversations + 15 messages on stable UUIDs |
| Conversations data layer | `lib/supabase/comms.js` | `listConversations`, `getConversation`, `createConversation`, `updateConversation`, `softDeleteConversation`, `listMessages`, `createMessage` |
| Supabase client | `lib/supabase/client.js` | already `db: { schema: "comms" }`, so `.from("conversations")` resolves to `comms.conversations`. Use `createClient()` directly; there is no separate `schemaClient()` in this repo. |
| Signed-in user | `lib/supabase/user.js` | `getUser()` → `{ id, name, email, avatar }`, 30s cache |
| Status / priority / channel lookups | `components/internal/screens/overview/constants.js` | `CONVERSATION_STATUS_MAP`, `PRIORITY_META`, `PRIORITY_WEIGHT`, `CONVERSATION_CHANNELS`, `formatRelativeTime` |
| Shared kit | `components/internal/shared/screen_kit.jsx` | `ScreenHeader`, `StatsBar`, `StatGrid`, `SectionCard`, `Toolbar`, `SearchInput`, `DataTable`, `StatusPill`, `EmptyState`, `SettingsList`, `SettingRow`, `Field`, `RollingNumber` |
| Consumer of the data layer | `components/internal/screens/overview/comms_overview.jsx` | calls `listConversations({ projectId })` and reads `contactName`, `channel`, `status`, `priority`, `assignee`, `unread`, `waitingOnUs`, `lastMessageAt`, `createdAt` |

**Hard constraint:** `normalizeConversation()` must keep returning every field the
Overview screen reads, with the same meaning. Overview must not break. Verify by
loading Overview after each migration.

### 1.1 Known drift to fix forward

Three problems in the existing schema. Fix them in **new migrations** — never
edit `20260705072403_comms.sql`, which is applied.

1. **`assignee` is free text** (`'You'`, `'Aria'`, `'Unassigned'`). *Your Inbox*
   and *Mentions* are meaningless without real identity.
2. **`comms.contacts` exists but nothing references it.** Conversations carry
   denormalised `contact_name` / `contact_email` / `contact_avatar`.
3. **`unread` is a single global boolean.** In a shared inbox, read state is
   per-agent.

Also note the original migration has no `@down` and uses
`created_by uuid references auth.users(id)`, where `MIGRATION_CONVENTIONS.md` §5
requires a plain `uuid`. New tables in this spec use the plain form. Leave the
old columns alone.

---

## 2. Data model

Four migrations, scaffolded with `npm run db:new -- <name> --template raw`, each
with `@up` and `@down`, each idempotent and schema-qualified.

### 2.1 `inbox_identity`

Real teammates, and real foreign keys from conversations.

```sql
create table if not exists comms.teammates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid,                                   -- auth user id; plain uuid, no FK
  name         text not null default '',
  email        text,
  avatar_url   text,
  availability text not null default 'available',      -- available | away | offline
  project_id   uuid references public.projects(id) on delete cascade,
  metadata     jsonb not null default '{}'::jsonb,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create unique index if not exists teammates_user_project_idx
  on comms.teammates (user_id, project_id) where deleted_at is null;

alter table comms.conversations
  add column if not exists assignee_id uuid references comms.teammates(id) on delete set null,
  add column if not exists contact_id  uuid references comms.contacts(id)  on delete set null;

create index if not exists conversations_assignee_idx
  on comms.conversations (assignee_id) where deleted_at is null;
create index if not exists conversations_contact_idx
  on comms.conversations (contact_id) where deleted_at is null;
```

Back-fill inside the same migration: insert one `teammates` row per distinct
non-empty `assignee` that is not `'Unassigned'`, then set `assignee_id`; insert
one `contacts` row per distinct `contact_email`, then set `contact_id`. Use
`on conflict do nothing` so a re-run is a no-op.

**Keep `assignee`, `contact_name`, `contact_email`, `contact_avatar` columns.**
They are deprecated, not dropped — Overview still reads them and
`MIGRATION_CONVENTIONS.md` §5 forbids dropping live columns in a feature change.
Writes go to the new FK columns; `normalizeConversation` prefers the joined row
and falls back to the legacy text.

### 2.2 `inbox_state`

Per-agent read state, mentions, tags, lifecycle timestamps, and notes.

```sql
alter table comms.conversations
  add column if not exists snoozed_until    timestamptz,
  add column if not exists closed_at        timestamptz,
  add column if not exists first_response_at timestamptz;

-- Per-agent read state. Absent row = never read.
create table if not exists comms.conversation_reads (
  conversation_id uuid not null references comms.conversations(id) on delete cascade,
  teammate_id     uuid not null references comms.teammates(id)     on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, teammate_id)
);

create table if not exists comms.mentions (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references comms.conversations(id) on delete cascade,
  message_id      uuid not null references comms.messages(id)      on delete cascade,
  teammate_id     uuid not null references comms.teammates(id)     on delete cascade,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists mentions_teammate_idx
  on comms.mentions (teammate_id, read_at, created_at desc);

create table if not exists comms.tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text not null default 'slate',
  project_id uuid references public.projects(id) on delete cascade,
  metadata   jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists tags_name_project_idx
  on comms.tags (lower(name), project_id) where deleted_at is null;

create table if not exists comms.conversation_tags (
  conversation_id uuid not null references comms.conversations(id) on delete cascade,
  tag_id          uuid not null references comms.tags(id)          on delete cascade,
  primary key (conversation_id, tag_id)
);

alter table comms.messages
  add column if not exists message_type text not null default 'comment', -- comment | note
  add column if not exists author_id    uuid references comms.teammates(id) on delete set null,
  add column if not exists attachments  jsonb not null default '[]'::jsonb,
  add column if not exists updated_at   timestamptz not null default now(),
  add column if not exists deleted_at   timestamptz;
```

`message_type = 'note'` is an internal note: never sent to the customer, rendered
differently, and excluded from `waiting_on_us` recalculation.

`author_role` stays `customer | agent` and **must also accept `'ai_agent'`** —
the AI Agent section will write messages later (§8).

### 2.3 `inbox_views_tickets`

```sql
create table if not exists comms.views (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Untitled view',
  icon       text,
  filter     jsonb not null default '{}'::jsonb,   -- see §3.3 for the shape
  sort       text not null default 'newest',
  owner_id   uuid references comms.teammates(id) on delete cascade,
  shared     boolean not null default false,
  position   integer not null default 0,
  project_id uuid references public.projects(id) on delete cascade,
  metadata   jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists comms.tickets (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references comms.conversations(id) on delete set null, -- origin thread
  type            text not null default 'customer',   -- customer | back_office | tracker
  state           text not null default 'submitted',  -- submitted | in_progress | waiting | resolved
  title           text not null default '',
  description     text not null default '',
  attributes      jsonb not null default '{}'::jsonb,
  assignee_id     uuid references comms.teammates(id) on delete set null,
  project_id      uuid references public.projects(id) on delete cascade,
  metadata        jsonb not null default '{}'::jsonb,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- A tracker ticket spans many customer conversations (one bug, many reporters).
create table if not exists comms.ticket_links (
  ticket_id       uuid not null references comms.tickets(id)        on delete cascade,
  conversation_id uuid not null references comms.conversations(id)  on delete cascade,
  primary key (ticket_id, conversation_id)
);
```

`type` is the filter that makes Back-office and Tracker tickets views rather
than screens (per `docs/sidebar-audit-2026-08.md` §4.2).

### 2.4 `inbox_realtime`

```sql
alter table comms.conversations replica identity full;
alter table comms.messages      replica identity full;
alter table comms.mentions      replica identity full;

alter publication supabase_realtime add table comms.conversations;
alter publication supabase_realtime add table comms.messages;
alter publication supabase_realtime add table comms.mentions;
```

Wrap each `alter publication` in a `do $$ ... exception when duplicate_object then null; end $$;`
block so the migration stays idempotent. `@down` drops the tables from the
publication.

### 2.5 RLS, triggers, standard columns

Every new table: `enable row level security`, a demo-open policy matching the
existing `comms_*_demo_all` pattern, and a `touch_updated_at` trigger where the
table has `updated_at`. Tightening RLS is a later, separate migration.

---

## 3. Data layer

Pure data access. Validate, `console.error("[comms.<fn>]", …)` on failure, return
`null` / `[]` / `false`. **Never throw, never toast.**

### 3.1 Files

| File | Owns |
|---|---|
| `lib/supabase/comms.js` *(extend)* | `conversations`, `messages`, `conversation_reads` |
| `lib/supabase/teammates.js` *(new)* | `teammates`, current-teammate resolution |
| `lib/supabase/views.js` *(new)* | `views` |
| `lib/supabase/tickets.js` *(new)* | `tickets`, `ticket_links` |
| `lib/supabase/tags.js` *(new)* | `tags`, `conversation_tags` |
| `lib/supabase/mentions.js` *(new)* | `mentions` |
| `lib/supabase/realtime.js` *(new)* | one shared subscription helper |

Each new file re-exports nothing; import `isSupabaseConfigured` from
`./comms` (the existing convention in this repo).

### 3.2 New / changed functions

**`comms.js`**

```js
listConversations({ projectId, filter, limit = 50, before })  // filter per §3.3
getConversation(id)                       // joins contact + assignee
assignConversation(id, teammateId|null)
snoozeConversation(id, untilISO)          // sets status 'Snoozed' + snoozed_until
closeConversation(id)                     // status 'Closed', closed_at = now()
reopenConversation(id)                    // status 'Open', clears closed_at/snoozed_until
setPriority(id, priority)
markRead(conversationId, teammateId)      // upsert conversation_reads
markUnread(conversationId, teammateId)    // delete the reads row
listThread(conversationId)                // messages, deleted_at is null, asc
createMessage({ conversationId, body, messageType, authorId, authorRole, attachments, id })
```

`createMessage` must, in the same call path, update the parent conversation:
`last_message_at = now()`, `preview = <first 140 chars>`, and
`waiting_on_us = (authorRole === 'customer')`. Set `first_response_at` on the
first `agent` message if null. Notes (`message_type = 'note'`) update **none** of
these. Do this in a `comms.post_message(...)` plpgsql function so it is atomic —
a client-side two-step will drift under Realtime.

**`teammates.js`**

```js
listTeammates({ projectId })
getCurrentTeammate({ projectId })   // getUser() -> find by (user_id, project_id) -> create if absent
setAvailability(id, availability)
```

`getCurrentTeammate` is the backbone of Your Inbox and Mentions. It returns
`null` when signed out; every screen must handle that (§5.6).

**`realtime.js`**

```js
// Returns an unsubscribe function. Never throws. No-ops when unconfigured.
subscribeTable(table, { filter, onInsert, onUpdate, onDelete })
```

Wraps `createClient().channel(...).on("postgres_changes", …)`. One channel per
subscription; the caller owns the lifecycle.

### 3.3 The filter object

One shape, used by `listConversations`, stored in `views.filter`, and encoded in
the URL. Defining it once is what makes Views a saved filter rather than a
parallel implementation.

```js
{
  status:    ["Open"],            // Open | Snoozed | Closed
  channel:   ["Email", "Chat"],
  priority:  ["Urgent"],
  assignee:  "me" | "unassigned" | "<teammateId>" | null,
  tagIds:    ["<uuid>"],
  unread:    true | null,
  search:    "refund",            // ILIKE over subject + preview
  sort:      "newest" | "oldest" | "priority"
}
```

Omitted or empty keys mean "no constraint". `assignee: "me"` resolves against the
current teammate at query time, so a shared view means the right thing for each
person.

### 3.4 Three query details that are otherwise ambiguous

**What "unread" means.** A conversation is unread for a teammate when there is no
`conversation_reads` row for `(conversation_id, teammate_id)`, **or** that row's
`last_read_at < conversations.last_message_at`. Implement it as a left join, not
by reading the deprecated global `unread` boolean:

```sql
left join comms.conversation_reads r
  on r.conversation_id = c.id and r.teammate_id = :me
where r.last_read_at is null or r.last_read_at < c.last_message_at
```

Because PostgREST cannot express that filter cleanly, expose it as a
`comms.list_conversations(p_project uuid, p_teammate uuid, p_filter jsonb, …)`
plpgsql function returning the filtered, sorted page, and have
`listConversations` call it via `.rpc()`. Keep the existing simple
`listConversations` select path for the Overview screen, which passes no filter.

**What the list selects.** The list needs contact and assignee display data
without an N+1. Select the embedded rows in one call:

```js
.select("*, contact:contacts(id,name,email,avatar_url), assignee:teammates(id,name,avatar_url)")
```

`normalizeConversation` then prefers `row.contact?.name` and falls back to the
legacy `row.contact_name`, so Overview keeps working unchanged.

**Pagination.** Keyset, not offset — a live inbox reorders constantly and offset
paging will duplicate and skip rows. `before` is the `last_message_at` of the
last row already held; the query adds `last_message_at < before` and takes
`limit`. The list pane requests the next page when scrolled near the bottom.

---

## 4. Layout: the three-pane shell

### 4.1 The full-bleed problem

`app/project/[projectId]/[[...rest]]/page.js` renders screens inside
`<main className="flex-1 overflow-y-auto p-4 md:p-8">`. A full-height three-pane
inbox cannot live inside a padded, outer-scrolling container.

**Do not cancel the padding with negative margins.** Make it a declared property
of the screen:

1. In `registry.jsx`, export `FULL_BLEED_SCREENS = new Set(["Your Inbox", "All Conversations", "Mentions"])` and `isFullBleed(title)`.
2. In `page.js`, apply `cn("flex-1 relative z-10 w-full min-w-0", isFullBleed(currentTab) ? "overflow-hidden p-0" : "overflow-y-auto p-4 md:p-8")`.

Views and Tickets are ordinary screens and keep `MainScreenWrapper`.

### 4.2 Structure

```
components/internal/screens/inbox/
  constants.js              filter options, snooze presets, ticket maps, shortcuts
  inbox_shell.jsx           three-pane frame + all shared state
  conversation_list.jsx     middle-left pane
  conversation_row.jsx      one row
  conversation_thread.jsx   centre pane
  message_bubble.jsx        one message (comment | note | ai_agent)
  composer.jsx              reply / note tabs, @mention, send
  contact_panel.jsx         right pane
  new_conversation_dialog.jsx
  your_inbox.jsx            <InboxShell preset="mine" />
  all_conversations.jsx     <InboxShell preset="all" />
  mentions.jsx              <InboxShell preset="mentions" />
  views.jsx                 MainScreenWrapper + DataTable of saved views
  tickets.jsx               MainScreenWrapper + DataTable of tickets
```

`inbox_shell.jsx` owns rows, selection, filter, realtime, and mutations. The
three panes are presentational and take props. **Your Inbox, All Conversations
and Mentions are the same component with a different starting filter** — do not
fork three copies.

```
┌──────────┬──────────────────────┬───────────┐
│ list     │ thread               │ contact   │
│ w-[380px]│ flex-1 min-w-0       │ w-[320px] │
│ shrink-0 │                      │ shrink-0  │
│ overflow │ header (shrink-0)    │ overflow  │
│ -y-auto  │ messages (flex-1,    │ -y-auto   │
│          │   overflow-y-auto)   │           │
│          │ composer (shrink-0)  │           │
└──────────┴──────────────────────┴───────────┘
```

Root is `flex h-full min-h-0`. **Every flex child that scrolls needs `min-h-0`**
or it will not shrink and the page will grow instead of the pane scrolling. This
is the single most common bug in this layout.

Below `lg`: one pane at a time — list, or thread when a conversation is open,
with a back affordance. The contact panel collapses into a toggle in the thread
header.

---

## 5. Behaviour

### 5.1 URL state

`useWorkspaceUrl` currently carries `event`, `section`, `workflow`, `venue` —
leftovers from geiger-events — and **has no conversation param**. Add:

- `conversation` → the open thread, with `openConversation(id)` / `closeConversation()`
- `view` → the active saved view, with `setView(id)`

Follow the existing `openEvent`/`closeEvent` pattern exactly, and add both to the
reset list in `setTab` and `setProject`.

### 5.2 Loading, empty, error

Three list states, per `crafting.md` §0:

- **Loading** — a three-pane skeleton mirroring the real layout pane-for-pane, so
  nothing shifts when data lands. Follow `OverviewSkeleton` in `comms_overview.jsx`.
- **Empty** (no conversations at all) — `EmptyState` + "New conversation".
- **Filtered-empty** — `EmptyState` + "Clear filters".
- **No thread selected** — a centred placeholder in the thread pane, not a blank area.
- **Read failure** (`listConversations` → `null`) — empty state plus one
  `toast.error`. Never an infinite spinner.

### 5.3 Mutations

Optimistic, then persist, then reconcile — `SUPABASE_CONVENTIONS.md` §8. Mint the
id with `crypto.randomUUID()` and pass it to `createMessage` so the optimistic row
and the DB row share a UUID.

On a falsy write: roll back local state and `toast.error`. Never leave a message
looking sent when it was not.

### 5.4 Realtime, and the reconciliation rule

Subscribe in `inbox_shell.jsx`:

- `comms.conversations` filtered by `project_id` → insert prepends, update merges in place, and a row leaving the active filter is removed.
- `comms.messages` filtered by the **open** `conversation_id` → resubscribe on selection change; always unsubscribe the previous channel.
- `comms.mentions` filtered by the current teammate → drives the Mentions badge.

**The rule that prevents the worst bug class:** every realtime handler **dedupes
by `id` against current state**. An INSERT whose id is already present is
ignored, because it is almost certainly the echo of this client's own optimistic
write. An UPDATE merges field-by-field rather than replacing the row, so a local
optimistic edit is not clobbered by a stale payload.

Clean up every subscription in the effect's return. A leaked channel per
selection change will exhaust the connection.

### 5.5 Interactions

Assign · snooze (presets: 1h, 3h, tomorrow 9am, next week, custom) · close ·
reopen · priority · tag · mark read/unread · reply · internal note · `@`-mention
a teammate (inserts a `mentions` row per mentioned teammate) · create ticket from
conversation · open contact.

Keyboard: `j`/`k` move selection, `Enter` opens, `e` closes, `a` assigns,
`s` snoozes, `/` focuses search, `Esc` clears selection. Skip handling while an
input or textarea has focus.

### 5.6 Permissions and signed-out

Gate with `roleHasPermission` from `lib/rbac.js`:

- `comms.conversation.reply` → composer disabled with a tooltip when absent
- `comms.conversation.assign` → assignee control
- `comms.conversation.close` → close/reopen

`roleHasPermission` returns `true` when no roles are configured, so screens stay
reachable by default. When `getCurrentTeammate()` returns `null` (signed out, or
Supabase unconfigured), Your Inbox and Mentions render an explanatory empty state
rather than an error, and All Conversations still lists rows.

---

## 6. Views and Tickets screens

Ordinary `MainScreenWrapper` screens — `ScreenHeader` → `StatsBar` → `Toolbar` →
`DataTable`, matching the events reference.

**Views** — list of saved views (name, filter summary, owner, shared, count).
Create/edit dialog builds a §3.3 filter object. Row click applies the view and
navigates to All Conversations with `?view=<id>`. Row actions: edit, duplicate,
share toggle, delete.

**Tickets** — `DataTable` over `comms.tickets` with a **type filter**
(`All / Customer / Back-office / Tracker`), state filter, assignee filter and
search. Row click opens the linked conversation when there is one; a tracker
ticket opens a detail showing all linked conversations. Add
`TICKET_TYPE_MAP` and `TICKET_STATE_MAP` to `inbox/constants.js` and render via
`StatusPill`.

---

## 7. Registry and nav

`registry.jsx`: add the five titles to `REGISTERED` and one `case` each. Titles
must match `sidebar_nav.jsx` **exactly** — `"Your Inbox"`, `"All Conversations"`,
`"Mentions"`, `"Views"`, `"Tickets"`. No nav changes; all five already exist.

---

## 8. Forward compatibility

Seams to leave open for later sidebar sections. Cheap now, expensive to retrofit.

| Later section | Seam to leave |
|---|---|
| **AI Agent** | `messages.author_role` accepts `'ai_agent'`; `message_type` is extensible. An AI reply is a message with a different author, not a second table. |
| **AI Performance** | `first_response_at`, `closed_at`, `conversation_reads` are the raw material for resolution rate and response time. Populate them from day one even though nothing reads them yet. |
| **Automation** (workflows, macros, SLA) | Every mutation goes through a named data-layer function, so a workflow engine can call the same functions later. Never inline a `.update()` in a component. |
| **Channels** | `conversations.channel_id` FK arrives in the Channels spec; keep the `channel` text column as the display kind. |
| **Reports / Quality & CSAT** | Do not delete rows. Soft-delete only, so historical reporting stays correct. |
| **Knowledge Gaps** | Tags on conversations are the first input to topic clustering. |

---

## 9. Definition of done

- [ ] Four migrations written with `@up` **and** `@down`, idempotent, schema-qualified; `npm run db:push -- --dry-run`, then `npm run db:push`, then `npm run db:status` clean
- [ ] Overview screen still loads and shows correct numbers after every migration
- [ ] Data-layer functions return `null` / `[]` / `false`, never throw, never toast
- [ ] Three panes scroll independently; the page itself never scrolls
- [ ] Loading, empty, filtered-empty, no-selection and read-failure states all present
- [ ] Unread is per-agent: marking read in one account does not clear the badge in another
- [ ] Two browser windows: a reply in one appears in the other without refresh
- [ ] Sending a message does **not** produce a duplicate when its realtime echo arrives
- [ ] Switching conversations rapidly leaks no subscriptions (channel count stays flat)
- [ ] Semantic colour tokens only — no hardcoded hex outside the existing chart constants
- [ ] `npx eslint <changed files>` clean
