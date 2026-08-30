# Spec — Messenger Widget, Public API, and SDK

> **Status:** approved for implementation, 2026-08-22.
> **Scope:** the embeddable Messenger a customer installs on their own site —
> loader script, iframe widget app, public API, auth flow, realtime delivery —
> plus the `@geiger/comms-widget` package that replaces the paste-a-script-tag
> workflow for developers.
>
> **Depends on:** `2026-08-22-inbox-design.md` (conversations, messages,
> contacts, teammates) and `2026-08-22-channels-design.md` (the `messenger`
> channel row that holds appearance config). Build both first.
>
> This is the **only** part of Geiger Comms exposed to the open internet.
> §10 (Security) is not optional polish — it is the spec.

---

## 1. Decisions

Settled with the product owner on 2026-08-22:

| Decision | Choice |
|---|---|
| Identity | **JWT signed by the customer's backend**, plus anonymous sessions |
| Anonymous visitors | **Supported**, with an anonymous → identified merge path |
| Transport | **Dedicated public API** on the Next.js app (`/api/widget/*`) |
| Rendering | **iframe** on our origin |
| Realtime | **WebSocket** |
| Widget surface | **Full Messenger** — Home, Messages, Help, News, Tickets |
| Package | **Thin loader + typed API + React bindings**, separate GitHub repo, not published to npm |

Two of these hit real constraints during research. Both are resolved below rather
than quietly reinterpreted.

### 1.1 WebSocket — resolved via Supabase Realtime, not our own socket server

Vercel shipped native WebSocket support for Functions in **public beta on
2026-06-22**. It is real, but it has two properties that break this use case:

1. **The connection closes when the Function hits its max duration.** A support
   conversation outlives a 300-second function.
2. **A connection is pinned to one Function instance, and later requests are not
   guaranteed to reach the same instance.** When an agent replies in the
   workspace, that request lands on a *different* instance than the one holding
   the visitor's socket, so the message cannot be pushed. Vercel's own guidance
   is to add Redis as a backplane.

So "WebSocket through our API" would mean building a pub/sub backplane and a
reconnection protocol to work around a platform limit.

**Use Supabase Realtime instead.** It is a genuine persistent WebSocket, it is
managed, it has no function-duration ceiling, and it needs no backplane. Use
**private Broadcast channels** (not `postgres_changes`), which are authorised per
topic against `realtime.messages` RLS using the claims in the connecting JWT.

This keeps the transport decision intact: **the API remains the only write path
and the only thing that reads tables.** Realtime carries notification payloads
only, on a channel scoped to one conversation, and the widget re-fetches through
the API. Nothing about the schema is exposed to the browser.

```
widget ──POST /api/widget/messages──► API ──► DB
                                       │
                                       └──broadcast──► realtime topic
                                                        conversation:<id>
widget ◄────── WebSocket (Supabase Realtime, private) ──────┘
```

### 1.2 Full Messenger — needs two tables that no section owns yet

Home, Messages and Tickets are satisfied by the Inbox spec. **Help** needs
articles and **News** needs posts, and neither the Knowledge Base nor the
Proactive section is built.

Rather than ship empty tabs, this spec defines a **minimal** `comms.articles` and
`comms.posts` — only the columns the Messenger reads. They are designed for the
Knowledge Base and Proactive sections to **extend** (add columns, add authoring
screens) rather than replace. Those sections own authoring; this spec owns
public read access only.

If you would rather not commit to that schema before the Knowledge Base is
designed, cut Help and News from v1 — the spaces are independent and the widget
degrades cleanly by hiding a tab. Flagged, not assumed.

---

## 2. Component map

| Piece | Lives in | Served at |
|---|---|---|
| Loader script | this repo, `app/widget/v1.js/route.js` | `https://<host>/comms/widget/v1.js` |
| Widget app (iframe) | this repo, `app/widget/page.jsx` | `https://<host>/comms/widget` |
| Public API | this repo, `app/api/widget/**` | `https://<host>/comms/api/widget/*` |
| SDK | **separate repo** `geiger-comms-widget` | `github:bhargavjoshi1237/geiger-comms-widget#<sha>` |

The app is served under the `/comms` base path in production (see `README.md`),
so **every absolute URL the loader builds must include it**. Bake the origin and
base path into the loader at serve time from an env var; never let the customer
configure a URL, and never infer it from `document.currentScript` alone.

