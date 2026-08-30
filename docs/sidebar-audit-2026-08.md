# Sidebar Audit — Market Gaps and What Not To Build

> **Dated 2026-08-22.** Third pass on the competitive picture, and the first one
> pointed *at our own nav* rather than at the market. It builds on
> `research-findings.md` (pricing/gating, mid-2026) and
> `competitor-feature-inventory.md` (12-vendor feature census, 2026-07-28) —
> read those first for the per-vendor detail; this doc does not repeat it.
>
> Two things this pass adds: (1) the market delta since the July census, which is
> larger than a month usually produces, and (2) a verdict on each of the **89
> destinations** currently in `sidebar_nav.jsx`.

---

## 0. The headline

**The nav is a map of the market, not a plan for a product.** It has 14 top-level
sections and **89 destinations**, of which **2 are built** (`Overview`,
`Navigation`) and 87 render `ComingSoon`. Every entry in it is defensible in
isolation — it was derived honestly from a 12-vendor census — but the census
answered "what does this category contain?", and nobody has since answered
"what is *this* product?"

Three separate problems are tangled together in that list:

1. **Wrong product.** Whole sections belong to a different buyer, a different
   Geiger app, or a vendor we should integrate rather than become (Voice & IVR,
   Proactive, Workforce Management, Community Forum, Health Scores).
2. **Wrong altitude.** ~20 entries are settings, filters, tabs, or ticket
   *types* that have been promoted to top-level destinations. A sidebar entry is
   a promise of a screen; `Text-to-Speech` and `Spam` are not screens.
3. **Wrong order.** The AI-agent lifecycle (Evaluations, Versions, Guardrails)
   is correctly modelled and genuinely differentiating — but it cannot ship
   before an agent exists that has answered one message.

The recommendation is a cut to **24 destinations for v1**, with a phased path
back to ~45. The remaining ~44 are either deliberate nevers or belong elsewhere
in the suite. Detail in §4–§6.

**Do the restructure now.** `geiger-rbac.config.js` derives a permission key from
each top-level nav *title* (`navPermissionKey`), and those keys are persisted
against roles in the database. Renaming or removing a section after roles are
stored means a data migration to rewrite role rows. Right now almost nothing is
stored — the cost of this restructure will never be lower than it is today.

---

## 1. What changed since the July census

Four weeks, and the two largest vendors both restructured their product around
outcomes. This is not noise.

### 1.1 Zendesk "Relate 2026" — the Autonomous Service Workforce

Zendesk repositioned the whole suite around a **Resolution Platform** and shipped:

| Announced | What it is |
|---|---|
| **Resolution Platform** / **Resolution Learning Loop** | resolution — not ticket — as the unit of work; human corrections feed back into the agent |
| **Agent Builder** | no-code AI agent authoring, multilingual + multi-brand |
| **Voice AI Agents** | AI agents on the voice channel, not just chat/email |
| **AI Agents for Employee Service** | internal HR/IT support as a first-class product line |
| **Agent Copilot / Admin Copilot / Knowledge Copilot / Analyst Copilot** | copilot specialised per *role*, all embedded, none a destination |
| **Quality Score** | AI scoring of AI |
| **Zendesk MCP Client** *and* **MCP Server** | both directions — consume tools, and expose Zendesk as a tool |
| **Outcome-based billing** | "customers only pay for resolutions that are verified end-to-end, with spam and routine exchanges excluded", verified by an independent evaluation model |

Zendesk also now resells **Forethought AI agents** as an add-on, and shipped
**AI-based predictive routing** (assign to the agent predicted to resolve
fastest) plus a QA **Coaching dashboard** and multi-tier root causes.

The billing line matters more than it looks: *verified* resolution means there is
now a **dispute-and-verification surface** in the product. "Usage & Spend" as a
single screen under AI Performance does not cover it.

### 1.2 Intercom / Fin — standalone, certified, multi-mode

