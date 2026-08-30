"use client";

import { ComingSoonScreen } from "./coming_soon";
import { CommsOverviewScreen } from "./overview/comms_overview";
import { NavigationSettingsScreen } from "./settings/navigation_settings";
import { TeamMembersScreen } from "./settings/team_members";
import { RolesPermissionsScreen } from "./settings/roles_permissions";
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
  "Navigation",
  "Teammates",
  "Roles & Permissions",
  "Email",
  "Messenger",
  "WhatsApp",
  "SMS",
  "Social",
  "Slack",
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
    case "Navigation":
      return <NavigationSettingsScreen />;
    case "Teammates":
      return <TeamMembersScreen />;
    case "Roles & Permissions":
      return <RolesPermissionsScreen />;
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