---

## 3. Data model

One migration: `npm run db:new -- widget --template raw`.

```sql
-- An installable widget. public_id is what the customer pastes; the secret is
-- what their backend signs JWTs with and never reaches a browser.
create table if not exists comms.widget_apps (
  id               uuid primary key default gen_random_uuid(),
  public_id        text not null unique,          -- short, URL-safe, e.g. "wg_7fk2p9"
  name             text not null default 'Website',
  secret_hash      text not null,                 -- argon2/bcrypt of the signing secret
  secret_last4     text,                           -- for "sk_…a91f" display only
  allowed_origins  text[] not null default '{}',   -- exact scheme://host[:port]
  channel_id       uuid references comms.channels(id) on delete set null, -- messenger appearance
  project_id       uuid references public.projects(id) on delete cascade,
  metadata         jsonb not null default '{}'::jsonb,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- An anonymous browser. Promoted to a contact on identify.
create table if not exists comms.visitors (
  id           uuid primary key default gen_random_uuid(),
  anonymous_id text not null,                     -- opaque, generated client-side
  app_id       uuid not null references comms.widget_apps(id) on delete cascade,
  contact_id   uuid references comms.contacts(id) on delete set null,
  user_agent   text,
  last_seen_at timestamptz not null default now(),
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create unique index if not exists visitors_anon_app_idx
  on comms.visitors (anonymous_id, app_id);

-- Map a customer's own user id onto our contact.
alter table comms.contacts
  add column if not exists external_id text,
  add column if not exists app_id uuid references comms.widget_apps(id) on delete set null;
create unique index if not exists contacts_external_app_idx
  on comms.contacts (external_id, app_id) where deleted_at is null and external_id is not null;

-- Provenance on a conversation started from the widget.
alter table comms.conversations
  add column if not exists visitor_id uuid references comms.visitors(id) on delete set null,
  add column if not exists source     text not null default 'workspace'; -- workspace | widget
```

### 3.1 Minimal Help and News content (§1.2)

```sql
create table if not exists comms.articles (
  id           uuid primary key default gen_random_uuid(),
  title        text not null default '',
  slug         text,
  body         text not null default '',      -- markdown
  summary      text not null default '',
  published    boolean not null default false,
  locale       text not null default 'en',
  project_id   uuid references public.projects(id) on delete cascade,
  metadata     jsonb not null default '{}'::jsonb,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create table if not exists comms.posts (
  id           uuid primary key default gen_random_uuid(),
  title        text not null default '',
  body         text not null default '',
  published_at timestamptz,
  project_id   uuid references public.projects(id) on delete cascade,
  metadata     jsonb not null default '{}'::jsonb,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
```

Only `published = true` / `published_at is not null` rows are ever returned by
the public API.

### 3.2 RLS

Enable RLS on all new tables. **Do not add a demo-open policy to
`widget_apps`** — `secret_hash` must never be selectable by `anon`. Its only
reader is the workspace UI (via the authenticated session) and the API's
service-role client. The public API never queries these tables as `anon`.

---

## 4. Auth flow

```
 customer backend                customer page                 our origin
 ────────────────                ─────────────                 ──────────
 sign JWT (HS256, their
 secret, exp ≤ 24h)
        │
        └──── jwt ────────────►  GeigerComms('boot', {
                                   appId, jwt?, anonymousId
                                 })
                                        │
                                        │ creates iframe
                                        ▼
                                 /comms/widget?appId=…
                                        │
                                        │ postMessage handshake
                                        │ (exact origin both ways)
                                        ▼
                                 POST /api/widget/session
                                 { appId, jwt?, anonymousId }
                                        │
                                        ▼
                                 ┌──────────────────────────┐
                                 │ 1 resolve app by publicId│
                                 │ 2 Origin header ∈        │
                                 │   allowed_origins  else  │
                                 │   403                    │
                                 │ 3 jwt? verify HS256 with │
                                 │   app secret, check exp, │
                                 │   require user_id  else  │
                                 │   401                    │
                                 │ 4 identified → upsert    │
                                 │   contact by external_id │
                                 │   anonymous  → upsert    │
                                 │   visitor by anonymousId │
                                 │ 5 merge (§4.2)           │
                                 └──────────────────────────┘
                                        │
                                        ▼
                                 { sessionToken, realtimeToken,
                                   contact, config }
```

