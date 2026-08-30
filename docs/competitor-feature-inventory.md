# Competitor Feature Inventory — Intercom + the Customer-Service / Messaging Segment

> **Scraped 2026-07-28** from vendor sites (product, platform, pricing and feature pages),
> supplemented by search where a page was blocked. This is a **feature census**, not a
> pricing study — see `research-findings.md` for the pricing/gating analysis it complements.
>
> **Reliability notes.** Feature names are quoted as the vendor writes them. Prices are a
> July-2026 snapshot and move constantly. Three pages could not be read directly and are
> marked where used: `salesforce.com/service/cloud/` (403), `gorgias.com/pricing` (tier table
> not server-rendered), `dixa.com/platform/` (404) — Dixa is therefore **not** covered below.
> Anything sourced from a review site rather than the vendor is tagged *(3rd-party)*.

---

## 0. The headline finding

**Intercom is mid-rebrand to Fin.** `intercom.com/features` and `intercom.com/messenger`
now **308-redirect to `fin.ai`**, and the homepage leads with Fin rather than the helpdesk.
The AI agent has been promoted from a feature of the helpdesk to *the* product, with the
helpdesk repositioned as what Fin escalates into. Fin is also sold **standalone, no seats
required**, and plugs into Zendesk/Salesforce/HubSpot/Freshdesk — i.e. Intercom will now
sell AI *into a competitor's helpdesk*.

Two structural consequences for us:

1. **The AI agent is the product surface, not a settings page.** Every serious vendor now
   ships AI agent authoring, testing, observability and QA as first-class areas. Our sidebar
   currently models AI as five menu items; the market models it as a sub-application
   (train → simulate → deploy → observe → score).
2. **Outcome-based pricing needs a product surface.** `$0.99 per Fin outcome` implies UI for
   what counts as an outcome, spend, and forecasting. That's a screen, not a billing line.

---

## 1. Intercom — full feature inventory

Sources: `intercom.com` (homepage), `intercom.com/help-desk`, `intercom.com/pricing`, `fin.ai`.

### 1.1 Fin (AI agent)

| Area | Features |
|---|---|
| Models | **Apex 1.0** (proprietary), **Apex Flash** (low-latency variant) |
| Channels | Voice, Chat, Email, Slack, Social |
| Modes | **Service**, **Sales** (inbound), **Ecommerce** (shopping journey) |
| Execution | **Procedures** (multi-step workflow automation), **Fin Operator** (backend/back-office automation), custom **Actions** |
| Knowledge/config | **Train** (business understanding + policies), **Guides**-style plain-English behaviour config, **Knowledge Hub** (centralised content management across sources) |
| Integrations | **API Platform**, **Data Connectors**, **MCP**; native to Intercom + Salesforce, HubSpot, Freshdesk, Shopify |
| Testing | **Testing Suite** — simulations, regression testing, manual inspection |
| Observability | **Observability Suite**, **Insights** (trend + topic analysis), **Recommendations** (automated improvement suggestions) |
| Quality | **QA Products** — always-on AI conversation scoring |
| Commercial | `$0.99 per Fin outcome`; sold standalone (no seats) with a monthly commitment |

### 1.2 Helpdesk — Ticketing

Customer tickets (conversation→ticket), **Back-office tickets**, **Tracker tickets**
(one issue spanning many customers), one-click ticket creation, **ticket forms**,
**custom ticket states**, select state when converting, change ticket type after creation,
require attribute on close, **ticket time tracking in office hours**, ticket state
transitions exposed in the API.

### 1.3 Helpdesk — Inbox

Composer drafts · translation + translation-quality feedback · **side conversations**
(incl. Slack) with notifications · edit sent notes · unassign on unsnooze · auto-unassign
when away · **SLA sorting (FRT, NRT, TTC, TTR)** · skip away-mode in round robin ·
company pop-over · **search in Views** · duplicate a View · **inbox assignment limits** ·
conversation events UI · team-inbox invite config · **delay send / undo send** ·
channel indicators · attachments (bulk upload, carousel, grid) · AI titles in Messenger ·
holiday office hours · per-device push notification management.

