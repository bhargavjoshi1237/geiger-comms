"use client";

// SLA compliance per policy, graded from the SLA engine's own due times: met, missed (late, or overdue and still open) or pending.

import { useMemo } from "react";
import { Timer } from "lucide-react";
import { Badge } from "@geiger/ui";
import { StatsBar } from "@/components/internal/shared/screen_kit";
import { getSlaReport } from "@/lib/supabase/reports";
import { formatCount, formatPercent, rangeSlug } from "./constants";
import { ReportSection, ReportTable } from "./report_section";
import { useReport } from "./use_report";

const hitRate = ({ met, missed }) => formatPercent(met, met + missed);

function TargetCell({ target }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium tabular-nums text-foreground">{hitRate(target)}</span>
      <span className="whitespace-nowrap text-xs text-text-secondary">
        {formatCount(target.met)} met ·{" "}
        <span className={target.missed ? "text-red-400" : undefined}>{formatCount(target.missed)} missed</span> ·{" "}
        {formatCount(target.pending)} pending
      </span>
    </div>
  );
}

const CSV_COLUMNS = [
  { header: "Policy", csv: (row) => row.name },
  { header: "Status", csv: (row) => (row.deleted ? "Deleted" : row.enabled ? "Enabled" : "Disabled") },
  { header: "Conversations", csv: (row) => row.conversations },
  { header: "First response met", csv: (row) => row.firstResponse.met },
  { header: "First response missed", csv: (row) => row.firstResponse.missed },
  { header: "First response pending", csv: (row) => row.firstResponse.pending },
  { header: "First response hit rate", csv: (row) => hitRate(row.firstResponse) },
  { header: "Resolution met", csv: (row) => row.resolution.met },
  { header: "Resolution missed", csv: (row) => row.resolution.missed },
  { header: "Resolution pending", csv: (row) => row.resolution.pending },
  { header: "Resolution hit rate", csv: (row) => hitRate(row.resolution) },
];

const COLUMNS = [
  {
    key: "policy",
    header: "Policy",
    render: (row) => (
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium text-foreground">{row.name || "Untitled policy"}</span>
        {row.deleted ? <Badge variant="outline">Deleted</Badge> : !row.enabled ? <Badge variant="outline">Disabled</Badge> : null}
      </div>
    ),
  },
  {
    key: "conversations",
    header: "Conversations",
    align: "right",
    className: "tabular-nums",
    render: (row) => formatCount(row.conversations),
  },
  { key: "firstResponse", header: "First response", render: (row) => <TargetCell target={row.firstResponse} /> },
  { key: "resolution", header: "Resolution", render: (row) => <TargetCell target={row.resolution} /> },
];

function sum(rows, pick) {
  return rows.reduce((total, row) => total + pick(row), 0);
}

function SlaBody({ rows, range }) {
  const stats = useMemo(() => {
    const first = { met: sum(rows, (r) => r.firstResponse.met), missed: sum(rows, (r) => r.firstResponse.missed) };
    const resolution = { met: sum(rows, (r) => r.resolution.met), missed: sum(rows, (r) => r.resolution.missed) };
    const pending = sum(rows, (r) => r.firstResponse.pending + r.resolution.pending);
    return [
      { label: "On an SLA", value: formatCount(sum(rows, (r) => r.conversations)), footer: "Started in range" },
      {
        label: "First response hit rate",
        value: hitRate(first),
        footer: `${formatCount(first.met)} met · ${formatCount(first.missed)} missed`,
      },
      {
        label: "Resolution hit rate",
        value: hitRate(resolution),
        footer: `${formatCount(resolution.met)} met · ${formatCount(resolution.missed)} missed`,
      },
      { label: "Pending", value: formatCount(pending), footer: "Targets not yet due" },
    ];
  }, [rows]);

  return (
    <>
      <StatsBar stats={stats} />
      <ReportTable
        title="By policy"
        subtitle="Hit rate counts graded targets only; pending ones are still inside their window."
        columns={COLUMNS}
        csvColumns={CSV_COLUMNS}
        rows={rows}
        getRowKey={(row) => row.policyId}
        filename={`sla_compliance_${rangeSlug(range)}.csv`}
      />
    </>
  );
}

export function SlaReport({ query, range }) {
  const report = useReport(getSlaReport, query);
  return (
    <ReportSection
      title="SLA compliance"
      description="Conversations started in the range that an SLA policy applied to, graded against the due times the SLA engine recorded."
      report={report}
      isEmpty={(rows) => rows.length === 0}
      empty={{
        icon: Timer,
        title: "No SLA policies",
        description: "Add one under Automation → SLA Policies to track first response and resolution targets.",
      }}
    >
      {(rows) => <SlaBody rows={rows} range={range} />}
    </ReportSection>
  );
}