### 4.1 Tokens

- **`sessionToken`** — our own JWT, HS256, signed with a server-only secret,
  **15 minutes**, claims `{ sid, appId, contactId?, visitorId, scope: "widget" }`.
  Sent as `Authorization: Bearer` on every subsequent API call. Held **in the
  iframe's memory only**.
- **`realtimeToken`** — a JWT signed with the **Supabase project's JWT secret** so
  Realtime accepts it, used solely to open the WebSocket. Same 15-minute life.
  Claims: `{ role: "anon", visitor_id, contact_id?, app_id, exp }`. The
  authorisation claims are carried **in the token itself** — there is deliberately
  no server-side session table, so the RLS policy in §6 is a pure function of the
  JWT and needs no lookup. Revocation is handled by the short expiry, which is why
  it is 15 minutes and not hours.
- Both are refreshed by `POST /api/widget/session/refresh` before expiry. A 401
  triggers one silent re-boot; a second failure surfaces a "reconnecting" state.

The customer's JWT is verified **once**, at session creation. It is never stored
and never forwarded.

### 4.2 Anonymous → identified merge

The case that matters: a visitor chats anonymously, then signs in.

1. Boot arrives with both a `jwt` and a known `anonymousId`.
2. Resolve the contact from `jwt.user_id`.
3. Find the visitor by `(anonymousId, appId)`.
4. If `visitor.contact_id` is null, set it to the resolved contact and reassign
   every conversation with that `visitor_id` to the contact.
5. If it already points at a **different** contact, do **not** merge — start a
   fresh visitor row. Silently moving one person's history onto another account
   because they shared a browser is a privacy incident, not a feature.

Merging is one-way and idempotent. Run it inside a `comms.merge_visitor(...)`
plpgsql function so a partial merge cannot happen.

### 4.3 Storage, and why the anonymous id lives in the host page

Browsers partition third-party storage, so anything the iframe writes to
`localStorage` may be cleared or siloed and the visitor loses their history.

**The loader owns the anonymous id.** It generates a UUID on first load, stores
it in the **host page's** `localStorage` under `geiger_comms_anonymous_id`, and
passes it to the iframe on boot. The iframe keeps nothing durable — session
tokens live in memory. This sidesteps third-party cookie and storage
partitioning entirely, and it is the single most common reason embedded chat
widgets lose conversation history.

---

## 5. Public API

