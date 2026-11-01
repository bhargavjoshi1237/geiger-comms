# AI-native and challenger customer-support / messaging products vs Intercom (state as of 2026-10-21)

Scope: B2B and modern helpdesks (Plain, Pylon, Unthread, Thena, Atlas, Missive, Featurebase, Chatwoot, Crisp, Tidio, LiveChat/Text, Re:amaze, Trengo, respond.io) and AI-agent specialists (Decagon, Sierra, Ada, Forethought, Fini, Lorikeet, Siena, eesel, Parloa). Incumbents and Intercom are out of scope. Research was done 2026-10-21, mostly from vendor pages fetched that day. Internal prior work (`docs/competitor-feature-inventory.md` 2026-07-28, `docs/sidebar-audit-2026-08.md` §1.3) was skimmed. This pass verifies those docs and goes deeper; where it relies on them it says so.

Reliability conventions:
- "(vendor page, fetched 2026-10-21)" means the claim is the vendor's own current marketing or pricing.
- "(3rd-party)" marks a review, aggregator or competitor blog.
- "(older)" marks information from before June 2026.

---

## 1. Per product: positioning, channels, inbox UX, AI, issue trackers, account context, workflows, help center, feedback, pricing (B2B and modern helpdesks)

### Takeaway
The B2B challengers have converged on one shape:
- **Channels:** Slack, Teams and Discord sit next to email, chat and a portal as first-class channels.
- **AI:** AI triage (labels, urgency or priority, summaries) is built in. A per-resolution or credit-metered AI agent runs alongside it.
- **Issue trackers:** two-way Linear, Jira and GitHub linking.
- **Account context:** CRM data plus product data.
- **Platform:** MCP and API access.

Since July 2026, the leaders (Pylon, Plain) have been repositioning from "helpdesk with AI" to an **agentic support platform**. Background agents run natural-language "Skills" across the queue, and humans supervise.

SMB and messaging challengers (Crisp, Tidio, Text/LiveChat, Re:amaze, Featurebase, respond.io, Trengo) compete mainly on **transparent, low AI pricing**: flat workspace fees, or $0.49–$0.99 per AI resolution. They also compete on channel breadth (WhatsApp, social, voice).

### Cited Findings

