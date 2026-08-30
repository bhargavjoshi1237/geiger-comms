import {
  LayoutDashboard,
  Inbox,
  UserCheck,
  MessagesSquare,
  AtSign,
  ListFilter,
  Ticket,
  Radio,
  Mail,
  MessageCircle,
  MessageCircleMore,
  Smartphone,
  Share2,
  Slack,
  Phone,
  Users,
  Building2,
  Tags,
  Workflow,
  Zap,
  Route,
  Timer,
  Bot,
  GraduationCap,
  Database,
  Boxes,
  FlaskConical,
  TestTubes,
  ClipboardCheck,
  ShieldCheck,
  Rocket,
  GitCommitHorizontal,
  Activity,
  Hash,
  Lightbulb,
  Gauge,
  BookOpen,
  FileText,
  FileQuestion,
  LayoutTemplate,
  Send,
  PanelTop,
  MousePointerClick,
  Newspaper,
  ListChecks,
  Compass,
  ScrollText,
  Bell,
  BarChart3,
  PieChart,
  Star,
  Blocks,
  Store,
  Webhook,
  Plug,
  Settings,
  SlidersHorizontal,
  UserCog,
  UserPlus,
  CalendarClock,
  Import,
  Lock,
  CreditCard,
} from "lucide-react";

/**
 * Workspace navigation for Geiger Comms.
 *
 * Shape: a flat array of top-level items `{ title, icon, subItems?: [{ title, icon }] }`.
 * Title is the source of truth — the screen registry keys screens by title and
 * the URL slug derives from it. Items without `subItems` are leaves that open a
 * screen directly; items with `subItems` are collapsible groups.
 *
 * Scope: Intercom's product surface. See `docs/competitor-feature-inventory.md`
 * for the inventory this maps to, and `docs/sidebar-audit-2026-08.md` for why
 * the Gladly/Gorgias/Zendesk-only areas were cut and which features moved into
 * a screen instead of getting one. Tier legend: A = universal baseline,
 * B = common but usually tier-gated, C = premium add-on, D = rare/differentiating.
 */
