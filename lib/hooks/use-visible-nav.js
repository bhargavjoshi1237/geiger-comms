"use client";

import React from "react";
import { applyNavVisibility } from "@geiger/ui";

import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";
import { useNavVisibility } from "@/context/nav-visibility-context";
import { roleHasPermission, tabPermissionKey } from "@/lib/rbac";

// The nav the current user can actually reach: the workspace sections their role
// grants, narrowed to what they chose to keep in Settings → Navigation.
//
// Every surface that lists destinations reads it from here so the sidebar and
// the settings screen can't drift. Order matters — personal visibility comes
// last, so hiding an entry is always a narrowing of what the grant already
// allows, never a widening. Both filters are advisory UI gating, not an
// authorization boundary: a hidden screen's title still resolves.

// What the user is allowed to curate: the role-granted sections. With no roles
// configured, roleHasPermission() grants everything.
export function useCuratableNav(roles = [], roleId = "workspace_owner") {
  return React.useMemo(
    () =>
      workspaceNav.filter((item) =>
        roleHasPermission(roles, roleId, tabPermissionKey(item.title)),
      ),
    [roles, roleId],
  );
}

export function useVisibleNav(roles, roleId) {
  const curatable = useCuratableNav(roles, roleId);
  const { hidden, config } = useNavVisibility();

  return React.useMemo(
    () => applyNavVisibility(curatable, hidden, config),
    [curatable, hidden, config],
  );
}

export default useVisibleNav;
