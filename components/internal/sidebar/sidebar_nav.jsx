import {
  LayoutDashboard,
  Inbox,
  MessagesSquare,
  ListFilter,
  Ticket,
  ClipboardList,
  GitMerge,
  CornerUpRight,
  ShieldAlert,
  Radio,
  Mail,
  MessageSquare,
  MessageCircle,
  MessageCircleMore,
  Smartphone,
  Share2,
  Headphones,
  Phone,
  ListTree,
  Waypoints,
  AudioLines,
  Volume2,
  PhoneOutgoing,
  Voicemail,
  Disc,
  FileAudio,
  Users,
  History,
  Building2,
  Tags,
  ShoppingBag,
  PackageCheck,
  HeartPulse,
  Workflow,
  Zap,
  MessageSquareQuote,
  GitBranch,
  Route,
  Shuffle,
  Timer,
  CalendarClock,
  CheckCheck,
  Bot,
  GraduationCap,
  Database,
  Boxes,
  FlaskConical,
  TestTubes,
  ClipboardCheck,
  ShieldCheck,
  GitCommitHorizontal,
  Hash,
  Lightbulb,
  Activity,
  Gauge,
  Sparkles,
  BookOpen,
  FileText,
  Languages,
  LayoutTemplate,
  UsersRound,
  PanelTop,
  MousePointerClick,
  Newspaper,
  ListChecks,
  Compass,
  ScrollText,
  Send,
  Bell,
  BarChart3,
  PieChart,
  Star,
  Blocks,
  Store,
  Webhook,
  RefreshCw,
  Plug,
  Settings,
  SlidersHorizontal,
  UserCog,
  UserPlus,
  Lock,
  CreditCard,
} from "lucide-react";

/**
 * Workspace navigation for Geiger Comms.
 *
 * Shape: a flat array of top-level items `{ title, icon, subItems?: [{ title,
 * icon }] }`. Title is the source of truth — the screen registry keys screens by
 * title and the URL slug derives from it. Items without `subItems` are leaves
 * that open a screen directly; items with `subItems` are collapsible groups.
 *
 * Built from `competitor-feature-inventory.md` (Intercom/Fin plus 11 rivals) and
 * `research-findings.md`. Tier legend in the comments: A = universal baseline,
 * B = common but usually tier-gated, C = premium add-on, D = rare/differentiating.
 */