### 1.4 Helpdesk — Phone / Voice

Call transfer to workflows · **warm transfer to team** · CSAT for outbound calls ·
phone numbers per brand · **recording consent (GDPR)** · default outbound number ·
default outbound number for callbacks · quick reply stored on conversation ·
country-specific dial tones · call lifecycle + assignment visibility · **11 call metrics**.

### 1.5 Automation

**Visual no-code Workflows builder** · automated ticket assignment · **round robin** ·
**Macros** with permissions (create/edit/delete) · macro actions incl. re-open conversation
and set ticket state · **SLAs** (ticket-level, response + resolution).

### 1.6 Proactive / outbound (`Proactive Support Plus`, $99/mo, 500 messages)

**Posts** · **Checklists** · **Product Tours** · **Surveys** · **Series** (campaign builder) ·
Mobile Push · Mobile Carousels.
Free on core plans: **Chats, Banners, Tooltips** (no usage cost).

### 1.7 Copilot ($29/agent/mo)

Agent-facing AI — drafts replies, surfaces answers from the knowledge base, unlimited usage,
10 free conversations/agent/mo included.

### 1.8 Insights / QA (`Pro` add-on, $99/mo, 1,000 conversations)

**CX Score** · **Topics** (Topics Explorer) · **Recommendations** · **Monitors** ·
**Custom Scorecards** · Trends · **always-on QA** with AI scoring · pre-built + custom
dashboards · **scheduled external reports** · conversation auto-deletion.

### 1.9 Permissions, security, admin

Split delete permissions (replies vs notes) · inbox permissions for data connectors ·
reassign-when-away permissions · teammate profile permissions · conversation permissions
(participants, merge, creation) · **BPO permission restrictions (GDPR visibility control)** ·
**Tickets Portal user-visibility restriction** · SSO & identity management · **HIPAA** ·
disable team mentions workspace-wide · workspace avatars.

### 1.10 Self-service & collaboration

Public **Help Center** · private Help Center · **multilingual Help Center** ·
**multibrand Messenger + Help Center** · **Company portal** (customer ticket access) ·
**Lite seats** for back-office staff (20 free on Advanced, 50 on Expert) · private notes.

### 1.11 Platform

**350+ integrations** out of the box (Slack, Jira, Salesforce, Discord) · flexible APIs ·
live customer intelligence (real-time user/company records).

### 1.12 Plans

| Plan | Adds |
|---|---|
| **Essential** | Fin, Messenger, shared inbox + ticketing, pre-built reports, public Help Center |
| **Advanced** | Multiple team inboxes, Workflows builder, round robin, private + multilingual Help Center, 20 Lite seats |
| **Expert** | SSO & identity, HIPAA, **SLAs**, multibrand Messenger/Help Center, 50 Lite seats |

Seat prices are not rendered on the pricing page; *(3rd-party)* reporting puts them at
**$39 / $99 / $139** per seat/mo, with the homepage showing "$29 per seat/month + $0.99 per
outcome" for an entry configuration. **Treat seat pricing as unverified.**

---

## 2. Competitor inventories

### 2.1 Zendesk — the enterprise anchor

**Plans:** Support Team $19 · Suite Team $55 · Suite Professional $115 · Suite Enterprise + Copilot (sales).
**Add-ons:** Copilot **$50**/agent · Workforce Engagement Bundle **$50**/agent · Contact Centre **$83**/agent.

- **Team:** email + ticketing, ticket routing, prebuilt analytics dashboards, pre-written responses, customer context, automations and triggers
- **Suite Team:** **AI agents**, knowledge base, **Action builder**, **omnichannel routing**, messaging + live chat, **telephony**
- **Suite Professional:** **Admin copilot**, **App Builder**, **writing tools**, quick reports, **skills-based routing**, **IVR phone menu**
- **Suite Enterprise:** **Intelligent triage**, **Auto assist**, **generative AI for voice**, **approval workflows**, **sandbox**, **custom agent roles**
- **Platform:** agent workspace, help centre, **Workforce Management** (AI forecasting/scheduling), **Quality Assurance** (automatic human *and* AI agent scoring), security + AI governance, **1,800+ apps**

