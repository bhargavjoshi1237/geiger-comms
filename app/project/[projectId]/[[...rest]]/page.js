"use client";

import React, { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@geiger/ui";
import { AppSidebar } from "@/components/internal/sidebar/sidebar";
import { Topbar } from "@/components/internal/topbar/topbar";
import { ActiveScreen, isFullBleed } from "@/components/internal/screens/registry";
import { WidgetTestLauncher } from "@/components/internal/widget/widget_test_launcher";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { cn } from "@/lib/utils";
import {
  ProjectProvider,
  useProject,
  pickDefaultProjectId,
} from "@/context/project-context";
import { NavVisibilityProvider } from "@/context/nav-visibility-context";
import { RbacProvider } from "@/context/rbac-context";
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
  const { project } = useProject();

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-background text-foreground font-sans overflow-hidden selection:bg-surface-strong">
      {project ? <WidgetTestLauncher projectId={project.id} /> : null}
      <SidebarProvider
        className="flex-col !flex h-full min-w-0"
        style={{ flexDirection: "column" }}
      >
        <Topbar />
        <div className="flex flex-1 overflow-hidden relative">
          <AppSidebar activeTab={currentTab} onTabChange={setCurrentTab} />
          <SidebarInset className="flex-1 flex flex-col h-full bg-transparent overflow-hidden relative border-none">
            <div className="absolute top-0 right-0 w-[500px] h-[300px] bg-white/[0.02] blur-[120px] pointer-events-none rounded-full" />
            {/* Full-bleed screens (the three-pane inbox) own their scrolling
                and drop the padded, outer-scrolling container (spec §4.1). */}
            <main
              className={cn(
                "flex-1 relative z-10 w-full min-w-0",
                isFullBleed(currentTab)
                  ? "overflow-hidden p-0"
                  : "overflow-y-auto p-4 md:p-8",
              )}
            >
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
        {/* Sidebar curation is per (project, user), so it sits inside the
            project provider and above every surface that lists destinations.
            RBAC resolves this user's grants once per (project, user) and backs
            every can() gate, including the nav filter. */}
        <NavVisibilityProvider>
          <RbacProvider>
            <WorkspaceContent />
          </RbacProvider>
        </NavVisibilityProvider>
      </ProjectProvider>
    </Suspense>
  );
}