#### Plain (B2B, API-first; closest "modern Intercom-for-B2B")
- **Channels:** Slack, Microsoft Teams, Discord, email, Live Chat, Help Center, In-app Forms and a portal. The pricing page also lists "Headless portal" and "Custom channels". — [Plain home](https://www.plain.com/); [Plain pricing](https://www.plain.com/pricing)
- **Named AI** (vendor page, fetched 2026-10-21):
  - **Ari**, the customer agent, "triages requests, investigates issues".
  - **Sidekick** drafts replies, summarizes threads and searches knowledge, using customer history.
  - **Auto-triage** assigns labels, detects urgency and keeps thread summaries current.
  - **Insights** covers trends, churn risk, upsell potential and daily summaries. The linked URL contains "themes-beta".
  - **Ask AI** handles customer self-service.
  - Routing is AI-based, "by context or tone".
  - The product supports "multiple AI agents, including your own".
  - Source: [Plain home](https://www.plain.com/)
- **Pricing** (fetched 2026-10-21):
  - Foundation is $45/user/mo (annual) with 1,000 credits/mo. It includes Sidekick, Ari, AI workflows, Slack, email and in-app channels, Linear and Jira, and the Help Center/KB.
  - Horizon is $99/user/mo with 2,500 credits. It adds Microsoft Teams, SLAs and business hours, escalation paths, CRM integrations, "Reporting themes" and "AI suggested responses".
  - Frontier is custom: multiple workspaces, SSO/SCIM, HIPAA.
  - **Ari costs "100 credits/resolution"**. Credit top-ups are $10 per 1,000 credits, so Ari is about $1.00 per resolution.
  - Sidekick costs "15-300+ credits, depending on effort". A "Connected Agent" (third-party agent) costs 15 credits per assignment plus 15 per discussion.
  - Viewer seats exist.
  - Source: [Plain pricing](https://www.plain.com/pricing)
- **Integrations:** Linear, Shortcut, Jira, GitHub, incident.io, Rootly, Cursor, and HubSpot, Attio and Salesforce sync.
- **Importers:** from Intercom, Freshdesk, Zendesk and Help Scout.
- **Developer platform:** API, Webhooks, Events, MCP, Custom channels.
- Source: [Plain pricing](https://www.plain.com/pricing)
- **Keyboard-first inbox:**
  - ⌘K opens the command palette and `?` lists all shortcuts.
  - `J`/`K` move between threads, `E` marks a thread done, `A` assigns, `R` focuses the reply composer, `F` opens filters and `/` searches.
  - `I` adds a Linear issue. This appears in one version of the docs only.
  - The Help Center version also lists `T` (add task), `V` (display options) and Shift-click multi-select for bulk actions.
  - Sources: [Plain docs – shortcuts](https://www.plain.com/docs/shortcuts); [Plain help – keyboard shortcuts](https://help.plain.com/article/keyboard-shortcuts)
- **Changelog, Sep 23 – Oct 9 2026:**
  - Per-team business hours (Sep 23).
  - GitHub PRs linkable to threads (Sep 24).
  - New workspaces start with label suggestions and test threads (Sep 24).
  - **"Knowledge gaps" turns customer questions into help-center article candidates (Sep 30).**
  - Broadcasts to every customer channel, moved into the sidebar (Oct 1).
  - Workflow steps using the Internal Agent can **call your own MCP tools**. Manual workflows can run across a whole queue. The Customer Agent closes completed threads. (All Oct 2.)
  - **AI sets label and priority as a workflow step** (Oct 7).
  - Ari can be turned on for select live threads, manually or from a workflow (Oct 8).
  - Source: [Plain changelog](https://www.plain.com/changelog)

#### Pylon (B2B; Slack Connect-native, now "agentic support platform")
- **Channels** on all plans: Email, chat widget, SMS, ticket forms, Slack Connect, WhatsApp, Discord, Telegram, Slack Community and internal Slack channels.
  - Microsoft Teams, Google Chat and custom issue sources require Advanced or higher.
  - Phone is an add-on at $35/seat/mo.
  - Source: [Pylon pricing](https://www.usepylon.com/pricing)
- **Agents:**
  - **Assist Agent** ("Your personal AI operator") investigates, uses your tools, takes action, and can delegate to external agents.
  - **Support Agent** resolves customer questions across channels.
  - **Slack Agent** handles asks and actions from Slack.
  - **Automations** run on a kickoff event or a schedule.
  - **Skills** are "reusable instructions that teach agents how your team investigates and resolves work".
  - Workflows, agents and routing can be configured "by describing it in natural language".
  - Source: [Pylon home](https://www.usepylon.com/)
- **July 15 2026 repositioning:** "Today, Pylon becomes the agentic support platform" (beta).
  - **Background Agents** start from a trigger and work the queue. Humans "see, review, redirect, or take over".
  - **Skills** are natural-language instructions that agents run automatically or humans invoke.
  - Context comes in three layers: Support, Account and Product Intelligence.
  - Early-access claims from 20 customers (Cognition, Hex, Canvas Medical, Nominal): one cut L1→L2 escalations 70%.
  - Source: [Pylon blog, 2026-07-15](https://www.usepylon.com/blog/pylon-becomes-the-agentic-support-platform)
- **Nexus 1.0 (Oct 6 2026)** is the "agentic harness behind Pylon's agents".
  - Six mechanisms: context, memory, traces, routing, guardrails and improvement.
  - Each step is routed to a suitable model.
  - Guardrails check replies for PII, sender identity and citations before sending. Write actions, such as a feature request, are held for human approval.
  - **Eval sets per class of support work are rerun on every proposed change.** A change ships only with a measurable gain in quality, cost or latency.
  - Traces become new eval cases or documentation fixes.
  - Source: [Introducing Nexus](https://www.usepylon.com/blog/introducing-nexus)
- **Pylon x Devin (Oct 13 2026)** sends customer-reported bugs, with ticket context, to the Devin coding agent and tracks the fix in Pylon. There is a live launch event on Oct 27. — [Pylon x Devin](https://www.usepylon.com/blog/pylon-x-devin); [Pylon home](https://www.usepylon.com/)
- **Security posture:** a Sep 10 2026 post argues for separating data access, untrusted input and outbound messaging ("The agent that talks can't look...") to resist prompt injection. A Sep 1 post covers tracking escalation reasons ("Categorize what your AI can't do"). — [Pylon blog index](https://www.usepylon.com/blog); [prompt-injection post](https://www.usepylon.com/blog/prompt-injection-defense); [categorize post](https://www.usepylon.com/blog/categorize-what-your-ai-cant-do)
- **Account Intelligence** combines conversations, CRM data (Salesforce, HubSpot), product usage, logs and code. Other sources: Gong, Snowflake, BigQuery, PostHog, Mixpanel, LaunchDarkly. Integrations include Linear, Jira, Cursor and Claude/ChatGPT. KB integrations: Notion and Confluence. Data is exposed to agents through MCP. — [Pylon home](https://www.usepylon.com/)
- **Pricing** (fetched 2026-10-21):
  - Professional is $89/seat and Advanced $139/seat, both on annual contracts. Enterprise is custom.
  - **Account Intelligence is $10 "per customer account/month"**.
  - AI is credit-based: "You're not charged per ticket". The minimum commitment is 5,000 credits, and there is no public per-credit price.
  - Skill-based routing, team SLAs and **pull-based queues** require Advanced or higher.
  - WFM covers support hours and active/away status. Staffing heatmaps and capacity planning are Advanced or higher.
  - "Viewer seats" are on all plans.
  - The FAQ metadata contradicts the visible text on whether AI is sold per resolution. The visible text says it isn't.
  - Source: [Pylon pricing](https://www.usepylon.com/pricing)
- **Scale:** "Trusted by 1,500+ B2B customers". — [Pylon home](https://www.usepylon.com/)

#### Unthread (Slack-native; drifting toward ITSM / internal service management)
- **Channels:** "Chat-based ticketing" from Slack channels or DMs to a support bot, plus Teams, email, customer portal, live chat and API.
- **AI:** "Agentic AI", "Self-learning Knowledge" (auto-updating docs from tickets), KB "Drafts from resolved conversations", and "AI Analytics" covering deflection, CSAT and gap analysis.
- **Operations:** "SLAs & SLOs" with on-call alerts, and "On-call rotations".
- **ITSM features:** CMDB and asset tracking, change management, problem management and CAB approvals.
- **Integrations:** Jira, Linear, GitHub, ClickUp, Asana and Monday.
- **Sales model:** no self-serve signup and no public pricing.
- Source: [Unthread home](https://unthread.io/) (vendor page, fetched 2026-10-21)
- **Funding:** $3M seed, Aug 2024 (older). An SEC filing reportedly shows $7.6M, unverified. — [CityBiz](https://www.citybiz.co/article/589112/ai-customer-support-startup-unthread-raises-3-million/); [AlleyWatch](https://alleywatch.com/2024/08/unthread-ai-support-platform-integrated-embedded-slack-help-desk-tom-bachant/)

#### Thena (Slack/Teams-native B2B; status uncertain)
- **Channels:** Slack, email, MS Teams, web chat, web forms and Discord, plus "Multi-channel broadcasts" across Slack, Teams and email.
- **AI:** "AI agents" (respond, apply fields, create tickets, escalate), "AI agent studio", "Auto-triage and route tickets", AI co-pilot and AI logs.
- **Integrations:** Jira, Linear, HubSpot and Salesforce, plus Claude, Cursor, Windsurf, Raycast and an MCP server.
- **Accounts** objects: account and contact fields, tasks, notes and activities.
- **Pricing:** Standard is $79/user/mo (annual). Enterprise is $119, with the unit not stated; it adds MS Teams.
- The footer and featured reads are dated 2025.
- Source: [Thena home](https://www.thena.ai/)
- **Acquisition (3rd-party, unconfirmed):** HappyFox has reportedly absorbed Thena, and the standalone product is reportedly being sunset in 2026.
  - A competitor review says there were user reports of a sunset but "no formal announcement".
  - Sources: [YesPress](https://yespress.io/happyfox-bought-thena-support-lives-in-slack); [Unthread's Thena review](https://unthread.io/blog/thena-review/)

#### Atlas (B2C/B2B "bespoke AI for customer support", with session replay)
- **Autopilot** runs multi-step actions using tone, tools and "protocols", with guardrails and approvals.
- **Copilot** drafts replies with sources, writes an automatic context brief, and suggests next actions (refunds, credits, scheduling).
- **Knowledge Management** generates and refreshes articles from tickets, chats and SOPs, builds knowledge graphs, and **detects conflicting versions of a fact**.
- The rest of the product:
  - Omnichannel ticketing with a chronological customer timeline.
  - **Session Recording** ("Watch customers in perfect fidelity").
  - Chatbots, Broadcast, Help Center, Reports and Workforce management.
  - Integrations: Linear, Jira, Sentry, Salesforce, HubSpot, Dialpad and Shopify.
- No public prices or dated 2026 news on the homepage.
- Source: [Atlas home](https://www.atlas.so/) (vendor page, fetched 2026-10-21)

#### Missive (email-first collaborative inbox)
- **Positioning:** "Inbox collaboration for teams that run on email".
- **Collaboration:** internal discussion on email threads, internal statuses, email-to-task, a team task view, and a **"Capacity view"** showing who has room.
- **AI assistant** ("Not another AI sidebar") gathers context before drafting and pulls data from Stripe or a CRM **via MCP**.
- Source: [Missive home](https://missiveapp.com/)
- **Pricing:** Starter $14, Productive $24 and Business $36 per user/mo (annual).
  - AI is "Missive AI credits or **BYOK**", with Anthropic, OpenAI and Gemini as providers.
  - AI features: instant drafts, AI rules, translation, summarization and custom prompts.
  - API and MCP access from Productive.
  - Channels: WhatsApp, Messenger and Instagram via integrations. SMS via Twilio, Quo or Dialpad.
  - Source: [Missive pricing](https://missiveapp.com/pricing)

#### Featurebase (support + feedback + changelog in one; explicitly an Intercom/Canny alternative)
- **Positioning:** "Modern customer support & feedback platform".
- **Support:** an omnichannel inbox (in-app, Slack, Discord, email) and the **AI agent "Fibi"**.
- **Feedback:** feedback portal with voting, **public roadmap**, AI feedback prioritization tied to customer data, and **automatic loop closing** that notifies requesters when a request ships.
- **Changelog:** custom domain, in-app widgets, and release segmentation by user attributes.
- **Help center:** AI search answers, multi-brand, 40+ languages, "Notion-like editor".
- **Integrations:** Linear, Jira, GitHub, Intercom, Slack, HubSpot, Zendesk.
- Source: [Featurebase home](https://www.featurebase.app/)
- **Pricing** (per seat/mo, annual):
  - Free: 1 seat, live chat, unlimited conversations, no AI.
  - Growth $29: Fibi, AI Copilot, API/MCP/webhooks.
  - Professional $59: Slack support, workflows, round-robin, SLAs, Salesforce/HubSpot, **20 free Lite seats**.
  - Enterprise $99: **50 free Lite seats**, Azure DevOps.
  - **AI is $0.49 per AI resolution** on all paid plans.
  - A savings calculator benchmarks against Intercom, Zendesk, Freshdesk and Help Scout.
  - Source: [Featurebase pricing](https://www.featurebase.app/pricing)

#### Chatwoot (open-source Intercom alternative; the "floor")
- **v4.19.0 (20 Oct):**
  - Automatic conversation translation, via Captain or Google Translate.
  - **Captain toolset catalog**.
  - **Customer verification for sensitive tools**.
  - Refreshed Captain reports and Copilot chat history. Captain V1 is retired.
  - Bulk macros, reading mode and a collapsible reply editor.
  - Auto-resolution schedules and account-wide 2FA enforcement.
  - Source: [Chatwoot releases](https://github.com/chatwoot/chatwoot/releases)
- **v4.18.0 (18 Sep):**
  - Captain assignment, **scenario and tool controls**, and **playground testing**.
  - Alerts-only mode for Slack.
  - Source: [Chatwoot releases](https://github.com/chatwoot/chatwoot/releases)
- **v4.17.0 (20 Aug):**
  - Captain audience, schedule, inactivity, **outcome** and knowledge-usage controls.
  - Captain transcribes Twilio calls.
  - WhatsApp template management.
  - **Macros from the reply editor and command bar**.
  - Freshdesk import.
  - Source: [Chatwoot releases](https://github.com/chatwoot/chatwoot/releases)
- **v4.16.x (Jul):**
  - Captain **FAQ suggestion review** API and UI. This is knowledge-gap capture.
  - Assignment policies can exclude stale conversations.
  - WhatsApp Calls.
  - Video calls moved to Cloudflare RealtimeKit.
  - Help Center staged edits.
  - Source: [Chatwoot releases](https://github.com/chatwoot/chatwoot/releases)
- **v4.15 (16 Jun):** unread counts and badges, WhatsApp/Twilio calling, and voice messages. — [Chatwoot releases](https://github.com/chatwoot/chatwoot/releases)
- The release page shows day and month only. The year 2026 is inferred from a 3rd-party note that v4.14.2 shipped 2026-06-10. — [eesel – AI for Chatwoot](https://www.eesel.ai/blog/best-ai-for-chatwoot)
- Captain's AI usage is metered by credits: 300, 500 or 800 per month by plan, with overage (3rd-party estimate). — [eesel – AI for Chatwoot](https://www.eesel.ai/blog/best-ai-for-chatwoot)

#### Crisp (SMB; flat per-workspace pricing)
- **Pricing** (per workspace, not per seat):
  - Free: $0, 2 seats.
  - Mini: $45/mo, 4 seats, about 90 automated conversations, $5 AI credits.
  - Essentials: $95/mo, 10 seats, about 450 conversations, $25 credits. Adds an omnichannel inbox (WhatsApp, Instagram, SMS, Line, Viber), a workflow builder, an AI chatbot and a KB.
  - Plus: $295/mo, 20+ seats, about 1,350 conversations, $75 credits. Adds the "AI-First Support Suite" and ticketing.
  - Extra agents are $10/mo.
  - Crisp says you "pay a single, consistent price regardless of the number of conversations".
  - Named 2026 products: Hugo (AI agent), MagicBrowse, MCP Server, Crisp Unleash.
  - Source: [Crisp pricing](https://crisp.chat/en/pricing/)
- **AI page:**
  - **Hugo** is the "AI support agent teammate". It trains on snippets, KB, website crawl, conversation history and files.
  - Copilot "Augment" tools: Predict, Transcribe, Translate, Summarize, Categorize, Grammar, Expand, Rephrase.
  - **MagicReply** has a confidence threshold so the bot "admits when it can't find an answer".
  - The no-code AI Agents builder deploys to web chat, WhatsApp, Messenger, Instagram and email.
  - "All plans embed a fair use of AI": there is no per-resolution fee.
  - Source: [Crisp AI](https://crisp.chat/en/ai/)

#### Tidio (SMB/ecommerce; Lyro AI)
- **Plans:** Free (50 billable conversations), Starter $24.17/mo, Growth from $49.17/mo, Plus from $300/mo plus usage, and Premium at contact-for-price. Self-serve plans have 10 seats. — [Tidio pricing](https://www.tidio.com/pricing/)
- **Lyro billing:** a "Lyro conversation" quota, standalone from $32.50/mo for 50 conversations. The first 50 are free (lifetime).
- **Premium** adds **"Pay-per-resolution billing" and a "Guaranteed 50% Lyro AI resolution rate"**.
- Flows are priced by visitors reached.
- Source: [Tidio pricing](https://www.tidio.com/pricing/)
- The Lyro feature census (Smart Actions, Playground, etc.) is in the internal July 2026 inventory (older): `docs/competitor-feature-inventory.md` §2.11.

#### LiveChat → "Text" (Text, the LiveChat/HelpDesk/ChatBot company)
- **livechat.com/pricing now shows "Text" plans.** Existing LiveChat customers keep legacy plans. Text is "the next product from the team behind LiveChat".
- Essential is $19/user/mo (annual) with 1 AI Agent and 10 AI resolutions/mo. Growth is $79/user/mo with 10 AI Agents and 200 AI resolutions.
- **Extra AI resolutions are $49.50 per 50 ($0.99 each)**. A resolution means the AI directly solved the customer's question.
- Copilot reply suggestions and AI text edits are metered per user.
- Chat and ticket summaries, chat topics and tag suggestions are Growth only.
- "Chat supervision and takeover" is included.
- Source: [LiveChat/Text pricing](https://www.livechat.com/pricing/)

#### Re:amaze (SMB ecommerce, GoDaddy-owned)
- Basic $29, Pro $49 and Plus $69 per team member/mo. Starter is a $59 flat rate for unlimited members, capped at 500 responded conversations.
- The **AI Agent is included in every paid tier** with a monthly resolution allowance per user (5, 10 or 20). **Extra resolutions are $0.85.** AI is labelled "Beta".
- Pro adds SMS/voice and Live View of site visitors. Plus adds "Peek (Live Screensharing)".
- A **Status Page** is included from Pro.
- Source: [Re:amaze pricing](https://www.reamaze.com/pricing)

#### Trengo (EU omnichannel, WhatsApp/Meta partner)
- **Positioning:** "European-owned" customer engagement platform. It combines WhatsApp, email, live chat, social and voice in one inbox.
- AI Agents claim "Up to 80% of queries resolved". **"AI Agents for Voice" is marked "New"**.
- "AI Journeys" is the workflow product. "Dessa" is a new ecommerce sales AI agent.
- Integrations include Shopify, WooCommerce, HubSpot, Salesforce and hospitality PMSs (Mews, Apaleo, Cloudbeds).
- No pricing on the homepage.
- Source: [Trengo home](https://trengo.com/)

#### respond.io (WhatsApp/social-first conversation platform)
- **Positioning:** "#1 AI-Powered Customer Conversation Platform", with a framework called "Conversation-Led Growth™" (Capture/Convert/Retain).
- **Channels:** one inbox for WhatsApp, TikTok, Instagram and Facebook. **WhatsApp Business Calls, Messenger Calls and VoIP** live in the same thread.
- AI Agent templates handle ad enquiries, bookings, payment details and CRM updates, "with built-in guardrails".
- Also: broadcasts, in-chat CSAT, and analytics on "which ads, agents and channels drive ROI".
- Source: [respond.io home](https://respond.io/)
- **Funding:** $62.5M Series B on 2026-06-16, led by Camber Partners. About $35M ARR, +169% YoY, 30% profit margin. Funds go to North America and Europe expansion, including acquisitions. — [respond.io blog](https://respond.io/blog/respond-io-raises-62-million-series-b); [Pulse 2.0](https://pulse2.com/respond-io-raises-62-5-million-series-b-to-expand-ai-powered-customer-conversation-platform/)

### Inferences
- **The B2B segment standardized fast.** Plain, Pylon, Thena and Unthread all ship these, and Featurebase ships most of them at $29–$59/seat:
  - Slack/Teams/Discord channels.
  - Linear, Jira and GitHub links.
  - AI triage.
  - KB drafting from tickets.
  - MCP.
- **The leaders differentiate on agent architecture**, not on channel list. Examples: Pylon Nexus with eval-gated changes, Plain's Ari/Sidekick/Connected Agent credit model, and coding-agent handoff (Devin, Cursor).
- **There are two AI pricing camps:**
  - **Per AI resolution**, with a visible price: Featurebase $0.49, Re:amaze $0.85, Text $0.99, Plain about $1.00, and Tidio Premium.
  - **Pooled credits or "fair use"**: Pylon, Crisp, eesel, Missive BYOK.
  - Intercom's $0.99/outcome sits in the middle to upper end of the per-resolution camp, not below it.
- **Chatwoot (open source) now has Captain playground testing, tool controls with customer verification, outcome controls, a FAQ-gap review UI, auto-translation and a command bar.** This means "AI agent with playground and knowledge-gap capture" is no longer a premium differentiator.
- **Thena's apparent absorption (unconfirmed)** and Unthread's pivot toward ITSM suggest the pure "Slack ticketing bot" niche is consolidating. Pylon and Plain are winning the B2B customer-support use case.

### Gaps
- Pylon does not publish a per-credit price, so there is no exact cost per AI resolution.
- Plain's inbox views, tiers and SLA UX beyond the pricing list were not inspected. The changelog before Sep 23 2026 was not visible ("Load More").
- Atlas, Trengo and respond.io pricing were not retrieved. Their homepages show none.
- The Thena–HappyFox deal is sourced only to a secondary site. No official HappyFox or Thena statement was found.
- Missive's AI credit amounts are not published.
- Reddit threads specifically comparing these tools were not surfaced by search. See §4.

---

## 2. AI agent specialists: how agent behavior is structured, actions, testing and simulation, voice, evaluation and observability, pricing

### Takeaway
The specialists have converged on a common lifecycle:
1. Plain-language procedures (Decagon AOPs, Ada Playbooks, Lorikeet SOP workflows, Pylon Skills).
2. Tool and action layers with permissions and approvals.
3. Simulation and A/B experiments before and after launch.
4. Always-on AI QA of every conversation (Decagon Watchtower, Lorikeet Auto QA, Siena QA Agent, Sierra Ghostwriter).
5. An AI "builder" or "apprentice" that drafts procedure updates from escalations and Slack/Teams threads (Decagon Duet Apprentice, Sierra Ghostwriter).

October 2026's new frontier is two things:
- **Voice that talks and reasons in parallel:** Decagon Voice 3 with its duplex architecture, and Sierra Tandem Voice.
- **"Personal agent" (business-to-agent) channels:** Sierra's Personal Agent Protocol with Meta, Decagon's Personal Agent Gateway and PACT, Lorikeet B2A, and Sierra's fleming model that detects AI callers.

Pricing is per conversation, per resolution or outcome-based, and enterprise vendors rarely publish rates.

### Cited Findings

#### Decagon
- **Product surface** (vendor page, fetched 2026-10-21):
  - **Agent Operating Procedures (AOPs):** "Workflows for AI agents" in natural language.
  - **Channels:** Voice, Chat, Email.
  - **Duet:** "AI partner to build self-improving agents".
  - **Integrations:** "Pre-built connectors".
  - **Experiments:** "Live A/B testing".
  - **Testing & QA:** "Simulations at scale".
  - **Insights & reporting:** "Voice of the customer".
  - **Watchtower:** "Always on QA".
  - **Suggestions:** "AI powered knowledge".
  - Cross-channel memory and a unified intelligence layer across chat, voice and email.
  - Source: [Decagon home](https://decagon.ai/)
- **Decagon Dialogues, 2026-10-01**, four launches. Source: [Decagon – Dialogues 2026](https://decagon.ai/blog/dialogues-2026); [Decagon – Voice 3](https://decagon.ai/blog/voice-3)
  - **Voice 3:**
    - Built on **Chord**, Decagon Labs' first voice model, post-trained for customer conversations. Chord adjusts pacing for phone numbers and confirmation codes.
    - The **duplex** architecture keeps listening while speaking. It ignores backchannels ("brief acknowledgments") but yields to real interruptions.
    - Conversation and task execution run in parallel, so the agent gives progress updates instead of putting callers on hold.
  - **Personal Agent Gateway:**
    - Detects personal agents (examples: Instinct, Muse, dots), including agents that don't identify themselves.
    - Gives them a dedicated channel. Businesses set policies and customers define permissions.
    - The protocol spec is available now.
  - **Agent Modules:** journeys beyond support (lead qualification, onboarding, collections) by industry. Per-team access controls, and memory across conversations and channels.
  - **Duet Apprentice:**
    - Learns from internal documents and from escalated conversations handled by experienced reps.
    - Grounds AOP drafting, Simulations and analysis in that knowledge.
    - **Slack and Teams plugins** follow discussions, draft AOP updates when tagged, and ask for clarification.
    - "What Duet learns belongs to you... isn't used to train models outside it".
- A separate post, "Introducing the Personal Agent Consent & Trust Protocol (PACT)", is dated 2026-10-06. — [Decagon – Dialogues 2026](https://decagon.ai/blog/dialogues-2026)
- At the Dialogues NYC event on May 14 2026, Decagon showed "guided discovery" and Duet as a tool for building, QA-testing and deploying workflows (search summary, older). — [Decagon Dialogues on tour](https://decagon.ai/decagon-dialogues-on-tour-ldn)
- **Pricing** (3rd-party; not public):
  - Custom-quoted, with a per-conversation default or a per-resolution option layered on a platform fee.
  - Sources cite a roughly $50k annual platform fee, about $0.99 per conversation, and about $0.50 per negotiated resolution.
  - Vendr medians of about $386k–$433k/yr conflict between sources.
  - Sources: [Featurebase – Decagon pricing](https://www.featurebase.app/blog/decagon-pricing); [Quiq – Decagon pricing](https://quiq.com/blog/decagon-pricing/)
- **Funding:** $250M Series D at a $4.5B valuation, led by Coatue and Index (2026-01-28). An employee tender at $4.5B followed in March 2026. No newer raise was found. — [Bloomberg](https://www.bloomberg.com/news/articles/2026-01-28/ai-customer-support-startup-decagon-valued-at-4-5-billion)

#### Sierra
- **Summit 2026 (2026-10-06)** announcements. Source: [Sierra – Summit recap](https://sierra.ai/blog/summit-recap-2026)
  - **Agent OS models:**
    - **Curie** is the orchestration model. It picks the conversation path, chooses tools and writes replies.
    - **Fleming** detects when a caller is another AI agent.
    - Existing models Linnaeus and Darwin handle search and retrieval.
    - Agent OS manages token cost automatically.
  - **Tandem Voice** responds in real time while a separate reasoning layer works on the next step: "think fast and think slow at the same time".
  - **Persona Studio** lets businesses upload voice samples and tune personality in **Agent Studio** without engineering. One subscription business saw resolution rate rise "by over 50%" after Voice Personas.
  - **Ghostwriter** was reimagined as an always-on teammate. It monitors agents, surfaces API outages and metric anomalies, evaluates continuously, runs A/B tests, and uses Slack/Teams context to suggest improvements.
  - **Horizon** handles long-horizon goals (loan origination, prior authorization) over days, weeks or months. "Horizon Advisors" pick the next best action within business-set goals and guardrails. The **Context Engine** merges system data and memories.
  - **Stripe:** Sierra is in the Stripe App Marketplace. Agents can collect payment mid-conversation.
  - **Stats:** "almost 50% of the Fortune 50".
- **Other launches:**
  - Personal Agent Protocol (Oct 6), an open standard developed with Meta and partners including Genesys, Shopify, Stripe and Walmart.
  - A draft protocol spec ("Poppy") with 35 design partners (Oct 9).
  - **fleming-1** for AI caller ID (Oct 8).
  - Sierra + Stripe "conversation to payment" (Oct 20).
  - Voice Personas (Aug 7).
  - Horizon (Jul 16), with outcome-based pricing.
  - Sources: [Sierra blog](https://sierra.ai/blog); [PAP](https://sierra.ai/blog/introducing-personal-agent-protocol); [Poppy](https://sierra.ai/blog/poppy); [Caller ID](https://sierra.ai/blog/caller-id-in-the-age-of-agents); [Stripe](https://sierra.ai/blog/from-conversation-to-payment-sierra-and-stripe); [Voice Personas](https://sierra.ai/blog/introducing-voice-personas); [Horizon](https://sierra.ai/blog/horizon)
- **Earlier positioning (older; internal Aug 2026 audit):** agents across chat, voice, SMS, WhatsApp, email and ChatGPT, with hybrid generative and deterministic execution. — [getmacha – Sierra guide](https://www.getmacha.com/blog/sierra-ai-complete-guide)
- **Pricing:**
  - Outcome-based: pay for a resolved conversation, a saved cancellation or an upsell. Routing-style interactions may be billed per conversation.
  - Sierra published the model in Dec 2024 and reaffirmed it in its "Outcomemaxxing" post.
  - There is no public rate card.
  - Sources: [Sierra – outcome-based pricing](https://sierra.ai/uk/blog/outcome-based-pricing-for-ai-agents); [eesel – Sierra pricing](https://www.eesel.ai/blog/sierra-ai-pricing)
- **Funding:** $950M Series E at a $15.8B post-money valuation, led by Tiger Global and GV (May 2026). ARR was about $150M in Feb 2026. — [Quartz](https://qz.com/sierra-ai-funding-round-950-million-valuation-050426); [idlen](https://www.idlen.io/news/sierra-950-million-series-e-15-8-billion-valuation-bret-taylor-tiger-global-may-2026)
- **Unverified:** "Sierra achieves AIUC-1 certification", 2026-09-17, from a news tracker only. A "Multimodal Agents" launch (Sep 10/15 2026) comes from one 3rd-party blog. — [Autobound tracker](https://www.autobound.ai/companies/sierra/news); [chatgate](https://chatgate.ai/post/multimodal-agents-by-sierra)

#### Ada
- **Product surface** (vendor page, fetched 2026-10-21):
  - **Playbooks** "automate your complex SOPs with agentic AI".
  - **Ada Computer** gives the agent "the tools to complete customer tasks".
  - Orchestrates multiple LLMs.
  - Testing, analysis, optimization and coaching tools.
  - Channels: Voice, Messaging, Email.
  - Headline metric: "Automated resolution rate".
  - Compliance includes **AIUC-1**, plus HIPAA, SOC 2, PCI DSS and "zero data retention" with LLM providers.
  - Source: [Ada home](https://www.ada.cx/)
- **Unified Reasoning Engine (2026-02-18):** "A single instruction can now be deployed once and dynamically replicated in all channels and languages". — [BusinessWire](https://www.businesswire.com/news/home/20260218942802/en/Ada-Launches-the-Industrys-First-Unified-Reasoning-Engine-A-Single-Intelligence-Layer-to-Power-Agentic-Customer-Experiences-in-Any-Channel)
- Ada reported 12x growth in agentic Voice ARR in March 2026 (search summary of Ada's materials). — [Ada blog](https://www.ada.cx/blog/announcing-ada-generative-ai-capabilities-and-voice)

#### Forethought
- **Acquired by Zendesk.** Announced 2026-03-11, closed 2026-03-26. It ships as "Forethought AI Agents by Zendesk" for chat, email and voice. It reportedly remains available standalone for other helpdesks (3rd-party). — [Zendesk newsroom](https://www.zendesk.es/newsroom/articles/zendesk-completes-forethought-acquisition/); [The Next Web](https://thenextweb.com/news/zendesk-acquires-forethought-agentic-ai)
- **Earlier:** a "Browser Agent" (Oct 2025, older) acts inside browser-based systems without APIs. The 2026 roadmap webinar lists agent orchestration, AI QA and evaluation at scale, Agent Builder and self-optimizing agents. — [Forethought roadmap webinar](https://forethought.ai/webinars/what-were-building-in-2026-forethoughts-product-roadmap)

#### Fini
- **Pricing** (from Fini's own guides): free Starter, Growth at **$0.69/resolution with a $1,799/mo minimum**, and custom Enterprise. Escalations and fallbacks are not billed. — [Fini guide](https://www.usefini.com/guides/pay-per-resolution-ai-support-software)
- An Aug 2026 eesel review cites **$0.49/resolution** and flags inconsistent Enterprise allowances (3rd-party, competitor). — [eesel – Fini pricing](https://www.eesel.ai/blog/fini-ai-pricing)
- The pricing page fetch failed (HTTP 522).

#### Lorikeet (regulated industries: fintech, health, insurance)
- Follows SOPs, including "a 40-step refund flow". Named workflow steps include Workflow matching, Triage ticket, Gather, Get Status, Choice and Route.
- **Simulations** ("Test your workflows"), **Auto QA** ("Score every conversation live"), **Guardrails** ("Robust runtime checks") and **Coach**.
- Channels: chat, email, voice, SMS and WhatsApp from one agent.
- Works inside Zendesk, Intercom, Salesforce and HubSpot.
- "Forward-deployed" setup on every plan.
- There is a post titled "Launching Lorikeet B2A" (serving AI agents).
- Source: [Lorikeet home](https://www.lorikeetcx.ai/) (fetched 2026-10-21)
- **Funding:** $35M Series A led by QED, Aug 2025 (older). It reportedly valued the company at over $200M. No 2026 round was found. — [Pulse 2.0](https://pulse2.com/lorikeet-35-million-series-a-raised-for-ai-based-universal-customer-concierges)

#### Siena AI (consumer brands / ecommerce)
- **Positioning:** "The AI CX operating system for consumer brands".
- AI Personas are built on brand tone. Workflows are built with an AI Assistant.
- **Actions:** address updates, labels, refunds, replacements, and subscription skip/pause/swap.
- A social agent, **QA Agent** ("Score every conversation"), Topics Explorer (VoC) and "Ask Siena".
- Source: [Siena home](https://www.siena.cx/)
- **Funding:** $17M Series A led by York IE, total $29.7M. It positions as the "Agent of Record" and charges on results rather than seats. The date was not confirmed in my sources. — [The Next Web](https://thenextweb.com/news/siena-17m-series-a-york-ie-ai-agents); [Pulse 2.0](https://pulse2.com/siena-raises-17-million-series-a-bringing-total-funding-to-29-7-million/)

#### eesel AI (overlay "AI teammate" for existing helpdesks)
- An "AI teammate you hire". The helpdesk agent drafts, triages and hands off inside Zendesk, Intercom, Freshdesk, Gorgias and Help Scout.
- Internal Q&A runs in Slack, Teams, Google Chat, Discord, WhatsApp, or **Claude and ChatGPT**.
- "Test answers before making the agent available".
- Source: [eesel home](https://www.eesel.ai/)
- **Pricing:** credit-based, "A ticket or a chat is 1 credit". Teammate runs from $299/mo for 500 credits to $1,749 for 5,000, with $0.80 overage. Managed support is "$5,000 a month, flat". — [eesel pricing](https://www.eesel.ai/pricing)

#### Parloa (voice-first, EU)
- **Homepage:** "One platform across the AI agent lifecycle". Modules include Agent Builder, Performance Lab, Parloa Lens, Parloa Navigator, the "Performance Flywheel™", IVR Replacement and Expanded Language Coverage.
- Compliance badges: ISO 27001, SOC 2 II, HIPAA, PCI DSS, **DORA, EU AI Act**. It has SAP endorsed-app certification.
- The page is marketing-heavy, with no technical detail.
- Source: [Parloa home](https://www.parloa.com/)
- **Funding:** $350M Series D at a $3B valuation, led by General Catalyst (Jan 2026). About $50M revenue reported. — [Tech.eu](https://tech.eu/2026/01/15/parloa-raises-350m-tripling-valuation-to-3bn/)

### Inferences
- **The common agent architecture is: procedures in plain language + tools/actions with approval gates + simulation + live A/B + always-on QA + an AI "builder" that proposes procedure edits from escalations.** An Intercom-class product without simulation and AI QA of AI will look a generation behind to enterprise evaluators.
- **The "learning loop" is now productized as an assistant that watches Slack/Teams and escalations** (Duet Apprentice, Ghostwriter), not just as a dashboard.
- **"Agents talking to agents" became a concrete product category in Oct 2026.** Sierra, with Meta, published a protocol. Decagon shipped a gateway and the PACT consent protocol. Lorikeet launched B2A. A customer-messaging platform will soon need to identify agent traffic and expose an authenticated, permissioned channel for it.
- **Voice parity is the enterprise bar.** Parallel talk-and-act voice (Voice 3, Tandem Voice), custom voice personas and caller-is-AI detection are the October 2026 baseline.
- **Pricing:** per-resolution prices for mid-market have compressed to $0.49–$0.99. Enterprise specialists price on outcomes or conversations behind custom quotes with large platform fees.

### Gaps
- Official per-unit prices for Decagon, Sierra, Ada, Lorikeet, Parloa and Siena are not public. The figures above are 3rd-party estimates or vendor claims.
- Parloa's specific 2026 product launches, including how simulation and evaluation work in Performance Lab, were not found.
- Ada announcements after March 2026 were not found.
- Sierra's AIUC-1 certification and multimodal launch are unverified.
- Fini's current pricing page could not be fetched.
- Siena's Series A date is not confirmed.

---

## 3. Which challenger features are now EXPECTED by modern (especially B2B SaaS) buyers that legacy tools lack?

### Takeaway
The features below appear in multiple challengers, at modest list prices, and in some cases in open source. A B2B SaaS buyer evaluating an Intercom-class product in Oct 2026 will treat the list as baseline. Most legacy suites either lack these items or sell them as expensive add-ons.

### Cited Findings
1. **Slack Connect, Teams and Discord as first-class ticket channels, with threads becoming tickets:**
   - Plain: Slack/Teams/Discord. — [Plain pricing](https://www.plain.com/pricing)
   - Pylon: Slack Connect, Discord, Telegram and WhatsApp on all plans; Teams and Google Chat on Advanced. — [Pylon pricing](https://www.usepylon.com/pricing)
   - Featurebase: Slack and Discord. — [Featurebase](https://www.featurebase.app/)
   - Thena. — [Thena](https://www.thena.ai/)
   - Unthread. — [Unthread](https://unthread.io/)
2. **Issue-tracker sync** with Linear, Jira and GitHub (create issue from conversation, link PRs):
   - Plain: Linear, Shortcut, Jira, GitHub; PR linking added Sep 24 2026. — [Plain pricing](https://www.plain.com/pricing); [Plain changelog](https://www.plain.com/changelog)
   - Pylon: Linear and Jira. — [Pylon home](https://www.usepylon.com/)
   - Featurebase: Linear, Jira, GitHub, Azure DevOps. — [Featurebase pricing](https://www.featurebase.app/pricing)
   - Atlas: Linear, Jira, Sentry. — [Atlas](https://www.atlas.so/)
3. **Handoff to coding agents:**
   - Pylon x Devin, bug report to code fix (Oct 13 2026). — [Pylon x Devin](https://www.usepylon.com/blog/pylon-x-devin)
   - Cursor integrations at Plain and Pylon; Cursor and Windsurf at Thena. — [Plain pricing](https://www.plain.com/pricing); [Thena](https://www.thena.ai/)
4. **AI triage built in, not sold as a separate product:**
   - Plain: auto-labelling, urgency detection and thread summaries; AI sets label and priority as a workflow step. — [Plain pricing](https://www.plain.com/pricing); [Plain changelog](https://www.plain.com/changelog)
   - Thena: "Auto-triage and route tickets". — [Thena](https://www.thena.ai/)
   - Text/LiveChat: summaries, topics and tag suggestions on Growth. — [Text pricing](https://www.livechat.com/pricing/)
5. **Knowledge-gap detection and KB drafted from resolved tickets:**
   - Plain "Knowledge gaps" (Sep 30 2026). — [Plain changelog](https://www.plain.com/changelog)
   - Unthread "Self-learning Knowledge". — [Unthread](https://unthread.io/)
   - Atlas, including conflicting-fact detection. — [Atlas](https://www.atlas.so/)
   - Chatwoot Captain FAQ suggestion review. — [Chatwoot releases](https://github.com/chatwoot/chatwoot/releases)
   - Pylon's "Categorize what your AI can't do". — [Pylon](https://www.usepylon.com/blog/categorize-what-your-ai-cant-do)
6. **MCP and API-first, in both directions:**
   - Plain: API, Webhooks, Events, MCP; workflows call your MCP tools. — [Plain pricing](https://www.plain.com/pricing); [Plain changelog](https://www.plain.com/changelog)
   - Pylon MCP on all plans. — [Pylon pricing](https://www.usepylon.com/pricing)
   - Featurebase API/MCP from $29. — [Featurebase pricing](https://www.featurebase.app/pricing)
   - Crisp MCP Server. — [Crisp pricing](https://crisp.chat/en/pricing/)
   - Missive MCP access and an MCP-sourced AI assistant. — [Missive pricing](https://missiveapp.com/pricing)
   - Thena MCP server. — [Thena](https://www.thena.ai/)
   - eesel answers inside Claude and ChatGPT. — [eesel](https://www.eesel.ai/)
7. **Account-level context for B2B:** company or account objects, tiers and SLAs by tier, plus CRM, product-usage, logs and code context.
   - Pylon Account Intelligence ($10/account/mo). — [Pylon pricing](https://www.usepylon.com/pricing); [Pylon home](https://www.usepylon.com/)
   - Plain customer tiers and Attio/HubSpot/Salesforce sync. — [Plain](https://www.plain.com/); [Plain pricing](https://www.plain.com/pricing)
   - Thena Accounts. — [Thena](https://www.thena.ai/)
8. **Keyboard-first inbox:**
   - Plain: ⌘K command palette and J/K/E/A/R shortcuts. — [Plain docs](https://www.plain.com/docs/shortcuts)
   - Chatwoot: command bar with macros. — [Chatwoot releases](https://github.com/chatwoot/chatwoot/releases)
9. **Free or cheap non-agent seats**, for engineers and PMs who reply occasionally:
   - Pylon and Plain viewer seats. — [Pylon pricing](https://www.usepylon.com/pricing); [Plain pricing](https://www.plain.com/pricing)
   - Featurebase: 20 or 50 free Lite seats. — [Featurebase pricing](https://www.featurebase.app/pricing)
   - A G2 Plain reviewer complains about paying a full seat "when an engineer might only respond once a month". — [G2 Plain reviews](https://g2.com/products/plain/reviews_and_filters?page=2)
10. **Transparent AI pricing with a visible unit:**
    - $0.49/resolution at Featurebase. — [Featurebase pricing](https://www.featurebase.app/pricing)
    - $0.85 at Re:amaze. — [Re:amaze pricing](https://www.reamaze.com/pricing)
    - $0.99 at Text. — [Text pricing](https://www.livechat.com/pricing/)
    - About $1 at Plain. — [Plain pricing](https://www.plain.com/pricing)
    - Tidio Premium guarantees a 50% Lyro resolution rate. — [Tidio pricing](https://www.tidio.com/pricing/)
    - Crisp flat "fair use". — [Crisp AI](https://crisp.chat/en/ai/)
11. **Agent-trust tooling:**
    - Playground or simulation: Chatwoot playground (open source). — [Chatwoot releases](https://github.com/chatwoot/chatwoot/releases)
    - Decagon Simulations and Experiments. — [Decagon](https://decagon.ai/)
    - Lorikeet Simulations and Auto QA. — [Lorikeet](https://www.lorikeetcx.ai/)
    - Siena QA Agent. — [Siena](https://www.siena.cx/)
    - Eval-gated agent changes (Pylon Nexus). — [Pylon Nexus](https://www.usepylon.com/blog/introducing-nexus)
    - Guardrails with human approval for write actions (Pylon Nexus). — [Pylon Nexus](https://www.usepylon.com/blog/introducing-nexus)
    - Customer verification before sensitive tools (Chatwoot v4.19). — [Chatwoot releases](https://github.com/chatwoot/chatwoot/releases)
12. **Natural-language configuration** of agents, workflows and routing ("Skills"; "describe it in natural language"). — [Pylon home](https://www.usepylon.com/); [Pylon July 15 post](https://www.usepylon.com/blog/pylon-becomes-the-agentic-support-platform)
13. **Proactive broadcasts across every customer channel, including Slack:**
    - Plain (Oct 1 2026). — [Plain changelog](https://www.plain.com/changelog)
    - Pylon. — [Pylon pricing](https://www.usepylon.com/pricing)
    - Thena multi-channel broadcasts. — [Thena](https://www.thena.ai/)
14. **One-click importers** from Intercom, Zendesk, Freshdesk and Help Scout:
    - Plain. — [Plain pricing](https://www.plain.com/pricing)
    - Chatwoot Freshdesk import. — [Chatwoot releases](https://github.com/chatwoot/chatwoot/releases)
15. **Basic workforce visibility** (capacity, away status, staffing heatmaps):
    - Pylon WFM. — [Pylon pricing](https://www.usepylon.com/pricing)
    - Missive capacity view. — [Missive](https://missiveapp.com/)
    - Atlas WFM. — [Atlas](https://www.atlas.so/)
16. **Auto-translation in the inbox:**
    - Chatwoot v4.19. — [Chatwoot releases](https://github.com/chatwoot/chatwoot/releases)
    - Crisp Translate. — [Crisp AI](https://crisp.chat/en/ai/)
    - Missive translation. — [Missive pricing](https://missiveapp.com/pricing)
17. **Feedback → roadmap → changelog with loop closing, tied to support conversations:**
    - Featurebase. — [Featurebase](https://www.featurebase.app/)
    - Pylon's "Product Intelligence" (feature requests, bugs). — [Pylon July 15](https://www.usepylon.com/blog/pylon-becomes-the-agentic-support-platform)
18. **AI-governance certifications as a sales artifact:**
    - AIUC-1 at Ada. — [Ada](https://www.ada.cx/)
    - EU AI Act and DORA badges at Parloa. — [Parloa](https://www.parloa.com/)

### Inferences
- **Must-have for B2B SaaS buyers by Oct 2026:** items 1, 2, 4, 5, 6, 7, 9 and 10.
- **Emerging (6–12 months):**
  - Coding-agent handoff (3).
  - Background agents with Skills (12).
  - Eval-gated agent releases and approval-gated write actions (11).
  - Personal-agent channels (see §2).
- **What Geiger Comms probably lacks** (per the internal audit's gap list):
  - The Slack/Teams channel, plus account objects and tiers, are the B2B wedge.
  - Knowledge-gap detection is cheap given the existing KB and AI performance surfaces.
  - The ⌘K palette with J/K/E/A shortcuts also covers the audit's "global search" gap.
  - Free Lite/viewer seats.
- **Legacy-vs-challenger gap:** incumbents tend to sell AI triage, QA and Slack channels as separate add-ons. Challengers bundle them at $29–$99/seat. This is inferred from challenger pricing pages; incumbents' gating is covered by other researchers.

### Gaps
- No quantitative buyer survey (e.g., "% of B2B buyers requiring Slack support") was found. The "expected" status is inferred from how widely the features appear across vendors and how cheap they are.

---

## 4. Usability: what users praise about these tools vs Intercom (speed, simplicity, keyboard-first, pricing transparency)

### Takeaway
Review evidence is thin but consistent.
- **Pylon:** reviewers praise ease of use and seamless Slack integration for managing hundreds of customer channels. They criticize email handling, setup complexity and AI maturity.
- **Plain:** reviewers praise ease of use and the Slack/Linear integrations. They criticize search and full-seat cost for occasional engineers.
- **Intercom:** the recurring complaint is cost, including per-resolution Fin charges that "add up at scale".
- **SMB praise** focuses on cheaper, flat or predictable pricing (Crisp).
- Vendor comparison pages dominate search results, so treat them as marketing.

### Cited Findings
- **Pylon on G2:** about 4.7 average across roughly 77–111 reviews, depending on the snapshot.
  - Praise: "ease of use and seamless Slack integration", and "I like that it allows us to communicate to the hundreds of slack channels we have with customers".
  - Cons: email gaps ("doesn't cover all our bases-- we need to handle support tickets on email as well"), cumbersome setup, Slack-only sign-in, no mobile app at the time, and AI that "could benefit from further refinement".
  - Source: [G2 – Pylon reviews](https://www.g2.com/products/pylon-pylon/reviews_and_filters)
- **Plain on G2:** 4.5 across 20 reviews. Praise for Slack and Linear integrations, design, flexibility, and a team that "implements feedback super quick". Cons: search ("sometimes I struggle to find tickets") and seat cost for occasional engineer responders. — [G2 – Plain reviews](https://g2.com/products/plain/reviews_and_filters?page=2)
- **Intercom on Capterra:** reviewers call it expensive and "costly for new businesses". One flags that Fin's "about $0.99 per resolution... adds up quickly at scale". — [Capterra – Intercom reviews](https://www.capterra.com/p/134347/Intercom/reviews/)
- **Indie Hackers:** a founder saw Intercom's price rise fourfold after an early-stage discount ended. A reply says "Crisp offers like 85% of the feature set of Intercom and much cheaper" (single anecdote). — [Indie Hackers thread](https://www.indiehackers.com/post/free-cheaper-alternative-to-intercom-8658d3033e)
- **Vendor framing of Intercom as B2C/deflection-oriented:** Pylon says Intercom was "designed for consumer messaging and ticket deflection". Plain positions on native Slack/Teams/Discord and two-way Linear/Jira/GitHub (vendor marketing). — [Pylon vs Intercom](https://usepylon.com/pylon-v-intercom); [Plain – Intercom alternatives 2026](https://www.plain.com/blog/intercom-alternatives-b2b-saas-2026)
- **Pricing-transparency positioning:**
  - Crisp: "pay a single, consistent price regardless of the number of conversations". — [Crisp pricing](https://crisp.chat/en/pricing/)
  - Pylon: "You're not charged per ticket, so your costs stay predictable". — [Pylon pricing](https://www.usepylon.com/pricing)
  - Featurebase's savings calculator benchmarks against Intercom. — [Featurebase pricing](https://www.featurebase.app/pricing)
- **Third-party Pylon pricing claims conflict:**
  - A competitor's review (Unthread) says a 3-seat minimum at $89/seat applies for Slack Connect, and that AI add-ons cost about $500/mo.
  - CX Lead lists $59/seat.
  - Pylon's current page shows $89 and $139 plus credits.
  - Sources: [Unthread – Pylon review](https://unthread.io/blog/pylon-review/); [CX Lead – Pylon review](https://thecxlead.com/tools/pylon-review/); [Pylon pricing](https://www.usepylon.com/pricing)

### Inferences
- **Speed and keyboard-first praise for Plain is a design claim, not a review finding.** The documented shortcut set is Linear-like, but G2 reviewers more often cite integrations and ease of use. Search quality is a cited weakness. A fast global search plus ⌘K is a low-cost way for Geiger Comms to beat both Plain and Intercom on a known pain point.
- **Seat pricing for occasional responders is a concrete, repeated objection.** Free or cheap collaborator seats are a usability-and-pricing feature, not only a billing one.
- **Predictable AI cost is the most consistent pricing theme:** credits pooled per contract, flat fair use, or a published low per-resolution price, as opposed to open-ended per-resolution bills.

### Gaps
- No Reddit threads were surfaced by search (results were vendor and review-site pages). Community sentiment beyond G2, Capterra and Indie Hackers is unverified.
- No G2 or Capterra data was collected for Featurebase, Chatwoot, Crisp, Missive, Text, Re:amaze, Trengo or respond.io.
- No independent benchmark exists of inbox speed or latency versus Intercom.

---

## 5. Notable funding and launches, June–October 2026, and what they indicate about direction

### Takeaway
Big money went into enterprise AI-agent specialists in H1 2026, and launches since June have focused on agent infrastructure.
- **Funding:** Sierra raised $950M at $15.8B (May), Decagon $250M at $4.5B (Jan) and Parloa $350M at $3B (Jan).
- **Infrastructure launches since June:** harnesses and evals (Pylon Nexus), long-horizon agents (Sierra Horizon), full-duplex voice (Decagon Voice 3, Sierra Tandem Voice) and **personal-agent protocols** (Sierra PAP with Meta, Decagon Personal Agent Gateway and PACT).
- **Consolidation:** Zendesk bought Forethought, and HappyFox reportedly absorbed Thena (unconfirmed).
- **Regional messaging money:** respond.io raised $62.5M.

### Cited Findings
- **2026-06-16:** respond.io $62.5M Series B (Camber Partners). About $35M ARR, +169% YoY, profitable. Expansion into NA and EU via acquisitions. — [respond.io](https://respond.io/blog/respond-io-raises-62-million-series-b); [Pulse 2.0](https://pulse2.com/respond-io-raises-62-5-million-series-b-to-expand-ai-powered-customer-conversation-platform/)
- **2026-07-15:** Pylon repositions as "the agentic support platform", with Background Agents and Skills (beta). — [Pylon](https://www.usepylon.com/blog/pylon-becomes-the-agentic-support-platform)
- **2026-07-16:** Sierra Horizon, for long-running, multi-session goals with outcome-based pricing. — [Sierra – Horizon](https://sierra.ai/blog/horizon)
- **Jun–Oct 2026:** Chatwoot ships Captain v2.
  - Playground, scenario and tool controls, outcome controls and FAQ-gap review.
  - Translation, customer verification for sensitive tools, and Captain V1 retired (v4.19, Oct 20).
  - WhatsApp calling, campaigns and voice transcription.
  - Source: [Chatwoot releases](https://github.com/chatwoot/chatwoot/releases)
- **2026-08-07:** Sierra Voice Personas. — [Sierra](https://sierra.ai/blog/introducing-voice-personas)
- **2026-09-23 → 10-08:** Plain ships knowledge gaps, AI label and priority in workflows, workflows calling customer MCP tools, cross-channel Broadcasts, and Ari on select live threads. — [Plain changelog](https://www.plain.com/changelog)
- **2026-10-01:** Decagon Dialogues: Voice 3/Chord, Personal Agent Gateway, Agent Modules, Duet Apprentice. **2026-10-06:** the PACT protocol. — [Decagon](https://decagon.ai/blog/dialogues-2026)
- **2026-10-06:** Sierra Summit: Curie and Fleming models, Tandem Voice, Persona Studio, reimagined Ghostwriter, Personal Agent Protocol (with Meta), partner ecosystem. Then fleming-1 AI caller ID (Oct 8), the Poppy draft spec with 35 design partners (Oct 9), and Sierra + Stripe payments-in-conversation (Oct 20). — [Sierra recap](https://sierra.ai/blog/summit-recap-2026); [Sierra blog](https://sierra.ai/blog)
- **2026-10-06:** Pylon Nexus 1.0, an agent harness with eval-gated changes. **2026-10-13:** Pylon x Devin. — [Nexus](https://www.usepylon.com/blog/introducing-nexus); [Devin](https://www.usepylon.com/blog/pylon-x-devin)
- **Undated but current on the vendor page (fetched 2026-10-21):** LiveChat's pricing page now sells "Text", described as the next product from the LiveChat/HelpDesk/ChatBot team. LiveChat plans have moved to legacy pricing. — [livechat.com/pricing](https://www.livechat.com/pricing/)
- **Context before June 2026 (older):**
  - Sierra $950M Series E at $15.8B (May 2026). — [Quartz](https://qz.com/sierra-ai-funding-round-950-million-valuation-050426)
  - Decagon $250M at $4.5B (Jan 2026). — [Bloomberg](https://www.bloomberg.com/news/articles/2026-01-28/ai-customer-support-startup-decagon-valued-at-4-5-billion)
  - Parloa $350M at $3B (Jan 2026). — [Tech.eu](https://tech.eu/2026/01/15/parloa-raises-350m-tripling-valuation-to-3bn/)
  - Zendesk–Forethought (Mar 2026). — [Zendesk newsroom](https://www.zendesk.es/newsroom/articles/zendesk-completes-forethought-acquisition/)
  - Pylon's last disclosed round was a $31M Series B (Aug 2025). — [Pylon](https://www.usepylon.com/blog/announcing-our-31m-series-b)
  - Lorikeet $35M Series A (Aug 2025). — [Pulse 2.0](https://pulse2.com/lorikeet-35-million-series-a-raised-for-ai-based-universal-customer-concierges)
- **Unconfirmed:** HappyFox absorbing Thena and sunsetting it in 2026. — [YesPress](https://yespress.io/happyfox-bought-thena-support-lives-in-slack)

### Inferences
- **Direction 1:** the agent becomes the worker and the helpdesk becomes the supervision console (Pylon Background Agents, Plain Ari on the queue, Decagon Duet, Sierra Ghostwriter). Inbox UX shifts toward reviewing, redirecting and approving agent work.
- **Direction 2:** "B2A" channels and the identity, consent and permissions layer for customers' personal agents. Two of the three best-funded specialists shipped protocols in the same week. This is the next channel after Slack and ChatGPT.
- **Direction 3:** engineering-adjacent support. Bug report to coding agent to fix, tracked in the ticket.
- **Direction 4:** price compression and bundling at the SMB/mid end, while enterprise specialists hold custom outcome pricing.
- **Consolidation risk is real for thin Slack-ticketing vendors.** The defensible B2B position is the full stack: channels, account context, issue sync, agents and evals.

### Gaps
- Funding rounds for Plain, Featurebase, Atlas, Fini, Crisp, Trengo, Tidio or Missive between June and October 2026 were not searched individually. None surfaced incidentally.
- Pylon's blog index page 1 of 5 was the only page read, so smaller launches may be missing.
- A Sierra raise dated July 17 2026 appears on one tracker (DefiLlama, via search summary) and is unverified.