### 2.2 Freshdesk — value full-stack

**Plans:** Growth $19 · Pro $55 · Enterprise $89. **Freddy AI Copilot $29**/agent (Pro+).
Usage: AI Agent sessions **$49/100**, day passes $2–$12, connector tasks $80/5,000.

Ticketing · shared inbox · **threads and tasks** · customer portal · multilingual helpdesk (Pro+) ·
**collaborators** (5,000 on Pro+) · **Freddy AI Agent** (500 sessions included) ·
out-of-the-box analytics (Growth) · custom dashboards, **intelligent routing**, **multiple SLA
policies** (Pro) · **Freddy AI Insights**, **skill-based routing**, **sandbox**, **audit logs**,
**allowed domains & IP whitelisting** (Enterprise).

### 2.3 HubSpot Service Hub — CRM-native

**Help Desk Workspace** · ticketing · team email · ticket automation (simple + advanced) ·
**multiple ticket pipelines** · omnichannel · **call tracking with IVR trees** · live chat ·
intelligent routing · **SLA management** · **Breeze Customer Agent** · **Breeze Knowledge Base
Agent** (turns interactions into articles) · **Breeze Prospecting Agent** (upsell from service
data) · **Customer Success Workspace** (health scores) · **feedback management (NPS, CSAT,
surveys)** · **conversation intelligence** (call analytics) · **smart deal progression** ·
knowledge base · **customer portal** · service analytics · real-time dashboards · **2,000+
integrations**.

### 2.4 Salesforce Agentforce Service *(page 403 — from search)*

Case management natively tied to Sales/Marketing Cloud · **omnichannel routing** by skill,
workload, availability · knowledge management with article surfacing · **Omni-Channel
Autonomous Voice Agents** (GA Feb 2026, **Atlas Reasoning Engine**) · **Service Cloud Voice**
with Salesforce-first routing, customer-requested callbacks, unified voicemail, conversation
insights · Einstein real-time transcription + automated post-call wrap-up · AI↔human handoff.

### 2.5 Kustomer — CRM-style, timeline-leaning

**Concierge** (AI agents with full context) · **Envoy** (real-time agent suggestions) ·
**Architect** (no-code AI workflow builder) · **Data Explorer** (AI analytics) ·
**AI Agent Studio** · **AI Evaluations** (accuracy, tone, compliance testing) ·
**AI Guardrails** (escalation controls, failsafes) · CRM · omnichannel (chat, email, voice,
social) · reporting · workflows · integrations + webhooks · **Proactive Service** ·
self-service · **custom data objects and attributes** · **version control for AI agents**.

### 2.6 Gladly — the customer-centric differentiator

**Conversation History** — lifelong customer timeline across every channel, *no ticket
fragmentation* · **Customer Intelligence** (intent recognition) · **AI Customer Service
Agent** · **Gladly Team** (human agent collaboration) · **Guides** (plain-English brand voice
and behaviour config) · **Product Catalog Integration** · **Automatic Escalation** ·
end-to-end resolution or AI/human co-working · channels: voice, chat, SMS, email, social,
WhatsApp · real-time performance metrics · API.

### 2.7 Gorgias — ecommerce-native

**Helpdesk** (central inbox) · **AI Agent** split into **Support Agent** (~60% instant
resolution) and **Shopping Assistant** (product recommendations) · **Gaia** · **Voice** ·
**SMS** · omnichannel · workflow automation + routing · third-party data integration ·
reporting · customer segmentation.
**Pricing model is the differentiator:** *"never priced per agent"* — helpdesk scales
50→5,000 tickets/mo; AI Agent billed **only on resolution**; Voice and SMS usage-based.
Integrations: Shopify, BigCommerce, Magento, WooCommerce, PrestaShop, Loop Returns, Yotpo,
Recharge, Bloomreach, Attentive (100+).

### 2.8 Front — collaboration-first shared inbox

