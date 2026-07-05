import {
  Inbox,
  MessagesSquare,
  CircleDashed,
  AtSign,
  Clock,
  CheckCircle2,
  Users,
  UserPlus,
  Building2,
  Tags,
  BookOpen,
  FileText,
  FolderOpen,
  BarChart3,
  Gauge,
  Timer,
  Settings,
  SlidersHorizontal,
  Radio,
  UserCog,
} from "lucide-react";

/**
 * Workspace navigation for Geiger Comms (Intercom-style shared inbox).
 *
 * Shape: a flat array of top-level items `{ title, icon, subItems?: [{ title,
 * icon }] }`. Title is the source of truth — the screen registry keys screens by
 * title and the URL slug derives from it. "Inbox" is a leaf (the real screen);
 * the rest are groups whose items resolve to ComingSoon for now.
 */
export const workspaceNav = [
  { title: "Inbox", icon: Inbox },
  {
    title: "Conversations",
    icon: MessagesSquare,
    subItems: [
      { title: "All conversations", icon: MessagesSquare },
      { title: "Unassigned", icon: CircleDashed },
      { title: "Mentions", icon: AtSign },
      { title: "Snoozed", icon: Clock },
      { title: "Closed", icon: CheckCircle2 },
    ],
  },
  {
    title: "Contacts",
    icon: Users,
    subItems: [
      { title: "Leads", icon: UserPlus },
      { title: "People", icon: Users },
      { title: "Companies", icon: Building2 },
      { title: "Segments", icon: Tags },
    ],
  },
  {
    title: "Help Center",
    icon: BookOpen,
    subItems: [
      { title: "Articles", icon: FileText },
      { title: "Collections", icon: FolderOpen },
    ],
  },
  {
    title: "Reports",
    icon: BarChart3,
    subItems: [
      { title: "Reports Overview", icon: Gauge },
      { title: "Team performance", icon: Users },
      { title: "SLA & response times", icon: Timer },
    ],
  },
  {
    title: "Settings",
    icon: Settings,
    subItems: [
      { title: "General", icon: SlidersHorizontal },
      { title: "Channels", icon: Radio },
      { title: "Teammates", icon: UserCog },
    ],
  },
];
