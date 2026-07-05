"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
} from "recharts";
import {
  Inbox as InboxIcon,
  MessageSquarePlus,
  Send,
  Paperclip,
  Smile,
  Star,
  MoreHorizontal,
} from "lucide-react";

import { Button } from "@geiger/ui";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@geiger/ui";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  ScreenHeader,
  StatsBar,
  SectionCard,
  EmptyState,
} from "@/components/internal/shared/screen_kit";
import { listConversations, listMessages } from "@/lib/supabase/comms";
import {
  CHANNEL_META,
  CHANNEL_ORDER,
  STATUS_META,
  PRIORITY_META,
  INBOX_FILTERS,
  CHART_SERIES_COLORS,
  VOLUME_SERIES,
} from "./constants";

const VOLUME_CONFIG = {
  opened: { label: "Opened", color: "#ffffff" },
  resolved: { label: "Resolved", color: "#737373" },
};

// Compact relative time ("4m", "2h", "3d") for inbox rows.
function relTime(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.max(s, 1)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function initials(name) {
  return (name || "?")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// --- Small presentational pieces --------------------------------------------

function Pill({ meta, className }) {
  if (!meta) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        meta.className,
        className,
      )}
    >
      {meta.dot ? (
        <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      ) : null}
      {meta.label}
    </span>
  );
}

function ConversationRow({ conversation, active, onClick }) {
  const channel = CHANNEL_META[conversation.channel];
  const priority = PRIORITY_META[conversation.priority] || PRIORITY_META.Normal;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex w-full gap-3 border-b border-border px-4 py-3 text-left transition-colors",
        active ? "bg-surface-active" : "hover:bg-surface-hover",
      )}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-0.5", priority.rail)}
        aria-hidden
      />
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-card text-xs font-semibold text-foreground">
        {initials(conversation.contactName)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm",
              conversation.unread
                ? "font-semibold text-foreground"
                : "font-medium text-text-secondary",
            )}
          >
            {conversation.contactName}
          </span>
          <span className="shrink-0 text-[11px] text-text-tertiary">
            {relTime(conversation.lastMessageAt)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[13px] font-medium text-foreground">
          {conversation.subject}
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-text-tertiary">
            {conversation.preview}
          </span>
          {conversation.unread ? (
            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
          ) : null}
        </span>
        <span className="mt-1.5 flex items-center gap-1.5">
          {channel ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium",
                channel.className,
              )}
            >
              <channel.icon className="h-2.5 w-2.5" />
              {channel.label}
            </span>
          ) : null}
          <Pill meta={STATUS_META[conversation.status]} />
        </span>
      </span>
    </button>
  );
}

