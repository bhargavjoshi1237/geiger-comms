"use client";

// Teammate performance: conversations assigned and closed, replies sent, median first response and CSAT, one row per teammate.

import { Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@geiger/ui";
import { getTeammateReport } from "@/lib/supabase/reports";
import { initials } from "../inbox/constants";
import { formatCount, formatDuration, formatScore, rangeSlug } from "./constants";
import { ReportSection, ReportTable } from "./report_section";
import { useReport } from "./use_report";

const COLUMNS = [
  {
    key: "teammate",
    header: "Teammate",
    render: (row) => (
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar className="h-8 w-8 shrink-0">
          {row.avatarUrl ? <AvatarImage src={row.avatarUrl} alt={row.name} /> : null}
          <AvatarFallback className="bg-surface-card text-xs text-text-secondary">
            {initials(row.name || row.email)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.name || "Teammate"}</p>
          <p className="truncate text-xs text-text-secondary">{row.email || "No email"}</p>
        </div>
      </div>
    ),
  },
  {
    key: "assigned",
    header: "Assigned",
    align: "right",
    className: "tabular-nums",
    render: (row) => formatCount(row.assigned),
  },
  {
    key: "closed",
    header: "Closed",
    align: "right",
    className: "tabular-nums",
    render: (row) => formatCount(row.closed),
  },
  {
    key: "replies",
    header: "Replies",
    align: "right",
    className: "tabular-nums",
    render: (row) => formatCount(row.replies),
  },
  {
    key: "firstResponse",
    header: "Median first response",
    align: "right",
    className: "tabular-nums",
    render: (row) => (
      <span title={`${formatCount(row.firstResponseCount)} first replies`}>{formatDuration(row.firstResponseMedian)}</span>
    ),
  },
  {
    key: "csat",
    header: "CSAT",
    align: "right",
    className: "tabular-nums",
    render: (row) =>
      row.csatCount ? (
        <span>
          {formatScore(row.csatAverage)}
          <span className="text-text-tertiary"> · {formatCount(row.csatCount)}</span>
        </span>
      ) : (
        <span className="text-text-tertiary">—</span>
      ),
  },
];

const CSV_COLUMNS = [
  { header: "Teammate", csv: (row) => row.name },
  { header: "Email", csv: (row) => row.email },
  { header: "Assigned", csv: (row) => row.assigned },
  { header: "Closed", csv: (row) => row.closed },
  { header: "Replies", csv: (row) => row.replies },
  {
    header: "Median first response (seconds)",
    csv: (row) => (row.firstResponseMedian == null ? "" : Math.round(row.firstResponseMedian)),
  },
  { header: "First replies", csv: (row) => row.firstResponseCount },
  { header: "CSAT average", csv: (row) => (row.csatAverage == null ? "" : row.csatAverage.toFixed(2)) },
  { header: "Ratings", csv: (row) => row.csatCount },
];

export function TeammatesReport({ query, range }) {
  const report = useReport(getTeammateReport, query);
  return (
    <ReportSection
      title="Teammate performance"
      description="Assigned: conversations started in the range that are theirs now. Closed: closed in the range while theirs. First response: threads they answered first."
      report={report}
      isEmpty={(rows) => rows.length === 0}
      empty={{
        icon: Users,
        title: "No teammates match",
        description: "Teammates appear here once they join the workspace; check the team and teammate filters.",
      }}
    >
      {(rows) => (
        <ReportTable
          title="By teammate"
          subtitle="Sorted by conversations closed."
          columns={COLUMNS}
          csvColumns={CSV_COLUMNS}
          rows={rows}
          getRowKey={(row) => row.teammateId}
          filename={`teammate_performance_${rangeSlug(range)}.csv`}
        />
      )}
    </ReportSection>
  );
}