All routes under `app/api/widget/`. Node runtime (needs `jsonwebtoken`/`jose` and
the service-role key). Every route: validate `Origin`, validate the bearer
session token, and use a **service-role** Supabase client server-side.

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/session` | Boot. Body `{ appId, jwt?, anonymousId }` → tokens + contact + config |
| `POST` | `/session/refresh` | New tokens from a still-valid session |
| `GET` | `/config` | Appearance + enabled spaces (cacheable, no auth) |
| `GET` | `/conversations` | This contact/visitor's conversations only |
| `POST` | `/conversations` | Start one; returns the conversation |
| `GET` | `/conversations/:id/messages` | Thread, paginated. 404 if not the caller's |
| `POST` | `/conversations/:id/messages` | Send. Writes, then broadcasts (§6) |
| `POST` | `/conversations/:id/read` | Mark read |
| `GET` | `/articles?q=` | Published articles, search |
| `GET` | `/articles/:id` | One published article |
| `GET` | `/news` | Published posts |
| `GET` | `/tickets` | Caller's tickets |
| `POST` | `/events` | `trackEvent` |
| `POST` | `/upload` | Attachment upload |

**Ownership is enforced on every single row-returning route.** Derive
`contactId`/`visitorId` from the session token — **never** from a request
parameter. A route that accepts `?contactId=` is a data breach.

Responses are plain JSON view models, camelCase, containing only what the widget
renders. Never return internal ids the widget does not need (assignee ids,
teammate emails, `metadata`).

---

## 6. Realtime delivery

**Topic:** `conversation:<conversationId>`, private Broadcast.

**Publish:** after a message is written — by the widget *or* by an agent in the
workspace — the server broadcasts a small envelope to that topic:

```json
{ "type": "message.created", "conversationId": "…", "messageId": "…" }
```

The envelope deliberately carries **no message body**. The widget receives it and
re-fetches through the API, so authorisation is enforced in exactly one place.
This also means a compromised topic leaks metadata at worst, never content.

**Authorise:** an RLS policy on `realtime.messages` grants read on topic
`conversation:<id>` only when a conversation with that id has a `visitor_id` or
`contact_id` matching the corresponding claim in the connecting JWT (§4.1):

```sql
create policy widget_conversation_read on realtime.messages
for select to anon using (
  realtime.topic() like 'conversation:%'
  and exists (
    select 1 from comms.conversations c
    where c.id::text = split_part(realtime.topic(), ':', 2)
      and c.deleted_at is null
      and (
        c.visitor_id::text = (auth.jwt() ->> 'visitor_id')
        or (auth.jwt() ->> 'contact_id') is not null
           and c.contact_id::text = (auth.jwt() ->> 'contact_id')
      )
  )
);
```

Read-only: the widget never broadcasts. Only the server publishes, using the
service-role key, so there is no write policy for `anon`.

**Agent → visitor** is what makes this work: the workspace's `post_message`
function (Inbox spec §3.2) must broadcast on the same topic. Add that as part of
this spec's migration.

**Client lifecycle:** subscribe on open conversation, unsubscribe on change,
reconnect with exponential backoff (Supabase's client does this, but the widget
must still show a "reconnecting" state and re-fetch the thread on resume to close
the gap of anything missed while offline).

---

## 7. The loader — `script.js`

Served from `app/widget/v1.js/route.js` as `application/javascript`,
`Cache-Control: public, max-age=300`. **Hard budget: under 5 KB gzipped.** It is
on the critical path of somebody else's website.

Install snippet:

```html
<script>
  (function(){var w=window,g=w.GeigerComms;if(!g){g=function(){g.q.push(arguments)};
  g.q=[];w.GeigerComms=g}var s=document.createElement('script');
  s.src='https://<host>/comms/widget/v1.js';s.async=1;
  document.head.appendChild(s)})();
  GeigerComms('boot', { appId: 'wg_7fk2p9' });
</script>
```

The stub queues calls made before the script loads; the real loader drains
`GeigerComms.q` on init. This is why `boot` can be called on the line after the
tag.

Responsibilities, and nothing else:

1. Drain the queue, expose the method API (§9.1).
2. Own the anonymous id (§4.3).
3. Render the **launcher** (a button, styled from `/config`) and an unread badge.
4. Create the iframe lazily — **on first open, not on page load** — with
   `title`, `allow="clipboard-write"`, and `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`.
5. Own the postMessage bridge (§8).
6. Never touch the host page's DOM outside its own container, never define
   globals other than `GeigerComms`, never ship a CSS reset.

Loading the iframe lazily matters: the widget must cost the host page a launcher
button and ~5 KB until someone actually clicks.

---

## 8. The postMessage bridge

Both directions carry a versioned envelope, and both validate strictly.

```js
{ source: "geiger-comms", v: 1, type: "widget.ready", payload: { … } }
```

Rules, all mandatory:

- **Send** with an exact `targetOrigin`. Never `"*"`.
- **Receive**: check `event.origin` against the expected origin exactly, check
  `event.source` is the iframe's `contentWindow`, check `source === "geiger-comms"`,
  then validate the payload shape against the known type. Drop anything else
  without logging payload contents.
- Treat every inbound message as hostile input. The host page is not trusted, and
  any script on it can post to our iframe.

Message types — host → widget: `boot`, `update`, `show`, `hide`, `showSpace`,
`showArticle`, `showNews`, `showConversation`, `showNewMessage`, `shutdown`.
Widget → host: `ready`, `resize`, `unreadCount`, `open`, `close`,
`userEmailSupplied`.

---

## 9. The widget app (iframe)

`app/widget/page.jsx` — a `"use client"` React app on our origin, free to use
`@geiger/ui` and Tailwind because the iframe isolates it completely.

**Spaces** (Intercom's model, `showSpace(name)`):

| Space | Contents |
|---|---|
| `home` | Greeting, "Send us a message", recent conversation, article search box |
| `messages` | Conversation list → thread → composer |
| `help` | Article search + reader (`comms.articles`) |
| `news` | Published posts (`comms.posts`) |
| `tickets` | Caller's tickets (Inbox spec `comms.tickets`) |

Config from `/api/widget/config` decides which tabs appear; a space with no
backing content is hidden, not shown empty.

Every async surface needs loading, empty and error states. Offline/reconnecting
is a **first-class state** here in a way it is not in the workspace — the widget
runs on flaky consumer connections.

**Message rendering is an XSS boundary.** Render as plain text or through a
strict markdown renderer with HTML disabled. Never `dangerouslySetInnerHTML` on
anything that originated from a message, an article, or a post.

### 9.1 The JS API surface

Mirror Intercom's method names so their docs and habits transfer:

```
boot(settings)          update(data)        shutdown()
show()                  hide()              showSpace(name)
showMessages()          showNewMessage(text?)
showConversation(id)    showArticle(id)     showNews(id)     showTicket(id)
trackEvent(name, meta?) getVisitorId()
onShow(cb)  onHide(cb)  onUnreadCountChange(cb)  onUserEmailSupplied(cb)
```

Out of scope for v1 (they need Proactive, which does not exist):
`startTour`, `startSurvey`, `startChecklist`, `startConversation`.

---

## 10. Security requirements

This section is the acceptance bar. A failure in any item here is a release
blocker, not a bug.

1. **The signing secret never reaches a browser.** Only `public_id` is ever
   embedded in a page. Store `secret_hash`, show the secret exactly once at
   creation, support rotation with a grace period.
2. **Origin allowlist enforced on every API call**, matched exactly on
   `scheme://host[:port]`. No wildcard subdomains in v1, no suffix matching —
   `evil-acme.com` must not match `acme.com`.