`fin.ai` now leads with **Apex 1.0** and **Apex Flash** (own models), **Fin
Voice**, and three modes — **Fin for Service / Sales / Ecommerce** — plus **Fin
Operator** for back-office. Channels listed: **Voice, Chat, Email, Slack,
Social**. Note **Slack as a first-class channel**, which our Channels group does
not have.

The compliance list is the tell: **SOC2, ISO 27001, ISO 27701, HIPAA, ISO 42001,
AIUC-1**, plus **US / EU / Australia data residency**. ISO 42001 (AI management
systems) and AIUC-1 are new to this list since July — AI governance has become a
sales artifact, not a back-office concern.

### 1.3 The AI-native entrants the July census missed

These weren't in the 12-vendor list and they define where the category is going:

- **Sierra** — "Agent OS": agents across chat, voice, SMS, WhatsApp, email **and
  ChatGPT**; hybrid generative + deterministic execution (rules win on refund
  math); brand-voice tuning. $150M ARR by Feb 2026, ~$15B valuation May 2026.
- **Decagon** — agents built on **Agent Operating Procedures** (policies in plain
  language), **AI Agent Studio**, **Watchtower** (continuous QA), **Voice of the
  Customer** analytics, and **A/B testing + simulation** of agent versions.
- **Pylon** — B2B wedge: **Slack Connect and Microsoft Teams shared channels** as
  the primary support surface, messages auto-becoming tickets, plus account
  intelligence. This is the segment our suite's own customers most resemble.
- **Chatwoot** — the open-source floor. Notable for two things we lack in nav:
  **agent capacity / scheduling** and IP blocklisting.

Convergent signal across all four: **authoring → simulation → guardrails →
observability → scoring** is the shape of the AI product now. Our `AI Agent` and
`AI Performance` sections already model this correctly. That was a good call and
it should survive the cut.

### 1.4 Regulation stopped being hypothetical

**EU AI Act Article 50 transparency obligations took effect 2 August 2026** — 20
days ago. Deployers must clearly inform a person when they are interacting with
an AI system. The final Commission guidelines explicitly reject burying it in
terms of service, generic labels like "assistant", or metadata alone. Systems
predating 2 Aug 2026 have until **2 December 2026**; anything new must comply
immediately. Exposure is up to **€15M or 3% of worldwide turnover**.

We ship an AI agent that talks to end customers. There is no disclosure surface
in the nav, and `Guardrails` is about escalation, not disclosure. This is the
single most time-sensitive gap in this document.

---

## 2. The standard offering, restated

`competitor-feature-inventory.md` §3 remains accurate for Tiers A–D and is not
repeated. Three amendments from this pass:

- **Promote to Tier A (universal):** AI agent authoring + a playground, MCP
  (both directions), predictive/AI-assisted routing, AI-disclosure controls.
- **Promote to Tier B (common, gated):** conversation-level QA scoring of AI,
  knowledge-gap detection, data residency selection, agent capacity limits.
- **New Tier D (rare / differentiating):** Slack & Teams shared-channel support
  (Pylon), ChatGPT as a delivery channel (Sierra), verified-resolution billing
  with a dispute surface (Zendesk), plain-language agent policy authoring
  (Decagon AOPs, Gladly Guides, Fin Train).

---

## 3. What we're missing — ranked

Ordered by "how much it hurts to not have it".

