"use client";

// Customer satisfaction from the Messenger's post-chat rating (1-5, optional comment): score, distribution, trend and the latest rated conversations.

import { useMemo } from "react";
import { Star } from "lucide-react";
import { format } from "date-fns";
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@geiger/ui";
import { StatsBar } from "@/components/internal/shared/screen_kit";
import { getCsatReport } from "@/lib/supabase/reports";
import {
  BUCKET_LABELS,
  SERIES_COLORS,
  formatBucket,
  formatCount,
  formatPercent,
  formatScore,
  rangeSlug,
} from "./constants";
import { cn } from "@/lib/utils";
import { ChartCard, ReportSection, ReportTable, tooltipFormatter } from "./report_section";
import { useReport } from "./use_report";

const DISTRIBUTION_CONFIG = { count: { label: "Ratings", color: SERIES_COLORS.primary } };
const TREND_CONFIG = { average: { label: "Average rating", color: SERIES_COLORS.primary } };

const COLUMNS = [
  {
    key: "conversation",
    header: "Conversation",
    render: (row) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium text-foreground">{row.subject || "No subject"}</span>
        <span className="truncate text-xs text-text-secondary">
          {row.contactName || "Unknown contact"} · {row.channel}
        </span>
      </div>
    ),
  },
  {
    key: "score",
    header: "Rating",
    className: "whitespace-nowrap",
    render: (row) => (
      <span className="inline-flex items-center gap-1 font-medium tabular-nums text-foreground">
        <Star className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />
        {row.score} / 5
      </span>
    ),
  },
  {
    key: "comment",
    header: "Comment",
    className: "max-w-sm whitespace-normal text-text-secondary",
    render: (row) => row.comment || <span className="text-text-tertiary">No comment</span>,
  },
  {
    key: "teammate",
    header: "Teammate",
    className: "whitespace-nowrap text-text-secondary",
    render: (row) => row.teammateName || "Unassigned",
  },
  {
    key: "ratedAt",
    header: "Rated",
    className: "whitespace-nowrap tabular-nums text-text-secondary",
    render: (row) => (row.ratedAt ? format(new Date(row.ratedAt), "MMM d, yyyy") : "—"),
  },
];

const CSV_COLUMNS = [
  { header: "Conversation ID", csv: (row) => row.conversationId },
  { header: "Subject", csv: (row) => row.subject },
  { header: "Contact", csv: (row) => row.contactName },
  { header: "Channel", csv: (row) => row.channel },
  { header: "Rating", csv: (row) => row.score },
  { header: "Comment", csv: (row) => row.comment },
  { header: "Teammate", csv: (row) => row.teammateName },
  { header: "Rated at", csv: (row) => row.ratedAt },
];

function CsatBody({ data, range, detailed }) {
  const stats = useMemo(() => {
    const negative = data.distribution
      .filter((d) => d.score <= 2)
      .reduce((total, d) => total + d.count, 0);
    return [
      { label: "CSAT score", value: formatScore(data.average), footer: "Average rating out of 5" },
      { label: "Positive", value: formatPercent(data.positive, data.count), footer: "Rated 4 or 5" },
      { label: "Negative", value: formatPercent(negative, data.count), footer: "Rated 1 or 2" },
      { label: "Ratings", value: formatCount(data.count), footer: "Given in range" },
    ];
  }, [data]);

  // Highest score on top.
  const distribution = [...data.distribution]
    .sort((a, b) => b.score - a.score)
    .map((d) => ({ label: String(d.score), count: d.count }));
  const trend = data.series.map((row) => ({ label: formatBucket(row.bucket, data.unit), average: row.average }));

  const distributionChart = (
    <ChartCard title="Rating distribution" subtitle="Conversations per score, 5 (best) to 1.">
      <ChartContainer config={DISTRIBUTION_CONFIG} className="aspect-auto h-full w-full">
        <BarChart data={distribution} layout="vertical" margin={{ top: 0, right: 32, left: 0, bottom: 0 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={16} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel formatter={tooltipFormatter(DISTRIBUTION_CONFIG, formatCount)} />} />
          <Bar dataKey="count" fill="var(--color-count)" radius={4} barSize={18}>
            <LabelList dataKey="count" position="right" offset={8} className="fill-foreground" fontSize={11} />
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );

  const table = (
    <ReportTable
      title={detailed ? "Rated conversations" : "Latest ratings"}
      subtitle={detailed ? "The most recent 50 ratings in the range, with comments." : "The most recent ratings in the range."}
      columns={COLUMNS}
      csvColumns={CSV_COLUMNS}
      rows={data.recent}
      getRowKey={(row) => row.conversationId}
      filename={`csat_ratings_${rangeSlug(range)}.csv`}
    />
  );

  const trendChart = (
    <ChartCard title="CSAT over time" subtitle={`Average rating ${BUCKET_LABELS[data.unit]}; gaps are periods without ratings.`}>
      <ChartContainer config={TREND_CONFIG} className="aspect-auto h-full w-full">
        <LineChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
          <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tickLine={false} axisLine={false} width={24} />
          <ChartTooltip content={<ChartTooltipContent formatter={tooltipFormatter(TREND_CONFIG, formatScore)} />} />
          <Line
            dataKey="average"
            type="monotone"
            stroke="var(--color-average)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--color-average)" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ChartContainer>
    </ChartCard>
  );

  return (
    <>
      <StatsBar stats={stats} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-[300px]">{distributionChart}</div>
        <div className={cn("lg:col-span-2", detailed && "h-[300px]")}>{detailed ? trendChart : table}</div>
      </div>
      {detailed ? table : null}
    </>
  );
}

// `detailed` (Quality & CSAT) adds the trend and lists up to 50 ratings instead of 10.
export function CsatReport({ query, range, detailed = false }) {
  const csatQuery = useMemo(() => (query ? { ...query, limit: detailed ? 50 : 10 } : null), [query, detailed]);
  const report = useReport(getCsatReport, csatQuery);
  return (
    <ReportSection
      title="Customer satisfaction"
      description="Ratings customers gave in the range from the Messenger's post-chat survey."
      report={report}
      isEmpty={(d) => d.count === 0}
      empty={{
        icon: Star,
        title: "No ratings in this range",
        description: "Customers rate a conversation from the Messenger once it's closed; their scores and comments land here.",
      }}
    >
      {(data) => <CsatBody data={data} range={range} detailed={detailed} />}
    </ReportSection>
  );
}
