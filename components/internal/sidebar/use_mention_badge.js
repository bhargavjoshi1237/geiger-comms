"use client";

// Unread @mention count for the signed-in teammate in the active project, kept live via realtime (inbox spec §5.4).

import { useEffect, useState } from "react";
import { useOptionalProject } from "@/context/project-context";
import { getCurrentTeammate } from "@/lib/supabase/teammates";
import { countUnreadMentions } from "@/lib/supabase/mentions";
import { subscribeTable } from "@/lib/supabase/realtime";

export function useMentionBadge() {
  const { projectId } = useOptionalProject() ?? {};
  const [state, setState] = useState({ projectId: null, count: 0 });

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    let unsubscribe = null;
    getCurrentTeammate({ projectId }).then((me) => {
      if (!alive || !me?.id) return;
      const refresh = () =>
        countUnreadMentions({ projectId, teammateId: me.id }).then((count) => {
          if (alive && count != null) setState({ projectId, count });
        });
      void refresh();
      // New mentions arrive as INSERTs; opening a thread flips read_at (UPDATE).
      unsubscribe = subscribeTable("mentions", {
        filter: `teammate_id=eq.${me.id}`,
        onInsert: refresh,
        onUpdate: refresh,
        onDelete: refresh,
      });
    });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [projectId]);

  return state.projectId === projectId ? state.count : 0;
}

export default useMentionBadge;
