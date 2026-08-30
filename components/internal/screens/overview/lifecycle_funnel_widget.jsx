"use client";

// Support lifecycle funnel (radar chart — dots).

import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@geiger/ui";
import { CHART_COLORS } from "./constants";
import { DEMO_LIFECYCLE_FUNNEL } from "./demo_data";
import { WidgetHeader, WidgetShell } from "./widget_shell";

export function LifecycleFunnelWidget({ demo, received, active, resolved }) {
  const stages = demo
    ? DEMO_LIFECYCLE_FUNNEL
    : [
        { key: "received", label: "Conversations received", short: "Received", value: received },
        { key: "active", label: "Still active (open or snoozed)", short: "Active", value: active },
        { key: "resolved", label: "Resolved (closed)", short: "Resolved", value: resolved },
      ];
  const top = stages[0]?.value || 0;
  const bottom = stages[stages.length - 1]?.value || 0;
  const overall = top > 0 ? Math.round((bottom / top) * 100) : 0;

  // Plot each stage as its share of the top of the funnel, so the radar's
  // silhouette reads as the drop-off toward the final stage.
  const chartData = stages.map((stage) => ({
    ...stage,
    share: top > 0 ? Math.round((stage.value / top) * 100) : 0,
  }));

  const chartConfig = {
    share: { label: "Share of received", color: CHART_COLORS.primary },
  };

  const subtitle = demo
    ? "Share of conversations at each step of the support lifecycle."
    : "Share of conversations still moving vs. resolved.";

  return (
    <WidgetShell contentClassName="flex flex-col">
      <WidgetHeader
        title="Support Lifecycle"
        subtitle={subtitle}
        action={
          <div className="flex shrink-0 flex-col items-end">
            <span className="text-3xl font-bold leading-none text-white">{overall}%</span>
            <span className="mt-1 text-[11px] text-text-secondary">received → resolved</span>
          </div>
        }
      />
      <div className="mt-1 flex min-h-0 flex-1 items-center justify-center">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square h-full max-h-[210px]">
          <RadarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  nameKey="key"
                  formatter={(value, name, item) => (
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">{item.payload.label}</span>
                      <span className="font-medium tabular-nums text-foreground">
                        {item.payload.value.toLocaleString("en-US")} · {item.payload.share}%
                      </span>
                    </span>
                  )}
                />
              }
            />
            <PolarGrid stroke="#2a2a2a" />
            <PolarAngleAxis dataKey="short" tick={{ fill: "#a3a3a3", fontSize: 11 }} />
            <Radar
              dataKey="share"
              stroke={CHART_COLORS.primary}
              strokeWidth={2}
              fill={CHART_COLORS.primary}
              fillOpacity={0.5}
              dot={{
                r: 4,
                fill: CHART_COLORS.primary,
                fillOpacity: 1,
                stroke: CHART_COLORS.appBackground,
                strokeWidth: 1.5,
              }}
              isAnimationActive={true}
            />
          </RadarChart>
        </ChartContainer>
      </div>
    </WidgetShell>
  );
}
