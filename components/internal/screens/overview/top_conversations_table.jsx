"use client";

// Top conversations (table) — the five threads that most need attention.

import { useMemo, useState } from "react";
import { ChevronRight, MessagesSquare } from "lucide-react";
import { Button } from "@geiger/ui";
import {
  DataTable,
  EmptyState,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import FilterDropdown from "./filter_dropdown";
import { CONVERSATION_STATUS_MAP, PRIORITY_META, PRIORITY_WEIGHT, formatRelativeTime } from "./constants";
import { DEMO_TOP_CONVERSATIONS } from "./demo_data";
import { channelsIn, filterByChannel } from "./data_helpers";
import { WidgetHeader } from "./widget_shell";
import { ChannelScopeSelect } from "./channel_scope_select";
import { cn } from "@/lib/utils";

const TOP_CONVERSATIONS_SORT_OPTIONS = [
  { value: "recent", label: "Recent activity" },
  { value: "priority", label: "Priority" },
];

export function TopConversationsTable({ demo, pending, conversations = [], asOf = 0 }) {
  const [sortBy, setSortBy] = useState("recent");
  const [channelScope, setChannelScope] = useState([]);

  const scoped = useMemo(
    () => filterByChannel(conversations, channelScope),
    [conversations, channelScope],
  );

  const sorted = useMemo(() => {
    if (demo) return DEMO_TOP_CONVERSATIONS;
    return [...scoped]
      .sort((a, b) =>
        sortBy === "recent"
          ? new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)
          : (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0),
      )
      .slice(0, 5);
  }, [demo, scoped, sortBy]);

  const columns = [
    {
      key: "conversation",
      header: "Conversation",
      render: (conversation) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{conversation.subject}</span>
          <p className="text-xs text-text-secondary">
            {conversation.channel || "Chat"} ·{" "}
            {conversation.contactName || "Unknown contact"}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (conversation) => (
        <StatusPill status={conversation.status} map={CONVERSATION_STATUS_MAP} />
      ),
    },
    {
      key: "activity",
      header: "Last Activity",
      className: "whitespace-nowrap tabular-nums text-text-secondary",
      render: (conversation) => formatRelativeTime(conversation.lastMessageAt, asOf),
    },
    {
      key: "priority",
      header: "Priority",
      render: (conversation) => {
        const meta = PRIORITY_META[conversation.priority] || PRIORITY_META.Normal;
        const PriorityIcon = meta.icon;
        return (
          <span className={cn("inline-flex items-center gap-1.5 font-medium", meta.className)}>
            <PriorityIcon className="h-3.5 w-3.5" />
            {meta.label}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "text-right",
      render: () => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <WidgetHeader
          title="Top Conversations"
          subtitle="The five threads that most need attention right now."
        />
        <div className="flex items-center gap-2">
          <ChannelScopeSelect
            channels={channelsIn(conversations)}
            selected={channelScope}
            onChange={setChannelScope}
          />
          <FilterDropdown
            value={sortBy}
            onValueChange={setSortBy}
            options={TOP_CONVERSATIONS_SORT_OPTIONS}
            height="h-9"
          />
        </div>
      </Toolbar>

      {/* Mid-fetch the table keeps its header and no rows, rather than
          declaring the inbox has no conversations. DataTable renders just
          the header when data is empty and no empty state is given. */}
      <DataTable
        columns={columns}
        data={pending ? [] : sorted}
        getRowKey={(conversation) => conversation.id}
        empty={
          pending ? null : (
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={MessagesSquare}
                title="No conversations yet"
                description="Threads will appear here once customers reach out."
              />
            </div>
          )
        }
      />
    </div>
  );
}
