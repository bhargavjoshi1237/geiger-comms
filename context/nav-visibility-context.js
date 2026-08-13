"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { canToggleNavItem, defaultHiddenNav, sanitizeHidden } from "@geiger/ui";

import navConfig from "@/geiger-ui.config";
import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";
import { useOptionalProject } from "@/context/project-context";
import { getNavPrefs, saveNavPrefs } from "@/lib/supabase/nav_prefs";
import { getUser } from "@/lib/supabase/user";

// Which sidebar entries the signed-in user has hidden, for the active project.
//
// Sidebar curation is a personal preference, so this is keyed by (project, user)
// in public.user_nav_prefs — teammates keep their own sidebar. The rules about
// what may be hidden live in geiger-ui.config.js and are enforced by @geiger/ui;
// this context only loads, checks and persists.
//
// Writes are optimistic: local state updates immediately, then persists; a falsy
// return rolls the change back and the caller toasts.

const NavVisibilityContext = createContext(null);

// Everything-visible stand-in for trees with no provider (the landing
// playground), so useVisibleNav() is safe to call anywhere.
const ALL_VISIBLE = Object.freeze({
  hidden: Object.freeze([]),
  loading: false,
  available: false,
  config: navConfig,
  setHidden: async () => ({ ok: false, reason: "" }),
  showAll: async () => false,
});

export function NavVisibilityProvider({ children }) {
  const project = useOptionalProject();
  const projectId = project?.projectId || null;
  const [hidden, setHiddenState] = useState(() => defaultHiddenNav(navConfig));
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load this user's row. Every setState happens in the async continuation — a
  // synchronous setState in an effect body cascades renders. With no project
  // yet, resolve to the defaults rather than staying "loading" forever.
  useEffect(() => {
    let alive = true;
    (async () => {
      const user = await getUser();
      const prefs = projectId
        ? await getNavPrefs(projectId, user?.id ?? null)
        : null;
      if (!alive) return;
      setUserId(user?.id ?? null);
      // A stored list can outlive a renamed screen or a newly locked entry, so
      // never trust it straight from the database.
      setHiddenState(
        prefs
          ? sanitizeHidden(prefs.hidden, workspaceNav, navConfig)
          : defaultHiddenNav(navConfig),
      );
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  const persist = useCallback(
    async (next, previous) => {
      setHiddenState(next);
      if (!projectId) return true;
      const ok = await saveNavPrefs(projectId, userId, next);
      if (!ok) setHiddenState(previous);
      return ok;
    },
    [projectId, userId],
  );

  // Flip one entry. Refuses — with the reason to show the user — when the change
  // would leave a visible screen without something it needs.
  const setHidden = useCallback(
    async (title, nextHidden) => {
      const check = canToggleNavItem(title, {
        nav: workspaceNav,
        hidden,
        config: navConfig,
        nextHidden,
      });
      if (!check.allowed) return { ok: false, reason: check.reason };

      const next = nextHidden
        ? hidden.concat(title)
        : hidden.filter((t) => t !== title);
      const ok = await persist(next, hidden);
      return { ok, reason: ok ? "" : "Couldn't save your navigation settings." };
    },
    [hidden, persist],
  );

  // Showing everything can never violate the invariant, so it needs no checks.
  const showAll = useCallback(
    () => (hidden.length === 0 ? Promise.resolve(true) : persist([], hidden)),
    [hidden, persist],
  );

  const value = useMemo(
    () => ({
      hidden,
      loading,
      available: true,
      config: navConfig,
      setHidden,
      showAll,
    }),
    [hidden, loading, setHidden, showAll],
  );

  return (
    <NavVisibilityContext.Provider value={value}>
      {children}
    </NavVisibilityContext.Provider>
  );
}

export function useNavVisibility() {
  return useContext(NavVisibilityContext) ?? ALL_VISIBLE;
}

export default NavVisibilityProvider;
