# Geiger Comms — Codebase Feature Audit (as of 2026-10-21)

Scope: a read-only audit of `C:/Pro/geiger-comms` (Next 16.3 + Supabase, schema `comms`). Every claim cites a repo path rather than a URL. Depth scale: **DEEP** (full CRUD, persisted through `lib/supabase/*`, loading/empty states, real interactions) · **SHALLOW** (persisted but limited, or config that nothing executes) · **UI-ONLY** (renders, but data is static/demo or mutations are not persisted) · **STUB** (registered fallback `ComingSoonScreen`) · **ABSENT** (no code at all).

Codebase size: about 36k lines across screens, widget, data layer and API routes (`wc -l`). There are 24 commits in total, from 2026-07-05 to 2026-10-19.

---

## 1. What screens exist? (nav entries vs registry)

### Takeaway
The sidebar has **68 destinations**: 11 groups plus 2 top-level leaves. **24** map to a real component; the other **44 fall back to `ComingSoonScreen`**. All 68 are visible by default (`hiddenByDefault: []`). The 24 real screens cover only Overview, Inbox, Channels, Customers, Automation and three Settings pages. AI Agent, AI Performance, Knowledge Base, Proactive, Reports, Integrations, Phone and 10 of 13 Settings pages are all placeholders.

### Cited Findings
- The nav is a flat array of `{title, icon, subItems}`, and the title is the registry key. Groups: Overview (leaf), Inbox (5), Channels (6), Phone (leaf), Customers (3), Automation (6), AI Agent (9), AI Performance (5), Knowledge Base (4), Proactive (8), Reports (3), Integrations (4), Settings (13) — [sidebar_nav.jsx](components/internal/sidebar/sidebar_nav.jsx)
- `REGISTERED` contains exactly 24 titles: Overview, Your Inbox, All Conversations, Mentions, Views, Tickets, People, Companies, Segments, Workflows, Workflow Templates, Run History, Macros, Routing Rules, SLA Policies, Navigation, Teammates, Roles & Permissions, Email, Messenger, WhatsApp, SMS, Social, Slack. The `default:` case renders `ComingSoonScreen` — [registry.jsx](components/internal/screens/registry.jsx)
- **ComingSoon (44):** Phone · AI Agent: Train, Knowledge Sources, Actions & Procedures, Playground, Testing & Regression, Evaluations, Guardrails, Deployment, Versions · AI Performance: Resolutions, Topics, Recommendations, Monitors, Usage & Spend · Knowledge Base: Articles, Help Centers, Knowledge Gaps, Customer Portal · Proactive: Banners, Tooltips, Posts, Checklists, Product Tours, Surveys, Campaigns, Push Notifications · Reports: Analytics, Custom Dashboards, Quality & CSAT · Integrations: Marketplace, API & Webhooks, Data Connectors, MCP · Settings: General, Brands, Seats & Licenses, Custom Fields & Objects, Business Hours, Import & Migration, Sandbox, Audit Logs, Security & Compliance, Plans & Billing. Computed by diffing nav titles against registry `case` labels — [sidebar_nav.jsx](components/internal/sidebar/sidebar_nav.jsx), [registry.jsx](components/internal/screens/registry.jsx)
- The nav config locks Overview, Inbox, All Conversations, Settings and Navigation. `hiddenByDefault: []`, so every ComingSoon entry shows by default — [geiger-ui.config.js](geiger-ui.config.js)
- Full-bleed three-pane screens: Your Inbox, All Conversations, Mentions — [registry.jsx](components/internal/screens/registry.jsx)
- Global search is a ⌘K `CommandPalette` that fuzzy-matches **nav titles only**. It does not search conversations, contacts or articles — [topbar.jsx](components/internal/topbar/topbar.jsx)
- The topbar notifications bell reads `public.flow_notifications`, a geiger-flow suite table, not a comms notification model — [notifications_dropdown.jsx](components/internal/topbar/dialogue/notifications_dropdown.jsx)

### Inferences
- About 65% of the nav (44/68) is placeholder. The audit itself called 87 placeholders "a credibility tax" ([sidebar-audit-2026-08.md](docs/sidebar-audit-2026-08.md) §5), and the cut only reduced the count to 44.
- Audit §7 says the nav was cut to "67" destinations. The current file has 68, so one entry was likely added later or miscounted.

### Gaps
- `ComingSoonScreen` copy was not inspected for roadmap dates; none were assumed.

---

## 2. Depth rating per real screen

### Takeaway
Of the 24 real screens, about **13 are DEEP**: the inbox family, Views, Tickets, People, Workflows, Macros, Routing Rules, SLA Policies, Teammates, Roles, Navigation and Messenger. The other **5 channels are config-only, honestly labelled "Simulated"**. **Companies and Segments are partly UI-only**: Companies writes nothing, and Segments saves to `localStorage`. Several automation screens are DEEP as configuration, but **nothing in the repo executes them**, so they are SHALLOW as features.