export const workspaceNav = [
  // Analytics landing surface; also the URL default tab.
  { title: "Overview", icon: LayoutDashboard },
  {
    title: "Inbox",
    icon: Inbox,
    subItems: [
      { title: "Your Inbox", icon: UserCheck }, // A — the agent's own queue
      { title: "All Conversations", icon: MessagesSquare }, // A — omnichannel queue
      { title: "Mentions", icon: AtSign }, // A
      { title: "Views", icon: ListFilter }, // B — saved filters, incl. spam
      // Customer, back-office and tracker types live here as a type filter.
      { title: "Tickets", icon: Ticket }, // A
    ],
  },
  {
    title: "Channels",
    icon: Radio,
    subItems: [
      { title: "Email", icon: Mail }, // A
      { title: "Messenger", icon: MessageCircle }, // A — the embedded chat widget
      { title: "WhatsApp", icon: MessageCircleMore }, // B
      { title: "SMS", icon: Smartphone }, // B
      { title: "Social", icon: Share2 }, // A
      { title: "Slack", icon: Slack }, // B — Fin ships Slack as a first-class channel
    ],
  },
  // C — Intercom's Phone. Calls, recordings, transcripts and voicemail are tabs
  // on a call record, not separate destinations.
  { title: "Phone", icon: Phone },
  {
    title: "Customers",
    icon: Users,
    subItems: [
      { title: "People", icon: Users }, // A — the timeline is this record's detail view
      { title: "Companies", icon: Building2 }, // A
      { title: "Segments", icon: Tags }, // B
    ],
  },
  {
    title: "Automation",
    icon: Workflow,
    subItems: [
      { title: "Workflows", icon: Workflow }, // A — visual no-code builder, incl. triggers
      { title: "Macros", icon: Zap }, // A — canned replies, with optional actions
      { title: "Routing Rules", icon: Route }, // A — incl. round robin
      { title: "SLA Policies", icon: Timer }, // A (Intercom gates to Expert)
    ],
  },
  {
    title: "AI Agent",
    icon: Bot,
    // D — the Fin lifecycle: train → simulate → deploy → observe → score.
    subItems: [
      { title: "Train", icon: GraduationCap }, // business understanding + policies
      { title: "Knowledge Sources", icon: Database }, // what the agent may answer from
      { title: "Actions & Procedures", icon: Boxes }, // multi-step task execution
      { title: "Playground", icon: FlaskConical }, // interactive response testing
      { title: "Testing & Regression", icon: TestTubes }, // simulations before deploy
      { title: "Evaluations", icon: ClipboardCheck }, // accuracy, tone, compliance
      // Escalation controls, failsafes, and the EU AI Act Art. 50 disclosure
      // config (in force 2026-08-02) — see the audit doc §3.
      { title: "Guardrails", icon: ShieldCheck },
      // The go-live step: which channels and audiences the agent is live on.
      { title: "Deployment", icon: Rocket },
      { title: "Versions", icon: GitCommitHorizontal }, // version control + rollback
    ],
  },
  {
    title: "AI Performance",
    icon: Activity,
    subItems: [
      { title: "Resolutions", icon: Bot }, // D — autonomous resolution rate + verification
      { title: "Topics", icon: Hash }, // C — topic/trend mining
      { title: "Recommendations", icon: Lightbulb }, // D — automated improvement suggestions
      { title: "Monitors", icon: Activity }, // D — always-on conversation monitoring
      { title: "Usage & Spend", icon: Gauge }, // D — outcome-based pricing surface
    ],
  },
  {
    title: "Knowledge Base",
    icon: BookOpen,
    subItems: [
      { title: "Articles", icon: FileText }, // A — translations are an article state
      { title: "Help Centers", icon: BookOpen }, // B — multiple + multibrand
      // D — topics the agent repeatedly can't answer, ranked by volume, so the
      // content backlog follows usage rather than editorial guesswork.
      { title: "Knowledge Gaps", icon: FileQuestion },
      { title: "Customer Portal", icon: LayoutTemplate }, // B — self-service ticket access
    ],
  },
  {
    title: "Proactive",
    icon: Send,
    // C — the outbound/engagement suite (Intercom Proactive Support Plus).
    subItems: [
      { title: "Banners", icon: PanelTop },
      { title: "Tooltips", icon: MousePointerClick },
      { title: "Posts", icon: Newspaper },
      { title: "Checklists", icon: ListChecks },
      { title: "Product Tours", icon: Compass },
      { title: "Surveys", icon: ScrollText },
      { title: "Campaigns", icon: Send }, // series / journey builder
      { title: "Push Notifications", icon: Bell },
    ],
  },
  {
    title: "Reports",
    icon: BarChart3,
    subItems: [
      // Team, channel and SLA-compliance reporting ship as prebuilt dashboards
      // here rather than as their own destinations.
      { title: "Analytics", icon: BarChart3 }, // A
      { title: "Custom Dashboards", icon: PieChart }, // B
      { title: "Quality & CSAT", icon: Star }, // C — satisfaction + QA scoring
    ],
  },
  {
    title: "Integrations",
    icon: Blocks,
    subItems: [
      { title: "Marketplace", icon: Store }, // A — CRM sync ships as a listing here
      { title: "API & Webhooks", icon: Webhook }, // A
      { title: "Data Connectors", icon: Plug }, // B — live external data
      { title: "MCP", icon: Boxes }, // D — agent tool protocol, client and server
    ],
  },
  {
    title: "Settings",
    icon: Settings,
    subItems: [
      { title: "General", icon: SlidersHorizontal },
      // Personal sidebar curation. Locked in geiger-ui.config.js — it is the
      // screen that unhides everything else.
      { title: "Navigation", icon: ListFilter },
      { title: "Brands", icon: Building2 }, // B — multi-brand
      { title: "Teammates", icon: UserCog }, // A — incl. availability + work modes
      { title: "Roles & Permissions", icon: ShieldCheck }, // B — custom roles
      { title: "Seats & Licenses", icon: UserPlus }, // D — lite/collaborator seats
      { title: "Custom Fields & Objects", icon: Tags }, // A — the workspace data model
      { title: "Business Hours", icon: CalendarClock }, // B — incl. holiday hours
      { title: "Import & Migration", icon: Import }, // B — move off Zendesk/Intercom/Front
      { title: "Sandbox", icon: FlaskConical }, // B
      { title: "Audit Logs", icon: ScrollText }, // B
      { title: "Security & Compliance", icon: Lock }, // C — HIPAA, GDPR, data residency
      { title: "Plans & Billing", icon: CreditCard },
    ],
  },
];
