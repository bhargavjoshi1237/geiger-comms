"use client";

// Rate gauge (radial text) — used for both Resolution Rate and Response
// Backlog; `computeLive` supplies the metric-specific percentage + footnote.

import { useMemo, useState } from "react";
import { Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";
import { ChartContainer } from "@geiger/ui";
import { CHART_COLORS } from "./constants";
import { WidgetHeader, WidgetShell } from "./widget_shell";
import { ChannelScopeSelect } from "./channel_scope_select";

export function GaugeWidget({ title, subtitle, caption, channels = [], demo, demoValue, demoFootnote, computeLive }) {
  const [channelScope, setChannelScope] = useState([]);
  const { pct, footnote } = useMemo(() => {
    if (demo) return { pct: demoValue, footnote: demoFootnote };
    return computeLive(channelScope);
  }, [demo, demoValue, demoFootnote, computeLive, channelScope]);

  const clamped = Math.max(0, Math.min(100, pct));
  // Sweep the colored arc clockwise from the top, proportional to the value.
  const endAngle = 90 - (clamped / 100) * 360;
  const data = [{ name: caption, value: clamped, fill: CHART_COLORS.primary }];

  return (
    <WidgetShell contentClassName="flex flex-col">
      <WidgetHeader
        title={title}
        subtitle={subtitle}
        action={
          <ChannelScopeSelect
            channels={channels}
            selected={channelScope}
            onChange={setChannelScope}
          />
        }
      />
      <div className="mt-1 flex min-h-0 flex-1 items-center justify-center">
        <ChartContainer
          config={{ value: { label: caption, color: CHART_COLORS.primary } }}
          className="mx-auto aspect-square h-full max-h-[190px]"
        >
          <RadialBarChart
            data={data}
            startAngle={90}
            endAngle={endAngle}
            innerRadius={72}
            outerRadius={104}
          >
            {/* Full-circle track behind the value arc */}
            <PolarGrid
              gridType="circle"
              radialLines={false}
              stroke="none"
              polarRadius={[78, 66]}
              className="first:fill-[#202020] last:fill-[#1a1a1a]"
            />
            <RadialBar dataKey="value" cornerRadius={8} isAnimationActive={true} />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-white text-3xl font-bold"
                        >
                          {clamped}%
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 22}
                          className="fill-muted-foreground text-xs font-medium"
                        >
                          {caption}
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      </div>
      {footnote ? (
        <p className="mt-1 text-center text-xs text-text-secondary">{footnote}</p>
      ) : null}
    </WidgetShell>
  );
}