### Cited Findings
| Screen | Rating | Evidence |
|---|---|---|
| Overview | SHALLOW (read-only, live) | `listConversations` drives KPIs (Conversations, Unread, Awaiting Reply, Resolved), an attention list (unread / waiting / urgent / unassigned / snoozed), a trend chart, channel mix, a lifecycle funnel and resolution-rate/backlog gauges. The `demo` prop is only for the landing playground — [comms_overview.jsx](components/internal/screens/overview/comms_overview.jsx), [demo_data.js](components/internal/screens/overview/demo_data.js) |
| Your Inbox / All Conversations / Mentions | DEEP | One three-pane shell with presets `mine` / all / `mentions` — [use_inbox_shell.js](components/internal/screens/inbox/use_inbox_shell.js), [your_inbox.jsx](components/internal/screens/inbox/your_inbox.jsx), [mentions.jsx](components/internal/screens/inbox/mentions.jsx) |
| Views | DEEP | create/list/update/softDelete views, shared vs private, a filter builder, live counts via `countConversations` — [views.jsx](components/internal/screens/inbox/views.jsx), [lib/supabase/views.js](lib/supabase/views.js) |
| Tickets | DEEP | Types customer/back_office/tracker; states submitted/in_progress/waiting/resolved; assignee; links to many conversations; detail editor with Classification/Resolution/Danger zone; LogoLoading and EmptyState — [tickets.jsx](components/internal/screens/inbox/tickets.jsx), [ticket_sections.jsx](components/internal/screens/inbox/ticket_sections.jsx), [constants.js](components/internal/screens/inbox/constants.js), [lib/supabase/tickets.js](lib/supabase/tickets.js) |
| People | DEEP, but with a demo fallback | create/update/softDelete contacts. **Falls back to `DEMO_PEOPLE` when the DB returns no contacts**, against repo convention — [use_customers.js](components/internal/screens/customers/use_customers.js), [people.jsx](components/internal/screens/customers/people.jsx) |
| Companies | UI-ONLY mutations over persisted reads | "No separate companies table"; derived from `contacts.company`. `handleCreate`/`handleDelete` only call `setPeople`, so nothing persists — [companies.jsx](components/internal/screens/customers/companies.jsx) lines 136-170 |
| Segments | UI-ONLY persistence | "Custom segments persist to localStorage per project (no segments table yet)" — [segments.jsx](components/internal/screens/customers/segments.jsx) |
| Workflows + builder | DEEP config / no engine | CRUD plus a React Flow canvas — [workflows.jsx](components/internal/screens/automation/workflows.jsx), [workflow_builder.jsx](components/internal/screens/automation/workflow_builder.jsx), [workflow_canvas.jsx](components/internal/screens/automation/canvas/workflow_canvas.jsx) |
| Workflow Templates | DEEP (creates a workflow) | 8 templates — [workflow_templates.jsx](components/internal/screens/automation/workflow_templates.jsx), [workflow_catalog.js](components/internal/screens/automation/workflow_catalog.js) |
| Run History | SHALLOW (read-only) | `listWorkflowRuns` is read-only; rows are "written by the engine", but no engine exists in the repo — [run_history.jsx](components/internal/screens/automation/run_history.jsx), [workflow_runs.js](lib/supabase/workflow_runs.js) |
| Macros | DEEP config / not usable in inbox | CRUD, team/personal scope, `{{tokens}}`, actions, preview. **No inbox file references macros** — [macros.jsx](components/internal/screens/automation/macros.jsx), [macro_detail.jsx](components/internal/screens/automation/macro_detail.jsx), grep of `components/internal/screens/inbox` |
| Routing Rules | DEEP config / explicitly off | Banner: "Auto-assignment isn't switched on yet … new conversations aren't assigned automatically yet" — [routing_rules.jsx](components/internal/screens/automation/routing_rules.jsx) lines 391-395 |
| SLA Policies | DEEP config / engine only in the live DB | CRUD, reorder, business-hours picker, live usage from `conversations.sla_state` — [sla_policies.jsx](components/internal/screens/automation/sla_policies.jsx), [lib/supabase/sla_policies.js](lib/supabase/sla_policies.js) |
| Teammates | DEEP (except invite email) | Members/Invitations/Groups/Activity tabs, roles, groups. "No mail is actually sent yet" — [team_members.jsx](components/internal/screens/settings/team_members.jsx), [use_team.js](components/internal/screens/settings/team/use_team.js) line 346 |
| Roles & Permissions | DEEP | Custom roles CRUD, permission matrix, coverage, scoped grants — [roles_permissions.jsx](components/internal/screens/settings/roles_permissions.jsx), [use_roles.js](components/internal/screens/settings/roles/use_roles.js), [geiger-rbac.config.js](geiger-rbac.config.js) |
| Navigation | DEEP | Per-user sidebar curation persisted to `public.user_nav_prefs` — [navigation_settings.jsx](components/internal/screens/settings/navigation_settings.jsx), [nav-visibility-context.js](context/nav-visibility-context.js), [nav_prefs.js](lib/supabase/nav_prefs.js) |
| Messenger (channel) | DEEP (live) | Appearance config, launcher preview, Install section with widget apps — [channel_screen.jsx](components/internal/screens/channels/channel_screen.jsx), [install_section.jsx](components/internal/screens/channels/install_section.jsx) |
| Email / WhatsApp / SMS / Social / Slack | SHALLOW (config-only, "Simulated") | — [channels/constants.js](components/internal/screens/channels/constants.js) |

### Inferences
- The strongest surfaces are the agent inbox, tickets/views, Messenger and team/RBAC. Automation looks complete in the UI, but in the repo it is configuration without execution.

### Gaps
- Live-DB triggers from the lost September migrations (§12) may execute some SLA or routing logic. I could not verify this without DB access, which was out of scope.

---

## 3. Inbox capabilities (exists vs missing)

### Takeaway
The inbox is a **solid Intercom-style agent workspace**. It has a realtime three-pane UI, per-agent unread, assignment, snooze presets plus custom snooze, close/reopen, priority, tags, internal notes with @mentions, tickets of three types, saved views, j/k/e/a/s keyboard shortcuts and filter/sort/search. It **lacks** macros in the composer, agent-side attachments, emoji, any AI (copilot, summarize, AI drafts), SLA timers in the list or thread, bulk actions, merge, side conversations, spam handling, snooze auto-wake, typing indicators and full-text search. An uncommitted visual redesign of 20 files is in progress.