3. **`Content-Security-Policy: frame-ancestors`** on the widget route, generated
   per app from `allowed_origins`, so only that customer's site can frame it.
4. **JWT verification**: HS256 with the app's secret, reject `alg: none` and any
   asymmetric alg, require `user_id`, require and enforce `exp`, reject tokens
   with a lifetime over 24h, allow ≤60s clock skew.
5. **Ownership from the token, never the request.** Every row-returning route
   filters by the session's contact/visitor.
6. **Rate limits** per app and per session on `POST /session`, message sends and
   uploads. Boot is the expensive path — it verifies a JWT and hits the DB.
7. **Upload validation**: allowlist content types, cap size, strip EXIF, serve
   from a separate origin or with `Content-Disposition: attachment`; never
   execute or inline-render an uploaded file.
8. **No enumeration.** A conversation, article or ticket id that is not the
   caller's returns **404**, never 403 — 403 confirms existence.
9. **postMessage discipline** exactly as §8.
10. **No secrets in the client bundle.** Service-role key is server-only; assert
    it is never imported into anything under `app/widget/`.

---

## 11. The SDK — `@geiger/comms-widget`

Separate GitHub repo, consumed the way the suite already consumes packages:

```json
"@geiger/comms-widget": "github:bhargavjoshi1237/geiger-comms-widget#<sha>"
```

**Not published to npm yet.** Keep `"private": true` and a `"main"`/`"module"`/
`"types"` that resolve directly from the repo, so a GitHub install works with no
build step on the consumer's side. Ship prebuilt `dist/` committed to the repo —
a GitHub dependency has no `prepare` guarantee across package managers.

### 11.1 Why this exists

Answering the actual ask — a script tag gives you a global, no types, no
lifecycle, and nothing until page load. The package gives:

- **Typed API.** Every method and settings field, so a wrong field is a compile
  error rather than a silent no-op.
- **SSR safety.** No `window` access at module scope. Importing it in a Next.js
  server component must not throw.
- **Lifecycle integration.** A React provider boots on mount, updates when the
  user changes, and shuts down on unmount — instead of a global that survives
  navigation and leaks the previous user's session.
- **Deferred loading under the app's control**, not the browser's parse order.
- **A local dev target.** `scriptUrl` / `apiBase` point at `localhost:3000` so the
  widget is developed against a local Geiger Comms with no tunnels.

### 11.2 Surface

```js
// Vanilla
import GeigerComms from "@geiger/comms-widget";
GeigerComms.boot({ appId: "wg_7fk2p9", jwt });
GeigerComms.showSpace("help");
const off = GeigerComms.onUnreadCountChange((n) => setBadge(n));

// React
import { GeigerProvider, useGeigerComms } from "@geiger/comms-widget/react";

<GeigerProvider appId="wg_7fk2p9" jwt={jwt} options={{ hideDefaultLauncher: true }}>
  <App />
</GeigerProvider>;

const { open, close, showSpace, unreadCount, isReady } = useGeigerComms();
```

