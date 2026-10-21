"use client";

import { AlertTriangle, BarChart3 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, LogoLoading } from "@geiger/ui";

import { EmptyState, SectionCard } from "@/components/internal/shared/screen_kit";
import { USAGE_FEATURE_LABELS } from "../constants";

// Status pair (succeeded / failed) from the suite chart tokens; identity also carried by the legend and tooltip labels.
const CHART_CONFIG = {
  ok: { label: "Succeeded", color: "var(--chart-2)" },
  error: { label: "Failed", color: "var(--chart-5)" },
};

const dayLabel = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Settings → AI Providers → Usage — Last 30 Days (spec §6.2 item 7): requests per day and a by-feature list.
export function UsageCard({ usage, loading }) {
  let body;
  if (loading) {
    body = (
      <div className="flex items-center justify-center py-10">
        <LogoLoading size={40} aria-label="Loading AI usage" />
      </div>
    );
  } else if (!usage) {
    body = <EmptyState icon={AlertTriangle} title="Couldn't Load Usage" description="Try again in a moment." />;
  } else if (!usage.totals.requests) {
    body = <EmptyState icon={BarChart3} title="No AI Requests Yet" description="Requests appear here once a provider is tested or an AI feature runs." />;
  } else {
    body = (
      <div className="space-y-5">
        <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[200px] w-full">
          <BarChart data={usage.byDay} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={dayLabel} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={dayLabel} />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="ok" stackId="requests" fill="var(--color-ok)" stroke="var(--color-surface-subtle)" strokeWidth={2} radius={[4, 4, 0, 0]} />
            <Bar dataKey="error" stackId="requests" fill="var(--color-error)" stroke="var(--color-surface-subtle)" strokeWidth={2} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
        <ul className="divide-y divide-border text-sm">
          {usage.byFeature.map((row) => (
            <li key={row.feature} className="flex items-center justify-between gap-4 py-2">
              <span className="text-text-secondary">{USAGE_FEATURE_LABELS[row.feature] || row.feature}</span>
              <span className="tabular-nums text-foreground">
                {row.requests.toLocaleString("en-US")}
                {row.errors ? <span className="ml-2 text-xs text-text-tertiary">{row.errors.toLocaleString("en-US")} failed</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return <SectionCard title="Usage — Last 30 Days">{body}</SectionCard>;
}

export default UsageCard;