### Cited Findings
- **Presets:** `mine` (assignee=me, status Open), all (Open), `mentions` (mentioned=true) — [use_inbox_shell.js](components/internal/screens/inbox/use_inbox_shell.js) lines 63-69
- **Filter dimensions:** status[], channel[], priority[], channelId, assignee, tagIds[], unread, search, sort. They are mirrored server-side by `comms.filter_conversations`, `list_conversations` and `count_conversations` — [inbox/constants.js](components/internal/screens/inbox/constants.js) lines 87-99, [20261017181329_inbox_conversation_filters.sql](supabase/migrations/20261017181329_inbox_conversation_filters.sql)
- **Search** is an ILIKE over `subject` + `preview` only. There is no message-body or full-text search — [20261017181329_inbox_conversation_filters.sql](supabase/migrations/20261017181329_inbox_conversation_filters.sql) lines 19, 98-141
- **Handlers:** assign, snooze, close, reopen, priority, toggle read/unread, toggle/create tag, send reply/note, create conversation (find-or-create contact), create ticket and link it. All are optimistic with rollback and toasts — [use_inbox_shell.js](components/internal/screens/inbox/use_inbox_shell.js) lines 604-930
- **Realtime:** Supabase Realtime subscriptions on `conversations`, `messages` (open thread) and `mentions`, with dedupe-by-id and field merges — [use_inbox_shell.js](components/internal/screens/inbox/use_inbox_shell.js) lines 428-554, [lib/supabase/realtime.js](lib/supabase/realtime.js), [20260825120526_inbox_realtime.sql](supabase/migrations/20260825120526_inbox_realtime.sql)
- **Notes and @mentions:** the composer has Reply/Note tabs, note mode tints amber, and @-autocomplete works in notes. Saving a note creates `comms.mentions` rows. Cmd/Ctrl+Enter sends — [composer.jsx](components/internal/screens/inbox/composer.jsx), [use_inbox_shell.js](components/internal/screens/inbox/use_inbox_shell.js) lines 815-826, [mentions.js](lib/supabase/mentions.js)
- **Keyboard:** j/k/↑/↓ move, Enter opens, e closes/reopens, a assigns, s snoozes, / focuses search, Esc clears — [use_inbox_shell.js](components/internal/screens/inbox/use_inbox_shell.js) lines 941-1024
- **Snooze** presets plus a custom datetime dialog — [constants.js](components/internal/screens/inbox/constants.js) `SNOOZE_PRESETS`, [custom_snooze_dialog.jsx](components/internal/screens/inbox/custom_snooze_dialog.jsx). `snoozeConversation` only sets status/snoozed_until — [comms.js](lib/supabase/comms.js) lines 414-420. The repo has no cron/pg_cron job, and `post_message` does not reopen on a customer reply (it only sets `waiting_on_us`/`first_response_at`) — [20261017181523_widget_security_lockdown.sql](supabase/migrations/20261017181523_widget_security_lockdown.sql)
- **Contact panel:** Status, Assignee, Priority, Tags, Channel, Started, linked Ticket and a profile link — [contact_panel.jsx](components/internal/screens/inbox/contact_panel.jsx)
- **Thread "more" menu:** only Mark read/unread and Create ticket — [conversation_thread.jsx](components/internal/screens/inbox/conversation_thread.jsx) lines 377-388
- **Message types** rendered: comment | note | ai_agent (violet "AI Agent" bubble). Attachments render, but agent messages are sent with `attachments: []` — [message_bubble.jsx](components/internal/screens/inbox/message_bubble.jsx), [use_inbox_shell.js](components/internal/screens/inbox/use_inbox_shell.js) line 774
- **Missing (no match in `components/internal/screens/inbox/*`):** macro, emoji, AI/copilot/summarize, SLA, bulk, merge, spam, side conversation, forward, typing/presence. Grep sweeps — [components/internal/screens/inbox/](components/internal/screens/inbox/)
- **Permissions** are enforced in UI: `comms.conversation.reply/assign/close` — [use_inbox_shell.js](components/internal/screens/inbox/use_inbox_shell.js) lines 49-54, [geiger-rbac.config.js](geiger-rbac.config.js)
- **Ticket types** are customer, back-office and tracker; a tracker spans many conversations via `ticket_links`. There are no custom ticket attributes — [inbox/constants.js](components/internal/screens/inbox/constants.js) lines 175-213, [20260825120525_inbox_views_tickets.sql](supabase/migrations/20260825120525_inbox_views_tickets.sql)
- **Uncommitted work:** 20 modified files, +1301/−751, mostly an inbox UI redesign (channel glyphs, day dividers, elapsed-time formatting) — `git diff --stat`, [inbox/constants.js](components/internal/screens/inbox/constants.js) diff

### Inferences
- An agent replying to an **email/WhatsApp/SMS/Slack** conversation only stores a message. No outbound dispatch exists (§5), so replies reach customers only for Messenger conversations.
- Macros are built but not wired into the composer. This is the single cheapest high-value gap.

### Gaps
- Whether a live-DB trigger un-snoozes conversations or applies SLA (lost migrations `sla_engine`, `ticket_states`) cannot be confirmed from the repo.

---

## 4. Messenger / widget, install and public API

### Takeaway
The Messenger is the **most production-grade part of the product**. It has a loader script, an iframe app, an Intercom-like JS API, JWT identity verification with an anonymous→identified merge, exact-origin allowlists plus CSP frame-ancestors, secret rotation with a 24h grace period, rate limiting, hardened attachments, realtime delivery, post-chat CSAT, offline lead capture, and Home/Messages/Help/News/Tickets spaces. Help, News and Tickets appear only when content exists. **No authoring screens exist for articles or posts**, the Ask/AI space is dormant because no assistant is ever configured, and the proactive message card is not mounted.

### Cited Findings
- **Spaces:** Home, Ask, Messages, Help, News, Tickets — [widget_app.jsx](components/widget/widget_app.jsx) lines 12-17. Home and Messages are core. Help, News and Tickets show only when enabled **and** a content probe finds rows — [widget_app.jsx](components/widget/widget_app.jsx) lines 78-84. The server config returns only `spaces: { home: true, messages: true }` and **no `assistant`**, so Ask always redirects to a new message — [lib/widget/apps.js](lib/widget/apps.js) lines 85-92, [widget_app.jsx](components/widget/widget_app.jsx) lines 86-90
- **Customization:** `launcherColor` (hex-validated), `greeting` (≤200 chars), `position` left/right, `showAvatars`, `officeHoursNote` (≤300) — [lib/widget/apps.js](lib/widget/apps.js), [channels/constants.js](components/internal/screens/channels/constants.js). The client accepts logoUrl, team avatars and teamOnline, but the server never sends them — [widget_app.jsx](components/widget/widget_app.jsx) lines 57-76
- **JS API:** boot, shutdown, update, show, hide, showSpace, showNewMessage, showConversation, showArticle, showNews, trackEvent, onShow, onHide, onUnreadCountChange — [lib/widget/loader.js](lib/widget/loader.js), [components/widget/bridge.js](components/widget/bridge.js). The loader is served at `/comms/widget/v1.js` — [app/widget/v1.js/route.js](app/widget/v1.js/route.js)
- **Identity verification:** the customer backend signs a JWT, verified once at boot. After that a 15-min HS256 session token plus a Supabase realtime token are used. `alg:none`, forged or expired tokens get 401 — [lib/widget/jwt.js](lib/widget/jwt.js), [lib/widget/session.js](lib/widget/session.js), [app/api/widget/session/route.js](app/api/widget/session/route.js). Anonymous→identified merge goes through `comms.merge_visitor` — [lib/widget/data.js](lib/widget/data.js), [20260821225308_widget.sql](supabase/migrations/20260821225308_widget.sql)
- **Install section:** create widget app (public id `wg_…`), exact-origin allowlist, one-time signing-secret reveal, rotate secret (the old one verifies for 24h), copy snippet, `npm install` SDK command and React `<GeigerProvider appId jwt>` usage. The SDK repo is "to be pinned once the geiger-comms-widget repo is pushed" — [install_section.jsx](components/internal/screens/channels/install_section.jsx), [app/api/widget-apps/[id]/route.js](app/api/widget-apps/[id]/route.js)
- **Public API routes:** session, session/refresh, config (CORS), conversations GET/POST, conversations/:id/messages GET/POST, :id/read, :id/rating (CSAT 1-5 + comment), tickets, articles (search plus `popular`), articles/:id, news, ask, quick-actions, events (trackEvent), leads (offline email capture), orders (the "Which order?" picker), upload — [app/api/widget/](app/api/widget/)
- **Security hardening:** anon privileges revoked across the `comms` schema, demo policies narrowed to `authenticated`, notes never broadcast, `widget_list_conversations` excludes notes — [20261017181523_widget_security_lockdown.sql](supabase/migrations/20261017181523_widget_security_lockdown.sql). Uploads are magic-byte verified, capped at 10 MB, EXIF/XMP stripped and stored as octet-stream — [app/api/widget/upload/route.js](app/api/widget/upload/route.js), [lib/widget/strip_metadata.js](lib/widget/strip_metadata.js). CSP frame-ancestors per app — [proxy.js](proxy.js). Rate limiting is in-memory and per-instance ("a shared store must replace the Map for hard limits") — [lib/widget/ratelimit.js](lib/widget/ratelimit.js)
- **CSAT** is stored at `conversations.metadata.rating = {score, comment, at}` — [lib/widget/data.js](lib/widget/data.js) line 271. No workspace screen reads it (no "rating" match in `components/internal`)
- **Ask route:** "NOT an AI answer: no model is involved" — an ILIKE article search returning `generatedByAi:false` — [app/api/widget/ask/route.js](app/api/widget/ask/route.js)
- **Proactive card:** "not mounted until the Proactive section supplies real messages" — [components/widget/proactive.jsx](components/widget/proactive.jsx)
- **In-workspace test launcher** boots the real widget for the active project — [widget_test_launcher.jsx](components/internal/widget/widget_test_launcher.jsx), [app/project/[projectId]/[[...rest]]/page.js](app/project/[projectId]/[[...rest]]/page.js)
- Widget composer: single attachment, images and PDF, no emoji picker — [components/widget/composer.jsx](components/widget/composer.jsx)

