# Geiger Comms — Landing, Playground & Project Workspace

Date: 2026-07-05
Status: Built & verified — lint clean (0 errors), production build passes, `db:push`
seeded the `comms` schema, anon REST + `/` and `/project` return 200.

## Goal

Mirror the geiger-events `/` (marketing landing + embedded live playground) and
`/project` (resolver → workspace) structure for **geiger-comms**, an Intercom
alternative. Copy the *code/layout*, not the events data. Use `@geiger/ui` for all
UI primitives (no local `components/ui/*`). Wire Supabase (shared suite project),
`db:push` migrations, and a `comms` schema data layer.

## Auth / session model

All suite apps share ONE Supabase project + anon key on ONE origin under different
`basePath`s. `@supabase/ssr`'s default localStorage key derives from the project
ref, so a session from the dashboard is visible to comms. Replication = same `.env`
+ `basePath: '/comms'`. `getUser()` reads `supabase.auth.getSession()`.

## Decisions

- Playground depth: **Inbox hero + placeholder shells** (only Inbox is a real screen).
- Nav: **Inbox** (real), Contacts, Help Center, Reports, Settings — each with sub-items.
- Header/auth: **full port** — `getUser` + `ProfileDropdown` + `SuiteMegaMenu`.
- Persistence: **wire Supabase now** — `comms` schema, data layer, `db:push`, SQLs.
- Inbox data (AFK default): **seed ~6 demo conversations under open demo RLS** so the
  anonymous playground fetches real rows via the data layer. Org-scoped RLS deferred.
- Banner (AFK default): **dropped**. Layout = ThemeProvider → children + Toaster +
  SystemFavicon.

## Build map

1. **Config**: `next.config.mjs` (basePath `/comms`), `.env` (copy shared values),
   `package.json` (deps + `db:push`), `app/globals.css` (`@geiger/ui/tokens.css`),
   `lib/utils.js` (re-export `cn`).
2. **Supabase**: `lib/supabase/{client(schema=comms),user,activity,comms}.js`;
   `supabase/sqls/comms.sql` (conversations/messages/contacts, metadata bag,
   touch_updated_at, open demo RLS, seed rows); `scripts/run-sqls.js` (`--clean` = `comms.*`).
3. **Shell** (primitives from `@geiger/ui`): `internal/sidebar/*`, `internal/topbar/*`,
   `internal/shared/{screen_kit,screen_wrappers,segmented_tabs}`, `internal/screens/
   {coming_soon,registry,overview/filter_dropdown}`, `internal/workspace/workspace_states`.
4. **Hero**: `internal/screens/overview/inbox_overview.jsx` — StatsBar (Open · Waiting ·
   Median first response · CSAT) + message-volume line chart + two-pane inbox (list +
   reader), fetching via `listConversations()`.
5. **Marketing**: `components/{header,system-favicon,theme-provider}.jsx`,
   `components/landing/suite-mega-menu.jsx`, `components/CommsPlayground{,Showcase}.jsx`,
   `app/page.js` (comms copy), `app/layout.js`.
6. **Workspace**: `context/project-context.js`, `lib/hooks/use-workspace-url.js`,
   `lib/workspace/tabs.js`, `lib/rbac.js`, `app/project/page.js`,
   `app/project/[projectId]/[[...rest]]/page.js`.

## Out of scope (this pass)

Storage/upload, email/Resend, Stripe, notifications write path, org-scoped RLS,
real Contacts/Help Center/Reports/Settings screens.