function Reader({ conversation, messages, loading }) {
  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <EmptyState
          icon={InboxIcon}
          title="Select a conversation"
          description="Pick a thread from the list to read the full exchange."
        />
      </div>
    );
  }

  const channel = CHANNEL_META[conversation.channel];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Reader header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-card text-xs font-semibold text-foreground">
            {initials(conversation.contactName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {conversation.contactName}
            </p>
            <p className="truncate text-xs text-text-tertiary">
              {conversation.contactEmail}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {channel ? (
            <span
              className={cn(
                "hidden items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium sm:inline-flex",
                channel.className,
              )}
            >
              <channel.icon className="h-2.5 w-2.5" />
              {channel.label}
            </span>
          ) : null}
          <Pill meta={STATUS_META[conversation.status]} />
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Star">
            <Star className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Thread */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {loading ? (
          <p className="text-sm text-text-tertiary">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-text-tertiary">No messages yet.</p>
        ) : (
          messages.map((m) => {
            const agent = m.authorRole === "agent";
            return (
              <div
                key={m.id}
                className={cn("flex flex-col gap-1", agent ? "items-end" : "items-start")}
              >
                <span className="px-1 text-[11px] text-text-tertiary">
                  {m.authorName} · {relTime(m.createdAt)}
                </span>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                    agent
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm border border-border bg-surface-card text-foreground",
                  )}
                >
                  {m.body}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer (mock) */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-card px-3 py-2">
          <input
            type="text"
            placeholder={`Reply to ${conversation.contactName}…`}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-text-tertiary outline-none"
          />
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Attach">
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Emoji">
            <Smile className="h-4 w-4" />
          </Button>
          <Button size="icon" className="h-8 w-8" aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Screen ------------------------------------------------------------------

export function InboxOverviewScreen() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  useEffect(() => {
    let active = true;
    listConversations().then((rows) => {
      if (!active) return;
      const list = rows ?? [];
      setConversations(list);
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    (async () => {
      setMessagesLoading(true);
      const rows = await listMessages(selectedId);
      if (!active) return;
      setMessages(rows ?? []);
      setMessagesLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [selectedId]);

  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      if (filter === "unassigned")
        return !c.assignee || c.assignee === "Unassigned";
      if (filter === "waiting") return c.waitingOnUs && c.status !== "Closed";
      if (filter === "closed") return c.status === "Closed";
      return true;
    });
  }, [conversations, filter]);

  const stats = useMemo(() => {
    const open = conversations.filter((c) => c.status === "Open").length;
    const waiting = conversations.filter(
      (c) => c.waitingOnUs && c.status !== "Closed",
    ).length;
    return [
      { label: "Open", value: String(open), footer: "in the shared inbox" },
      {
        label: "Waiting on us",
        value: String(waiting),
        footer: "awaiting your reply",
      },
      {
        label: "Median first response",
        value: "2m 14s",
        delta: "11%",
        trend: "up",
        footer: "faster vs last week",
      },
      {
        label: "CSAT",
        value: "96%",
        delta: "2 pts",
        trend: "up",
        footer: "last 200 ratings",
      },
    ];
  }, [conversations]);

  const channelMix = useMemo(() => {
    const counts = {};
    conversations.forEach((c) => {
      counts[c.channel] = (counts[c.channel] || 0) + 1;
    });
    return CHANNEL_ORDER.filter((ch) => counts[ch]).map((ch, i) => ({
      channel: ch,
      value: counts[ch],
      fill: CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length],
    }));
  }, [conversations]);

  const channelConfig = useMemo(() => {
    const cfg = {};
    channelMix.forEach((c) => {
      cfg[c.channel] = { label: c.channel, color: c.fill };
    });
    return cfg;
  }, [channelMix]);

  const totalConversations = conversations.length;
  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) || null,
    [conversations, selectedId],
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Inbox"
        description="Every customer conversation across email, chat, and social — in one shared queue."
        actions={
          <Button className="gap-2">
            <MessageSquarePlus className="h-4 w-4" />
            New conversation
          </Button>
        }
      />

      <StatsBar stats={stats} />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="Conversation volume"
          description="Opened vs resolved · last 14 days"
          className="lg:col-span-2"
        >
          <ChartContainer config={VOLUME_CONFIG} className="h-[220px] w-full">
            <LineChart
              data={VOLUME_SERIES}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="#2a2a2a" />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={1}
                tick={{ fill: "#737373", fontSize: 11 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="opened"
                stroke="#ffffff"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="resolved"
                stroke="#737373"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </SectionCard>

        <SectionCard title="Channels" description="Where conversations come from">
          {channelMix.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-text-tertiary">
              No conversations yet
            </div>
          ) : (
            <>
              <ChartContainer
                config={channelConfig}
                className="mx-auto aspect-square h-[180px]"
              >
                <PieChart>
                  <ChartTooltip
                    content={<ChartTooltipContent nameKey="channel" hideLabel />}
                  />
                  <Pie
                    data={channelMix}
                    dataKey="value"
                    nameKey="channel"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={2}
                    stroke="#161616"
                  >
                    {channelMix.map((entry) => (
                      <Cell key={entry.channel} fill={entry.fill} />
                    ))}
                    <Label
                      content={({ viewBox }) => {
                        if (!viewBox || !("cx" in viewBox)) return null;
                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy - 6}
                              className="fill-white text-2xl font-bold"
                            >
                              {totalConversations}
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy + 14}
                              className="fill-current text-[11px] text-text-tertiary"
                            >
                              total
                            </tspan>
                          </text>
                        );
                      }}
                    />
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="mt-2 space-y-1.5">
                {channelMix.map((c) => (
                  <div
                    key={c.channel}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="flex items-center gap-2 text-text-secondary">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: c.fill }}
                      />
                      {c.channel}
                    </span>
                    <span className="font-medium text-foreground tabular-nums">
                      {c.value}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Shared inbox"
        description="Your team's live conversation queue"
        bodyPadding={false}
      >
        {loading ? (
          <div className="flex h-[520px] items-center justify-center text-sm text-text-tertiary">
            Loading conversations…
          </div>
        ) : totalConversations === 0 ? (
          <EmptyState
            icon={InboxIcon}
            title="Inbox zero"
            description="No conversations yet. New messages from email, chat, and social land here."
            className="py-24"
          />
        ) : (
          <div className="grid h-[560px] grid-cols-1 md:grid-cols-[minmax(0,360px)_1fr]">
            {/* List column */}
            <div className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
              <div className="flex items-center gap-1 border-b border-border px-3 py-2">
                {INBOX_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFilter(f.value)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      filter === f.value
                        ? "bg-surface-active text-foreground"
                        : "text-text-secondary hover:bg-surface-hover hover:text-foreground",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-text-tertiary">
                    No conversations match this filter.
                  </div>
                ) : (
                  filtered.map((c) => (
                    <ConversationRow
                      key={c.id}
                      conversation={c}
                      active={c.id === selectedId}
                      onClick={() => setSelectedId(c.id)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Reader column */}
            <Reader
              conversation={selected}
              messages={messages}
              loading={messagesLoading}
            />
          </div>
        )}
      </SectionCard>
    </MainScreenWrapper>
  );
}

export default InboxOverviewScreen;
