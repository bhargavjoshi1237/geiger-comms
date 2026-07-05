"use client";

import React, { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@geiger/ui";
import { AppSidebar } from "@/components/internal/sidebar/sidebar";
import { Topbar } from "@/components/internal/topbar/topbar";
import { ActiveScreen } from "@/components/internal/screens/registry";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  ProjectProvider,
  useProject,
  pickDefaultProjectId,
} from "@/context/project-context";
import {
  LoadingArea,
  NoProjectState,
} from "@/components/internal/workspace/workspace_states";

// Active screen for the current tab, gated on the path's project resolving to
// one the user can reach. Keyed by project id so switching projects remounts.
function ScreenArea({ tab }) {
  const router = useRouter();
  const { project, projects, loading } = useProject();

  useEffect(() => {
    if (loading || project || projects.length === 0) return;
    const fallback = pickDefaultProjectId(projects);
    if (fallback) router.replace(`/project/${fallback}`);
  }, [loading, project, projects, router]);

  if (loading) return <LoadingArea />;
  if (projects.length === 0) return <NoProjectState />;
  if (!project) return <LoadingArea />;

  return (
    <div key={project.id} className="h-full">
      <ActiveScreen tab={tab} />
    </div>
  );
}

function WorkspaceContent() {
  // The active tab lives in the URL (path) so a refresh keeps the user in place.
  const { tab: currentTab, setTab: setCurrentTab } = useWorkspaceUrl();

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-background text-foreground font-sans overflow-hidden selection:bg-surface-strong">
      <SidebarProvider
        className="flex-col !flex h-full min-w-0"
        style={{ flexDirection: "column" }}
      >
        <Topbar />
        <div className="flex flex-1 overflow-hidden relative">
          <AppSidebar activeTab={currentTab} onTabChange={setCurrentTab} />
          <SidebarInset className="flex-1 flex flex-col h-full bg-transparent overflow-hidden relative border-none">
            <div className="absolute top-0 right-0 w-[500px] h-[300px] bg-white/[0.02] blur-[120px] pointer-events-none rounded-full" />
            <main className="flex-1 overflow-y-auto p-4 md:p-8 relative z-10 w-full min-w-0">
              <ScreenArea tab={currentTab} />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}

export default function ProjectWorkspacePage() {
  // useSearchParams / useParams (via useWorkspaceUrl) need a Suspense boundary.
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] w-full items-center justify-center bg-background" />
      }
    >
      <ProjectProvider>
        <WorkspaceContent />
      </ProjectProvider>
    </Suspense>
  );
}
