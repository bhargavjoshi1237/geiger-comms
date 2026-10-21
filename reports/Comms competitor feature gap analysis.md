# Geiger Comms clones the inbox, not Fin

Geiger Comms is a well-built Intercom-style inbox inside a navigation that is mostly empty. **24 of 68 sidebar destinations are real and 44 show "Coming soon"**. About 13 of the 24 are deep. Measured against the support cycle, Comms is **deep in 3 of 15 stages** (Messenger intake, agent handling, internal collaboration), shallow in 8 and absent in 4. The absences are exactly where Intercom now competes. **No AI model is called anywhere in the codebase.** There is no help-center editor, no proactive messaging and no reporting beyond an overview dashboard, and Messenger is the only live channel. Several screens look finished but do nothing: workflows, routing and SLAs are configuration that no engine in the repo runs. Meanwhile the target kept moving. Intercom renamed itself **Fin** in May. **Salesforce closed a ~$3.6B acquisition on 10 September.** **Fin 4** (7 October) recast the helpdesk as a console for supervising AI, while the Intercom helpdesk kept shipping every week, including skill-based routing and Workforce Management, two features we had cut as "not Intercom". Across vendors, AI is now billed per outcome at **$0.49–$2.00**, and **EU AI Act Article 50 chatbot disclosure has applied since 2 August 2026**. The overall picture:

- **Core:** of 46 core gaps, 20 are P0 for an Intercom buyer. The biggest are the AI agent, a real email channel, a help center, and engines that actually run.
- **Adjacent:** of 25 adjacent features, none is P0, 22 are missing, and Intercom's cheap proactive basics come next.
- **Non-core:** of 24 platform items, the 5 P0s are mostly cheap trust fixes. The first is a hole that lets any suite user promote themselves to admin.

The fastest gain in credibility comes from making existing screens true, not from adding new ones.

**Overall status as of 21 October 2026** (the three lists below track only gaps; what is already deep is listed separately in the last row):