### Inferences
- The widget's Help and News spaces draw on live `articles` (20 rows) and `posts`, but those rows can only be authored outside the product (seeded via lost migrations). The help center has a reader and no editor.
- There are no mobile SDKs, and the React SDK package is not yet published.

### Gaps
- `comms.leads` and `comms.orders` are read and written by routes, but **no repo migration creates them**. Whether they exist live is unverified (§12).

---

## 5. Channels

### Takeaway
**Only Messenger is live.** Email, WhatsApp, SMS, Social (Instagram/Facebook/X) and Slack are **configuration screens with simulated connections**, deliberately labelled so. There is no inbound ingestion, outbound send, OAuth or webhook for any of them. Phone has no screen at all.

### Cited Findings
- Spec decision: "These are configuration screens with simulated connections. No real provider integration is in scope. No Gmail or Outlook OAuth, no Twilio, no WhatsApp Business API, no Meta or Slack app" — [2026-08-22-channels-design.md](docs/specs/2026-08-22-channels-design.md) §1
- Per-kind blurbs: Email "Simulated — no email is received or sent"; WhatsApp, SMS, Social and Slack say the same. Email "Verified" is "a manual marker — no ownership check runs" — [channels/constants.js](components/internal/screens/channels/constants.js)
- `isSimulatedKind(kind)` is true for every kind except those in `LIVE_CHANNEL_KINDS` — [lib/supabase/channels.js](lib/supabase/channels.js) line 14. A data-only migration flipped messenger rows to `simulated:false` — [20261017181734_messenger_channels_live.sql](supabase/migrations/20261017181734_messenger_channels_live.sql)
- Channel CRUD, connect/disconnect, a conversation count per channel and a "view conversations" deep link into the inbox filter — [channel_screen.jsx](components/internal/screens/channels/channel_screen.jsx), [lib/supabase/channels.js](lib/supabase/channels.js)
- The only API routes are `app/api/widget/*` and `app/api/widget-apps/*`. No email/SMS/WhatsApp/Slack webhook routes exist — [app/api/](app/api/)
- Phone is ComingSoon — [registry.jsx](components/internal/screens/registry.jsx)

### Inferences
- In practice Geiger Comms is single-channel (web chat) today. Email, the most basic helpdesk channel and something every competitor (Front, Help Scout, Zendesk, Plain) has, is absent as a working channel.

### Gaps
- None. The spec and code agree.

---

## 6. AI (agent, copilot, summarization, drafts)

### Takeaway
**AI is ABSENT.** No model is called anywhere. `@anthropic-ai/sdk` is in `package.json` but imported nowhere. Only seams exist: an `ai_agent` author role, a dormant Ask space gated on `assistantName`, an "AI agent answers first" workflow action and template, and a draft BYO-provider spec. All 9 AI Agent and 5 AI Performance destinations are ComingSoon.

### Cited Findings
- `"@anthropic-ai/sdk": "^0.124.0"` is a dependency — [package.json](package.json). Grepping app/lib/components/scripts for `@anthropic-ai`, `openai`, `@ai-sdk`, `generateText`, `streamText` and `embedding` returns **no matches** — [app/](app/), [lib/](lib/), [components/](components/)
- Seams: `authorRole: customer | agent | ai_agent` — [lib/supabase/comms.js](lib/supabase/comms.js) line 78. AI bubble styling — [message_bubble.jsx](components/internal/screens/inbox/message_bubble.jsx). The widget Ask space with an `AiBadge` only when `generatedByAi === true` — [components/widget/ask_space.jsx](components/widget/ask_space.jsx)
- Workflow action `ai_answer` ("The AI agent replies first…") and the template "AI agent answers first" — [workflow_catalog.js](components/internal/screens/automation/workflow_catalog.js) lines 361, 584-591
- The KB + AI Providers spec is a **"draft for review"** (2026-10-18): BYO model providers only, no platform key, a port of the geiger-grey adapter, `lib/ai/*`, `/api/kb/assist`, a knowledge index and Knowledge Gaps. **`lib/ai/` does not exist** — [2026-10-18-knowledge-base-and-ai-providers-design.md](docs/specs/2026-10-18-knowledge-base-and-ai-providers-design.md) header, §1.1, §14; directory listing of [lib/](lib/)
- The live DB has empty AI tables from lost migrations: `knowledge_sources`, `knowledge_chunks` (vector(1536), 0 rows), `topics`, `conversation_topics`, `recommendations`, `ai_outcomes`, `agent_versions` (all 0 rows) — [KB spec §1.2, §2, §2.1](docs/specs/2026-10-18-knowledge-base-and-ai-providers-design.md)
- EU AI Act Art. 50 disclosure is planned under Guardrails (ComingSoon). The widget already refuses to label non-AI answers as AI — [sidebar_nav.jsx](components/internal/sidebar/sidebar_nav.jsx) comments, [app/api/widget/ask/route.js](app/api/widget/ask/route.js)

### Inferences
- Against Intercom (Fin), Zendesk AI agents, Plain, Pylon and Front Copilot, the AI column is empty: no agent, copilot, summaries, AI drafts, auto-tagging or AI QA. For an "Intercom clone" this is the largest gap.

### Gaps
- No timeline for the KB/AI spec, which waits on §17 open questions and an RBAC hardening prerequisite (§1.7).

---

## 7. Automation / workflows

