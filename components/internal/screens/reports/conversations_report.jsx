"use client";

// Conversations: new and closed in the range, the backlog right now, volume over time and the split by channel.

import { MessagesSquare } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@geiger/ui";
import { StatsBar } from "@/components/internal/shared/screen_kit";
import { getConversationReport } from "@/lib/supabase/reports";
import {
  BUCKET_LABELS,
  SERIES_COLORS,
  formatBucket,
  formatCount,
  formatPercent,
  rangeSlug,
} from "./constants";
import { ChartCard, ReportSection, ReportTable, tooltipFormatter } from "./report_section";
import { useReport } from "./use_report";

const VOLUME_CONFIG = {
  created: { label: "New", color: SERIES_COLORS.primary },
  closed: { label: "Closed", color: SERIES_COLORS.secondary },
};

function ConversationsBody({ data, range }) {
  const stats = [
    { label: "New", value: formatCount(data.created), footer: "Started in range" },
    { label: "Closed", value: formatCount(data.closed), footer: "Closed in range" },
    { label: "Open", value: formatCount(data.open), footer: "Right now" },
    { label: "Snoozed", value: formatCount(data.snoozed), footer: "Right now" },
  ];
  const series = data.series.map((row) => ({ ...row, label: formatBucket(row.bucket, data.unit) }));

  const columns = [
    {
      key: "channel",
      header: "Channel",
      className: "font-medium text-foreground",
      render: (row) => row.channel,
      csv: (row) => row.channel,
    },
    {
      key: "created",
      header: "New",
      align: "right",
      className: "tabular-nums",
      render: (row) => formatCount(row.created),
      csv: (row) => row.created,
    },
    {
      key: "closed",
      header: "Closed",
      align: "right",
      className: "tabular-nums",
      render: (row) => formatCount(row.closed),
      csv: (row) => row.closed,
    },
    {
      key: "share",
      header: "Share",
      align: "right",
      className: "tabular-nums text-text-secondary",
      render: (row) => formatPercent(row.created, data.created),
      csv: (row) => formatPercent(row.created, data.created),
    },
  ];

  return (
    <>
      <StatsBar stats={stats} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-[340px] lg:col-span-2">
          <ChartCard title="Volume over time" subtitle={`New and closed conversations ${BUCKET_LABELS[data.unit]}.`}>
            <ChartContainer config={VOLUME_CONFIG} className="aspect-auto h-full w-full">
              <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent formatter={tooltipFormatter(VOLUME_CONFIG, formatCount)} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line dataKey="created" type="monotone" stroke="var(--color-created)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line dataKey="closed" type="monotone" stroke="var(--color-closed)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ChartContainer>
          </ChartCard>
        </div>
        <ReportTable
          title="By channel"
          subtitle="New and closed per channel."
          columns={columns}
          rows={data.byChannel}
          getRowKey={(row) => row.channel}
          filename={`conversations_by_channel_${rangeSlug(range)}.csv`}
        />
      </div>
    </>
  );
}

export function ConversationsReport({ query, range }) {
  const report = useReport(getConversationReport, query);
  return (
    <ReportSection
      title="Conversations"
      description="Volume in the selected range, and the backlog as it stands now."
      report={report}
      isEmpty={(d) => !d.created && !d.closed && !d.open && !d.snoozed}
      empty={{
        icon: MessagesSquare,
        title: "No conversations in this range",
        description: "Try a wider date range or clear the filters.",
      }}
    >
      {(data) => <ConversationsBody data={data} range={range} />}
    </ReportSection>
  );
}
