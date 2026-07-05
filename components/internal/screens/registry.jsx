"use client";

import { InboxOverviewScreen } from "./overview/inbox_overview";
import { ComingSoonScreen } from "./coming_soon";
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

// Renders the workspace screen for the active tab. Uses static component
// references (one case per registered screen) so screen identity stays stable
// across renders; unregistered titles fall back to ComingSoon.
export function ActiveScreen({ tab }) {
  if (tab === "Inbox") return <InboxOverviewScreen />;

  const item = findNavItem(tab) || { title: tab };
  return <ComingSoonScreen title={item.title} icon={item.icon} />;
}

// Whether a title has a dedicated screen (used to gate nav, not to render).
export function hasScreen(title) {
  return title === "Inbox";
}
