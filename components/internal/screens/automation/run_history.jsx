"use client";

// Run History: one row per workflow execution from comms.workflow_runs, with a per-step log in a side sheet.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, History, MessagesSquare, MinusCircle, XCircle } from "lucide-react";
import {
  Badge,
  Button,
  LogoLoading,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@geiger/ui";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import {
  DataTable,
  EmptyState,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import FilterDropdown from "../overview/filter_dropdown";
import { cn } from "@/lib/utils";
import { useOptionalProject } from "@/context/project-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listWorkflowRuns } from "@/lib/supabase/workflow_runs";
import { listWorkflows } from "@/lib/supabase/workflows";

import { RUN_STATUS_FILTER_OPTIONS, RUN_STATUS_MAP, formatDateTime, formatDuration } from "./constants";
import { catalogEntry } from "./workflow_catalog";

const STEP_STATUS_ICON = {
  ok: CheckCircle2,
  failed: XCircle,
  running: Clock,
  skipped: MinusCircle,
};

function RunDetailSheet({ run, workflowName, onClose, onOpenConversation }) {
  const trigger = run ? catalogEntry(run.trigger) : null;
  const steps = run?.stepsLog || [];
  const contextEntries = run
    ? Object.entries(run.context || {}).filter(([, v]) => v != null && v !== "" && typeof v !== "object")
    : [];

  return (
    <Sheet open={!!run} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{workflowName || "Workflow run"}</SheetTitle>
          <SheetDescription>
            When {trigger?.label || run?.trigger || "—"} · {formatDateTime(run?.startedAt)}
          </SheetDescription>
        </SheetHeader>

        {run ? (
          <div className="space-y-6 px-4 pb-8 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={run.status} map={RUN_STATUS_MAP} />
              <Badge variant="neutral">{formatDuration(run.durationMs)}</Badge>
              <Badge variant="neutral">
                {run.stepsCompleted}/{run.stepsTotal} steps
              </Badge>
            </div>

            {run.status === "failed" && run.error ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">
                {run.error}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-text-tertiary">Started</p>
                <p className="text-foreground">{formatDateTime(run.startedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Finished</p>
                <p className="text-foreground">{formatDateTime(run.finishedAt)}</p>
              </div>
            </div>

            {run.conversationId ? (
              <Button
                variant="outline"
                className="w-full border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                onClick={() => onOpenConversation(run.conversationId)}
              >
                <MessagesSquare className="h-4 w-4" /> Open conversation
              </Button>
            ) : null}

            {contextEntries.length ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Context
                </p>
                <div className="divide-y divide-border rounded-lg border border-border bg-surface-subtle">
                  {contextEntries.map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="text-text-secondary">{k}</span>
                      <span className="truncate text-foreground">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Steps
              </p>
              {steps.length ? (
                <div className="space-y-2">
                  {steps.map((s, i) => {
                    const entry = catalogEntry(s.type);
                    const status = s.status || "ok";
                    const Glyph = STEP_STATUS_ICON[status] || CheckCircle2;
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg border border-border bg-surface-subtle p-3"
                      >
                        <Glyph
                          className={cn(
                            "mt-0.5 h-4 w-4 shrink-0",
                            RUN_STATUS_MAP[status]?.iconClass || "text-text-secondary",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {s.label || entry?.label || s.type}
                          </p>
                          {s.error ? (
                            <p className="mt-0.5 text-xs text-red-700 dark:text-red-300">{s.error}</p>
                          ) : (
                            <p className="mt-0.5 text-xs text-text-secondary">
                              {formatDuration(s.durationMs)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-text-secondary">
                  No step-level detail was recorded for this run.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function RunHistoryScreen() {
  const { projectId } = useOptionalProject() ?? {};
  const { openConversationInTab } = useWorkspaceUrl();

  const [runs, setRuns] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listWorkflowRuns({ projectId }), listWorkflows({ projectId })]).then(
      ([rows, flows]) => {
        if (!alive) return;
        setRuns(rows ?? []);
        setWorkflows(flows ?? []);
        setLoading(false);
        if (rows === null) toast.error("Couldn't load run history.");
      },
    );
    return () => {
      alive = false;
    };
  }, [projectId]);

  const workflowById = useMemo(() => new Map(workflows.map((w) => [w.id, w])), [workflows]);
  const workflowName = (id) => workflowById.get(id)?.name || "Deleted workflow";
  const runTrigger = (r) => r.trigger || workflowById.get(r.workflowId)?.trigger || "";

  const workflowOptions = useMemo(
    () => [
      { value: "all", label: "All workflows" },
      ...workflows.map((w) => ({ value: w.id, label: w.name })),
    ],
    [workflows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return runs.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (workflowFilter !== "all" && r.workflowId !== workflowFilter) return false;
      if (!q) return true;
      const name = workflowById.get(r.workflowId)?.name || "";
      const trigger = catalogEntry(r.trigger || workflowById.get(r.workflowId)?.trigger)?.label || "";
      return `${name} ${trigger}`.toLowerCase().includes(q);
    });
  }, [runs, status, workflowFilter, search, workflowById]);

  const pager = usePagination(filtered, { resetKey: `${search}|${status}|${workflowFilter}` });

  const stats = useMemo(() => {
    const total = runs.length;
    const success = runs.filter((r) => r.status === "ok").length;
    const failed = runs.filter((r) => r.status === "failed").length;
    const durations = runs.filter((r) => r.durationMs > 0);
    const avg = durations.length
      ? durations.reduce((s, r) => s + r.durationMs, 0) / durations.length
      : 0;
    return [
      { label: "Total runs", value: total.toLocaleString("en-US"), footer: "Latest 500" },
      {
        label: "Success rate",
        value: `${total ? Math.round((success / total) * 100) : 0}%`,
        footer: `${success} succeeded`,
      },
      { label: "Failed", value: String(failed), footer: failed ? "Needs attention" : "Nothing failing" },
      { label: "Avg duration", value: formatDuration(avg), footer: "Per run" },
    ];
  }, [runs]);

  const openConversation = (id) => openConversationInTab(id, "All Conversations");

  const columns = [
    {
      key: "workflow",
      header: "Workflow",
      render: (r) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-medium text-foreground">{workflowName(r.workflowId)}</span>
          <span className="truncate text-xs text-text-secondary">
            When {catalogEntry(runTrigger(r))?.label || "—"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={RUN_STATUS_MAP} />,
    },
    {
      key: "started",
      header: "Started",
      className: "text-text-secondary",
      render: (r) => formatDateTime(r.startedAt),
    },
    {
      key: "duration",
      header: "Duration",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (r) => formatDuration(r.durationMs),
    },
    {
      key: "steps",
      header: "Steps",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (r) => (r.stepsTotal ? `${r.stepsCompleted}/${r.stepsTotal}` : "—"),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Run History"
        description="Every time a workflow fires, its outcome lands here — the trigger, timing and a per-step log, so you can see exactly what happened to a conversation."
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown
            value={status}
            onValueChange={setStatus}
            options={RUN_STATUS_FILTER_OPTIONS}
            height="h-9"
          />
          <FilterDropdown
            value={workflowFilter}
            onValueChange={setWorkflowFilter}
            options={workflowOptions}
            height="h-9"
          />
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search runs…"
          className="w-full sm:w-64"
        />
      </Toolbar>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
          <LogoLoading size={48} aria-label="Loading run history" />
        </div>
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(r) => r.id}
            onRowClick={(r) => setSelected(r)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={History}
                  title={runs.length ? "No runs match your filters" : "No runs yet"}
                  description={
                    runs.length
                      ? "Try clearing the search or filters."
                      : "Once live workflows start firing, each execution shows up here with its step-by-step outcome."
                  }
                  action={
                    runs.length ? (
                      <Button
                        variant="outline"
                        className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                        onClick={() => {
                          setSearch("");
                          setStatus("all");
                          setWorkflowFilter("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : null
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="runs" />
        </div>
      )}

      <RunDetailSheet
        run={selected}
        workflowName={selected ? workflowName(selected.workflowId) : ""}
        onClose={() => setSelected(null)}
        onOpenConversation={openConversation}
      />
    </MainScreenWrapper>
  );
}

export default RunHistoryScreen;
