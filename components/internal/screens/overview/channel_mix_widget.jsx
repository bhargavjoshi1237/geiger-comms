"use client";

// Channel mix (donut).

import { useMemo, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@geiger/ui";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import FilterDropdown from "./filter_dropdown";
import { CHART_COLORS, CHART_SERIES_COLORS } from "./constants";
import { DEMO_CHANNEL_MIX } from "./demo_data";
import { buildChannelMix } from "./data_helpers";
import { WidgetHeader, WidgetShell } from "./widget_shell";

export function ChannelMixWidget({ demo, pending, conversations = [] }) {
  const mix = useMemo(() => {
    if (demo) return DEMO_CHANNEL_MIX;
    return buildChannelMix(conversations);
  }, [demo, conversations]);

  const [selectedType, setSelectedType] = useState(null);
  // Falls back to the top item whenever the current selection isn't in the
  // (possibly just-changed) mix — derived, not synced via an effect.
  const activeType = mix.some((item) => item.key === selectedType) ? selectedType : mix[0]?.key ?? null;

  const total = mix.reduce((sum, item) => sum + item.value, 0);
  const chartData = mix.map((item, index) => ({
    ...item,
    fill: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length],
  }));
  const selectedIndex = Math.max(
    chartData.findIndex((item) => item.key === activeType),
    0,
  );
  const selectedItem = chartData[selectedIndex] || chartData[0];
  const typeOptions = mix.map((item) => ({ value: item.key, label: item.label }));
  const chartConfig = mix.reduce(
    (config, item, index) => ({
      ...config,
      [item.key]: {
        label: item.label,
        color: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length],
      },
    }),
    {},
  );

  // A donut has no zero shape to draw, so while the fetch is in flight it holds
  // an empty ring on the same geometry the chart will occupy.
  if (pending && !mix.length) {
    return (
      <WidgetShell contentClassName="flex flex-col">
        <WidgetHeader title="Channel Mix" subtitle="Distribution across support channels." />
        <div className="relative mt-4 flex min-h-0 w-full flex-1 items-center justify-center">
          <div className="h-[156px] w-[156px] rounded-full border-[34px] border-border" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
            <span className="text-3xl font-bold leading-none text-foreground">0</span>
            <span className="mt-1 text-xs font-medium text-muted-foreground">0% share</span>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-text-secondary">0 of 0 conversations</p>
      </WidgetShell>
    );
  }

  if (!mix.length) {
    return (
      <WidgetShell contentClassName="flex flex-col">
        <WidgetHeader title="Channel Mix" subtitle="Distribution across support channels." />
        <div className="mt-4 flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            icon={MessagesSquare}
            title="No conversations yet"
            description="Start a conversation to see the mix by channel."
          />
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell contentClassName="flex flex-col">
      <WidgetHeader
        title="Channel Mix"
        subtitle="Distribution across support channels."
        action={
          <div className="flex items-center gap-2">
            <FilterDropdown
              value={activeType}
              onValueChange={setSelectedType}
              options={typeOptions}
              height="h-9"
            />
          </div>
        }
      />
      <div className="relative mt-4 flex min-h-0 w-full flex-1 items-center justify-center">
        <ChartContainer config={chartConfig} className="mx-auto h-[220px] w-[220px]">
          <PieChart>
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="key" />} />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="key"
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={78}
              activeIndex={selectedIndex}
              activeShape={{ outerRadius: 88 }}
              stroke={CHART_COLORS.appBackground}
              strokeWidth={2}
              isAnimationActive={true}
            />
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
          <span className="text-3xl font-bold leading-none text-foreground">{selectedItem?.value}</span>
          <span className="mt-1 text-xs font-medium text-muted-foreground">
            {total > 0 ? Math.round(((selectedItem?.value || 0) / total) * 100) : 0}% share
          </span>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-text-secondary">
        {(selectedItem?.value || 0).toLocaleString("en-US")} of {total.toLocaleString("en-US")} conversations
      </p>
    </WidgetShell>
  );
}
