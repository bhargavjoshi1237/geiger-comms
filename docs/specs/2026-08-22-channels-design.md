# Spec — Channels

> **Status:** approved for implementation, 2026-08-22.
> **Scope:** the six `Channels` destinations in `sidebar_nav.jsx` — Email,
> Messenger, WhatsApp, SMS, Social, Slack — from migration to UI.
> **Depends on:** `2026-08-22-inbox-design.md`. Build the Inbox first; this spec
> adds a FK to `comms.conversations` and links into the Inbox filter.
>
> Read before starting: `MODULE_CONVENTIONS.md`, `SUPABASE_CONVENTIONS.md`,
> `MIGRATION_CONVENTIONS.md`, `crafting.md`.

---

## 1. The decision that defines this spec

**These are configuration screens with simulated connections. No real provider
integration is in scope.** No Gmail or Outlook OAuth, no Twilio, no WhatsApp
Business API, no Meta or Slack app. Nothing is ingested from any external
service, and no message ever leaves the system.

This was chosen deliberately: real ingestion needs vendor accounts, app review
and per-provider webhook endpoints, none of which exist yet.

### 1.1 The honesty requirement — non-negotiable

A connection UI that looks real but does nothing is dangerous: someone will
believe email is flowing and stop checking. Therefore:

1. Every channel row and detail header carries a **`Simulated` badge** while
   `config.simulated === true`.
2. The connect dialog states plainly, in the dialog body, that this stores
   settings only and does not connect to the provider.
3. A channel's config is stored with `simulated: true`. When real integrations
   land, that flag flips per channel and the badge disappears with no schema
   change.

Do not soften this into ambiguous copy like "Connected (demo)". The badge and the
dialog text must be unmistakable.

---

## 2. Data model

One migration: `npm run db:new -- channels --template raw`.

```sql
create table if not exists comms.channels (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,                        -- email | messenger | whatsapp | sms | social | slack
  name        text not null default '',             -- "Support inbox", "@acme on Instagram"
  status      text not null default 'disconnected', -- connected | disconnected | error
  config      jsonb not null default '{}'::jsonb,   -- per-kind shape, see §3
  project_id  uuid references public.projects(id) on delete cascade,
  metadata    jsonb not null default '{}'::jsonb,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists channels_kind_idx
  on comms.channels (project_id, kind) where deleted_at is null;

alter table comms.conversations
  add column if not exists channel_id uuid references comms.channels(id) on delete set null;

create index if not exists conversations_channel_id_idx
  on comms.conversations (channel_id) where deleted_at is null;
```

`kind` is deliberately **not** a Postgres enum — a new channel kind should be a
constant in the UI, not a migration.

A workspace may have several channels of one kind (two support addresses, three
social accounts), so screens list rows, not a singleton.

RLS enabled with a demo-open policy matching the existing `comms_*_demo_all`
pattern, plus a `touch_updated_at` trigger. `@down` drops the index, the column
and the table.

### 2.1 Relationship to `conversations.channel`

`comms.conversations.channel` is existing free text (`Chat`, `Email`, `Slack`,
`WhatsApp`, `Instagram`) read by the Overview screen's channel-mix widget.

**Keep it.** It is the display kind. `channel_id` additionally records *which
connected channel* a conversation belongs to. When a conversation is created
against a channel, set both. Never drop or rewrite the text column.

---

## 3. Per-kind config shapes

Stored in `config jsonb` — the expansion bag from `SUPABASE_CONVENTIONS.md` §6.
Promote a key to a real column only when it needs indexing or its own RLS.

| kind | config keys |
|---|---|
| `email` | `address`, `forwardingAddress`, `signature`, `replyToName`, `verified` |
| `messenger` | `launcherColor`, `greeting`, `position` (`left`\|`right`), `showAvatars`, `officeHoursNote` |
| `whatsapp` | `phoneNumber`, `displayName`, `businessAccountId` |
| `sms` | `number`, `provider`, `senderId` |
| `social` | `accounts: [{ network: "instagram"\|"facebook"\|"x", handle }]` |
| `slack` | `workspaceName`, `defaultChannel`, `notifyOnAssign` |

Every shape also carries `simulated: true` (§1.1).

Define these in `channels/constants.js` as a declarative `CHANNEL_KIND_META` map
— label, icon, blurb, and a `fields` array of `{ key, label, type, placeholder,
hint, required }`. The config form renders from that array, so adding a field is
a one-line change and all six screens stay consistent.

---

## 4. Data layer

`lib/supabase/channels.js` — same contract as the rest: guard with
`isSupabaseConfigured()` (import from `./comms`), `console.error` on failure,
return `null` / `[]` / `false`, never throw, never toast.