export const workspaceNav = [
  // Analytics landing surface; also the URL default tab.
  { title: "Overview", icon: LayoutDashboard },

  {
    title: "Inbox",
    icon: Inbox,
    subItems: [
      { title: "All Conversations", icon: MessagesSquare }, // A — omnichannel queue
      { title: "Views", icon: ListFilter }, // B — saved filters
      { title: "Tickets", icon: Ticket }, // A
      { title: "Back-office Tickets", icon: ClipboardList }, // D — Intercom
      { title: "Tracker Tickets", icon: GitMerge }, // D — one issue, many customers
      { title: "Side Conversations", icon: CornerUpRight }, // B — loop in externals
      { title: "Spam", icon: ShieldAlert }, // B
    ],
  },

  {
    title: "Channels",
    icon: Radio,
    subItems: [
      { title: "Email", icon: Mail }, // A
      { title: "Live Chat", icon: MessageSquare }, // A
      { title: "Messenger", icon: MessageCircle }, // A — embedded widget
      { title: "WhatsApp", icon: MessageCircleMore }, // B
      { title: "SMS", icon: Smartphone }, // B
      { title: "Social", icon: Share2 }, // A
    ],
  },

  {
    title: "Voice & IVR",
    icon: Headphones,
    subItems: [
      { title: "Calls", icon: Phone }, // C — contact centre
      { title: "IVR Flows", icon: ListTree }, // D — programmable IVR
      { title: "IVR Routing", icon: Waypoints }, // D — by history, location, LTV
      { title: "Voice Recognition", icon: AudioLines }, // D
      { title: "Text-to-Speech", icon: Volume2 }, // D
      { title: "Callbacks", icon: PhoneOutgoing }, // C
      { title: "Voicemail", icon: Voicemail }, // C
      { title: "Call Recordings", icon: Disc }, // C — incl. consent capture
      { title: "Call Transcripts", icon: FileAudio }, // C — conversation intelligence
    ],
  },

  {
    title: "Customers",
    icon: Users,
    subItems: [
      { title: "Unified Timeline", icon: History }, // D — lifelong thread, no ticket fragmentation
      { title: "People", icon: Users }, // A
      { title: "Companies", icon: Building2 }, // A
      { title: "Segments", icon: Tags }, // B
      { title: "Order History", icon: ShoppingBag }, // D — ecommerce agent view
      { title: "Order Actions", icon: PackageCheck }, // D — refund, cancel, address, coupons
      { title: "Health Scores", icon: HeartPulse }, // D — success-side
    ],
  },

  {
    title: "Automation",
    icon: Workflow,
    subItems: [
      { title: "Workflows", icon: Workflow }, // A — visual no-code builder
      { title: "Macros", icon: Zap }, // A
      { title: "Saved Replies", icon: MessageSquareQuote }, // A — canned responses
      { title: "Triggers", icon: GitBranch }, // A
      { title: "Routing Rules", icon: Route }, // A
      { title: "Skills-based Routing", icon: Shuffle }, // B
      { title: "SLA Policies", icon: Timer }, // A (gated by most vendors)
      { title: "Business Hours", icon: CalendarClock }, // B — incl. holiday hours
      { title: "Approval Workflows", icon: CheckCheck }, // D — Zendesk enterprise
    ],
  },

  {
    title: "AI Agent",
    icon: Bot,
    // D — the agent lifecycle Fin/Kustomer/Tidio ship as a sub-application.
    subItems: [
      { title: "Train", icon: GraduationCap }, // business understanding + policies
      { title: "Knowledge Sources", icon: Database }, // what the agent may answer from
      { title: "Actions & Procedures", icon: Boxes }, // multi-step task execution
      { title: "Playground", icon: FlaskConical }, // interactive response testing
      { title: "Testing & Regression", icon: TestTubes }, // simulations before deploy
      { title: "Evaluations", icon: ClipboardCheck }, // accuracy, tone, compliance
      { title: "Guardrails", icon: ShieldCheck }, // escalation controls + failsafes
      { title: "Versions", icon: GitCommitHorizontal }, // version control + rollback
    ],
  },

  {
    title: "AI Performance",
    icon: Activity,
    subItems: [
      { title: "Resolutions", icon: Bot }, // D — autonomous resolution rate
      { title: "Topics", icon: Hash }, // C — topic/trend mining
      { title: "Recommendations", icon: Lightbulb }, // D — automated improvement suggestions
      { title: "Monitors", icon: Activity }, // D — always-on conversation monitoring
      { title: "Usage & Spend", icon: Gauge }, // D — outcome-based pricing surface
    ],
  },

  // A — agent-facing reply drafting and answer surfacing.
  { title: "Copilot", icon: Sparkles },

  {
    title: "Knowledge Base",
    icon: BookOpen,
    subItems: [
      { title: "Articles", icon: FileText }, // A
      { title: "Help Centers", icon: BookOpen }, // B — multiple + multibrand
      { title: "Translations", icon: Languages }, // B — multilingual KB
      { title: "Customer Portal", icon: LayoutTemplate }, // B — self-service ticket access
      { title: "Community Forum", icon: UsersRound }, // D — Zoho, LiveAgent
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
      { title: "Analytics", icon: BarChart3 }, // A — prebuilt dashboards
      { title: "Custom Dashboards", icon: PieChart }, // B
      { title: "SLA Compliance", icon: Timer }, // B
      { title: "Team Performance", icon: Users }, // A
      { title: "Channel Performance", icon: Radio }, // A
      { title: "CSAT & Quality", icon: Star }, // A — satisfaction measurement
      { title: "Quality Assurance", icon: ClipboardCheck }, // C — scores humans and AI
      { title: "Workforce Management", icon: CalendarClock }, // C — forecasting + scheduling
    ],
  },

  {
    title: "Integrations",
    icon: Blocks,
    subItems: [
      { title: "Marketplace", icon: Store }, // A
      { title: "API & Webhooks", icon: Webhook }, // A
      { title: "CRM Sync", icon: RefreshCw }, // B — bidirectional
      { title: "Data Connectors", icon: Plug }, // B — live external data
      { title: "MCP", icon: Boxes }, // D — agent tool protocol
    ],
  },

  {
    title: "Settings",
    icon: Settings,
    subItems: [
      { title: "General", icon: SlidersHorizontal },
      { title: "Brands", icon: Building2 }, // B — multi-brand
      { title: "Teammates", icon: UserCog }, // A
      { title: "Roles & Permissions", icon: ShieldCheck }, // B — custom roles
      { title: "Seats & Licenses", icon: UserPlus }, // D — lite/collaborator seats
      { title: "Sandbox", icon: FlaskConical }, // B
      { title: "Audit Logs", icon: ScrollText }, // B
      { title: "Security & Compliance", icon: Lock }, // C — HIPAA, GDPR visibility
      { title: "Plans & Billing", icon: CreditCard },
    ],
  },
];
