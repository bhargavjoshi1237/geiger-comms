"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { NavVisibilitySettings } from "@geiger/ui";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader, StatsBar } from "@/components/internal/shared/screen_kit";
import { LoadingArea } from "@/components/internal/workspace/workspace_states";
import { useCuratableNav } from "@/lib/hooks/use-visible-nav";
import { useNavVisibility } from "@/context/nav-visibility-context";

// Settings → Navigation. Lets this user hide the parts of the sidebar they don't
// use, for this project only — it's a personal preference, stored per (project,
// user) in public.user_nav_prefs, so teammates keep their own sidebar.
//
// The rules are declared in geiger-ui.config.js and enforced by @geiger/ui's
// <NavVisibilitySettings>: a switch that would leave a visible screen without
// something it needs is disabled and explains why. This screen owns only the
// frame, the stats and the toasts.

export function NavigationSettingsScreen() {
  const nav = useCuratableNav();
  const { hidden, config, loading, available, setHidden, showAll } =
    useNavVisibility();
  const [busy, setBusy] = useState(false);

  const stats = useMemo(() => {
    const total = nav.reduce(
      (sum, section) => sum + 1 + (section.subItems?.length || 0),
      0,
    );
    return [
      { label: "Destinations", value: String(total) },
      { label: "Shown", value: String(Math.max(0, total - hidden.length)) },
      { label: "Hidden", value: String(hidden.length) },
    ];
  }, [nav, hidden]);

  const handleToggle = async (title, nextHidden) => {
    setBusy(true);
    const { ok, reason } = await setHidden(title, nextHidden);
    setBusy(false);
    if (ok) toast.success(`${title} ${nextHidden ? "hidden" : "shown"}`);
    else
      toast.error(
        reason || `Couldn't ${nextHidden ? "hide" : "show"} ${title}.`,
      );
  };

  const handleReset = async () => {
    setBusy(true);
    const ok = await showAll();
    setBusy(false);
    if (ok) toast.success("Every section is back in the sidebar");
    else toast.error("Couldn't reset your navigation settings.");
  };

  const header = (
    <ScreenHeader
      title="Navigation"
      description="Choose what appears in your sidebar. This is personal to you — teammates on this project keep their own. Some screens can't be hidden while another screen still needs them."
    />
  );

  if (loading) {
    return (
      <MainScreenWrapper>
        {header}
        <LoadingArea />
      </MainScreenWrapper>
    );
  }

  return (
    <MainScreenWrapper>
      {header}

      <StatsBar stats={stats} columns={3} />

      <NavVisibilitySettings
        nav={nav}
        config={config}
        hidden={hidden}
        busy={busy || !available}
        onToggle={handleToggle}
        onReset={handleReset}
      />
    </MainScreenWrapper>
  );
}

export default NavigationSettingsScreen;
