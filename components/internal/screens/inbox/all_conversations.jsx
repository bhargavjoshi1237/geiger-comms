"use client";

// All Conversations — the omnichannel queue. Applies a saved view when the
// URL carries ?view=<id> (a Views row click lands here with that param).

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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

// Resolves one saved view into a starting filter, then mounts the shared
// shell. setState only happens in the fetch continuation (repo convention).
function ViewedShell({ viewId }) {
  const [filter, setFilter] = useState(null);

  useEffect(() => {
    let alive = true;
    getView(viewId).then((view) => {
      if (!alive) return;
      setFilter(
        view
          ? { ...defaultFilter(), ...view.filter, sort: view.sort || "newest" }
          : defaultFilter(),
      );
    });
    return () => {
      alive = false;
    };
  }, [viewId]);

  if (!filter) {
    return (
      <div className="flex h-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-subtle px-6 py-16 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading view…
      </div>
    );
  }
  return <InboxShell preset="all" startFilter={filter} />;
}

export default AllConversationsScreen;