Omnichannel shared inbox · ticketing · live chat · knowledge base · **Front AI** ·
**Autopilot** (AI beyond FAQs) · **Copilot** · **Smart QA** · **Smart CSAT** (AI scoring) ·
AI-powered workflows · automated routing · **rules engine** · multi-team collaboration ·
analytics · **CRM sync** (Salesforce, HubSpot) with **bidirectional syncing** and real-time
external data · 160+ integrations.

### 2.9 Help Scout — SMB simplicity

Inbox · **AI Drafts** · **AI Summarize** · knowledge base / custom help center ·
**Messages** (proactive alerts + surveys) · Insights & Analytics · 100+ integrations ·
mobile · **Workflows** · **Views** · **Saved Replies** · customer profiles ·
company-level context.

### 2.10 Zoho Desk — low-cost, deep tier ladder

**Express:** email, social (Instagram/Facebook/X), web forms, **AI Agents (30M free
tokens/mo)**, **Generative AI (BYOK)**, direct assignment, workflows, custom domain,
multi-level escalations, contact management.
**Standard:** business messaging widget, **instant messaging** (WhatsApp, Instagram, Messenger,
Telegram, WeChat, Line), **Answer bot**, **community forum**, **work modes**, knowledge base,
**ASAP self-service widget**, happiness ratings, custom reports/dashboards.
**Professional:** telephony, **Zia AI**, **Blueprints** (drag-drop process builder),
multi-department, round-robin by workload, custom lookup fields, **multilingual help center
(40+ languages)**, **parent-child ticketing**, custom actions, webhooks.
**Enterprise:** live chat (SalesIQ), **Guided Conversations** flow builder, **skill-based
assignment**, **multi-level IVR**, **multi-brand help center**, custom modules, **sandbox**.

### 2.11 Tidio — SMB / ecommerce, unusually granular

**Lyro AI Agent:** Smart Actions, product recommendations, AI email resolutions, multilanguage,
multichannel, smart redirection to humans, **Playground** (response testing), instant KB
updates, conversation monitoring, time-saved analytics.
**Live chat:** live typing preview, macros, **AI Reply Assistant**, user ban, dedicated chat
pages, transcripts, **pre-chat surveys**, attachments, tags + contact properties, CSAT,
operating hours, read receipts, **live visitor list**, auto-assignment, offline messaging.
**Ticketing:** chat→ticket, workflows, tagging + prioritisation, history, ownership
reassignment, advanced filtering, spam management, **smart views by topic**.
**Flows:** visual builder, 40+ ecommerce templates, in-conversation flows, data collection,
post-conversation surveys, fallbacks, **abandoned cart recovery**, scroll-percentage triggers,
mobile-specific actions, operator transfer.
**Shopify:** cart preview, order history, order management (cancel/refund/address change),
custom coupon codes, delivery zone check.
**Analytics:** sales contribution, response/resolution/occupancy, operator performance,
channel comparison, flow performance, lead tracking, improvement suggestions, CSAT.

### 2.12 LiveAgent — the longest raw feature list in the segment

Useful as a **checklist of long-tail table stakes** we'd otherwise forget:

- **Ticketing:** agent collision detection, audit log, business hours, canned messages,
  contact fields/forms, custom roles, departments, email forwarding + templates,
  **hybrid ticket stream**, mass actions, **merge tickets**, multiple ticket tabs, notes,
  online ticket history URL, pause, **responsibility**, search & replace, SLA, SPAM filters,
  **split tickets**, tags, ticket export, ticket fields, filters, universal inbox,
  WYSIWYG editor, companies, **agent ranking**, contact groups, attachments
- **Live chat:** chat button + animations + gallery, **chat distribution**, chat history,
  invitation gallery, window docking, internal chat, **max queue length**, online visitors,
  **proactive chat invitations**, **real-time typing view**, website visitor tracking
- **Call centre:** **automatic callback**, call button, **call detail records**, device
  scheduling, call routing, transfers, internal calls, **IVR**, softphones, unlimited call
  recordings, **video call**
- **Reporting:** agent availability, agent/channel/department/performance reports,
  **SLA compliance report**, **SLA log report**, tag reports, time report
