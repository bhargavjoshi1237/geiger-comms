"use client";

import { useMemo, useState } from "react";
import { Clock } from "lucide-react";

import {
  DataTable,
  EmptyState,
  SearchInput,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import {
  ListPagination,
  usePagination,
} from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { cn } from "@/lib/utils";
import { ACTIVITY_ACTION_MAP, formatRelativeTime } from "../constants";

const FALLBACK = { label: "", icon: Clock, tone: "text-text-secondary" };

// Only the actions the feed actually contains earn a filter entry.
function actionOptions(activity) {
  const seen = [];
  for (const a of activity) if (a.action && !seen.includes(a.action)) seen.push(a.action);
  return [
    { value: "all", label: "All Activity" },
    ...seen.map((action) => ({
      value: action,
      label: ACTIVITY_ACTION_MAP[action]?.label || action,
    })),
  ];
}

export default function ActivityTab({ activity }) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const options = useMemo(() => actionOptions(activity), [activity]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activity.filter((a) => {
      if (actionFilter !== "all" && a.action !== actionFilter) return false;
      if (q && !`${a.actorName} ${a.targetName} ${a.action}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [activity, search, actionFilter]);

  const pager = usePagination(filtered, { resetKey: `${search}|${actionFilter}` });

  const columns = [
    {
      key: "event",
      header: "Event",
      render: (a) => {
        const meta = { ...FALLBACK, label: a.action, ...ACTIVITY_ACTION_MAP[a.action] };
        const Icon = meta.icon;
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface-card">
              <Icon className={cn("h-3.5 w-3.5", meta.tone)} />
            </div>
            <p className="min-w-0 text-sm text-foreground">
              <span className="font-medium">{a.actorName || "Someone"}</span>{" "}
              <span className="text-text-secondary">{meta.label}</span>{" "}
              <span className="font-medium">
                {a.targetName || a.detail?.role || a.detail?.email || ""}
              </span>
            </p>
          </div>
        );
      },
    },
    {
      key: "detail",
      header: "Detail",
      render: (a) => (
        <span className="text-xs text-text-secondary">
          {a.detail?.role || a.detail?.status || a.detail?.email || "—"}
        </span>
      ),
    },
    {
      key: "when",
      header: "When",
      align: "right",
      className: "text-right",
      render: (a) => (
        <span className="text-xs text-text-secondary">
          {formatRelativeTime(a.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Toolbar>
        <FilterDropdown
          value={actionFilter}
          onValueChange={setActionFilter}
          options={options}
          placeholder="All Activity"
          height="h-9"
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search activity…"
        />
      </Toolbar>

      <DataTable
        columns={columns}
        data={pager.pageItems}
        getRowKey={(a) => a.id}
        empty={
          <div className="rounded-xl border border-border bg-surface-subtle">
            {activity.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No activity yet"
                description="Invites, role changes and removals will show up here."
              />
            ) : (
              <EmptyState
                icon={Clock}
                title="No matching activity"
                description="Try clearing the search or action filter."
              />
            )}
          </div>
        }
      />

      <ListPagination {...pager} itemLabel="events" />
    </div>
  );
}
