"use client";

// All Conversations — the omnichannel queue. ?view=<id> applies a saved view (Views row click);
// ?channel=<channelId> narrows to one connected channel (Channels → "View conversations"), handled in the shell.

import { useEffect, useState } from "react";
import { LogoLoading } from "@geiger/ui";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { getView } from "@/lib/supabase/views";
import { InboxShell } from "./inbox_shell";
import { defaultFilter } from "./constants";

export function AllConversationsScreen() {
  const { viewId } = useWorkspaceUrl();
  if (!viewId) return <InboxShell preset="all" />;
  // Keyed by view id: a different view remounts the shell with its filter.
  return <ViewedShell key={viewId} viewId={viewId} />;
}

// Resolves one saved view into a starting filter, then mounts the shared shell (setState only in the fetch continuation).
function ViewedShell({ viewId }) {
  const [view, setView] = useState(null);

  useEffect(() => {
    let alive = true;
    getView(viewId).then((row) => {
      if (!alive) return;
      setView({
        title: row?.name || null,
        filter: row ? { ...defaultFilter(), ...row.filter, sort: row.sort || "newest" } : defaultFilter(),
      });
    });
    return () => {
      alive = false;
    };
  }, [viewId]);

  if (!view) {
    return (
      <div className="flex h-full items-center justify-center" aria-label="Loading view">
        <LogoLoading size={80} />
      </div>
    );
  }
  return <InboxShell preset="all" startFilter={view.filter} title={view.title ?? undefined} />;
}

export default AllConversationsScreen;