| # | Gap | Why it matters | Where it goes |
|---|---|---|---|
| 1 | **A personal work surface** — Your Inbox / Assigned to me / Mentions / Snoozed | The single most-used screen in any helpdesk, and the nav has no concept of it. `All Conversations` is a manager's view. The README even promises "unassigned, mentions, snoozed" — the nav dropped it. | Inbox |
| 2 | **AI disclosure & AI Act compliance** | Legally required in the EU since 2026-08-02; €15M / 3% exposure. Needs per-channel disclosure config + an audit trail proving it was shown. | AI Agent → Guardrails, or Settings → Security & Compliance |
| 3 | **Agent presence / availability / work modes** | You cannot route to a person without knowing whether they are there. Round-robin, capacity, and away-reassignment all depend on it, and all three are already in the nav. This is a missing *foundation*, not a feature. | Settings or Automation |
| 4 | **Custom fields, tags, and objects** | Every list screen, filter, workflow condition, and report depends on the workspace's own data model. Universal across all 12 vendors; absent from our Settings. | Settings |
| 5 | **Global search** | Conversations, contacts, articles. No entry anywhere in the nav. | Top-level / command palette |
| 6 | **Slack & Microsoft Teams as channels** | Pylon's entire wedge; Fin lists Slack as a channel. For a B2B suite this is more relevant than WhatsApp. | Channels |
| 7 | **Knowledge-gap detection** | Named as standard 2026 capability — surface topics where the agent repeatedly fails to find content. Closes the loop between AI Performance and the KB, both of which we already have. | Knowledge Base |
| 8 | **Import / migration from Zendesk, Intercom, Front** | Nobody adopts a helpdesk without moving history. Pure acquisition feature; zero vendors treat it as optional. | Settings |
| 9 | **Resolution definition & verification** | If we price on outcomes (per `research-findings.md` §4, that's the wedge), "what counted, and can I dispute it" is a screen. `Usage & Spend` is only the invoice half. | AI Performance |
| 10 | **Learning loop** — QA verdicts and human edits feeding agent training | Zendesk shipped it as the "Resolution Learning Loop"; Decagon as Agent Assist learning. We have `Evaluations` and `Recommendations` but nothing that closes back to `Train`. | AI Agent |
| 11 | **Data residency** | On Fin's front page. Enterprise deal-blocker, cheap to expose once the infra choice is made. | Settings |
| 12 | **Agent capacity / workload limits** | Chatwoot ships it at the open-source floor; Intercom has "inbox assignment limits". Routing without it just overloads whoever is online. | Automation → routing |
| 13 | **ChatGPT / assistant as a channel** | Sierra ships it; Intercom exposes conversations inside ChatGPT. Speculative, but the MCP entry we already have is half of the plumbing. | Channels (watch) |

Items 1, 3, 4, and 5 are the striking ones: they are not exotic — they are
plumbing that a 89-item nav built from a competitor census simply never had a
column for, because no vendor markets "we have tags".

---

## 4. What's in the sidebar that we should not build

### 4.1 Wrong product — cut, or send to another Geiger app

| Section / item | Count | Verdict |
|---|---|---|
| **Voice & IVR** (whole section) | 9 | **Cut to one.** Carrier relationships, SIP, recording storage, per-jurisdiction consent law, ASR and TTS. Zendesk sells this as a **$83/agent** separate product and Gladly built a moat out of it over a decade. It is 10% of our nav for the most expensive, most regulated, least defensible surface we could pick — and `research-findings.md` §5.4 already argued against it. Keep **`Calls`** as a *log* fed by a Twilio-class integration; delete `IVR Flows`, `IVR Routing`, `Voice Recognition`, `Text-to-Speech`, `Callbacks`, `Voicemail`, `Call Recordings`, `Call Transcripts`. |
| **Proactive** (whole section) | 8 | **Move to Geiger Campaign.** Banners, Tooltips, Posts, Checklists, Product Tours and Push are product-adoption tooling (Pendo, Appcues) and outbound marketing — a different buyer from support, and Intercom sells it as a **separate $99/mo add-on**. The suite already has a Campaign product; this is its surface, not ours. Keep only **`Surveys`**, which is support-native (CSAT/NPS), and fold `Campaigns` into Campaign. |
| **Workforce Management** (in Reports) | 1 | **Cut.** Forecasting, scheduling and adherence is its own discipline and its own vendor (Assembled, Verint). It is also not a report — filing an ops application under Reports is how it ends up half-built. |
| **Community Forum** (in Knowledge Base) | 1 | **Cut.** A forum is a whole product: moderation, reputation, spam, SEO, email digests. Two of twelve vendors ship it and it is nobody's reason to buy. |
| **Health Scores** (in Customers) | 1 | **Cut or defer.** Customer Success, not support — different buyer, different data model. HubSpot deliberately puts it in a *separate* Customer Success Workspace. |
| **Order History**, **Order Actions** (in Customers) | 2 | **Strategy-gated — decide before building.** These are the reason ecommerce teams buy Gorgias/Tidio, and worthless otherwise. They demand deep Shopify/BigCommerce integration. If ecommerce is not a named target segment, cut both; if it is, they are top-five priorities rather than mid-list. **This is a question for you, not a default.** |

### 4.2 Wrong altitude — real features, but not destinations

These should be filters, tabs, settings, or in-composer controls. Promoting them
to the sidebar means building a shell screen for something that is one control.

- **`Back-office Tickets`, `Tracker Tickets`, `Spam`** — ticket *types* and a
  state. One conversations table, three saved filters. Intercom exposes them as
  types, not as separate inboxes.
- **`Side Conversations`** — an action inside a conversation ("loop in a
  vendor"). There is no coherent screen that lists all side conversations, and no
  vendor ships one.
- **`Text-to-Speech`, `Voice Recognition`** — configuration on a voice flow.
  Category error even if we built voice.
- **`Callbacks`, `Voicemail`, `Call Recordings`, `Call Transcripts`** —
  attributes of a call record; tabs or columns inside `Calls`.
- **`Saved Replies` vs `Macros`** — the same object in most products (a canned
  reply, optionally with actions). Two screens invites two data models for one
  concept. **Merge.**
- **`Triggers` + `Routing Rules` + `Skills-based Routing` + `Approval Workflows`
  vs `Workflows`** — five entries for one rules engine. Zendesk's split between
  triggers and automations is a historical accident users complain about; do not
  reproduce it deliberately. One **Workflows** builder, with rule types and an
  approval node.
- **`Business Hours`** — a settings page.
- **`Translations`** (KB) — a state of an article, shown in the article list.
- **`Messenger` vs `Live Chat`** — the same channel. Intercom's "Messenger" *is*
  the chat widget. Merge into one **Chat** entry with widget configuration.
- **`Copilot`** (top-level) — copilot lives in the composer. All four of
  Zendesk's copilots are embedded; none is a destination. A `Copilot` screen is a
  shell around a feature that belongs inside the Inbox.
- **`SLA Compliance`, `Team Performance`, `Channel Performance`, `CSAT & Quality`**
  — four fixed dashboards next to `Analytics` *and* `Custom Dashboards`. Make
  them prebuilt dashboards inside Analytics, not four hand-maintained screens.
- **`Resolutions`, `Topics`, `Recommendations`, `Monitors`** — tabs of one AI
  Performance screen; they share one dataset and one time-range filter.
- **`CRM Sync`, `Data Connectors`** — marketplace entries, not peer screens to
  the Marketplace.
- **`Seats & Licenses`** — a section of Plans & Billing.

That is **~28 entries** that should not exist as destinations. Note this is not
"don't build the feature" — it's "don't build a *screen* for it". Most of them
get built anyway, as part of the screen they actually belong to.

### 4.3 Right feature, wrong order

- **AI Agent (8 entries)** — the section is correctly modelled and is our best
  structural bet. But `Testing & Regression`, `Evaluations`, `Guardrails` and
  `Versions` are trust infrastructure for an agent in production. Ship
  `Knowledge Sources` → `Train` → `Playground` first; the other four follow once
  something is live enough to regress.
- **`Quality Assurance`, `Customer Portal`, `Sandbox`, `Brands`, `Audit Logs`** —
  all legitimate, all late. Enterprise-tier concerns that presuppose enterprise
  customers.
- **`Unified Timeline`** — keep, and keep it early. Per `research-findings.md`
  §5.3 this is the structural differentiator (Gladly, Kustomer) and it is a
  *data-model* decision. It cannot be retrofitted after conversations ship
  ticket-fragmented, so the decision lands now even if the screen lands later.

---

## 5. Should we build them all?

No — and the cost of the current list is not just build time.

- **87 coming-soon screens is a credibility tax.** A user who clicks eight items
  and finds eight placeholders stops clicking. A 24-item nav where 24 work is a
  better product than an 89-item nav where 2 do.
- **Every entry is a permission key.** `geiger-rbac.config.js` mints one per
  top-level section, persisted against roles. The surface is an ongoing
  authorization and migration liability, not a one-off.
- **Breadth is not the competitive position.** `research-findings.md` §5 argues
  the wedge is *bundle the baseline, win on AI economics, own the unified
  timeline*. None of those three needs an IVR builder or a product-tour editor.
  LiveAgent has the longest feature list in the segment and is nobody's answer.

### Proposed v1 — 24 destinations

```
Overview
Inbox        Your Inbox · All Conversations · Views · Tickets
Channels     Email · Chat · Social · Slack & Teams
Customers    People · Companies · Unified Timeline · Segments
Automation   Workflows · Macros · SLA Policies · Routing
AI Agent     Knowledge Sources · Train · Playground
AI Performance  (single screen)
Knowledge Base  Articles · Help Centers
Reports      Analytics · Custom Dashboards
Settings     General · Navigation · Teammates · Roles & Permissions ·
             Channels & Data Model · Plans & Billing
```

### v2 — once v1 is real (~12 more)

WhatsApp · SMS · Guardrails (incl. AI disclosure) · Testing & Regression ·
Evaluations · Versions · Surveys/CSAT · Knowledge-gap detection · Customer
Portal · Audit Logs · Integrations (Marketplace + API/Webhooks/MCP) ·
Import & migration.

### v3 / never

Voice beyond a call log · Proactive suite (→ Geiger Campaign) · WFM · QA
scorecards · Community Forum · Health Scores · Brands · Sandbox ·
Order History & Actions *(unless ecommerce is chosen as the segment)*.

---

## 6. Open questions — these change the answer

1. **Who is the buyer?** B2B SaaS support (→ Slack/Teams channels, accounts,
   Pylon-shaped) or ecommerce (→ order actions, WhatsApp, Gorgias-shaped)? The
   nav currently hedges both and is 20 entries heavier for it.
2. **Do we price on outcomes?** If yes, resolution definition + verification +
   dispute is v1 product surface, not a billing footnote.
3. **Is Proactive ours or Geiger Campaign's?** Eight entries and a whole second
   product depend on the answer.
4. **Is voice in scope at all,** or is `Calls` a log fed by an integration?
5. **Employee service** (Zendesk's new line, Freshservice's whole market) — a
   Comms section, a separate suite app, or out of scope?

---

## 7. Decision — applied 2026-08-22

**Buyer: Intercom's buyer.** Geiger Comms is a straight clone of Intercom and the
segment around it for now; genuinely new/unique features are separately in
engineering and land later. That answers §6 and reverses one recommendation
above: **Proactive stays in full** — it is Intercom's own Proactive Support Plus
(Posts, Checklists, Product Tours, Surveys, Series, Push, Banners, Tooltips), not
a foreign product. It was §4.1's weakest call and the buyer decision overturns it.

The cut applied to `sidebar_nav.jsx`: **89 destinations → 67** (25 cut or folded,
5 added as plumbing, 3 added from the market update), 14 top-level sections
unchanged except `Voice & IVR` → `Phone`.

**Cut — not Intercom's product (10)**
`IVR Flows`, `IVR Routing`, `Voice Recognition`, `Text-to-Speech` (Gladly's
programmable-IVR moat) · `Order History`, `Order Actions` (Gorgias/Tidio
ecommerce) · `Health Scores` (HubSpot/Kustomer success) · `Community Forum`
(Zoho/LiveAgent) · `Workforce Management` (Zendesk add-on) ·
`Skills-based Routing`, `Approval Workflows` (Zendesk enterprise).

**Folded — the feature ships, the destination doesn't (15)**
`Back-office Tickets`, `Tracker Tickets` → a type filter on `Tickets` ·
`Spam` → a View · `Side Conversations` → an action in the conversation ·
`Live Chat` → merged into `Messenger` (they are one channel) ·
`Callbacks`, `Voicemail`, `Call Recordings`, `Call Transcripts` → tabs on a call
record under `Phone` · `Saved Replies` → `Macros` · `Triggers` → `Workflows` ·
`Translations` → an article state · `Unified Timeline` → the `People` detail
view · `SLA Compliance`, `Team Performance`, `Channel Performance` → prebuilt
dashboards in `Analytics` · `Quality Assurance` + `CSAT & Quality` → one
`Quality & CSAT` · `CRM Sync` → a Marketplace listing.

**Added — §3 plumbing no competitor markets (5)**
`Your Inbox`, `Mentions` (the agent's daily surface) ·
`Custom Fields & Objects` (the data model every filter and report depends on) ·
`Import & Migration` (nobody adopts a helpdesk without moving history) ·
`Business Hours` moved from Automation to Settings.

**Added from the §1 market update (3)** — filtered to what Intercom/Fin ships
*and* what is genuinely a destination:

- **`Slack`** (Channels) — Fin lists Slack alongside voice, chat, email and
  social. Teams was not added: that is Pylon's surface, not Intercom's.
- **`Deployment`** (AI Agent) — the go-live step. We modelled train → test →
  observe but had nowhere to say which channels and audiences the agent is
  actually live on.
- **`Knowledge Gaps`** (Knowledge Base) — topics the agent repeatedly can't
  answer, ranked by volume. Closes the loop from `AI Performance` back into the
  content backlog, so it follows usage signal rather than editorial guesswork.

**Absorbed rather than given a destination**
EU AI Act Art. 50 disclosure → `Guardrails`; data residency → `Security &
Compliance`; agent availability/work modes → `Teammates`; resolution
verification → `Resolutions`. All four are noted in the nav comments so they are
not lost when those screens get built.

**Still open:** global search has no home — it wants a command palette in the
shell rather than a nav entry, so it was left out of this pass deliberately.

---

## Sources

New in this pass (2026-08-22):
[cxtoday — Zendesk Autonomous Service Workforce](https://www.cxtoday.com/contact-center/zendesk-ai-agents-autonomous-service-workforce/) ·
[fin.ai](https://fin.ai/) ·
[Cooley — EU AI Act transparency obligations, 2 Aug 2026](https://www.cooley.com/news/insight/2026/2026-08-03-eu-ai-act-transparency-obligations-take-effect-2-august-2026) ·
[European Commission — transparency guidelines](https://digital-strategy.ec.europa.eu/en/library/guidelines-transparency-obligations-providers-and-deployers-ai-systems) ·
[Zendesk — What's new, July 2026](https://support.zendesk.com/hc/en-us/articles/10943174976794-What-s-new-in-Zendesk-July-2026) ·
[Futurum — Zendesk outcome pricing](https://futurumgroup.com/insights/zendesk-bets-on-autonomous-ai-agents-outcome-pricing-to-upend-service-models/) ·
[Sierra AI guide (getmacha)](https://www.getmacha.com/blog/sierra-ai-complete-guide) ·
[Decagon (eesel)](https://www.eesel.ai/blog/decagon) ·
[Pylon — Slack support channels](https://www.usepylon.com/blog/slack-customer-support-channels) ·
[Chatwoot (eesel)](https://www.eesel.ai/blog/chatwoot) ·
[Lorikeet — conversational AI analytics 2026](https://www.lorikeetcx.ai/articles/best-conversational-ai-analytics-support-2026) ·
[Plain — MCP for customer support](https://www.plain.com/blog/mcp-customer-support-2026) ·
[Zendesk for employee service (eesel)](https://www.eesel.ai/blog/zendesk-for-employee-service)

Prior passes: `research-findings.md`, `competitor-feature-inventory.md`.