```js
normalizeChannel(row)   // snake -> camel, spreads config last
listChannels({ projectId })
listChannelsByKind({ projectId, kind })
getChannel(id)
createChannel(input)              // honors caller-supplied id
updateChannel(id, patch)
setChannelStatus(id, status)
softDeleteChannel(id)
countConversationsByChannel({ projectId })   // { [channelId]: n }
```

`toRow` emits a column only when its key is present in the input, so one
`updateChannel` serves both a full save and a single-field toggle.

---

## 5. Screens

All six are ordinary `SecondaryScreenWrapper` screens — narrower than a list
screen, because they are settings surfaces.

```
components/internal/screens/channels/
  constants.js               CHANNEL_KIND_META, status maps
  channel_screen.jsx         the shared screen, takes `kind`
  channel_config_form.jsx    renders from CHANNEL_KIND_META[kind].fields
  connect_dialog.jsx         create/connect, with the §1.1 disclosure
  messenger_preview.jsx      live widget preview (messenger only)
  email.jsx  messenger.jsx  whatsapp.jsx  sms.jsx  social.jsx  slack.jsx
```

The six leaf files are thin: `export const EmailScreen = () => <ChannelScreen kind="email" />`.
**Do not write six near-identical screens.**

### 5.1 Anatomy of `channel_screen.jsx`

1. `ScreenHeader` — kind label + blurb, primary action `Connect <kind>`.
2. **Connection list** — one `SectionCard` per configured channel: name, status
   via `StatusPill`, the `Simulated` badge, conversation count, and a row-actions
   `DropdownMenu` (Edit, Disconnect, Delete — destructive styling on Delete).
3. **Config form** for the selected channel — `SettingsList` / `SettingRow` /
   `Field`, rendered from `CHANNEL_KIND_META[kind].fields`. Saves through
   `updateChannel`, optimistic + `toast`.
4. **Empty state** — `EmptyState` with a Connect action when the kind has no
   channels.
5. **"View conversations"** — links to All Conversations with the channel filter
   pre-applied, using the §3.3 filter object from the Inbox spec.

Messenger additionally renders `messenger_preview.jsx`: a non-functional visual
preview of the widget reflecting `launcherColor`, `greeting` and `position`.

> **Messenger gains an Install section later.** `2026-08-22-messenger-widget-design.md`
> §12 adds widget app credentials, allowed origins and the embed snippet to this
> screen. Leave room for it below the config form, and keep the appearance config
> here as the single source — the widget reads it rather than duplicating it.

### 5.2 States

Loading (skeleton matching the card layout), empty, and error — the same three
states `crafting.md` requires of every async surface. Save buttons disable and
show a spinner while pending.

---

## 6. Registry and nav

`registry.jsx`: add the six titles to `REGISTERED` with one `case` each. Titles
must match `sidebar_nav.jsx` exactly — `"Email"`, `"Messenger"`, `"WhatsApp"`,
`"SMS"`, `"Social"`, `"Slack"`. These are **not** full-bleed; they keep the
default padded layout.

No nav changes — all six entries already exist.

---

## 7. Forward compatibility

The point of the `channels` table is that real integrations later become a
**data** change, not a rebuild.

| Later | Seam |
|---|---|
| Real ingestion | Add a webhook route that resolves a provider payload to a `channels` row, then calls the Inbox's `createConversation` + `post_message`. No schema change. |
| OAuth | Store tokens in a **separate** table with its own RLS — never in `config jsonb`, which is readable by every workspace member under the demo policy. |
| Outbound send | `post_message` gains a dispatch step keyed on `channel.kind`. |
| Brands (Settings) | `channels.metadata.brandId` links a channel to a brand without a migration. |
| AI Agent → Deployment | The Deployment screen picks which `channels` rows the agent answers on; it reads this table. |
| Reports → Channel performance | Already satisfied by `conversations.channel_id`. |

**Security note for whoever adds OAuth:** the current RLS policy is demo-open
(`using (true)`). Putting provider credentials in `config` today would expose
them to anonymous reads. Credentials must wait for scoped RLS.

---

## 8. Definition of done

- [ ] Migration has `@up` and `@down`, is idempotent and schema-qualified; `db:push --dry-run` → `db:push` → `db:status` clean
- [ ] Overview channel-mix widget still renders correctly (the `channel` text column untouched)
- [ ] All six screens render from one shared component; no duplicated screen bodies
- [ ] Every simulated channel is visibly badged, and the connect dialog says plainly that nothing connects to a provider
- [ ] Connect → configure → disconnect → delete all work and persist across reload
- [ ] "View conversations" lands on All Conversations with the channel filter applied
- [ ] Loading, empty and error states on every screen
- [ ] Semantic colour tokens only; no hardcoded hex
- [ ] `npx eslint <changed files>` clean