`GeigerProvider` re-boots when `jwt` changes identity and shuts down on unmount.
`hideDefaultLauncher` lets the host render its own button — the common request
the moment a design system exists.

### 11.3 Repo layout

```
geiger-comms-widget/
  src/index.ts        core: queue, loader injection, method API
  src/react.tsx       GeigerProvider, useGeigerComms
  src/types.ts        settings + method types
  dist/               committed build (esm + cjs + d.ts)
  README.md           install, both usage modes, JWT signing example
```

The README must contain a **server-side JWT signing example** in Node. It is the
step customers get wrong, and getting it wrong means signing in the browser and
leaking the secret.

---

## 12. Workspace side

The `Messenger` channel screen (Channels spec §5) gains an **Install** section:

- Create/revoke widget apps; show `public_id`; show the secret **once**.
- Manage `allowed_origins` with validation that rejects a bare hostname, a path,
  or a wildcard.
- Copy-paste snippet (§7) and the SDK install command, pre-filled with the app id.
- Appearance config already lives on the messenger channel — reuse it, do not
  duplicate.
- Installation status: whether a boot has ever been seen, and last seen at.

---

## 13. Forward compatibility

| Later | Seam |
|---|---|
| **Knowledge Base** | Owns authoring on `comms.articles`; adds columns, collections, locales. The public read API stays as-is. |
| **Proactive** | Owns `comms.posts` authoring; adds tours/checklists/surveys, which unlock the four deferred JS API methods in §9.1. |
| **AI Agent** | Fin answers in the widget with no widget change — an AI reply is a message with `author_role = 'ai_agent'` (Inbox spec §8). **EU AI Act Art. 50 disclosure is a widget-side requirement**: the visitor must be told they are talking to an AI, in the thread, not in a settings page. |
| **Mobile SDKs** | The public API is transport-agnostic; iOS/Android reuse §5 and §4 unchanged. |
| **Real channels** | Widget conversations are `source = 'widget'`; other sources slot in beside it. |

---

## 14. Definition of done

- [ ] Migration with `@up`/`@down`, idempotent, schema-qualified; `db:push --dry-run` → `db:push` → `db:status` clean
- [ ] `widget_apps.secret_hash` is **not** selectable by `anon` — verify with an anon-key query
- [ ] Loader under 5 KB gzipped; iframe created on first open, not page load
- [ ] Install snippet works pasted into a plain static HTML page on a different origin
- [ ] Anonymous visitor can start a conversation; it appears in the workspace Inbox
- [ ] Agent replies in the workspace; the open widget receives it over the WebSocket without a refresh
- [ ] Sign-in merges the anonymous history; a *different* contact on the same browser does **not** merge
- [ ] Request from a non-allowlisted origin is rejected (API 403, and framing blocked by `frame-ancestors`)
- [ ] A forged/expired/`alg:none` JWT is rejected with 401
- [ ] Another visitor's conversation id returns 404, not 403
- [ ] A message containing `<img src=x onerror=alert(1)>` renders as literal text
- [ ] Session expiry mid-conversation refreshes silently with no message loss
- [ ] SDK imports without error in a Next.js server component; `GeigerProvider` boots, re-boots on identity change, shuts down on unmount
- [ ] `npx eslint <changed files>` clean

---

## Sources

[Vercel WebSocket support (public beta, 2026-06-22)](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections) ·
[WebSockets on Vercel — limits](https://ably.com/vercel/websockets-on-vercel) ·
[Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization) ·
[Supabase Broadcast & Presence Authorization](https://supabase.com/blog/supabase-realtime-broadcast-and-presence-authorization) ·
[Intercom JS API methods](https://developers.intercom.com/installing-intercom/web/methods) ·
[Intercom Messenger JWT authentication](https://www.intercom.com/help/en/articles/10589769-authenticating-users-in-the-messenger-with-json-web-tokens-jwts) ·
[Intercom identity verification](https://developers.intercom.com/installing-intercom/web/identity-verification) ·
[postMessage security guidance](https://bindbee.dev/blog/secure-cross-window-communication) ·
[iframe XSS, CSP and sandboxing](https://7asecurity.com/blog/2026/06/iframe-xss-security/)