### Takeaway
The Automation UI is broad and polished: a workflow list plus a canvas builder with 10 triggers, 8 conditions and about 17 actions, 8 templates, Run History, Macros, Routing Rules and SLA Policies. **No workflow, routing or SLA execution engine exists in the repo.** Workflows are a linear trigger→conditions→actions chain with no real branching. Routing auto-assign is explicitly "not switched on yet", and SLA due dates depend on lost live-DB functions fed by mis-shaped business-hours seeds.

### Cited Findings
- **Triggers (10):** New conversation, Customer replies, Teammate replies, Conversation assigned, Tag added, State changes, Customer unresponsive (wait N), Teammate unresponsive (wait N), Ticket created, Ticket state changes — [workflow_catalog.js](components/internal/screens/automation/workflow_catalog.js) lines 36-130, DB check constraint in [20261018184859_workflow_builder.sql](supabase/migrations/20261018184859_workflow_builder.sql)
- **Conditions (8):** channel, priority, has tag, state, **office hours inside/outside**, assignment, message contains, contact attribute — [workflow_catalog.js](components/internal/screens/automation/workflow_catalog.js) lines 136-230
- **Actions:** Send reply, Add note, Assign (round robin / balanced / direct), Add/Remove tag, Set priority, Snooze, Close, **Apply SLA**, Convert to ticket (3 types), **Send CSAT survey**, **Let the AI agent answer**, Wait, **Send webhook** (POST/GET/PUT), Update contact — [workflow_catalog.js](components/internal/screens/automation/workflow_catalog.js) lines 233-395
- **Linear model:** "a trigger feeding ordered condition/action steps". `rulesFromSteps` flattens them into `conditions{}` + `actions[]` "for the engine". `graph.js` lays steps out in one column — [lib/supabase/workflows.js](lib/supabase/workflows.js), [lib/workflows/graph.js](lib/workflows/graph.js)
- **No engine:** `workflow_runs` is "read-only here … written by the engine" — [workflow_runs.js](lib/supabase/workflow_runs.js) line 1. The adopt migration says "The engines that read these tables (comms.assign_next, the conversations_apply_sla trigger, comms.sla_due_at) are not adopted here" — [20261018184858_adopt_automation.sql](supabase/migrations/20261018184858_adopt_automation.sql) header. No repo code executes workflow steps (grep for run/execute/insert into workflow_runs)
- **Status lifecycle:** draft / live / paused / archived — [20261018184859_workflow_builder.sql](supabase/migrations/20261018184859_workflow_builder.sql)
- **Templates (8):** Auto-assign new conversations, Out-of-office reply, Escalate urgent conversations, Bug reports to a tracker, Nudge unresponsive customers, Reassign when a teammate goes quiet, CSAT survey after close, AI agent answers first — [workflow_catalog.js](components/internal/screens/automation/workflow_catalog.js) lines 481-595
- **Macros:** body with `{{contact.name|email|company|plan}}`, `{{teammate.name}}`, `{{conversation.subject}}`, `{{ticket.title}}`; actions assign, tag add/remove, set priority, snooze, close, reopen, set ticket state; personal/team scope; usage_count — [automation/constants.js](components/internal/screens/automation/constants.js) lines 102-127, [lib/supabase/macros.js](lib/supabase/macros.js)
- **Routing:** strategies round_robin | load | direct; match on channel/priority/tags; team_id, fallback_assignee; ordered; shows teammate availability. **"Auto-assignment isn't switched on yet"** — [routing_rules.js](lib/supabase/routing_rules.js), [routing_rules.jsx](components/internal/screens/automation/routing_rules.jsx) lines 391-395
- **SLA:** first-response, next-response and resolution minutes, scope, business_hours_id, ordered. Usage counts on_track/approaching/breached/paused from `conversations.sla_state` — [lib/supabase/sla_policies.js](lib/supabase/sla_policies.js). The seeded business-hours schedule shape is wrong, so "live SLA due dates land in 2030" and `sla_state` is stuck at `on_track` — project memory `business-hours-seed-format.md` (noted 2026-10-19)
- **Business hours:** read-only lookup; "editing belongs to Settings → Business Hours" (ComingSoon) — [lib/supabase/business_hours.js](lib/supabase/business_hours.js)

### Inferences
- Compared with Intercom Workflows (branching, bots, a live engine), Zendesk triggers/automations or Front rules, Geiger has the authoring surface of a workflow product but none of the runtime. In the repo, "live" workflows do nothing.

### Gaps
- The live DB may hold a lost `assign_next`/SLA trigger engine. The routing screen's own banner suggests auto-assign is off regardless.

---

## 8. Help center / KB, outbound, news

### Takeaway
**Knowledge Base authoring is ABSENT** (Articles, Help Centers, Knowledge Gaps, Customer Portal are all ComingSoon). The widget can still *read* articles and posts that exist in the live DB. The **Proactive suite (8 destinations) is entirely ABSENT**, with only an unmounted widget card and a CSAT-after-close template. Post-chat CSAT exists in the widget.

