"use client";

import React from "react";
import { applyNavVisibility } from "@geiger/ui";

import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";
import { useNavVisibility } from "@/context/nav-visibility-context";
import { useRbac } from "@/context/rbac-context";
import { tabPermissionKey } from "@/lib/rbac";

// The nav the current user can actually reach: the sections their role grants,
// narrowed to what they chose to keep in Settings → Navigation.
//
// Every surface that lists destinations reads it from here — the sidebar and
// the topbar's command palette — so the two can't drift.
//
// Order matters. The permission filter comes first, personal visibility last,
// so hiding an entry is always a narrowing of what the grant already allows,
// never a widening. This is advisory UI gating, not an authorization boundary:
// a hidden screen's URL still resolves until per-table RLS policies land.

export function useCuratableNav() {
  const { can } = useRbac();

  return React.useMemo(
    () => workspaceNav.filter((item) => can(tabPermissionKey(item.title))),
    [can],
  );
}

export function useVisibleNav() {
  const curatable = useCuratableNav();
  const { hidden, config } = useNavVisibility();

  return React.useMemo(
    () => applyNavVisibility(curatable, hidden, config),
    [curatable, hidden, config],
  );
}

// True until the list above can be trusted: both inputs — this user's grants
// and their own curation — need a round trip, and the page paints before any of
// them can be asked for. Rendering the nav in that window shows entries that
// disappear a moment later; surfaces should render a placeholder instead.
export function useNavLoading() {
  const { loading: rbacLoading } = useRbac();
  const { loading: visibilityLoading } = useNavVisibility();

  return rbacLoading || visibilityLoading;
}

export default useVisibleNav;
