"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
} from "recharts";
import { MessageSquarePlus } from "lucide-react";

import { Button } from "@geiger/ui";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  ScreenHeader,
  StatsBar,
  SectionCard,
} from "@/components/internal/shared/screen_kit";
import { listConversations } from "@/lib/supabase/comms";
import {
  CHANNEL_ORDER,
  CHART_SERIES_COLORS,
  VOLUME_SERIES,
  RESPONSE_SERIES,
} from "./constants";

const VOLUME_CONFIG = {
  opened: { label: "Opened", color: "#ffffff" },
  resolved: { label: "Resolved", color: "#737373" },
};

const RESPONSE_CONFIG = {
  minutes: { label: "Median response (min)", color: "#ffffff" },
};

// --- Screen ------------------------------------------------------------------

export function InboxOverviewScreen() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    listConversations().then((rows) => {
      if (!active) return;
      setConversations(rows ?? []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

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

  // Channel counts drive both the donut and the volume-by-channel bar chart.
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

      {/* Top row: volume trend + channel mix */}
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

      {/* Bottom row: volume by channel + response-time trend */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Volume by channel"
          description="Conversations handled per channel"
        >
          {loading ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-text-tertiary">
              Loading…
            </div>
          ) : channelMix.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-text-tertiary">
              No conversations yet
            </div>
          ) : (
            <ChartContainer config={channelConfig} className="h-[220px] w-full">
              <BarChart
                data={channelMix}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid vertical={false} stroke="#2a2a2a" />
                <XAxis
                  dataKey="channel"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fill: "#737373", fontSize: 11 }}
                />
                <ChartTooltip
                  content={<ChartTooltipContent nameKey="channel" hideLabel />}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {channelMix.map((entry) => (
                    <Cell key={entry.channel} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </SectionCard>

        <SectionCard
          title="Response time"
          description="Median first response · last 14 days"
        >
          <ChartContainer config={RESPONSE_CONFIG} className="h-[220px] w-full">
            <AreaChart
              data={RESPONSE_SERIES}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="fillResponse" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ffffff" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                </linearGradient>
              </defs>
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
              <Area
                type="monotone"
                dataKey="minutes"
                stroke="#ffffff"
                strokeWidth={2}
                fill="url(#fillResponse)"
              />
            </AreaChart>
          </ChartContainer>
        </SectionCard>
      </div>
    </MainScreenWrapper>
  );
}

export default InboxOverviewScreen;