| List | Items | Have-shallow | UI-only | Missing | P0 | Where the weight sits |
|---|---|---|---|---|---|---|
| Core (Intercom's support surface) | 46 | 15 | 2 | 29 | 20 | AI agent, help center, email, engines that execute, composer basics, reports |
| Adjacent ("same circle") | 25 | 3 | 0 | 22 | 0 (7 P1) | Outbound chats, banners, News, surveys, knowledge gaps, tracker fan-out, Linear/Jira |
| Non-core (platform, admin, security, compliance, usability) | 24 | 7 | 0 | 17 | 5 | Trust fixes and AI disclosure first; then API, SSO, audit log, billing |
| Already deep (not counted as gaps) | ~13 screens | | | | | Realtime three-pane inbox, Views, Tickets (Intercom's three types), Messenger with JWT identity, People with unified timeline, Teammates, custom Roles, Navigation |

The Geiger Comms side of this report rests on a read-only code audit of the repo as of 2026-10-21 ([codebase audit](../research_notes/Comms%20competitor%20feature%20gap%20analysis/geiger_comms_codebase_audit.md)). It uses the audit's scale: **DEEP** means persisted, full CRUD, with real interactions. **SHALLOW** means persisted but limited, or configuration that nothing executes. **UI-ONLY** means static/demo data or unpersisted mutations. **STUB** means the `ComingSoonScreen` fallback. **ABSENT** means no code. A screen counts as built only if the behavior it promises actually happens.

## Intercom became Fin, joined Salesforce, and kept shipping

Intercom renamed itself **Fin on 12 May 2026**. The name "Intercom" now covers only the helpdesk, which was rebuilt and launched as "Intercom 2" ([Intercom blog](https://www.intercom.com/blog/today-intercom-becomes-fin)). Salesforce signed a definitive agreement on **15 June for about $3.6 billion** ([Salesforce newsroom](https://www.salesforce.com/news/press-releases/2026/06/15/salesforce-signs-definitive-agreement-to-acquire-fin)) and **closed on 10 September**. Fin now sits inside Salesforce AI Labs, Eoghan McCabe remains CEO, and the closing release says nothing about the helpdesk, Messenger or Outbound ([Salesforce IR](https://investor.salesforce.com/news/news-details/2026/Salesforce-Completes-Acquisition-of-Fin/default.aspx)). At Dreamforce, Salesforce presented Fin as a "job-ready" service agent that connects to whatever systems a company already runs, and its recap never mentions Intercom ([Salesforce blog](https://www.salesforce.com/blog/dreamforce-2026-announcements/)).

Some readers will take this as a sign that the helpdesk is being wound down. The changelog says otherwise. Releases kept coming every week after the close: macros at ticket creation (16 Sep), custom report metrics (23 Sep), macro fill-in fields (6 Oct), inbox dictation (14 Oct), **Workforce Management** (15 Oct), phone skills routing (16 Oct) and Follow (21 Oct) ([Intercom changelog](https://www.intercom.com/changes/en)). The surface we are cloning is growing, not frozen.

**Fin 4 (7 October)** is the strategic signal that matters most. It merges Fin's Service, Sales, Ecommerce and new Success modes into one Customer Agent. It also adds Skills for problems with no defined process, a background Copilot 2, second-generation human-in-the-loop, and Operator Routines. Intercom argues that **"case- or ticket-based helpdesks are no longer fit for purpose"** ([Intercom blog](https://www.intercom.com/blog/fin-4-customer-agent-operator-and-major-upgrades-to-the-intercom-helpdesk); [fin.ai/fin4](https://fin.ai/fin4)). The AI control surface has become a sub-application of its own: Train, Test (simulations, releases, A/B rollout), Deploy, Analyze (CX Score, Topics, Monitors, incident detection) and Operator, which edits that configuration through pull-request-style proposals ([fin.ai/testing](https://fin.ai/testing); [fin.ai/analyze](https://fin.ai/analyze); [fin.ai/operator](https://fin.ai/operator)).

Packaging moved the same way:

- **Fin** has cost **$0.99 per outcome since 12 March 2026**, or $9.99 per sales qualification ([fin.ai/pricing](https://fin.ai/pricing); [fin.ai/updates](https://fin.ai/updates)).
- **Seats** cost $29, $85 and $132 per month on annual billing ([plans explained](https://www.intercom.com/help/en/articles/9061614-fin-and-intercom-plans-explained)).
- **Pro** costs $0.20 per conversation with a 500-conversation minimum. It bundles CX Score, Topics, Monitors, Operator credits and the new WFM ([Pro add-on](https://www.intercom.com/help/en/articles/17217972-pro-add-on)).

Pricing remains the most repeated complaint about Intercom: **64% of the 211 Capterra reviews that mention price are negative** ([Capterra](https://www.capterra.com/p/134347/Intercom/reviews/)).

| Development | What it means for Geiger Comms |
|---|---|
| **Intercom is now Fin; "Intercom" names only the helpdesk** ([Intercom blog](https://www.intercom.com/blog/today-intercom-becomes-fin)) | The clone target is the Intercom helpdesk plus the Fin add-ons sold with it on intercom.com/pricing. The AI agent is the headline product, not a feature of the helpdesk. |
| **Salesforce owns Fin** (closed 10 Sep 2026), and no primary source says anything about the helpdesk roadmap ([Salesforce IR](https://investor.salesforce.com/news/news-details/2026/Salesforce-Completes-Acquisition-of-Fin/default.aspx)) | Buyer uncertainty opens room for an "independent Intercom" position. This is inference: no review yet shows buyers leaving over the deal, so we should not build positioning on it alone. |
| **Weekly helpdesk releases continue after the close** ([changelog](https://www.intercom.com/changes/en)) | Every month adds mid-market polish that a side-by-side demo will expose. Parity is a moving line. |
| **Fin 4 recasts the inbox as an AI supervision console** ([Intercom blog](https://www.intercom.com/blog/fin-4-customer-agent-operator-and-major-upgrades-to-the-intercom-helpdesk)) | A clone of the 2025 inbox lands a generation behind. AI has to be designed into the inbox, not bolted onto it later. |
| **Per-outcome AI pricing has converged**: Fin $0.99, Help Scout $0.75, Featurebase $0.49, Re:amaze $0.85, Text $0.99, Plain about $1, Gorgias $0.90–$1.00, Zendesk $2.00 pay-as-you-go, Freshdesk $49 per 100 sessions ([fin.ai](https://fin.ai/pricing); [Help Scout](https://www.helpscout.com/pricing/); [Featurebase](https://www.featurebase.app/pricing); [Re:amaze](https://www.reamaze.com/pricing); [Text](https://www.livechat.com/pricing/); [Plain](https://www.plain.com/pricing); [Gorgias](https://www.gorgias.com/pricing); [Zendesk](https://www.zendesk.com/pricing/); [Freshdesk](https://www.freshworks.com/freshdesk/pricing/)) | The low end of the market publishes a per-resolution price at or below $0.75. Spend caps and a per-outcome audit trail are part of the product, not just the invoice. Zendesk already exposes allowance dashboards and committed independent verification of resolutions ([Kundelab](https://www.kundelab.no/en/articles/zendesk-news-october-2026); [CX Foundation](https://cxfoundation.com/news/zendesk-relate-2026-announcements)). |
| **Intercom gates SLAs, custom roles, SSO, balanced assignment and multibrand to Expert** ([plans explained](https://www.intercom.com/help/en/articles/9061614-fin-and-intercom-plans-explained)) | Shipping those in a mid tier is cheap differentiation that stays inside the clone scope. |
| **EU AI Act Article 50 has applied since 2 Aug 2026.** The Digital Omnibus (Regulation 2026/1744) delayed the high-risk duties but left Article 50 unchanged. A support bot does not qualify for the "obvious from context" exception. Machine-readable marking binds new systems immediately and existing systems by 2 Dec 2026. Fines reach €15M or 3% of turnover ([Legalithm](https://www.legalithm.com/en/blog/eu-ai-act-what-applies-2-august-2026); [CMSWire](https://www.cmswire.com/customer-experience/is-your-contact-center-ready-for-europes-chatbot-disclosure-rules/); [Technology.org](https://www.technology.org/2026/10/13/eu-ai-act-deadlines-after-the-digital-omnibus-what-applies-from-december-2026-to-august-2028/)) | Any AI Comms ships counts as a new system. Disclosure in every served language, marking of AI output and a human handoff are launch requirements. Zendesk already ships a per-channel "Generated by AI" label ([Zendesk July 2026](https://support.zendesk.com/hc/en-us/articles/10943174976794-What-s-new-in-Zendesk-July-2026)). Having no AI yet lets us build compliance in from the start. |
| **The European Accessibility Act has applied since 28 Jun 2025**, measured against EN 301 549 / WCAG 2.1 AA ([TestCollab](https://testcollab.com/blog/european-accessibility-act-2025); [Siteimprove](https://www.siteimprove.com/blog/eaa-wcag-compliance/)) | Our customers embed the Messenger and help center in their own EU-facing products and will ask for a conformance statement. Intercom resized tooltips to meet the WCAG 2.2 target size in September ([changelog p.2](https://www.intercom.com/changes/en?page=2)). |
| **Customers give AI few chances.** Only 27% would try a chatbot again after a bad experience, and 87% say a human option is essential. Only 24% of consumers say their last AI interaction was fully resolved, against vendor claims of 66–76% ([Gartner](https://www.gartner.com/en/newsroom/press-releases/2026-09-02-gartner-finds-only-27-percent-of-customers-would-try-a-chatbot-again-after-a-negative-experience); [Macha compilation](https://www.getmacha.com/blog/customer-service-ai-statistics)) | Ship AI reliability-first: narrow audiences, a playground, a visible handoff, and reports that separate confirmed resolutions from assumed ones. |
| **The open-source floor rose.** Chatwoot now ships an AI playground, tool controls with customer verification, outcome controls, review of suggested FAQ gaps, and auto-translation ([Chatwoot releases](https://github.com/chatwoot/chatwoot/releases)) | An AI agent with a playground and knowledge-gap capture is now the minimum, not a premium feature. |

The July–August internal research still holds as background, but several of its specifics have changed. Where the two disagree, the October evidence wins:

| Earlier internal finding (Jul–Aug 2026) | October 2026 evidence |
|---|---|
| Intercom seats "$39/$99/$139, unverified" (`docs/competitor-feature-inventory.md` §1.12) | Those are the monthly prices. Annual pricing is $29/$85/$132 ([plans explained](https://www.intercom.com/help/en/articles/9061614-fin-and-intercom-plans-explained)). |
| Insights "Pro" at $99/mo for 1,000 conversations (inventory §1.8) | Replaced by Pro at $0.20 per conversation with a 500 minimum, now including Operator and WFM ([Pro add-on](https://www.intercom.com/help/en/articles/17217972-pro-add-on)). |
| Help Scout $0.75/resolution, a $0.49 resolution price, and "community forums and health scores are rare" were all refuted (`docs/research-findings.md` §6) | All four now appear on vendor pages: Help Scout $0.75 ([Help Scout](https://www.helpscout.com/pricing/)), Featurebase $0.49 ([Featurebase](https://www.featurebase.app/pricing)), Freshdesk Pro forums ([Freshdesk](https://www.freshworks.com/freshdesk/pricing/)), HubSpot health scores ([HubSpot](https://www.hubspot.com/pricing/service)). |
| Zendesk WFM ~$25/agent and QA ~$35/agent (research-findings §3) | Now a $50/agent Workforce Engagement bundle, and basic WFM has been free on Suite Professional+ since July ([Zendesk pricing](https://www.zendesk.com/pricing/); [Zendesk July 2026](https://support.zendesk.com/hc/en-us/articles/10943174976794-What-s-new-in-Zendesk-July-2026)). |
| Skills-based routing and WFM are Zendesk products, so cut (`docs/sidebar-audit-2026-08.md` §7) | Intercom shipped skill-based routing on **13 Jul 2026, before the cut was made**, and launched WFM on 15 Oct ([changelog p.6](https://www.intercom.com/changes/en?page=6); [Intercom WFM](https://www.intercom.com/blog/announcing-workforce-management)). |
| WhatsApp, SLA-triggered automation, availability with away reassignment, customer portal, knowledge-gap detection, MCP and AI testing sit in Tiers B–D (inventory §3) | These are now table stakes. Help Scout alone added WhatsApp, SLA-triggered workflows, availability, away reassignment and a customer portal during 2026 ([Help Scout updates](https://updates.helpscout.com)). |
| Article 50 "took effect 2 Aug" (sidebar audit §1.4) | Confirmed. The Commission adopted its final guidelines on 20 Jul 2026, and the Omnibus did not delay Article 50 ([Legalithm](https://www.legalithm.com/en/blog/eu-ai-act-what-applies-2-august-2026)). |
| v1 plan of 24 destinations (sidebar audit §5) | About 15 are built (some only partly), 5 are partial or simulated, and 11 are missing. The nav grew to 68 entries, 44 of them placeholders. |
| Intercom has 350+ integrations | It now lists 450+ ([intercom.com/helpdesk](https://www.intercom.com/helpdesk)). |

One conflict inside this round's notes: the adjacent-category research reported that Intercom has no native WFM and runs its own support on Assembled ([Assembled case study](https://www.assembled.com/case-study/intercom)). Intercom's own 15 October launch post supersedes that finding.

## Comms is deep in three of fifteen support-cycle stages

The middle of the cycle is real and good. Messenger is the most production-grade part of the product:

- **Identity:** the customer's backend signs a JWT that is verified at boot, followed by 15-minute session tokens and an anonymous-to-identified merge.
- **Embedding controls:** exact-origin allowlists with CSP frame-ancestors, and signing-secret rotation with a 24-hour grace period.
- **Hardened uploads:** content is verified by magic bytes, capped at 10 MB, and stripped of EXIF metadata.
- **Spaces and capture:** realtime delivery, post-chat CSAT, offline lead capture, and Home, Messages, Help, News and Tickets spaces (`lib/widget/jwt.js`, `lib/widget/session.js`, `app/api/widget/upload/route.js`).

This matches where Intercom itself has gone: Intercom deprecated HMAC identity verification in favor of JWTs ([Intercom help](https://www.intercom.com/help/en/articles/10589769-authenticating-users-in-the-messenger-with-json-web-tokens-jwts)).

The agent inbox is also solid:

- A realtime three-pane shell with per-agent unread.
- Snooze presets plus custom snooze, close and reopen, priority, and tags.
- Internal notes with @mentions feeding a live Mentions queue.
- Intercom's three ticket types, including tracker tickets that link many conversations.
- Saved views with live counts.
- j/k/e/a/s keyboard shortcuts, close to Plain's documented set ([Plain docs](https://www.plain.com/docs/shortcuts)), in `components/internal/screens/inbox/use_inbox_shell.js`.

Custom roles with a permission matrix and conversation-scoped grants already exist. Intercom reserves custom roles for Expert ([plans explained](https://www.intercom.com/help/en/articles/9061614-fin-and-intercom-plans-explained)).

Both ends of the cycle are thin or empty, and that is where an Intercom buyer makes the decision. The table rates each stage honestly. In particular, a configured automation that nothing executes is rated SHALLOW, not built.

| Stage | Intercom (Oct 2026) | Best competitor depth | Geiger Comms today | Gap |
|---|---|---|---|---|
| 1. Setup & migration | Fin CLI builds a workspace from the terminal; native importer; test workspaces ([fin.ai/updates](https://fin.ai/updates)) | Plain imports from Intercom, Zendesk, Freshdesk and Help Scout; new workspaces start with label suggestions and test threads ([Plain](https://www.plain.com/pricing); [changelog](https://www.plain.com/changelog)) | **SHALLOW**: widget install section and in-workspace test launcher; General settings is a stub; invitations send no email; no importer | No path to bring an Intercom customer's history across, and no way to invite a teammate by email |
| 2. Channel config | Email (multi-domain), WhatsApp (several WABAs), SMS (per brand), Instagram, Facebook, Slack, Discord, Telegram, Phone ([omnichannel](https://www.intercom.com/helpdesk/omnichannel)) | Pylon puts Slack Connect, Discord, Telegram and WhatsApp on every plan ([Pylon](https://www.usepylon.com/pricing)) | **SHALLOW**: six channel screens; only Messenger is live; the rest are labelled "Simulated" (`components/internal/screens/channels/constants.js`) | Every non-chat channel |
| 3. Intake | Messenger on web, iOS and Android; JWT; Tickets, News and Tasks spaces; queue position; dictation | Multimodal intake demand: 76% of consumers want text, voice and visuals in one thread ([Zendesk CX Trends](https://www.zendesk.hk/newsroom/articles/ai-ushers-in-era-of-contextual-intelligence-redefining-customer-experience-in-2026/)) | **DEEP for Messenger**: secure web widget, CSAT, offline leads; no mobile SDKs; React SDK unpublished | Mobile SDKs, per-audience spaces, emoji, multi-attachment |
| 4. Self-serve & AI | Fin 4 on Apex 2.0, Procedures, Knowledge Hub, up to 100 help centers, 45+ languages ([fin.ai](https://fin.ai/); [Knowledge Hub](https://www.intercom.com/helpdesk/knowledge-hub)) | Zendesk Voice AI agents GA in 53 languages; Decagon and Sierra run simulation and live A/B ([Kundelab](https://www.kundelab.no/en/articles/zendesk-news-october-2026); [Decagon](https://decagon.ai/)) | **ABSENT**: no model is called; the widget Help space reads 20 seeded articles; "Ask" is keyword search that correctly refuses to label itself as AI | The entire stage. This is the largest single gap. |
| 5. Triage & routing | Manual, round robin, balanced, skill-based (Jul 2026), per-channel limits, take/drop permissions, AI-detected attributes ([workload](https://www.intercom.com/help/en/articles/6560715-workload-management-explained); [changelog p.6](https://www.intercom.com/changes/en?page=6)) | Zendesk routes on skills, capacity, skills timeout, overflow and predicted fastest resolver ([Zendesk routing](https://support.zendesk.com/hc/en-us/articles/4828787357210-Managing-your-omnichannel-routing-configuration)) | **SHALLOW**: manual assign, views and filters are deep; routing rules are configured but the screen says auto-assignment "isn't switched on yet"; availability has no UI | Execution, availability, capacity |
| 6. Handling | Macros with folders, fill-ins and analytics; AI compose, summarize and translate; bulk actions on every match; merge; spam inbox; undo send ([inbox](https://www.intercom.com/helpdesk/inbox); [changelog](https://www.intercom.com/changes/en)) | AI copilots add 14–34% resolved issues per hour in studies ([NBER](https://www.nber.org/papers/w31161)) | **DEEP shell**: macros are not in the composer, agents cannot attach files, and there is no AI, bulk action, merge or message-body search | The agent productivity layer |
| 7. Collaboration | Notes, mentions, side conversations over email and Slack (auto-translated), Follow, viewing avatars | Front's live thread collaboration ([Hiver](https://hiverhq.com/blog/front-vs-help-scout)) | **DEEP**: notes with @mentions, realtime Mentions queue and badge | Side conversations, collision detection, Follow |
| 8. Resolution & SLA | FRT/NRT/TTC/TTR, office and holiday hours, pause rules, card badges, sort by next SLA, pre-breach and breach workflows ([SLAs](https://www.intercom.com/help/en/articles/6546152-set-slas-for-conversations-and-tickets)) | Help Scout added SLA-triggered workflows in Jun 2026 ([Help Scout updates](https://updates.helpscout.com)) | **SHALLOW**: policy CRUD; the engine lives only in the live DB; seeded schedules push due dates to 2030; no timers in the inbox; snooze never wakes | A clock that works |
| 9. Follow-up | CSAT; CX Score on every conversation (Pro); per-state "notify customer" on tickets | HubSpot NPS, CES and CSAT; Front Smart CSAT ([HubSpot](https://www.hubspot.com/pricing/service); [Front](https://front.com/pricing)) | **SHALLOW**: the widget's 1–5 rating sits in conversation metadata and nothing reads it; customer replies do not reopen conversations | Reporting and reopen rules |
| 10. Proactive | Chats, banners and tooltips free; Proactive Support Plus adds posts, tours, checklists, surveys, Series, push and carousels ([outbound](https://www.intercom.com/helpdesk/outbound)) | Appcues and Pendo for adoption depth; Plain broadcasts to Slack ([Plain changelog](https://www.plain.com/changelog)) | **ABSENT**: the News space reads posts, but nothing authors them; the proactive card is built but not mounted | The entire stage |
| 11. Customer data | People, companies, custom attributes, events, segments, custom objects, Salesforce sync (Advanced+) | Zendesk multi-lookup fields and AI object builder; Front two-way CRM sync ([Zendesk Sept](https://support.zendesk.com/hc/en-us/articles/11180657600026-What-s-new-in-Zendesk-September-2026); [Front](https://front.com/platform)) | **SHALLOW**: People is deep, with a unified timeline (but falls back to demo data); Companies create/delete are not persisted; Segments live in localStorage; no custom attributes | The data model |
| 12. QA & reporting | 12 prebuilt reports, custom reports and metrics, dataset export, real-time dashboard; Pro adds CX Score, Topics, Monitors, Scorecards ([reporting](https://www.intercom.com/helpdesk/reporting)) | Zendesk QA with reviewer calibration and coaching ([Zendesk Sept](https://support.zendesk.com/hc/en-us/articles/11180657600026-What-s-new-in-Zendesk-September-2026)) | **SHALLOW**: Overview dashboard only; `first_response_at` and `closed_at` are recorded but never read; no QA | Response-time, SLA, CSAT and team reports |
| 13. Workforce | WFM (15 Oct): forecasts, shift scheduling with Google Calendar sync, coverage, adherence; wrap-up time ([Intercom WFM](https://www.intercom.com/blog/announcing-workforce-management)) | Zendesk forecasting with adherence alerts, basic tier free on Suite Professional ([Zendesk July](https://support.zendesk.com/hc/en-us/articles/10943174976794-What-s-new-in-Zendesk-July-2026)) | **ABSENT**: `setAvailability` exists in the data layer, but no UI calls it | Availability first, WFM much later |
| 14. Knowledge loop | Content suggestions from failed Fin answers; Operator drafts article updates ([content suggestions](https://www.intercom.com/help/en/articles/11394959-use-ai-powered-content-suggestions-to-improve-fin)) | Plain "Knowledge gaps" (30 Sep); Chatwoot FAQ-gap review ([Plain](https://www.plain.com/changelog); [Chatwoot](https://github.com/chatwoot/chatwoot/releases)) | **ABSENT**: Knowledge Gaps is a stub; `comms.article_views` does not exist, so "popular" articles fall back to most recent | All of it; needs the KB and AI first |
| 15. Admin, security, billing | Custom roles, SAML SSO and SCIM, 1-year activity logs, REST API v2.17, 450+ apps, MCP, HIPAA, ISO 42001 and AIUC-1, US/EU/AU hosting ([fin.ai/trust](https://fin.ai/trust-reliability); [API changelog](https://developers.intercom.com/docs/build-an-integration/learn-more/rest-apis/api-changelog)) | Freshdesk includes SSO on Growth; Help Scout includes SSO and HIPAA on Pro ([Freshdesk](https://www.freshworks.com/freshdesk/pricing/); [Help Scout](https://www.helpscout.com/pricing/)) | **SHALLOW**: Teammates, custom roles and Navigation are deep, but users can promote themselves; no SSO, audit screen, API, webhooks or billing | The enterprise checklist, and trust |

The stage view understates one risk. Intercom's own documentation shows depth Comms has not considered, and some of it is a weakness a clone can beat without leaving scope. Examples:

- Only one SLA can apply to a conversation at a time ([Intercom SLAs](https://www.intercom.com/help/en/articles/6546152-set-slas-for-conversations-and-tickets)).
- Companies cannot be imported by CSV ([import](https://www.intercom.com/help/en/articles/177-import-your-user-data-into-intercom)).
- Product tours do not work on mobile web ([tours FAQ](https://intercom.com/help/en/articles/7885216-product-tours-faqs)).
- The MCP server is limited to US-hosted workspaces ([Intercom MCP](https://www.intercom.com/integrations/connectors/intercom-mcp-server)).

We should not, however, count on Intercom's reporting being a soft spot. This round found no current evidence that it is, and Intercom added custom metrics and dataset export in September ([changelog p.2](https://www.intercom.com/changes/en?page=2)).

## Core gaps: an AI agent, live channels, and engines that run

The 20 P0 gaps fall into five groups:

- **AI and knowledge:** the AI agent, Train/Playground/Deploy, the help center, and Copilot basics.
- **The basic channel:** email.
- **Engines behind existing screens:** workflows, auto-assignment, availability, the SLA clock, business hours, snooze/reopen, and CSAT.
- **Composer basics:** macros, attachments, bulk actions, and search.
- **Data and reporting:** companies, segments, custom attributes, and prebuilt reports.

Priorities follow the standing decision that Comms targets the buyer of Intercom. P0 means that buyer expects it on day one. P1 means expected soon or on a mid tier. P2 is later parity, and "defer" means outside the clone surface or strategically gated. Effort is a sizing hint based on what the audit shows already exists: seams, live tables and drafted specs. It is not a plan. **S** is under a week, **M** is one to three weeks, **L** is one to two months, and **XL** is a quarter or more, for one or two engineers.

| # | Stage | Feature | Status (evidence) | Priority | Who has it | Effort |
|---|---|---|---|---|---|---|
| C1 | Self-serve/AI | AI agent that answers Messenger conversations from help-center content, cites sources and hands off to a human | **Missing**: no model is called; `@anthropic-ai/sdk` is installed but never imported; "Ask" is ILIKE search (`app/api/widget/ask/route.js`) | P0 | Intercom Fin; Zendesk; HubSpot; Help Scout; Plain (Ari); Featurebase (Fibi); Chatwoot (Captain, open source) | XL; BYO-provider spec drafted, vector tables exist live but are empty, `lib/ai/` absent |
| C2 | Self-serve/AI | Train, Playground and Deploy (guidance, tone, audiences, channel rollout, test chat) | **Missing** (stubs) | P0 | Fin; Chatwoot playground; HubSpot batch testing; Tidio Playground | L |
| C3 | Self-serve/AI | Evaluations, regression runs, versioned releases, A/B rollout | **Missing** (stubs) | P1 | Fin Simulations and Releases; Decagon; Pylon Nexus eval-gated changes ([Pylon](https://www.usepylon.com/blog/introducing-nexus)) | L |
| C4 | Self-serve/AI | Procedures and actions: multi-step flows that call customer APIs, with an approval step | **Missing**; only an unexecuted "Send webhook" workflow action exists | P1 | Fin Procedures and Data Connectors; Zendesk Action Flows; Decagon AOPs | XL |
| C5 | Self-serve/AI | Help-center authoring and public site: editor, collections, multiple help centers, multilingual | **Missing**: the widget reads 20 seeded rows; no editor and no website | P0 | Intercom (public help center on every plan); universal | L; tables exist live |
| C6 | Self-serve/AI | Internal articles, snippets and synced sources (URLs, PDFs, Notion, Confluence) feeding AI and agents | **Missing** | P1 | Intercom Knowledge Hub; Zendesk knowledge connectors | L |
| C7 | Channels | Live email: inbound forwarding, outbound from a verified custom domain, threading | **Have-shallow**: config labelled "Simulated"; agent replies are stored but never sent | P0 | Universal | L |
| C8 | Channels | Live WhatsApp and SMS | **Have-shallow** (simulated) | P1 | Intercom; Zendesk; HubSpot; Help Scout (2026); Pylon | L |
| C9 | Channels | Live Instagram and Facebook | **Have-shallow** (simulated) | P1 | Intercom; Zendesk; Zoho | L |
| C10 | Channels | Live Slack shared channels | **Have-shallow** (simulated) | P1 | Intercom; Plain; Pylon; Featurebase | L |
| C11 | Channels | Phone with IVR, recording, transcripts and a voice AI agent | **Missing** (stub) | P2 | Intercom Phone and Fin Voice ([Phone](https://www.intercom.com/help/en/articles/8488907-intercom-phone-explained)); Zendesk Contact Center; HubSpot | XL |
| C12 | Intake | Mobile SDKs (iOS, Android, React Native) and a published React SDK | **Missing**; the SDK repo is "to be pinned once pushed" | P1 | Intercom | L |
| C13 | Intake | Messenger completeness: per-audience spaces, Home apps, server-sent logo and avatars, emoji, multi-attachment, typing, queue position | **Have-shallow**: the core widget is deep, these extras are not | P1 | Intercom | M |
| C14 | Triage | Auto-assignment that runs (round robin, balanced) | **Have-shallow**: rules configured, auto-assignment "isn't switched on yet" (`routing_rules.jsx`) | P0 | Intercom (round robin Advanced+, balanced Expert); Help Scout; Freshdesk Growth | M |
| C15 | Triage | Teammate availability, away status, auto-unassign when away | **Have-shallow**: `setAvailability` exists, no UI calls it | P0 | Intercom; Help Scout (Jun 2026); Zendesk | S |
| C16 | Triage | Team inboxes | **Have-shallow**: groups and routing `team_id` exist; no team queue or team filter | P1 | Intercom (Advanced+) | S |
| C17 | Triage | Per-channel assignment limits and wrap-up time | **Missing** | P1 | Intercom (Jul 2026); Chatwoot | M |
| C18 | Triage | Skill-based routing | **Missing** (cut 22 Aug; flagged for revisit below) | P1 | Intercom (13 Jul 2026); Zendesk Professional; Freshdesk Enterprise; HubSpot | M |
| C19 | Triage | Workflow engine that fires triggers, evaluates conditions, runs actions and writes Run History | **Have-shallow**: 10 triggers, 8 conditions and about 17 actions are configurable; nothing executes them | P0 | Intercom Workflows (Advanced+); Zendesk triggers; Front rules | L |
| C20 | Triage | Branching, reply buttons and bot steps, "let AI answer", inactivity auto-close | **Missing**: workflows are a linear chain | P1 | Intercom ([Workflows](https://www.intercom.com/help/en/articles/7836459-workflows-explained)) | M |
| C21 | Handling | Macros usable from the composer | **Have-shallow**: macros CRUD with tokens and actions; no inbox file references them | P0 | Intercom; Chatwoot; universal | S |
| C22 | Handling | Agent attachments, emoji, rich formatting | **Missing**: agent messages send `attachments: []` | P0 | Universal | S |
| C23 | Handling | Bulk actions | **Missing** | P0 | Intercom (bulk on all matches); Plain; Chatwoot | M |
| C24 | Handling | Full-text and global search (message bodies; contacts and articles in ⌘K) | **Have-shallow**: ILIKE on subject and preview; ⌘K matches nav titles only | P0 | Intercom; Plain; Zendesk | M; a `message_search` migration exists live, not adopted |
| C25 | Handling | Snooze auto-wake and reopen on customer reply | **Missing**: no cron job; `post_message` never reopens | P0 | Universal | S |
| C26 | Handling | Copilot basics: summarize, rephrase/tone, draft reply from knowledge and history | **Missing** | P0 | Intercom inbox AI and Copilot ($29/agent); Help Scout; Front ($20); Zendesk ($50); Plain Sidekick | M, after C1's provider layer |
| C27 | Handling | AI translation of customer messages and replies | **Missing** | P1 | Intercom; Zendesk; Chatwoot; Crisp | M |
| C28 | Handling | AI triage: topic, sentiment and urgency attributes | **Missing** | P1 | Fin Attributes; Plain; Help Scout; Zoho | M |
| C29 | Handling | Merge conversations and contacts | **Missing** | P1 | Intercom; Zendesk (with merge suggestions) | M |
| C30 | Handling | Custom ticket attributes, forms and states | **Have-shallow**: three types, four fixed states, no custom attributes | P1 | Intercom; Zendesk; HubSpot | M |
| C31 | Handling | Spam filtering and a spam view | **Missing** | P1 | Intercom; LiveAgent | M, with C7 |
| C32 | Collaboration | Side conversations over email or Slack | **Missing** | P1 | Intercom; Zendesk | M, needs C7 |
| C33 | Collaboration | Collision detection and presence (who is viewing or typing) | **Missing** | P1 | Intercom; Front | S |
| C34 | Collaboration | Follow a conversation without being assigned | **Missing** | P2 | Intercom (21 Oct 2026) | S |
| C35 | Resolution/SLA | SLA clock end to end: office-hours due times, pause on snooze or waiting, breach state, inbox badges and sort, pre-breach and breach triggers | **Have-shallow**: policy CRUD; the engine is live-DB-only; seeds push due dates to 2030 | P0 | Intercom (Expert); Zendesk; Freshdesk Growth; Help Scout; HubSpot | M |
| C36 | Resolution/SLA | Business hours and holiday editor | **Missing**: read-only lookup; Settings page is a stub | P0 | Intercom; Help Scout (per inbox); Plain (per team) | S |
| C37 | Follow-up | CSAT request on close, plus CSAT reporting | **Have-shallow**: the widget stores the rating; nothing reads it | P0 | Universal | S |
| C38 | Self-serve | Customer portal for a customer's tickets and conversations | **Missing**: widget Tickets space only | P1 | Intercom (Advanced+); Help Scout (Aug 2026); Freshdesk; HubSpot | M |
| C39 | Customer data | Companies as a persisted entity | **UI-only**: create and delete never persist | P0 | Intercom; HubSpot; Help Scout | M |
| C40 | Customer data | Segments stored server-side and reusable in views, workflows and targeting | **UI-only**: localStorage | P0 | Intercom | S |
| C41 | Customer data | Custom data attributes and tracked events on profiles | **Missing**: Custom Fields is a stub; `trackEvent` data is stored but unused | P0 | Intercom; universal | M |
| C42 | Customer data | CSV import of people and companies | **Missing** | P1 | Intercom (people only) | S |
| C43 | Customer data | Custom objects | **Missing** | P2 | Intercom; Zendesk | L |
| C44 | Reporting | Prebuilt reports: first response, time to close, SLA compliance, teammate performance, CSAT, volume by channel and tag | **Have-shallow**: Overview dashboard only; response timestamps are recorded but unread | P0 | Intercom (12 prebuilt, every plan) | M |
| C45 | Reporting | Custom reports, custom metrics, dataset and CSV export, scheduled sharing | **Missing** | P1 | Intercom (Advanced+); Zendesk; Freshdesk Pro | L |
| C46 | Reporting | Real-time dashboard of queues and teammate status | **Missing** | P2 | Intercom (Expert) | M |

Read as a whole, the list says the gap is not mainly missing screens. **Seven of the 20 P0s are S-sized** because the work behind them already exists: C15, C21, C22, C25, C36, C37 and C40. Macros, CSAT capture, availability and segments are built and need wiring, not invention. The two XL items, the AI agent (C1) and Procedures (C4), are where Intercom is spending, and they cannot be faked. The October KB and AI providers spec (`docs/specs/2026-10-18-knowledge-base-and-ai-providers-design.md`) is the right vehicle, but it is still an unstarted draft, gated on RBAC hardening and its own open questions.

## Adjacent features: Intercom's proactive basics come first

Intercom's pattern for adjacent categories is consistent. It absorbs features that run through the Messenger or the conversation record: tours, News, surveys, phone, QA and incident fan-out through tracker tickets. It skips features that need a different user or a different data spine: feedback boards, community, customer-success health scores, status pages, co-browse and CDPs. None of the latter appears on its pricing page ([Intercom pricing](https://www.intercom.com/pricing)).

Featurebase comes at the bundle from the other direction, combining a support inbox, AI agent, feedback voting, roadmap, changelog, help center and surveys at $29–$99 per seat plus $0.49 per resolution ([Featurebase](https://www.featurebase.app/); [pricing](https://www.featurebase.app/pricing)). Buyers want consolidation: a vendor-sponsored survey of 1,505 European CX leaders found **94% prioritise stack consolidation** ([Puzzel](https://www.puzzel.com/press/new-survey-reveals-the-key-customer-experience-cx-trends-for-2026)). That favors covering the 70–80% use case of an adjacent tool inside the existing price, not matching the specialist.

Comms has only three seeds in this circle: a News reader in the widget, tracker-ticket linking, and a "Which order?" picker that reads a table no repo migration creates.

| # | Category | Feature | Status (evidence) | Priority | Who has it | Effort |
|---|---|---|---|---|---|---|
| A1 | Proactive | Outbound in-app chats and posts targeted by attribute or page | **Missing**: `components/widget/proactive.jsx` is built but not mounted | P1 | Intercom (chats free on every plan; posts in Proactive Support Plus) | M |
| A2 | Proactive | News/changelog authoring, newsfeeds, public News page | **Have-shallow**: widget News reads `comms.posts`; nothing authors them | P1 | Intercom ([News](https://www.intercom.com/help/en/articles/6362251-news-explained)); Featurebase; Beamer | M |
| A3 | Proactive | Banners | **Missing** | P1 | Intercom (free on every plan) | M |
| A4 | Proactive | Tooltips | **Missing** | P2 | Intercom (free on every plan) | M |
| A5 | Surveys/VoC | NPS, CSAT and CES surveys in the Messenger | **Missing**: post-chat stars only | P1 | Intercom (8 question types, [surveys](https://www.intercom.com/help/en/articles/5973834-intercom-s-survey-types)); HubSpot; Featurebase | M |
| A6 | Proactive | Checklists (Tasks space) | **Missing** | P2 | Intercom; Appcues | M |
| A7 | Proactive | Product tours (mobile web would beat Intercom's web-only tours) | **Missing** | P2 | Intercom; Appcues; Pendo | L |
| A8 | Lifecycle | Series journey builder with goals, control groups and A/B | **Missing** | P2 | Intercom ([PSP](https://www.intercom.com/help/en/articles/9061648-proactive-support-plus-add-on)) | XL |
| A9 | Lifecycle | Email campaigns and SMS/WhatsApp broadcasts | **Missing** | P2 | Intercom (pay-as-you-go); Plain and Pylon broadcasts | L |
| A10 | Proactive | Mobile push and carousels | **Missing**; needs mobile SDKs (C12) | defer | Intercom | L |
| A11 | Incidents | Tracker-ticket fan-out: notify every linked customer, bulk close, export affected customers | **Have-shallow**: trackers link many conversations; the audit found no fan-out path | P1 | Intercom (no export, [tracker tickets](https://www.intercom.com/help/en/articles/8300295-when-to-use-tracker-tickets)); incident.io with Zendesk | S |
| A12 | QA | Monitors and scorecards for AI and human conversations | **Missing** | P2 | Intercom Pro; Zendesk QA; Front Smart QA; Decagon Watchtower | L |
| A13 | VoC | AI CX score on every conversation | **Missing** | P2 | Intercom CX Score (Pro); Front Smart CSAT | M |
| A14 | Insights | Topics, trends and incident detection | **Missing**: live `topics` tables are empty | P2 | Intercom Pro; Plain Insights; Zendesk | M |
| A15 | Knowledge mgmt | Knowledge-gap detection and content suggestions | **Missing** (stub) | P1 | Intercom (Pro); Plain (30 Sep 2026); Chatwoot; Freshworks; Zendesk | M |
| A16 | Engineering escalation | Linear, Jira and GitHub links from a conversation or tracker, with status back-sync | **Missing** | P1 | Plain; Pylon; Featurebase; Intercom via apps and Copilot 2 ([Copilot](https://www.intercom.com/helpdesk/copilot)) | M |
| A17 | Meetings | Calendly or Chili Piper booking in chat | **Missing** | P2 | Intercom; Fin for Sales | S |
| A18 | Workforce | WFM: forecasts, schedules, coverage, adherence | **Missing** (cut; flagged for revisit) | defer | Intercom WFM (15 Oct, Pro); Zendesk; Pylon basic | XL; integrate Assembled first |
| A19 | Ecommerce | Order context and Shopify actions (refunds, replacements) | **Have-shallow**: widget order picker over `comms.orders`, a table with no repo migration | defer (revisit) | Intercom (Jun and Oct 2026); Gorgias; Tidio; Gladly | L |
| A20 | Sales assist | Sales-mode Messenger and lead qualification | **Missing**; offline lead capture only | defer | Intercom Fin for Sales and Spotlight; Salesforce/Qualified | L |
| A21 | Feedback | Feedback boards, voting, roadmap, "shipped" notifications | **Missing** | defer (novel track) | Featurebase; Canny; Zendesk Gather (light) | L |
| A22 | Community | Community forums | **Missing** | defer (cut, not Intercom) | Zendesk Gather; Freshdesk Pro; Zoho | L |
| A23 | Customer success | Account health scores and account intelligence | **Missing** | defer (cut, not Intercom) | HubSpot; Pylon ($10/account/mo); Help Scout Company Profile | L |
| A24 | Integrate, don't build | Status page, co-browse, CDP ingestion, session replay | **Missing** | defer (integrate) | Statuspage and incident.io; Cobrowse.io and Upscope; Segment; Pendo | integration |
| A25 | Emerging channel | Personal-agent (B2A) channel and AI-caller detection | **Missing** | defer (watch) | Sierra Personal Agent Protocol with Meta; Decagon gateway and PACT; Lorikeet ([Sierra](https://sierra.ai/blog/summit-recap-2026); [Decagon](https://decagon.ai/blog/dialogues-2026)) | watch |

The ranking inside this list follows Intercom's own packaging. Chats, banners and tooltips are free on every Intercom plan, so an Intercom buyer treats them as part of the base product. The metered items (posts, tours, surveys, Series) cost $99 a month plus $0.0175–$0.07 per message beyond 500, so many Intercom buyers never turn them on ([PSP](https://www.intercom.com/help/en/articles/9061648-proactive-support-plus-add-on)). Knowledge-gap detection (A15) and Linear/Jira linking (A16) are P1 rather than P2 because the challengers made them baseline for the B2B SaaS buyers who also evaluate Intercom ([Plain](https://www.plain.com/changelog); [Pylon](https://www.usepylon.com/)).

## Non-core gaps decide security reviews before features do

Procurement treats identity, audit and residency as pass/fail gates:

- SAML/OIDC SSO with SCIM deprovisioning.
- Audit logs kept 90+ days and exportable.
- Data residency, where failing a mandatory criterion "should be disqualified immediately" ([SaaS CRM Review](https://saascrmreview.com/knowledge-base-software-requirements-template/); [Supportbench](https://www.supportbench.com/helpdesk-rfp-canadian-organizations-scorecard-requirements/)).

Intercom clears all of these with SOC 2 Type II, ISO 27001/27701/27018/42001, AIUC-1, HIPAA and US/EU/AU hosting ([fin.ai/trust](https://fin.ai/trust-reliability)). It still charges the "SSO tax" by reserving SSO for Expert, while Freshdesk includes SSO on its $19 Growth plan ([Freshdesk](https://www.freshworks.com/freshdesk/pricing/)).

Comms clears none of the gates today. More urgently, it fails a basic trust check: **any authenticated suite user can promote themselves and gain `comms.settings.manage` and `comms.article.publish`** (KB spec §1.7).

| # | Area | Feature | Status (evidence) | Priority | Who has it | Effort |
|---|---|---|---|---|---|---|
| N1 | Security | RBAC that cannot be bypassed: close self-promotion; `roles_write` is still `using (true)` | **Have-shallow**: deep role UI, broken trust (`rbac_trust_hardening` pending) | P0 | Intercom custom roles (Expert) | S–M |
| N2 | Admin | Teammate invitations that actually send email | **Have-shallow**: the toast says "Invitation sent", but "No mail is actually sent yet" (`use_team.js`) | P0 | Universal | S |
| N3 | Platform | Reproducible schema: adopt the 25 lost migrations, fix seeds, restore the missing seed script | **Have-shallow**: live DB ahead of the repo; `scripts/seed-inbox.js` missing | P0 | n/a | M |
| N4 | Usability | Placeholder destinations hidden until built | **Missing**: 44 stubs visible by default (`hiddenByDefault: []`) | P0 | n/a | S |
| N5 | Admin | General workspace settings (name, timezone, languages, default hours) | **Missing** (stub) | P1 | Universal | S |
| N6 | Usability | Comms-native notifications: desktop/browser, digests, per-agent preferences | **Have-shallow**: the bell reads geiger-flow's `public.flow_notifications` | P1 | Intercom; Zendesk per-agent preferences ([Zendesk Sept](https://support.zendesk.com/hc/en-us/articles/11180657600026-What-s-new-in-Zendesk-September-2026)) | M |
| N7 | Platform | Public REST API for conversations, contacts and tickets, plus outbound webhooks | **Missing**: only the widget API exists | P1 | Intercom API v2.17; Plain; Featurebase ($29 tier) | L |
| N8 | Platform | Integrations marketplace and sidebar-app framework, with core apps (two-way Salesforce/HubSpot, Stripe, Shopify, Slack notifications) | **Missing** | P1 | Intercom 450+; Zendesk 1,800+; HubSpot 2,000+; Front two-way CRM | XL |
| N9 | Platform | MCP server and MCP client | **Missing** | P2 | Intercom (US-only); Zendesk client GA; Plain; Pylon; Freshdesk | M |
| N10 | Setup | Import and migration from Intercom, Zendesk, Help Scout and Freshdesk | **Missing** (stub) | P1 | Plain; Chatwoot; Intercom native importer | L |
| N11 | Governance | Audit log covering admin, data-export and AI-config changes, with retention and export | **Have-shallow**: Team Activity feed only; live `audit_log` not adopted | P1 | Intercom (all plans, 1 year); Freshdesk Enterprise; Zendesk SIEM webhooks | M |
| N12 | Identity | SAML/OIDC SSO and SCIM | **Missing**: shared suite session only | P1 | Intercom (Expert); Front Pro; Freshdesk Growth; Help Scout Pro | L |
| N13 | Identity | Enforced 2FA, IP allowlisting, session policy | **Missing**: `input-otp` installed but unused | P1 | Intercom; Zendesk; Chatwoot (2FA enforcement, v4.19) | M |
| N14 | AI compliance | Per-channel, per-language AI disclosure; machine-readable marking; answer citations and reasoning logs; visible handoff | **Missing** (the widget already refuses to mislabel non-AI answers) | P0, ships with C1 | Zendesk per-channel label; Intercom source citations | S–M |
| N15 | Accessibility | WCAG 2.1 AA / EN 301 549 conformance for the Messenger and help center | **Missing** (not assessed by the audit; treat as missing until reviewed) | P1 | Intercom (WCAG 2.2 tooltip sizes) | M |
| N16 | Privacy | Data export, retention auto-delete, GDPR access and erasure tooling | **Missing** | P1 | Intercom (auto-deletion, CSV and S3 export) | M |
| N17 | Billing | Plans, seats, AI usage meters, spend caps and a per-outcome audit trail | **Missing** (stub) | P1 | Intercom usage limits; Zendesk allowance dashboards; Help Scout spend cap | L |
| N18 | Billing | Lite or viewer seats for occasional responders | **Have-shallow**: a `viewer` system role exists; no seat model | P1 | Intercom (20/50 free); Featurebase; Freshdesk (5,000 collaborators); Plain; Pylon | S, after N17 |
| N19 | Security | Rate limiting on a shared store | **Have-shallow**: in-memory and per-instance (`lib/widget/ratelimit.js`) | P1 | n/a | S |
| N20 | Admin | Multi-brand (per-brand Messenger, help center, email, SMS) | **Missing**: 4 live `brands` rows, unused | P2 | Intercom (Expert, 300 brands); Zendesk; Kustomer | L |
| N21 | Admin | Sandbox or test workspace | **Missing** (stub) | P2 | Intercom test workspaces; Zendesk and Freshdesk Enterprise | M |
| N22 | Compliance | Data residency (EU/US) | **Missing** | P2 | Intercom (US/EU/AU) | XL |
| N23 | Compliance | SOC 2 Type II, ISO 27001, HIPAA BAA, ISO 42001/AIUC-1 | **Missing** | P2 | Intercom; Ada (AIUC-1); Parloa | XL (organizational) |
| N24 | Usability | Agent mobile apps | **Missing** | P2 | Intercom; Zendesk; Help Scout | XL |

The ordering here is deliberate. Five P0s are trust and honesty items, and four of them are S or S–M. N14 is P0 not because Comms has AI today, but because the AI work in the first core group cannot ship without it. The new law makes disclosure a launch blocker. Customer data makes the handoff a product requirement: 87% of customers say a human option is essential ([Macha compilation citing Gartner](https://www.getmacha.com/blog/customer-service-ai-statistics)).

## A dozen defects keep "built" features from counting

The audit's DEEP ratings describe code paths, not observed behavior. No dev server or database was run, and live-DB triggers from the lost September migrations may run some SLA or routing logic the repo cannot show. Several defects change whether a feature counts as built, and they belong next to every status above:

| Caveat | What it does to the status | Evidence |
|---|---|---|
| Any authenticated suite user can promote themselves to settings and publish rights | Roles & Permissions is deep in the UI but bypassable in practice; it also blocks the KB/AI spec | `docs/specs/2026-10-18-knowledge-base-and-ai-providers-design.md` §1.7 |
| The invite toast says "Invitation sent", but no email is sent | New teammates can only be added out of band | `components/internal/screens/settings/team/use_team.js` lines 343–346 |
| 25 applied migrations have no repo files; about 50 live tables are undefined in the repo; code reads `business_hours`, SLA columns, `leads` and `orders` with no repo migration | A fresh environment built from the repo loses SLA, Help, leads and orders; a new `create table if not exists` silently no-ops on these names | project memory `lost-september-migrations.md`; `supabase/migrations/20261018184858_adopt_automation.sql` header |
| Seeded business-hours rows use the wrong schedule shape, so SLA due dates land around 2030 and `sla_state` stays `on_track` | SLA usage counts look healthy and mean nothing | project memory `business-hours-seed-format.md` |
| Companies create and delete only update local state | Companies is UI-only for writes | `components/internal/screens/customers/companies.jsx` lines 136–170 |
| Segments persist to localStorage per browser | Segments are UI-only and cannot drive targeting or workflows | `components/internal/screens/customers/segments.jsx` |
| People falls back to `DEMO_PEOPLE` when the DB returns no contacts | A real empty workspace can show fabricated customers, against repo convention | `components/internal/screens/customers/use_customers.js` lines 34–37 |
| No workflow, routing or SLA engine exists in the repo; Run History reads rows nothing writes | Workflows, Routing and SLA Policies are configuration, not features | `lib/supabase/workflow_runs.js`; `components/internal/screens/automation/routing_rules.jsx` lines 391–395 |
| Agent replies on email, WhatsApp, SMS and Slack conversations are stored but never dispatched | Only Messenger is a working channel | `components/internal/screens/channels/constants.js`; `app/api/` (no provider routes) |
| Snoozed conversations never wake, and customer replies do not reopen them | Snooze and close are one-way for the agent | `lib/supabase/comms.js` lines 414–420; `supabase/migrations/20261017181523_widget_security_lockdown.sql` |
| Widget rate limiting is in-memory per instance; `comms.article_views` does not exist | Limits are soft across instances; "popular" articles are really just recent ones | `lib/widget/ratelimit.js`; `lib/widget/data.js` line 406 |
| 44 of 68 nav entries are visible stubs, and 20 inbox files carry an uncommitted redesign | First impressions are mostly placeholders; the inbox's visual state is in flux | `components/internal/sidebar/sidebar_nav.jsx`; `geiger-ui.config.js`; `git status` |

## Intercom shipped four features we cut as out of scope

The 22 August decision record scoped Comms to Intercom's surface and cut several features as other vendors' products (`docs/sidebar-audit-2026-08.md` §7; project memory `comms-is-an-intercom-clone.md`). This report does not override that decision. But four of the cuts now rest on facts that are no longer true, and one of them was already outdated when the cut was made. They need an explicit revisit, not a silent change in priority.

| Cut (22 Aug 2026) | Original rationale | New evidence | Recommendation |
|---|---|---|---|
| Skills-based routing | Zendesk enterprise feature | Intercom shipped skill-based routing with fallback to load balancing on **13 Jul 2026**, and skills-based call routing on 16 Oct ([changelog p.6](https://www.intercom.com/changes/en?page=6); [changelog](https://www.intercom.com/changes/en)) | **Revisit:** reclassify as Intercom surface at P1, built after auto-assignment and availability (C14, C15) |
| Workforce Management | Zendesk add-on; its own discipline | Intercom launched WFM on **15 Oct 2026** in the Pro add-on: 8-week forecasts, shift templates with two-way Google Calendar sync, coverage, adherence and shrinkage ([Intercom WFM](https://www.intercom.com/blog/announcing-workforce-management)) | **Revisit the classification, keep the build deferred.** It needs months of volume data and working routing first; availability and wrap-up time come first, and an Assembled integration can bridge the gap |
| Ecommerce order actions | Gorgias/Tidio territory | Intercom added Shopify refunds, gift cards and replacement orders in the Inbox on 17 Jun, a new shipping address on 7 Oct, and Fin for Ecommerce in May ([changelog p.8](https://www.intercom.com/changes/en?page=8); [changelog](https://www.intercom.com/changes/en); [fin.ai/updates](https://fin.ai/updates)) | **Revisit:** now Intercom surface but secondary for a SaaS-leaning buyer; keep at defer, and note the widget already has an order picker over an unmigrated table |
| Programmable IVR | Gladly's moat | Intercom Phone has no-code IVR trees with keypad or speech input, callbacks, voicemail and recording consent ([omnichannel](https://www.intercom.com/helpdesk/omnichannel); [Phone](https://www.intercom.com/help/en/articles/8488907-intercom-phone-explained)) | **Revisit when Phone is scoped.** Phone stays P2, so IVR rides with it |
| Approval workflows | Zendesk enterprise feature | Intercom has a Procedures "Ask a teammate" approval step (May 2026), human-in-the-loop (beta), Releases that need approval, and Operator proposals ([fin.ai/updates](https://fin.ai/updates); [HITL](https://www.intercom.com/help/en/articles/16198358-ask-a-teammate-for-help-with-email-replies-human-in-the-loop)) | **Partial revisit:** build approvals as AI-agent steps (C4), not as a generic approval engine |
| Lifelong timeline (kept as the People detail view) | Gladly's differentiator | Fin Memory recalls past conversations across chat and email (Jul–Aug 2026) ([fin.ai/updates](https://fin.ai/updates)) | **No change:** the timeline exists; make sure the AI agent can read it |
| Community forums; health scores; a Teams channel | Not Intercom's product | Still absent from Intercom's pricing page and channel list ([pricing](https://www.intercom.com/pricing); [omnichannel](https://www.intercom.com/helpdesk/omnichannel)) | **Keep cut** |

## Top 10 next moves for an Intercom buyer

The moves are ranked by impact on an Intercom buyer's evaluation. Effort and dependencies show sequencing. The second and third moves are a pair: the knowledge base is the agent's fuel, so it is built first even though the agent ranks higher.

| Rank | Move | Why it ranks here | Effort | Depends on |
|---|---|---|---|---|
| 1 | **Make what is shown true.** Close the RBAC self-promotion hole, send invitation email, adopt the lost migrations into the repo, fix the business-hours seed shape, persist companies and segments, drop the demo-people fallback, and hide the 44 stubs until they ship (N1–N4, C39, C40) | A buyer's security review fails on the first item today. A demo that clicks into placeholders or 2030 SLA dates loses trust faster than a missing feature does. The KB/AI spec names RBAC hardening as its prerequisite. | M | — |
| 2 | **Ship an AI agent v1 on Messenger**: provider layer per the October spec, knowledge index, cited answers, human handoff, playground, audience-scoped deployment, AI disclosure in every language, machine-readable marking, and an outcome log that separates confirmed from assumed resolutions (C1, C2, N14) | Fin is what an Intercom buyer buys first. Every competitor, down to open-source Chatwoot, ships an agent with a playground. Without one there is no evaluation to win. | XL | 1, 3 |
| 3 | **Ship the knowledge base**: editor, collections, help centers, public site (C5, then C6) | It is the agent's fuel, a public help center is on every Intercom plan, and the tables already exist live. | L | 1 |
| 4 | **Turn on the engines behind existing screens**: workflow executor, auto-assignment with availability, SLA clock with inbox timers, snooze wake and reopen, business-hours editor (C14, C15, C19, C25, C35, C36) | Workflows, round robin and SLAs are the daily operating system of an Intercom team. Today the screens promise behavior that nothing delivers. | L | 1 |
| 5 | **Make email a real channel** (C7, then C31, C32) | Email is universal, and today only Messenger replies reach customers. Spam handling and side conversations depend on it. | L | — |
| 6 | **Finish the composer**: macros, attachments and emoji, bulk actions, full-text search, then AI summarize, compose and translate (C21–C24, C26, C27) | The cheapest high-value cluster; macros are already built, and the AI parts reuse move 2's provider layer. | M | 2 (AI parts) |
| 7 | **Report on what is already recorded**: first response, time to close, SLA compliance, teammate performance, CSAT, CSV export (C37, C44, then C45) | Intercom ships 12 prebuilt reports on every plan, and our timestamps and ratings are already stored and never read. | M | 4 (SLA metrics) |
| 8 | **Complete the customer data model and an Intercom importer** (C41, C42, N10) | Targeting, workflows and reports key off attributes, companies and segments, and nobody switches without moving history. | L | 1 |
| 9 | **Proactive v1**: outbound chats and posts, banners, News authoring, NPS and CSAT surveys (A1, A2, A3, A5) | Proactive in-app messaging is Intercom's most distinctive depth, and the free tier of it is part of every Intercom plan. The widget already renders News and has an unmounted proactive card. | L | 8 |
| 10 | **Open the platform and clear enterprise gates**: REST API and webhooks, real Slack, Linear/Jira linking, CRM sync, audit log, SSO and SCIM (N7, N8, N11, N12, C10, A16) | Expert-tier and B2B buyers check these before features, and challengers bundle API, MCP and Linear sync at $29–$99 per seat. | XL | 1 |

## Conclusion

The gap analysis changes the question from "which Intercom screens are we missing?" to "which of our screens actually do something?". Comms already has the authoring surfaces for workflows, routing, SLAs, macros, segments and CSAT. **Nine of the 25 P0 items across the three lists are S-sized**, because the remaining work is wiring, honesty or a missing email send, not new product. A short, unglamorous sprint would turn a demo that fails on inspection into a smaller product that holds up. The one gap that cannot be wired is AI, and the market has moved past the point where an Intercom clone without an agent is a clone at all. Fin 4's claim that ticket-based helpdesks no longer fit means the 2026 reading of "clone Intercom" is an inbox built around reviewing, approving and correcting AI work.

Starting late on AI is not entirely a handicap. Comms has no legacy bot to retrofit, so Article 50 disclosure, machine-readable marking and a human handoff can ship as defaults. A "confirmed vs assumed resolution" ledger directly targets Intercom's most-cited complaint, its pricing, and the 76%-claimed versus 24%-experienced resolution gap. Intercom's own documented limits sit inside the clone scope and can be beaten: one SLA per conversation, companies that cannot be CSV-imported, web-only tours, a US-only MCP server, and Expert-only SLAs, roles and SSO. Matching the feature while removing the limit is depth, not a novel feature, so it respects the standing scope decision. The Salesforce acquisition may yet make "independent Intercom" a selling point, but no evidence supports betting on that today. The surer bet is a smaller product whose every visible screen is true.
