"use client";

import React, { useState } from "react";
import { SidebarProvider, SidebarInset } from "@geiger/ui";
import { AppSidebar } from "@/components/internal/sidebar/sidebar";
import { Topbar } from "@/components/internal/topbar/topbar";
import { ActiveScreen } from "@/components/internal/screens/registry";
import { DEFAULT_TAB } from "@/lib/hooks/use-workspace-url";

// Live, embeddable copy of the Comms workspace for the landing playground. Tab
// lives in local state (no URL, no project) — a throwaway, fully interactive
// instance. Fills its container (h-full) instead of the viewport.
export function CommsPlayground() {
  const [currentTab, setCurrentTab] = useState(DEFAULT_TAB);

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground font-sans overflow-hidden selection:bg-surface-strong">
      <SidebarProvider
        className="flex-col !flex h-full min-w-0"
        style={{ flexDirection: "column" }}
      >
        <Topbar />
        <div className="flex flex-1 overflow-hidden relative">
          <AppSidebar activeTab={currentTab} onTabChange={setCurrentTab} />
          <SidebarInset className="flex-1 flex flex-col h-full bg-transparent overflow-hidden relative border-none">
            <div className="absolute top-0 right-0 w-[500px] h-[300px] bg-white/[0.02] blur-[120px] pointer-events-none rounded-full" />
            <main className="flex-1 overflow-y-auto p-4 md:p-8 relative z-10 w-full min-w-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <ActiveScreen tab={currentTab} />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}

export default CommsPlayground;
