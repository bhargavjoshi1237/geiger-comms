"use client";

// Building blocks every report section shares: the section frame with its loading / failed / empty states, a titled table with CSV export, and chart helpers.

import { AlertTriangle, Download } from "lucide-react";
import { Button, LogoLoading } from "@geiger/ui";
import { DataTable, EmptyState, SectionCard } from "@/components/internal/shared/screen_kit";
import { WidgetHeader, WidgetShell } from "../overview/widget_shell";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/components/internal/shared/csv";

const PANEL = "rounded-xl border border-border bg-surface-subtle";

// `report` is a useReport() result; `children(data)` renders only once the report is ready and not empty.
export function ReportSection({ title, description, report, isEmpty, empty, children }) {
  let body;
  if (report.status === "loading") {
    body = (
      <div className={cn("flex items-center justify-center px-6 py-16", PANEL)}>
        <LogoLoading size={48} aria-label={`Loading ${title}`} />
      </div>
    );
  } else if (report.status === "failed") {
    body = (
      <div className={PANEL}>
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load this report"
          description="The report query failed. Try again in a moment."
          action={
            <Button
              variant="outline"
              className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
              onClick={report.retry}
            >
              Retry
            </Button>
          }
        />
      </div>
    );
  } else if (isEmpty(report.data)) {
    body = (
      <div className={PANEL}>
        <EmptyState {...empty} />
      </div>
    );
  } else {
    body = <div className="space-y-4">{children(report.data)}</div>;
  }

  return (
    <SectionCard bare title={title} description={description}>
      {body}
    </SectionCard>
  );
}

// Columns are DataTable columns plus `csv: (row) => value`; pass csvColumns when the export carries more detail than the table shows.
export function ReportTable({ title, subtitle, columns, csvColumns, rows, getRowKey, filename }) {
  const exported = csvColumns ?? columns.filter((c) => c.csv);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <WidgetHeader
        title={title}
        subtitle={subtitle}
        action={
          <Button
            variant="outline"
            size="sm"
            className="border-border bg-surface-card text-foreground hover:bg-surface-subtle"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv(filename, [exported.map((c) => c.header), ...rows.map((row) => exported.map((c) => c.csv(row)))])
            }
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        }
      />
      <DataTable columns={columns} data={rows} getRowKey={getRowKey} />
    </div>
  );
}

export function ChartCard({ title, subtitle, action, children }) {
  return (
    <WidgetShell contentClassName="flex flex-col">
      <WidgetHeader title={title} subtitle={subtitle} action={action} />
      <div className="mt-4 min-h-0 flex-1">{children}</div>
    </WidgetShell>
  );
}

// ChartTooltipContent drops zero values; this row always shows the value, formatted.
export function tooltipFormatter(config, format) {
  return function formatRow(value, name, item) {
    return (
      <div className="flex w-full items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
        <span className="flex-1 text-muted-foreground">{config[name]?.label ?? name}</span>
        <span className="font-mono font-medium tabular-nums text-foreground">{format(value)}</span>
      </div>
    );
  };
}
