"use client";

// Conversations over time (line + label, with detail).

import { useMemo, useState } from "react";
import { MessagesSquare } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  LabelList,
  XAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@geiger/ui";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import FilterDropdown from "./filter_dropdown";
import { CHART_COLORS } from "./constants";
import { DEMO_TREND_SERIES } from "./demo_data";
import { buildWeeklyBuckets, buildWeeklyTrendSeries, filterByChannel, weekLabel } from "./data_helpers";
import { WidgetHeader, WidgetShell } from "./widget_shell";
import { ChannelScopeSelect } from "./channel_scope_select";

const CONVERSATION_RANGE_OPTIONS = [
  { value: "created", label: "New conversations" },
  { value: "activity", label: "Last activity" },
];

export function ConversationsTrendWidget({ demo, pending, channels = [], conversations = [] }) {
  const [metric, setMetric] = useState("created");
  const [channelScope, setChannelScope] = useState([]);
  const selected =
    CONVERSATION_RANGE_OPTIONS.find((o) => o.value === metric) ||
    CONVERSATION_RANGE_OPTIONS[0];

  const weeks = useMemo(() => buildWeeklyBuckets(12), []);
  const scopedConversations = useMemo(
    () => filterByChannel(conversations, channelScope),
    [conversations, channelScope],
  );
  const hasLiveData = scopedConversations.length > 0;

  const seriesByMetric = useMemo(() => {
    if (demo) return DEMO_TREND_SERIES;
    return buildWeeklyTrendSeries(scopedConversations, weeks);
  }, [demo, scopedConversations, weeks]);

  const series = seriesByMetric[metric] || [];
  const data = series.map((value, i) => ({
    label: demo ? `W${i + 1}` : weekLabel(weeks[i]),
    value,
  }));

  const headerAction = (
    <div className="flex items-center gap-2">
      <ChannelScopeSelect
        channels={channels}
        selected={channelScope}
        onChange={setChannelScope}
      />
      <FilterDropdown
        value={metric}
        onValueChange={setMetric}
        options={CONVERSATION_RANGE_OPTIONS}
        height="h-9"
      />
    </div>
  );

  // While the fetch is in flight the series is all zeros, so the line sits flat
  // on the baseline and animates up when the real numbers land.
  if (!demo && !pending && !hasLiveData) {
    return (
      <WidgetShell contentClassName="flex flex-col">
        <WidgetHeader
          title="Conversations Over Time"
          subtitle={`${selected.label} across your channels.`}
          action={headerAction}
        />
        <div className="mt-4 flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            icon={MessagesSquare}
            title="No activity yet"
            description="Conversation volume will show up here once customers start reaching out."
          />
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell contentClassName="flex flex-col">
      <WidgetHeader
        title="Conversations Over Time"
        subtitle={`${selected.label} across your channels.`}
        action={headerAction}
      />
      <div className="mt-4 flex min-h-0 flex-1 items-center justify-center">
        <ChartContainer
          config={{ value: { label: selected.label, color: CHART_COLORS.primary } }}
          className="mx-auto h-full w-full"
        >
          <LineChart data={data} margin={{ top: 24, right: 16, left: 12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#2a2a2a" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fill: "#737373", fontSize: 11 }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="line"
                  hideLabel
                  formatter={(value) => (
                    <span className="font-medium tabular-nums text-foreground">
                      {value.toLocaleString("en-US")}
                    </span>
                  )}
                />
              }
            />
            <Line
              dataKey="value"
              type="monotone"
              stroke={CHART_COLORS.primary}
              strokeWidth={2}
              dot={{ fill: CHART_COLORS.primary, r: 3 }}
              activeDot={{ r: 5 }}
              isAnimationActive={true}
            >
              <LabelList
                dataKey="value"
                position="top"
                offset={10}
                className="fill-[#ededed]"
                fontSize={11}
                formatter={(value) => value.toLocaleString("en-US")}
              />
            </Line>
          </LineChart>
        </ChartContainer>
      </div>
    </WidgetShell>
  );
}
