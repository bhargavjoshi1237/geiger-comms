"use client";

import { ComingSoonScreen } from "./coming_soon";
import { NavigationSettingsScreen } from "./settings/navigation_settings";
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
const REGISTERED = new Set(["Navigation"]);

export function ActiveScreen({ tab }) {
  switch (tab) {
    case "Navigation":
      return <NavigationSettingsScreen />;
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