- **Gamification:** benchmarks + leaderboards, levels, rewards & badges
- **Customer portal:** customer forum, feedback & suggestions, internal knowledge base,
  **multi knowledge base**
- **Security:** 2-step verification, ban IPs, GDPR, HTTPS, multiple data centres,
  password validator + audit log, SSO

---

## 3. Consolidated master feature list

Deduped across all vendors above. **Count = how many of the 12 surveyed vendors ship it.**
This is the list to build a roadmap and a sidebar from.

### Tier A — universal (9–12 vendors). Non-negotiable.

| Feature | Notes |
|---|---|
| Omnichannel shared inbox | one queue, all channels |
| Ticketing (create, state, fields, tags, merge, split) | Intercom adds back-office + tracker types |
| Email channel | universal |
| Live chat / messenger widget | universal |
| Social channels (FB, IG, X) | universal |
| Knowledge base / help center | universal |
| Macros / saved replies / canned messages | universal |
| Workflow automation + rules engine | visual no-code builder is now standard |
| Routing (direct, round-robin) | skills-based is the gated upgrade |
| SLA management | tier-gated by Intercom (Expert) and Freshdesk (Pro) |
| Analytics + prebuilt dashboards | universal |
| CSAT / satisfaction ratings | universal |
| Integrations marketplace + API | 100–2,000 apps depending on vendor |
| AI agent (autonomous resolution) | **now universal**, was differentiating 18 months ago |
| AI copilot / reply drafting for agents | universal, usually a paid add-on |
| Private notes / internal collaboration | universal |
| Customer profile + context panel | universal |
| Mobile apps | universal |
| SSO | universal at enterprise tier |

### Tier B — common, usually tier-gated (5–8 vendors)

Skills-based routing · custom dashboards / advanced reporting · multilingual KB ·
multi-brand · multiple help centers · custom roles & permissions · sandbox ·
audit logs · **WhatsApp** · **SMS** · **voice / telephony** · **IVR** ·
customer portal (self-service ticket access) · surveys · community forum ·
business/office hours · **side conversations** · ticket forms · parent-child tickets ·
webhooks · custom fields & objects · **proactive/outbound messaging** · CRM sync ·
spam filtering · agent collision detection · ticket time tracking.

### Tier C — premium add-ons (3–5 vendors, sold separately)

**Workforce Management (WFM)** — forecasting, scheduling, adherence ·
**Quality Assurance (QA)** — scorecards, sampling, AI scoring of *both* human and AI agents ·
**Contact centre / voice suite** · **Conversation intelligence** (call analytics, transcription,
post-call wrap-up) · **Advanced data privacy / compliance (HIPAA, GDPR visibility control)** ·
**Proactive Support suites** (tours, checklists, series) · **AI insights** (topic/trend mining).

### Tier D — rare / genuinely differentiating (1–3 vendors)

| Feature | Who | Why it matters |
|---|---|---|
| **Lifelong unified customer timeline** (no ticket fragmentation) | Gladly, Kustomer | structural data-model advantage, very hard to retrofit |
| **Fully-programmable cloud IVR** (touchtone + ASR + TTS, routing by history/location/LTV) | Gladly | deep voice moat |
| **Native ecommerce order actions in agent view** (refund, cancel, address change, coupons) | Gorgias, Tidio | the reason ecommerce buys these |
| **AI agent testing suite** (simulation, regression, playground) | Fin, Kustomer, Tidio | the emerging trust layer for AI |
| **AI agent observability + evaluations** (accuracy, tone, compliance, guardrails, version control) | Fin, Kustomer | ships alongside the testing suite |
| **AI agent scored by QA like a human** | Zendesk, Fin, Front | "Smart QA" / "always-on QA" |
| **Back-office & tracker ticket types** | Intercom | one issue → many customers |
| **Outcome-based pricing surface** | Fin, Gorgias | pricing model exposed as product |
| **Lite / free collaborator seats** | Intercom, Freshdesk | kills the per-seat objection for back-office staff |
| **Gamification** (leaderboards, levels, badges) | LiveAgent, Zoho | cheap to build, rarely offered |
| **Community forum** | Zoho, LiveAgent | self-service long tail |
| **Health scores / success workspace** | HubSpot, Kustomer | CS, not support |
| **Approval workflows** | Zendesk | enterprise process control |
| **BPO / outsourcer permission model** | Intercom | enterprise + BPO deals |
| **Standalone AI agent that plugs into a rival helpdesk** | Fin | land-and-expand wedge |

