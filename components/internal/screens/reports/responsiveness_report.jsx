"use client";

// Responsiveness: median and 90th-percentile first response, median time to close, and either trend over time.

import { useState } from "react";
import { Clock } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@geiger/ui";
import { StatsBar } from "@/components/internal/shared/screen_kit";
import FilterDropdown from "@/components/internal/shared/filter_dropdown";
import { getResponsivenessReport } from "@/lib/supabase/reports";
import {
  BUCKET_LABELS,
  RESPONSE_METRIC_OPTIONS,
  SERIES_COLORS,
  formatBucket,
  formatCount,
  formatDuration,
} from "./constants";
import { ChartCard, ReportSection, tooltipFormatter } from "./report_section";
import { useReport } from "./use_report";

const TREND_CONFIG = {
  firstResponse: { label: "Median first response", color: SERIES_COLORS.primary },
  timeToClose: { label: "Median time to close", color: SERIES_COLORS.primary },
};

function ResponsivenessBody({ data }) {
  const [metric, setMetric] = useState("firstResponse");

  const stats = [
    {
      label: "Median first response",
      value: formatDuration(data.firstResponse.median),
      footer: `${formatCount(data.firstResponse.count)} first replies`,
    },
    { label: "90th percentile", value: formatDuration(data.firstResponse.p90), footer: "First response" },
    {
      label: "Median time to close",
      value: formatDuration(data.timeToClose.median),
      footer: `${formatCount(data.timeToClose.count)} closed`,
    },
    { label: "Unanswered", value: formatCount(data.unanswered), footer: "Still waiting on a first reply" },
  ];

  const series = data.series.map((row) => ({
    label: formatBucket(row.bucket, data.unit),
    [metric]: metric === "firstResponse" ? row.firstResponseMedian : row.timeToCloseMedian,
  }));
  const config = { [metric]: TREND_CONFIG[metric] };

  return (
    <>
      <StatsBar stats={stats} />
      <div className="h-[320px]">
        <ChartCard
          title="Response trend"
          subtitle={`${TREND_CONFIG[metric].label} ${BUCKET_LABELS[data.unit]}; gaps are periods with nothing to measure.`}
          action={<FilterDropdown value={metric} onValueChange={setMetric} options={RESPONSE_METRIC_OPTIONS} />}
        >
          <ChartContainer config={config} className="aspect-auto h-full w-full">
            <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
              <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={formatDuration} />
              <ChartTooltip content={<ChartTooltipContent formatter={tooltipFormatter(config, formatDuration)} />} />
              <Line
                dataKey={metric}
                type="monotone"
                stroke={`var(--color-${metric})`}
                strokeWidth={2}
                dot={{ r: 3, fill: `var(--color-${metric})` }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ChartContainer>
        </ChartCard>
      </div>
    </>
  );
}

export function ResponsivenessReport({ query }) {
  const report = useReport(getResponsivenessReport, query);
  return (
    <ReportSection
      title="Responsiveness"
      description="First response runs from the customer's first message to the next teammate or AI reply; time to close from start to close."
      report={report}
      isEmpty={(d) => !d.firstResponse.count && !d.timeToClose.count && !d.unanswered}
      empty={{
        icon: Clock,
        title: "Nothing to measure in this range",
        description: "Response times appear once customers write in and teammates reply or close.",
      }}
    >
      {(data) => <ResponsivenessBody data={data} />}
    </ReportSection>
  );
}
