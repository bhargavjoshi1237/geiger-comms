"use client";

// Top conversations (table) — the five threads that most need attention.

import { useMemo, useState } from "react";
import { ChevronRight, MessagesSquare } from "lucide-react";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@geiger/ui";
import { EmptyState, StatusPill } from "@/components/internal/shared/screen_kit";
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
        {/* Mid-fetch the table keeps its header and no rows, rather than
            declaring the inbox has no conversations. */}
        {sorted.length === 0 && !pending ? (
          <EmptyState
            icon={MessagesSquare}
            title="No conversations yet"
            description="Threads will appear here once customers reach out."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead>Conversation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((conversation) => {
                const meta = PRIORITY_META[conversation.priority] || PRIORITY_META.Normal;
                const PriorityIcon = meta.icon;
                return (
                  <TableRow key={conversation.id} className="border-border">
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-foreground">{conversation.subject}</span>
                        <p className="text-xs text-text-secondary">
                          {conversation.channel || "Chat"} ·{" "}
                          {conversation.contactName || "Unknown contact"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <StatusPill status={conversation.status} map={CONVERSATION_STATUS_MAP} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-text-secondary">
                      {formatRelativeTime(conversation.lastMessageAt, asOf)}
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center gap-1.5 font-medium", meta.className)}>
                        <PriorityIcon className="h-3.5 w-3.5" />
                        {meta.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