---

## 4. Gap analysis vs our current sidebar

Our nav (built from `research-findings.md`) covers Tiers A and B well. Measured against
this census, these are **missing entirely**:

**Highest value (rare tier — differentiators we're not modelling):**

1. **AI agent lifecycle** — Train, Playground/Simulator, Testing & Regression, Evaluations,
   Guardrails, Versions. Everyone serious has this; our nav has none of it.
2. **AI observability** — resolution rate, topic mining, recommendations, monitors.
   We have a single "AI Usage" entry that only covers spend.
3. **Ecommerce order actions** — refunds, cancellations, address changes, coupons.
   We have a passive "Order History" view; the money is in *acting* on the order.
4. **Ticket types** — back-office and tracker tickets.

**Table stakes we skipped:**

5. **WhatsApp** as its own channel (we have SMS/Social but not WhatsApp — it is named
   explicitly by Gladly, Zoho, Tidio, Intercom)
6. **Proactive / outbound** — banners, tooltips, posts, checklists, product tours, series
7. **Surveys & CSAT** as an area (we only have "CSAT" inside Reports in the *old* nav — the
   current nav dropped it entirely)
8. **Customer portal** (self-service ticket access) — distinct from the help center
9. **Community forum**
10. **Views / saved filters** as a first-class concept
11. **Canned responses / saved replies** — we have Macros, which is adjacent but not the same
12. **Side conversations** (loop in an external vendor mid-thread)
13. **Business hours / holiday hours**
14. **Audit logs**, **agent collision detection**, **spam filtering**
15. **Lite/collaborator seats** as a concept in Roles

**Worth a deliberate "no":** WFM and QA are real add-on categories, but `research-findings.md`
§5.4 already argues against early investment. Keep the nav entries as placeholders, build last.

---

## Sources

Vendor pages (fetched 2026-07-28):
[intercom.com](https://www.intercom.com/) ·
[intercom.com/help-desk](https://www.intercom.com/help-desk) ·
[intercom.com/pricing](https://www.intercom.com/pricing) ·
[fin.ai](https://fin.ai/) ·
[zendesk.com/service](https://www.zendesk.com/service/) ·
[zendesk.com/pricing](https://www.zendesk.com/pricing/) ·
[freshworks.com/freshdesk/pricing](https://www.freshworks.com/freshdesk/pricing/) ·
[hubspot.com/products/service](https://www.hubspot.com/products/service) ·
[kustomer.com/platform](https://www.kustomer.com/platform/) ·
[gladly.ai](https://www.gladly.ai/) ·
[gorgias.com/platform](https://www.gorgias.com/platform) ·
[front.com/platform](https://front.com/platform) ·
[helpscout.com/features](https://www.helpscout.com/features/) ·
[zoho.com/desk/pricing](https://www.zoho.com/desk/pricing.html) ·
[tidio.com/features](https://www.tidio.com/features/) ·
[liveagent.com/features](https://www.liveagent.com/features/)

Search-sourced (vendor page blocked or thin):
[Salesforce Service Cloud guide](https://www.salesforce.com/service/cloud/guide/) ·
[Salesforce omnichannel routing](https://www.salesforce.com/service/digital-customer-engagement-platform/omnichannel-routing/) ·
[Intercom Proactive Support Plus add-on](https://www.intercom.com/help/en/articles/9061648-proactive-support-plus-add-on) ·
[Intercom guide (getmacha)](https://www.getmacha.com/blog/intercom-for-customer-support) ·
[Intercom Fin guide (myaskai)](https://myaskai.com/blog/intercom-fin-ai-agent-complete-guide-2026)
