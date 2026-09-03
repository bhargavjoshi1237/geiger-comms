"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlarmClock, AlertTriangle, Clock, Inbox, UserPlus } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { RollingNumber, ScreenHeader, StatsBar } from "@/components/internal/shared/screen_kit";
import { cn } from "@/lib/utils";
import { useOptionalProject } from "@/context/project-context";
import { listConversations } from "@/lib/supabase/comms";
import {
  ACTIVE_STATUSES,
  channelsIn,
  filterByChannel,
  periodDelta,
  sumInWindow,
} from "./data_helpers";
import {
  DEMO_ATTENTION_ITEMS,
  DEMO_BACKLOG,
  DEMO_RESOLUTION,
  DEMO_STATS,
  DEMO_WORKSPACE_SUMMARY,
} from "./demo_data";
import { ConversationsTrendWidget } from "./conversations_trend_widget";
import { ChannelMixWidget } from "./channel_mix_widget";
import { LifecycleFunnelWidget } from "./lifecycle_funnel_widget";
import { GaugeWidget } from "./gauge_widget";
import { TopConversationsTable } from "./top_conversations_table";
import { GeneralStatsCard } from "./general_stats_card";

// `demo` renders the fixed showcase dataset (the landing-page playground, which
// has no real project/session); the real workspace mounts this with no props
// and fetches live rows through the data layer instead.
export function CommsOverviewScreen({ demo = false }) {
  const live = !demo;
  // useOptionalProject so this screen can also mount on the public landing page
  // (as a live playground) with no ProjectProvider above it.
  const projectCtx = useOptionalProject();
  const projectId = projectCtx?.projectId ?? null;
  const projectLoading = projectCtx?.loading ?? false;

  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(live);
  // Snapshot of "now" taken when the data last loaded, so period comparisons
  // below can derive from state instead of calling Date.now() during render.
  const [asOf, setAsOf] = useState(0);

  useEffect(() => {
    if (!live || !projectId) return undefined;
    let alive = true;
    listConversations({ projectId }).then((rows) => {
      if (!alive) return;
      setConversations(rows ?? []);
      setAsOf(Date.now());
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [live, projectId]);

  const total = conversations.length;
  const unreadCount = useMemo(
    () => conversations.filter((c) => c.unread).length,
    [conversations],
  );
  const activeConversations = useMemo(
    () => conversations.filter((c) => ACTIVE_STATUSES.has(c.status)),
    [conversations],
  );
  const activeCount = activeConversations.length;
  const resolvedCount = useMemo(
    () => conversations.filter((c) => c.status === "Closed").length,
    [conversations],
  );
  const waitingOnUsCount = useMemo(
    () => activeConversations.filter((c) => c.waitingOnUs).length,
    [activeConversations],
  );
  const channels = useMemo(() => channelsIn(conversations), [conversations]);

  const liveWorkspaceSummary = useMemo(
    () => [
      { label: "Conversations", value: String(total) },
      { label: "Unread", value: String(unreadCount) },
      { label: "Waiting on Us", value: String(waitingOnUsCount) },
    ],
    [total, unreadCount, waitingOnUsCount],
  );

  const liveStats = useMemo(() => {
    const now = asOf || 0;
    const cur0 = now - 30 * 86400000;
    const prev0 = cur0 - 30 * 86400000;

    const convCur = sumInWindow(conversations, "createdAt", () => 1, cur0, now);
    const convPrev = sumInWindow(conversations, "createdAt", () => 1, prev0, cur0);
    const convDelta = periodDelta(convCur, convPrev);

    return [
      { label: "Conversations", value: total.toLocaleString("en-US"), delta: convDelta.delta, trend: convDelta.trend, footer: "VS Last Period" },
      { label: "Unread", value: unreadCount.toLocaleString("en-US") },
      { label: "Awaiting Reply", value: waitingOnUsCount.toLocaleString("en-US") },
      { label: "Resolved", value: resolvedCount.toLocaleString("en-US") },
    ];
  }, [conversations, total, unreadCount, waitingOnUsCount, resolvedCount, asOf]);

  const resolutionCompute = useCallback(
    (scope) => {
      const scoped = filterByChannel(conversations, scope);
      const received = scoped.length;
      const resolved = scoped.filter((c) => c.status === "Closed").length;
      const pct = received > 0 ? Math.round((resolved / received) * 100) : 0;
      return {
        pct,
        footnote: `${resolved.toLocaleString("en-US")} of ${received.toLocaleString("en-US")} Resolved`,
      };
    },
    [conversations],
  );

  const backlogCompute = useCallback(
    (scope) => {
      const scopedActive = filterByChannel(conversations, scope).filter((c) =>
        ACTIVE_STATUSES.has(c.status),
      );
      const waiting = scopedActive.filter((c) => c.waitingOnUs).length;
      const pct = scopedActive.length > 0 ? Math.round((waiting / scopedActive.length) * 100) : 0;
      return {
        pct,
        footnote: `${waiting.toLocaleString("en-US")} of ${scopedActive.length.toLocaleString("en-US")} Active Threads`,
      };
    },
    [conversations],
  );

  const liveAttentionItems = useMemo(() => {
    const urgentPriority = activeConversations.filter((c) => c.priority === "Urgent");
    const unassigned = activeConversations.filter((c) => !c.assignee);
    const snoozed = conversations.filter((c) => c.status === "Snoozed");
    return [
      { key: "unread", label: "Unread conversations", hint: "Needs a first look", value: String(unreadCount), count: unreadCount, cta: "Review", icon: Inbox, urgency: "urgent" },
      { key: "waiting", label: "Awaiting our reply", hint: "Last message from customer", value: String(waitingOnUsCount), count: waitingOnUsCount, cta: "Reply", icon: Clock, urgency: "urgent" },
      { key: "priority", label: "Urgent priority threads", hint: "Marked urgent", value: String(urgentPriority.length), count: urgentPriority.length, cta: "Triage", icon: AlertTriangle, urgency: "soon" },
      { key: "unassigned", label: "Unassigned threads", hint: "No owner yet", value: String(unassigned.length), count: unassigned.length, cta: "Assign", icon: UserPlus, urgency: "soon" },
      { key: "snoozed", label: "Snoozed conversations", hint: "Scheduled to reopen", value: String(snoozed.length), count: snoozed.length, cta: "Reopen", icon: AlarmClock, urgency: "routine" },
    ];
  }, [activeConversations, conversations, unreadCount, waitingOnUsCount]);

  const workspaceSummary = demo ? DEMO_WORKSPACE_SUMMARY : liveWorkspaceSummary;
  const statsData = demo ? DEMO_STATS : liveStats;
  const attentionItems = demo ? DEMO_ATTENTION_ITEMS : liveAttentionItems;

  // No skeleton: the page lays out immediately with every figure at zero and
  // fills in once the fetch lands. Widgets that would otherwise state "nothing
  // here" get told the data is still in flight so they don't jump to a verdict.
  // With no project there is nothing to wait for, so those empty states are the
  // honest answer rather than a permanent hold on zeros.
  const pending = live && (projectLoading || (Boolean(projectId) && loading));

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Comms Overview"
        description="Track conversation volume, response load, and resolutions across every channel."
        actions={
          <div className="flex w-full md:w-auto md:gap-0">
            {workspaceSummary.map((stat, i) => {
              const last = i === workspaceSummary.length - 1;
              return (
                <div
                  key={stat.label}
                  className={cn(
                    "flex flex-1 flex-col items-center md:flex-none",
                    i === 0 && "md:pr-8",
                    i > 0 && "border-l border-border",
                    i > 0 && !last && "md:px-8",
                    last && i > 0 && "md:pl-8",
                  )}
                >
                  <span className="text-text-secondary text-[11px] uppercase tracking-wider font-medium">
                    {stat.label}
                  </span>

                  <RollingNumber
                    value={stat.value}
                    className="mt-0.5 text-2xl font-bold text-white"
                  />
                </div>
              );
            })}
          </div>
        }
      />

      {/* Summary stats bar */}
      <StatsBar stats={statsData} />

      {/* Bento hero: wide trend + donut */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 h-[360px]">
          <ConversationsTrendWidget demo={demo} pending={pending} channels={channels} conversations={conversations} />
        </div>
        <div className="h-[360px]">
          <ChannelMixWidget demo={demo} pending={pending} conversations={conversations} />
        </div>
      </div>

      {/* Support lifecycle: funnel + two gauges (equal ratio) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="h-[300px]">
          <LifecycleFunnelWidget
            demo={demo}
            received={total}
            active={activeCount}
            resolved={resolvedCount}
          />
        </div>
        <div className="h-[300px]">
          <GaugeWidget
            title="Resolution Rate"
            subtitle="Resolved vs. all conversations."
            caption="Resolved"
            channels={channels}
            demo={demo}
            demoValue={DEMO_RESOLUTION.value}
            demoFootnote={`${DEMO_RESOLUTION.resolved.toLocaleString("en-US")} of ${DEMO_RESOLUTION.received.toLocaleString("en-US")} Resolved`}
            computeLive={resolutionCompute}
          />
        </div>
        <div className="h-[300px]">
          <GaugeWidget
            title="Response Backlog"
            subtitle="Waiting on us vs. active threads."
            caption="Waiting on Us"
            channels={channels}
            demo={demo}
            demoValue={DEMO_BACKLOG.value}
            demoFootnote={`${DEMO_BACKLOG.waiting.toLocaleString("en-US")} of ${DEMO_BACKLOG.active.toLocaleString("en-US")} Active Threads`}
            computeLive={backlogCompute}
          />
        </div>
      </div>

      {/* Top conversations table */}
      <TopConversationsTable demo={demo} pending={pending} conversations={conversations} asOf={asOf} />

      {/* General stats */}
      <GeneralStatsCard items={attentionItems} />
    </MainScreenWrapper>
  );
}

export default CommsOverviewScreen;
