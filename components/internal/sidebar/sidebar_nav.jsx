import {
  LayoutDashboard,
  Inbox,
  MessagesSquare,
  Ticket,
  Radio,
  Mail,
  MessageSquare,
  Share2,
  Smartphone,
  Headphones,
  Phone,
  ListTree,
  AudioLines,
  Volume2,
  Waypoints,
  Users,
  History,
  ShoppingBag,
  Workflow,
  Zap,
  GitBranch,
  Route,
  Shuffle,
  Timer,
  Sparkles,
  MessageSquareReply,
  BotMessageSquare,
  Bot,
  Gauge,
  BookOpen,
  FileText,
  Languages,
  BarChart3,
  PieChart,
  ClipboardCheck,
  CalendarClock,
  Blocks,
  Store,
  Webhook,
  Settings,
  Building2,
  UserCog,
  FlaskConical,
  ShieldCheck,
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
 * This covers every product feature named in `research-findings.md` — §3's four
 * prevalence tiers plus the pricing/metering surfaces implied by §4 and §5.
 * Tier legend in the comments: baseline (🟢 very common), gated (🟡 common but
 * tier-locked), addon (🟠 premium add-on), rare (🔴 differentiating). §2's vendor
 * table and §6's open questions are research meta, not surfaces, so they have no
 * nav entry.
 */
export const workspaceNav = [
  // Analytics landing surface; also the URL default tab.
  { title: "Overview", icon: LayoutDashboard },

  {
    title: "Inbox",
    icon: Inbox,
    // baseline — omnichannel inbox / ticketing, every channel in one queue.
    subItems: [
      { title: "All Conversations", icon: MessagesSquare },
      { title: "Tickets", icon: Ticket },
    ],
  },

  {
    title: "Channels",
    icon: Radio,
    // baseline — email, chat, social; SMS per the §3 unified-thread bullet.
    subItems: [
      { title: "Email", icon: Mail },
      { title: "Live Chat", icon: MessageSquare },
      { title: "Social", icon: Share2 },
      { title: "SMS", icon: Smartphone },
    ],
  },

  {
    title: "Voice & IVR",
    icon: Headphones,
    // addon — voice/contact center; rare — Gladly's fully-programmable cloud IVR.
    subItems: [
      { title: "Calls", icon: Phone }, // addon — contact center
      { title: "IVR Flows", icon: ListTree }, // rare — touchtone menus
      { title: "Voice Recognition", icon: AudioLines }, // rare
      { title: "Text-to-Speech", icon: Volume2 }, // rare — 30 languages
      { title: "IVR Routing", icon: Waypoints }, // rare — by history, location, LTV
    ],
  },

  {
    title: "Customers",
    icon: Users,
    subItems: [
      { title: "Unified Timeline", icon: History }, // rare — lifelong thread, §5.3
      { title: "Order History", icon: ShoppingBag }, // rare — e-commerce agent view
    ],
  },

  {
    title: "Automation",
    icon: Workflow,
    subItems: [
      { title: "Macros", icon: Zap }, // baseline
      { title: "Triggers", icon: GitBranch }, // baseline
      { title: "Routing Rules", icon: Route }, // baseline
      { title: "Skills-based Routing", icon: Shuffle }, // gated
      { title: "SLA Management", icon: Timer }, // baseline
    ],
  },

  {
    title: "AI",
    icon: Sparkles,
    subItems: [
      { title: "Reply Suggestions", icon: MessageSquareReply }, // baseline
      { title: "Chatbot", icon: BotMessageSquare }, // baseline — basic bot
      { title: "AI Copilot", icon: Sparkles }, // addon — agent-facing copilot
      { title: "Autonomous Resolutions", icon: Bot }, // addon — metered resolutions
      { title: "AI Usage", icon: Gauge }, // §4 — allotments & per-resolution spend
    ],
  },

  {
    title: "Knowledge Base",
    icon: BookOpen,
    subItems: [
      { title: "Articles", icon: FileText }, // baseline — self-service KB
      { title: "Help Centers", icon: BookOpen }, // gated — multiple help centers
      { title: "Translations", icon: Languages }, // gated — multilingual KB
    ],
  },

  {
    title: "Reports",
    icon: BarChart3,
    subItems: [
      { title: "Analytics", icon: BarChart3 }, // baseline
      { title: "Custom Dashboards", icon: PieChart }, // gated — advanced reporting
      { title: "Quality Assurance", icon: ClipboardCheck }, // addon — QA
      { title: "Workforce Management", icon: CalendarClock }, // addon — WFM
    ],
  },

  {
    title: "Integrations",
    icon: Blocks,
    // baseline — integration marketplace / API.
    subItems: [
      { title: "Marketplace", icon: Store },
      { title: "API & Webhooks", icon: Webhook },
    ],
  },

  {
    title: "Settings",
    icon: Settings,
    subItems: [
      { title: "Brands", icon: Building2 }, // gated — multi-brand support
      { title: "Roles", icon: UserCog }, // gated — custom roles
      { title: "Sandbox", icon: FlaskConical }, // gated
      { title: "Security & Compliance", icon: ShieldCheck }, // gated/addon — data privacy
      { title: "Plans & Billing", icon: CreditCard }, // §5.5 — per-seat vs ticket-volume
    ],
  },
];