### Cited Findings
- KB nav entries are ComingSoon — [registry.jsx](components/internal/screens/registry.jsx). The spec for them is a draft — [2026-10-18-knowledge-base-and-ai-providers-design.md](docs/specs/2026-10-18-knowledge-base-and-ai-providers-design.md)
- The live DB holds `articles` (20 rows), `help_centers` (2), `help_center_articles` (20), `brands` (4), created by lost migrations — [KB spec §2](docs/specs/2026-10-18-knowledge-base-and-ai-providers-design.md)
- Widget Help space: search plus a reader over published articles, rendered through the XSS-safe `MarkdownView`. "Popular" ordering falls back to most-recent because `comms.article_views` does not exist — [help_space.jsx](components/widget/help_space.jsx), [lib/widget/data.js](lib/widget/data.js) lines 393-406, [KB spec §2.1 #5](docs/specs/2026-10-18-knowledge-base-and-ai-providers-design.md)
- Widget News space reads published `comms.posts` — [news_space.jsx](components/widget/news_space.jsx), [app/api/widget/news/route.js](app/api/widget/news/route.js), table in [20260821225308_widget.sql](supabase/migrations/20260821225308_widget.sql)
- Proactive (Banners, Tooltips, Posts, Checklists, Product Tours, Surveys, Campaigns, Push) is all ComingSoon. The audit decided "Proactive stays in full" for the Intercom buyer — [sidebar-audit-2026-08.md](docs/sidebar-audit-2026-08.md) §7, [components/widget/proactive.jsx](components/widget/proactive.jsx)
- Offline lead capture (email + message) when the team is away — [offline_message.jsx](components/widget/offline_message.jsx), [app/api/widget/leads/route.js](app/api/widget/leads/route.js)

### Inferences
- With no help-center site (the spec says "no website is served yet", §10.1) and no article editor, self-serve exists only inside the widget, over pre-seeded content.

### Gaps
- A lost "outbound" migration is in the ledger (memory `lost-september-migrations.md`). Which outbound tables exist live is unknown.

---

## 9. Customers (people, companies, segments)

### Takeaway
**People is real**: persisted contacts, a detail page with Overview/Timeline/Conversations/Tickets/Notes & tasks/Attributes tabs, and a unified timeline. It shows **demo data when the DB returns no contacts**. Companies are a derived lens with unpersisted create/delete. Segments are a rule builder saved to localStorage. There are no custom attributes/objects, CRM sync, imports or event-based segmentation.

### Cited Findings
- `comms.contacts` is the hub. "Companies are derived from the contact's company field (there is no separate companies table); segments are saved filters over people" — [lib/supabase/customers.js](lib/supabase/customers.js) header
- Demo fallback: `setPeople(rows || DEMO_PEOPLE); setDemo(!rows)` — [use_customers.js](components/internal/screens/customers/use_customers.js) lines 34-37
- Person detail tabs: Overview, Timeline, Conversations, Tickets, Notes & tasks, Attributes; sections Contact points, Subscription — [person_sections.jsx](components/internal/screens/customers/person_sections.jsx)
- Segment rule fields: lifecycle stage, tag, company, location, email subscription, created; operators is / is_not / contains / within_days. Built-in segments include VIP, created in last 7 days, trial, opted out — [customers/constants.js](components/internal/screens/customers/constants.js) lines 294-343
- Widget `trackEvent` stores small flat event metadata on the visitor row. No People UI consumes it — [app/api/widget/events/route.js](app/api/widget/events/route.js), [lib/widget/data.js](lib/widget/data.js) `appendVisitorEvent`
- "Custom Fields & Objects" and "Import & Migration" are ComingSoon — [registry.jsx](components/internal/screens/registry.jsx)

### Inferences
- The unified timeline that the audit called a "structural differentiator" exists in a basic form, aggregating conversations, tickets and notes per person.

### Gaps
- None material.

---

## 10. Reporting / analytics / QA

### Takeaway
Reporting is limited to the **Overview dashboard**: volume, unread, awaiting reply, resolved, trend, channel mix, funnel and resolution-rate gauge, computed client-side from conversations. **Analytics, Custom Dashboards and Quality & CSAT are ComingSoon.** There are no response-time, SLA-compliance, team-performance, CSAT or QA reports.

### Cited Findings
- Overview KPIs and widgets — [comms_overview.jsx](components/internal/screens/overview/comms_overview.jsx) lines 84-146, 202-234, [lifecycle_funnel_widget.jsx](components/internal/screens/overview/lifecycle_funnel_widget.jsx), [conversations_trend_widget.jsx](components/internal/screens/overview/conversations_trend_widget.jsx), [channel_mix_widget.jsx](components/internal/screens/overview/channel_mix_widget.jsx)
- `first_response_at`/`closed_at` are populated ("raw material for resolution rate and response time … nothing reads them yet") — [2026-08-22-inbox-design.md](docs/specs/2026-08-22-inbox-design.md) §8, [20260825120524_inbox_state.sql](supabase/migrations/20260825120524_inbox_state.sql)
- Charts use recharts via the shadcn/`@geiger/ui` chart wrappers — [package.json](package.json), project memory `charts-use-shadcn.md`

### Inferences
- The data for FRT/TTR exists, but no reports use it.

### Gaps
- A lost `metrics` migration exists live, contents unknown.

---

## 11. Settings, admin, security, billing, integrations, API/webhooks, import/export, audit, SSO

### Takeaway
Admin is limited to **Teammates** (no real invite email, no availability control), **Roles & Permissions** (custom roles plus a matrix and conversation-scoped grants) and **Navigation**. General, Brands, Seats, Custom Fields, Business Hours, Import, Sandbox, Audit Logs, Security & Compliance and Plans & Billing are ComingSoon. **Integrations, webhooks, a public REST API, MCP, import/export, SSO/SAML and billing are ABSENT.** Audit is limited to a Team "Activity" feed. A documented RBAC weakness lets any authenticated suite user self-promote.

### Cited Findings
- **Permission catalog (10 keys):** comms.conversation.reply/assign/close, contact.edit, article.publish, team.invite, team.assign, role.manage, billing.manage, settings.manage. System roles: owner, admin, manager, member, viewer. Some permissions are scoped by conversation — [geiger-rbac.config.js](geiger-rbac.config.js), [lib/rbac.js](lib/rbac.js)
- **Teammates:** Members / Invitations / Groups / Activity tabs — [team_members.jsx](components/internal/screens/settings/team_members.jsx). "No mail is actually sent yet", though the toast says "Invitation sent" — [use_team.js](components/internal/screens/settings/team/use_team.js) lines 343-346. `setAvailability` exists in the data layer but **no UI calls it** — [lib/supabase/teammates.js](lib/supabase/teammates.js) line 161, grep across components
- **Activity feed** (`member_activity`, "append-only audit feed") records only team and role changes — [lib/supabase/team.js](lib/supabase/team.js), [use_roles.js](components/internal/screens/settings/roles/use_roles.js). A full `audit_log`/`audit_write` exists only live, un-adopted — [20261018184858_adopt_automation.sql](supabase/migrations/20261018184858_adopt_automation.sql) header
- **Auth** is the shared suite Supabase session (`getUser()` reads `supabase.auth.getSession()`), with no comms-specific SSO/SAML. The `input-otp` dependency is unused in comms code — [2026-07-05-comms-landing-playground-design.md](docs/specs/2026-07-05-comms-landing-playground-design.md) "Auth / session model", [lib/supabase/user.js](lib/supabase/user.js), grep for InputOTP (no hits)
- **Security weakness:** "any authenticated suite user can promote themselves … can obtain `comms.settings.manage` and `comms.article.publish`". The fix (`rbac_trust_hardening`) is a pending prerequisite. Comms `roles_write` is still `using (true)` — [KB spec §1.7](docs/specs/2026-10-18-knowledge-base-and-ai-providers-design.md)
- The only server APIs are the widget public API and the widget-apps admin API. There are no webhooks-out (except the unexecuted "Send webhook" workflow action), no REST API for conversations/contacts, and no Marketplace — [app/api/](app/api/), [workflow_catalog.js](components/internal/screens/automation/workflow_catalog.js)
- No billing code (no stripe/invoice matches outside nav/topic labels) — grep across [app/](app/), [lib/](lib/), [components/](components/)

### Inferences
- Enterprise checkboxes common to Zendesk, Intercom and Front (SSO, audit log, data residency, HIPAA, sandbox, multi-brand) are all unbuilt.

### Gaps
- None in the repo. Live `brands` (4 rows) and `platform` tables exist from lost migrations but are unused by code.

---

## 12. Data layer and migrations (incl. schema drift)

### Takeaway
There are **22 `lib/supabase/*` modules** and **17 repo migrations**. The live DB is ahead of the repo by **25 lost migrations** (2026-09-09/10). Five automation tables have been re-adopted. Code still touches several objects with no repo migration: `business_hours`, `conversations.sla_policy_id`/`sla_state`, `leads`, `orders`, and the non-existent `article_views`. Suite tables `public.user_nav_prefs` and `public.flow_notifications` are owned elsewhere.

### Cited Findings
- **Data-layer modules:** activity, business_hours (read-only), channels, client, comms (conversations/messages/contacts/reads + RPCs list/count/mark_read/post_message), customers, macros, mentions, nav_prefs, rbac, realtime, routing_rules, sla_policies, tags, team, teammates, tickets, user, views, widget_apps, workflow_runs (read-only), workflows — [lib/supabase/](lib/supabase/). Server-side widget layer (service role): [lib/widget/](lib/widget/) (data, session, jwt, apps, origins, ratelimit, attachments, strip_metadata, secrets, loader…)
- **Repo migrations and what they own:**
  - `20260705072403_comms` — contacts, conversations, messages (no @down)
  - `20260821182908_adopt_rbac` — public.roles, comms.role_grants, can_access_project, rbac_allows, rbac_ensure_membership
  - `20260821220650_channels` — channels
  - `20260821225308_widget` — widget_apps, visitors, articles, posts, tickets, merge_visitor, post_message
  - `20260822051915_widget_upload` + `20260822194709_…attachments` — comms-widget bucket, post_message attachments
  - `20260825112725_rbac_team_management` — project_members, member_groups, member_activity, sync_project_team
  - `20260825120523_inbox_identity` — teammates
  - `20260825120524_inbox_state` — conversation_reads, mentions, tags, conversation_tags, snoozed_until/closed_at/first_response_at
  - `20260825120525_inbox_views_tickets` — views, ticket_links, tickets.assignee_id
  - `20260825120526_inbox_realtime` — publication
  - `20260830191104_drop_stale_post_message_overload`
  - `20261017181329_inbox_conversation_filters` — filter/list/count functions
  - `20261017181523_widget_security_lockdown`
  - `20261017181734_messenger_channels_live` — data-only
  - `20261018184858_adopt_automation` — workflows, workflow_runs, macros, routing_rules, sla_policies
  - `20261018184859_workflow_builder` — steps/graph/description
  - Sources: [supabase/migrations/](supabase/migrations/)
- **Lost migrations** (ledger `no file`): business_hours, custom_fields, sla_policies, audit_log, macros, channel_events, routing_rules, workflows, audit_triggers_backfill, sla_engine, routing_assign_hours, articles_authoring, help_centers, brands, rls_project_scope, metrics, ai_agent, outbound, measure_aux, quality, platform, message_search, ticket_states, platform_aux. Live has "~50 tables the repo never defines" with project-scoped RLS — project memory `lost-september-migrations.md`, [KB spec §1.2](docs/specs/2026-10-18-knowledge-base-and-ai-providers-design.md), [20261018184858_adopt_automation.sql](supabase/migrations/20261018184858_adopt_automation.sql) header
- **Code → table refs with no repo migration** (no match in `supabase/migrations/*.sql`):
  - `comms.business_hours` — [lib/supabase/business_hours.js](lib/supabase/business_hours.js)
  - `conversations.sla_policy_id`, `sla_state` — [lib/supabase/sla_policies.js](lib/supabase/sla_policies.js)
  - `comms.leads` — [app/api/widget/leads/route.js](app/api/widget/leads/route.js)
  - `comms.orders` — [lib/widget/data.js](lib/widget/data.js) line 508
  - `comms.article_views` (absent live too) — [lib/widget/data.js](lib/widget/data.js) line 406
  - `public.user_nav_prefs` (owned by geiger-dash) — [nav_prefs.js](lib/supabase/nav_prefs.js)
  - `public.flow_notifications` (geiger-flow) — [notifications_dropdown.jsx](components/internal/topbar/dialogue/notifications_dropdown.jsx)
  - Live-only functions `assign_next`, `conversations_apply_sla`, `sla_due_at`, `is_team_open`, `audit_write` — [20261018184858_adopt_automation.sql](supabase/migrations/20261018184858_adopt_automation.sql)
- The seed tree holds only `supabase/seeds/projects/geiger_notes_ebcc7910.sql`. The `db:seed:inbox` script points to `scripts/seed-inbox.js`, **which does not exist** — [package.json](package.json), [scripts/](scripts/)
- Several tables still carry demo-open policies, narrowed from `anon, authenticated` to `authenticated` only — [20261017181523_widget_security_lockdown.sql](supabase/migrations/20261017181523_widget_security_lockdown.sql)

### Inferences
- A fresh environment built from the repo would lack business hours, SLA columns/engine, leads, orders and all KB/AI tables. The Customers, Help and SLA surfaces would degrade.

### Gaps
- Live existence of `leads`/`orders` is unverified (DB access was out of scope).

---

## 13. Planned vs built (sidebar audit §5/§7, specs)

### Takeaway
Of the audit's **§5 v1 list** (31 named items, though the doc headlines "24"), about **15 are built**, some partially, **5 are partial or simulated**, and **11 are missing**. The missing ones are every AI and KB item, Reports, General, Custom Fields/"Channels & Data Model" and Billing. Among v2 items, only WhatsApp/SMS (simulated config) and fragments of CSAT and audit exist. The three 2026-08-22 specs are largely delivered; the 2026-10-18 KB/AI spec is unstarted.

### Cited Findings
- §5 v1 list — [sidebar-audit-2026-08.md](docs/sidebar-audit-2026-08.md) lines 255-269. Status per item:
  - **Built:** Overview; Your Inbox; All Conversations; Views; Tickets; Chat (= Messenger, live); People (demo fallback); Unified Timeline (folded into People detail per §7); Navigation; Teammates (no invite mail, no availability); Roles & Permissions
  - **Built as config, no engine in repo:** Workflows; Macros (not in composer); SLA Policies (engine lost/buggy); Routing (auto-assign off)
  - **Partial or simulated:** Email (simulated); Social (simulated); Slack & Teams (Slack simulated; Teams dropped in §7); Companies (unpersisted mutations); Segments (localStorage)
  - **Missing (ComingSoon):** Knowledge Sources; Train; Playground; AI Performance; Articles; Help Centers; Analytics; Custom Dashboards; General; Channels & Data Model (→ Custom Fields & Objects); Plans & Billing
  - Sources: [registry.jsx](components/internal/screens/registry.jsx), §2-§11 above
- §5 v2 — [sidebar-audit-2026-08.md](docs/sidebar-audit-2026-08.md) lines 271-276. Status:
  - **Partial:** WhatsApp and SMS (simulated config); Surveys/CSAT (widget post-chat rating only, unreported); Audit Logs (Team Activity feed only); Integrations (only the widget API exists)
  - **Missing:** Guardrails incl. AI disclosure; Testing & Regression; Evaluations; Versions; Knowledge-gap detection; Customer Portal; Import & migration
- §7 "Absorbed" items: AI disclosure → Guardrails (missing); data residency → Security & Compliance (missing); agent availability/work modes → Teammates (data-layer only, no UI); resolution verification → Resolutions (missing). Global search → command palette, nav-only — [sidebar-audit-2026-08.md](docs/sidebar-audit-2026-08.md) lines 350-357, [topbar.jsx](components/internal/topbar/topbar.jsx)
- Spec status:
  - Inbox spec (approved 2026-08-22): delivered — [2026-08-22-inbox-design.md](docs/specs/2026-08-22-inbox-design.md)
  - Channels spec (simulated by design): delivered — [2026-08-22-channels-design.md](docs/specs/2026-08-22-channels-design.md)
  - Messenger spec: delivered except the external `@geiger/comms-widget` SDK repo ("pin … once pushed") and the Proactive JS methods — [2026-08-22-messenger-widget-design.md](docs/specs/2026-08-22-messenger-widget-design.md), [install_section.jsx](components/internal/screens/channels/install_section.jsx)
  - KB + AI Providers spec: "draft for review", Phases 0-5 unstarted — [2026-10-18-knowledge-base-and-ai-providers-design.md](docs/specs/2026-10-18-knowledge-base-and-ai-providers-design.md) §14

### Inferences
- Execution has tracked the audit's v1 ordering for Inbox, Channels, Customers and Automation. The AI and KB lane, which the audit called "our best structural bet", has not started.

### Gaps
- Audit item #12 (agent capacity/workload limits) and the §3 "Resolution definition & verification" item have no code and no spec.

---

## 14. Momentum (git)

### Takeaway
Work comes in bursts: Inbox at end of August, Customers in early September, then a **five-week commit gap (2026-09-12 → 10-18)** that overlaps the lost-migration episode. October brought widget lockdown, inbox filters, Messenger live and the workflow builder. A 20-file inbox redesign is uncommitted.

### Cited Findings
- 24 commits in total. Key ones:
  - 2026-07-28: switch to `@geiger/orm`; sidebar expanded to the "full competitor feature set"
  - 2026-08-14: user-curated nav
  - 2026-08-31: `35159a7` inbox identity/state/views/realtime
  - 2026-09-02/03: channels and screen refactors
  - 2026-09-07: `751fde4` Customers
  - 2026-09-12: perf (prerendered shell), SuiteHeader
  - 2026-10-18: `6538206` widget API lockdown, inbox filters, Messenger live
  - 2026-10-19: `85eb1b7` workflow automation
  - Source: `git log --oneline -60`, `git log --format='%ci %s'`
- `git status`: 20 modified files (inbox composer/list/thread/contact panel redesign; customers, settings and widget touch-ups), no untracked files — `git status --porcelain --untracked-files=all`, `git diff --stat`

### Inferences
- The lost migrations (Sep 9-10) suggest a larger body of work (KB, AI, metrics, quality, outbound, audit) was built against the DB in September and never committed. Some UI for it may have been lost too.

### Gaps
- No branch other than master was inspected for unmerged work.

---

## 15. Mapping onto the support operation cycle

### Takeaway
Comms is **strong in the middle of the cycle** (intake via Messenger → triage → handling → collaboration). It is **thin or absent at both ends**: setup/channels, self-serve/AI, resolution/SLA enforcement, follow-up/CSAT reporting, proactive outbound, reporting/QA and admin/billing.

### Cited Findings (stage → status → evidence)
- **Setup/onboarding** — PARTIAL: project resolver, widget install section and in-workspace widget test launcher. No General settings, onboarding checklist or import — [install_section.jsx](components/internal/screens/channels/install_section.jsx), [widget_test_launcher.jsx](components/internal/widget/widget_test_launcher.jsx), [registry.jsx](components/internal/screens/registry.jsx)
- **Channel config** — SHALLOW: 6 channel screens, only Messenger live — [channels/constants.js](components/internal/screens/channels/constants.js)
- **Intake** — Messenger DEEP; email/WhatsApp/SMS/social/Slack/phone ABSENT as working channels; offline lead capture present — [app/api/widget/](app/api/widget/), [offline_message.jsx](components/widget/offline_message.jsx)
- **Self-serve** — PARTIAL/ABSENT: widget Help reader over pre-seeded articles; Ask is keyword search; no AI agent, help-center site or portal — [help_space.jsx](components/widget/help_space.jsx), [app/api/widget/ask/route.js](app/api/widget/ask/route.js)
- **Triage/routing/assignment** — PARTIAL: manual assign, views, filters, priority, tags; routing rules configured but auto-assign off; no skills or capacity — [routing_rules.jsx](components/internal/screens/automation/routing_rules.jsx)
- **Handling** — DEEP inbox, but no macros in composer, agent attachments, AI assist, bulk actions or merge — §3
- **Collaboration** — DEEP-ish: internal notes, @mentions with a realtime Mentions queue and sidebar badge; no side conversations or collision detection — [composer.jsx](components/internal/screens/inbox/composer.jsx), [use_mention_badge.js](components/internal/sidebar/use_mention_badge.js)
- **Resolution/SLA** — SHALLOW: close/reopen, tickets with resolution; SLA policies configured but the engine lives only in the DB and is mis-seeded; no SLA timers in the inbox — §7
- **Follow-up (CSAT/surveys)** — MINIMAL: widget post-chat 5-star rating stored in conversation metadata; not reported; Surveys ComingSoon — [rating.jsx](components/widget/rating.jsx), [lib/widget/data.js](lib/widget/data.js)
- **Proactive outbound** — ABSENT: News space reads posts; no authoring, banners, tours, checklists, push or campaigns — §8
- **Customer data** — PARTIAL: People DEEP (demo fallback), Companies derived, Segments local-only; no custom attributes, CRM sync or event data — §9
- **Reporting/QA** — SHALLOW: Overview only; no Analytics, CSAT, QA or response-time reports — §10
- **Admin/security/billing** — PARTIAL: Teammates, Roles, Navigation; no SSO, audit log screen, billing, integrations, API/webhooks or data residency; known RBAC self-promotion hole — §11

### Inferences
- In a feature matrix against Intercom, Zendesk, Front, Help Scout, Plain and Pylon, Comms would score credibly on the shared inbox, tickets (Intercom-style three types), Messenger security and RBAC. It would score near zero on AI, help center authoring, email/omnichannel, reporting, proactive, integrations and enterprise admin.

### Gaps
- No runtime verification was done (no dev server, no DB, per constraints). Ratings reflect code paths, not observed behaviour.
