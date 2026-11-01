"use client";

import { ComingSoonScreen } from "./coming_soon";
import { CommsOverviewScreen } from "./overview/comms_overview";
import { NavigationSettingsScreen } from "./settings/navigation_settings";
import { TeamMembersScreen } from "./settings/team_members";
import { RolesPermissionsScreen } from "./settings/roles_permissions";
import { BusinessHoursScreen } from "./settings/business_hours";
import { AiProvidersScreen } from "./settings/ai_providers";
import { EmailScreen } from "./channels/email";
import { MessengerScreen } from "./channels/messenger";
import { SlackScreen } from "./channels/slack";
import { SMSScreen } from "./channels/sms";
import { SocialScreen } from "./channels/social";
import { WhatsAppScreen } from "./channels/whatsapp";
import { YourInboxScreen } from "./inbox/your_inbox";
import { AllConversationsScreen } from "./inbox/all_conversations";
import { MentionsScreen } from "./inbox/mentions";
import { ViewsScreen } from "./inbox/views";
import { TicketsScreen } from "./inbox/tickets";
import { PeopleScreen } from "./customers/people";
import { CompaniesScreen } from "./customers/companies";
import { SegmentsScreen } from "./customers/segments";
import { WorkflowsScreen } from "./automation/workflows";
import { WorkflowTemplatesScreen } from "./automation/workflow_templates";
import { RunHistoryScreen } from "./automation/run_history";
import { MacrosScreen } from "./automation/macros";
import { RoutingRulesScreen } from "./automation/routing_rules";
import { SLAPoliciesScreen } from "./automation/sla_policies";
import { AnalyticsScreen } from "./reports/analytics";
import { QualityCsatScreen } from "./reports/quality_csat";
import { ArticlesScreen } from "./knowledge_base/articles";
import { HelpCentersScreen } from "./knowledge_base/help_centers";
import { KnowledgeGapsScreen } from "./knowledge_base/knowledge_gaps";
import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";

// Resolves the nav item (top-level or sub) for a title, for ComingSoon labels.
function findNavItem(title) {
  for (const item of workspaceNav) {
    if (item.title === title) return item;
    const sub = item.subItems?.find((s) => s.title === title);
    if (sub) return sub;
  }
  return null;
}

// Titles with a dedicated screen. One static case per entry below so screen
// identity stays stable across renders; unregistered titles fall back to
// ComingSoon.
const REGISTERED = new Set([
  "Overview",
  "Your Inbox",
  "All Conversations",
  "Mentions",
  "Views",
  "Tickets",
  "People",
  "Companies",
  "Segments",
  "Workflows",
  "Workflow Templates",
  "Run History",
  "Macros",
  "Routing Rules",
  "SLA Policies",
  "Analytics",
  "Quality & CSAT",
  "Navigation",
  "Teammates",
  "Roles & Permissions",
  "Business Hours",
  "AI Providers",
  "Email",
  "Messenger",
  "WhatsApp",
  "SMS",
  "Social",
  "Slack",
  "Articles",
  "Help Centers",
  "Knowledge Gaps",
]);

// Screens that need the whole viewport height and their own internal scrolling
// (a three-pane inbox cannot live in a padded, outer-scrolling container —
// inbox spec §4.1). The project page drops its padding for these titles.
export const FULL_BLEED_SCREENS = new Set(["Your Inbox", "All Conversations", "Mentions"]);

export function isFullBleed(title) {
  return FULL_BLEED_SCREENS.has(title);
}

export function ActiveScreen({ tab }) {
  switch (tab) {
    case "Overview":
      return <CommsOverviewScreen />;
    case "Your Inbox":
      return <YourInboxScreen />;
    case "All Conversations":
      return <AllConversationsScreen />;
    case "Mentions":
      return <MentionsScreen />;
    case "Views":
      return <ViewsScreen />;
    case "Tickets":
      return <TicketsScreen />;
    case "People":
      return <PeopleScreen />;
    case "Companies":
      return <CompaniesScreen />;
    case "Segments":
      return <SegmentsScreen />;
    case "Workflows":
      return <WorkflowsScreen />;
    case "Workflow Templates":
      return <WorkflowTemplatesScreen />;
    case "Run History":
      return <RunHistoryScreen />;
    case "Macros":
      return <MacrosScreen />;
    case "Routing Rules":
      return <RoutingRulesScreen />;
    case "SLA Policies":
      return <SLAPoliciesScreen />;
    case "Analytics":
      return <AnalyticsScreen />;
    case "Quality & CSAT":
      return <QualityCsatScreen />;
    case "Navigation":
      return <NavigationSettingsScreen />;
    case "Teammates":
      return <TeamMembersScreen />;
    case "Roles & Permissions":
      return <RolesPermissionsScreen />;
    case "Business Hours":
      return <BusinessHoursScreen />;
    case "AI Providers":
      return <AiProvidersScreen />;
    case "Email":
      return <EmailScreen />;
    case "Messenger":
      return <MessengerScreen />;
    case "WhatsApp":
      return <WhatsAppScreen />;
    case "SMS":
      return <SMSScreen />;
    case "Social":
      return <SocialScreen />;
    case "Slack":
      return <SlackScreen />;
    case "Articles":
      return <ArticlesScreen />;
    case "Help Centers":
      return <HelpCentersScreen />;
    case "Knowledge Gaps":
      return <KnowledgeGapsScreen />;
    default: {
      const item = findNavItem(tab) || { title: tab };
      return <ComingSoonScreen title={item.title} icon={item.icon} />;
    }
  }
}

// Whether a title has a dedicated screen (used to gate nav, not to render).
export function hasScreen(title) {
  return REGISTERED.has(title);
}
