"use client";

// Settings → Business Hours: weekly schedules and holidays over comms.business_hours. SLA policies count only their open time,
// workflows branch on inside/outside office hours, and routing gives away teammates conversations only while their hours are open.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Copy, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import {
  ActionMenu,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LogoLoading,
  Switch,
} from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  DataTable,
  EmptyState,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import FilterDropdown from "@/components/internal/shared/filter_dropdown";
import { useOptionalProject } from "@/context/project-context";
import {
  createBusinessHours,
  listBusinessHours,
  softDeleteBusinessHours,
  updateBusinessHours,
} from "@/lib/supabase/business_hours";
import { listSlaPolicies } from "@/lib/supabase/sla_policies";
import { listGroups } from "@/lib/supabase/team";
import { getUser } from "@/lib/supabase/user";
import { ENABLED_FILTER_OPTIONS } from "../automation/constants";
import { BusinessHoursDialog } from "./business_hours_dialog";
import { HOURS_STATE_MAP, formatDateKey, hoursStateAt, summarizeWeek, toDateKey } from "./business_hours_constants";

const UPCOMING_DAYS = 90;

export function BusinessHoursScreen() {
  const { projectId } = useOptionalProject() ?? {};

  const [rows, setRows] = useState([]);
  const [teams, setTeams] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [enabledFilter, setEnabledFilter] = useState("all");
  const [editor, setEditor] = useState(null); // { hours | null, key }
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    Promise.all([
      listBusinessHours({ projectId }),
      projectId ? listGroups(projectId) : Promise.resolve([]),
      listSlaPolicies({ projectId }),
    ]).then(([hours, groups, slas]) => {
      if (!alive) return;
      setRows(hours ?? []);
      setTeams(groups ?? []);
      setPolicies(slas ?? []);
      setLoading(false);
      if (hours === null) toast.error("Couldn't load business hours.");
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  // "Open now" follows the clock.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const teamName = useMemo(() => {
    const names = new Map(teams.map((t) => [t.id, t.name || "Untitled team"]));
    return (id) => (id ? names.get(id) || "Removed team" : "Whole workspace");
  }, [teams]);

  const policiesUsing = useMemo(() => {
    const map = new Map();
    for (const p of policies) {
      if (p.businessHoursId) map.set(p.businessHoursId, [...(map.get(p.businessHoursId) || []), p]);
    }
    return map;
  }, [policies]);

  const filtered = useMemo(() => {
    let list = rows;
    if (enabledFilter === "on") list = list.filter((h) => h.enabled);
    if (enabledFilter === "off") list = list.filter((h) => !h.enabled);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((h) => `${h.name} ${h.timezone}`.toLowerCase().includes(q));
    return list;
  }, [rows, enabledFilter, search]);

  const stats = useMemo(() => {
    const enabled = rows.filter((h) => h.enabled);
    const openNow = enabled.filter((h) => hoursStateAt(h, now) === "open").length;
    const today = toDateKey(now);
    const horizon = toDateKey(new Date(now.getTime() + UPCOMING_DAYS * 86_400_000));
    const upcoming = enabled
      .flatMap((h) => h.holidays)
      .filter((d) => d.date >= today && d.date <= horizon)
      .sort((a, b) => a.date.localeCompare(b.date));
    const linked = policies.filter((p) => p.businessHoursId && rows.some((h) => h.id === p.businessHoursId));
    return [
      { label: "Schedules", value: String(rows.length), footer: `${enabled.length} enabled` },
      { label: "Open now", value: String(openNow), footer: "Each in its own timezone" },
      {
        label: "Holidays ahead",
        value: String(upcoming.length),
        footer: upcoming[0]
          ? `Next: ${upcoming[0].name || "Holiday"}, ${formatDateKey(upcoming[0].date)}`
          : `None in the next ${UPCOMING_DAYS} days`,
      },
      {
        label: "SLA policies",
        value: String(linked.length),
        footer: linked.length ? "Count only open hours" : "None linked yet",
      },
    ];
  }, [rows, policies, now]);

  const openEditor = (hours) => setEditor({ hours, key: crypto.randomUUID() });

  async function createFrom(fields, successMessage) {
    const user = await getUser();
    const optimistic = {
      ...fields,
      id: crypto.randomUUID(),
      projectId: projectId ?? null,
      createdBy: user?.id ?? null,
      createdAt: new Date().toISOString(),
    };
    setRows((prev) => [...prev, optimistic]);
    const created = await createBusinessHours(optimistic);
    if (!created) {
      setRows((prev) => prev.filter((h) => h.id !== optimistic.id));
      toast.error("Couldn't create the schedule.");
      return false;
    }
    setRows((prev) => prev.map((h) => (h.id === created.id ? created : h)));
    toast.success(successMessage);
    return true;
  }

  async function handleSave(draft) {
    const target = editor?.hours;
    if (!target) return createFrom(draft, `Created "${draft.name}".`);
    setRows((prev) => prev.map((h) => (h.id === target.id ? { ...h, ...draft } : h)));
    const saved = await updateBusinessHours(target.id, draft);
    if (!saved) {
      setRows((prev) => prev.map((h) => (h.id === target.id ? target : h)));
      toast.error("Couldn't save the schedule.");
      return false;
    }
    setRows((prev) => prev.map((h) => (h.id === saved.id ? saved : h)));
    toast.success(`Saved "${saved.name}".`);
    return true;
  }

  function handleDuplicate(hours) {
    void createFrom(
      {
        name: `${hours.name} (copy)`,
        timezone: hours.timezone,
        teamId: hours.teamId,
        schedule: hours.schedule,
        holidays: hours.holidays,
        enabled: false,
      },
      `Duplicated "${hours.name}" — the copy is disabled until you turn it on.`,
    );
  }

  async function handleToggle(hours, enabled) {
    setRows((prev) => prev.map((h) => (h.id === hours.id ? { ...h, enabled } : h)));
    const saved = await updateBusinessHours(hours.id, { enabled });
    if (!saved) {
      setRows((prev) => prev.map((h) => (h.id === hours.id ? { ...h, enabled: !enabled } : h)));
      toast.error("Couldn't update the schedule.");
      return;
    }
    toast.success(enabled ? `"${hours.name}" enabled.` : `"${hours.name}" disabled.`);
  }

  async function handleDelete(hours) {
    setDeleteTarget(null);
    const index = Math.max(rows.findIndex((h) => h.id === hours.id), 0);
    setRows((prev) => prev.filter((h) => h.id !== hours.id));
    const ok = await softDeleteBusinessHours(hours.id);
    if (!ok) {
      setRows((prev) => [...prev.slice(0, index), hours, ...prev.slice(index)]);
      toast.error("Couldn't delete the schedule.");
      return;
    }
    toast.success(`Deleted "${hours.name}".`);
  }

  const columns = [
    {
      key: "name",
      header: "Schedule",
      render: (row) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-medium text-foreground">{row.name || "Untitled hours"}</span>
          <span className="truncate text-xs text-text-secondary">{teamName(row.teamId)}</span>
        </div>
      ),
    },
    {
      key: "hours",
      header: "Hours",
      className: "text-sm text-text-secondary",
      render: (row) => summarizeWeek(row.schedule),
    },
    {
      key: "timezone",
      header: "Timezone",
      className: "whitespace-nowrap text-sm text-text-secondary",
      render: (row) => row.timezone.replaceAll("_", " "),
    },
    {
      key: "now",
      header: "Now",
      render: (row) => <StatusPill status={hoursStateAt(row, now)} map={HOURS_STATE_MAP} />,
    },
    {
      key: "holidays",
      header: "Holidays",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (row) => row.holidays.length || "—",
    },
    {
      key: "enabled",
      header: "Enabled",
      render: (row) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={row.enabled}
            onCheckedChange={(v) => void handleToggle(row, v)}
            aria-label={`${row.enabled ? "Disable" : "Enable"} ${row.name}`}
          />
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "text-right",
      render: (row) => (
        <ActionMenu
          label={`Actions for ${row.name}`}
          items={[
            { icon: Pencil, label: "Edit", onSelect: () => openEditor(row) },
            { icon: Copy, label: "Duplicate", onSelect: () => handleDuplicate(row) },
            row.enabled
              ? { icon: Pause, label: "Disable", onSelect: () => void handleToggle(row, false) }
              : { icon: Play, label: "Enable", onSelect: () => void handleToggle(row, true) },
            { separator: true },
            {
              icon: Trash2,
              label: "Delete",
              variant: "destructive",
              onSelect: () => setDeleteTarget(row),
            },
          ]}
        />
      ),
    },
  ];

  const createButton = (
    <Button
      className="bg-primary text-primary-foreground hover:bg-primary/90"
      onClick={() => openEditor(null)}
    >
      <Plus className="h-4 w-4" /> New schedule
    </Button>
  );

  const deleteUsers = deleteTarget ? policiesUsing.get(deleteTarget.id) || [] : [];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Business Hours"
        description="When your team is open. SLA targets linked to a schedule count only its open time, workflows can branch on office hours, and away teammates only get new conversations while their hours are open."
        actions={createButton}
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <FilterDropdown
          value={enabledFilter}
          onValueChange={setEnabledFilter}
          options={ENABLED_FILTER_OPTIONS}
          height="h-9"
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search schedules…"
          className="w-full sm:w-64"
        />
      </Toolbar>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
          <LogoLoading size={48} aria-label="Loading business hours" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(row) => row.id}
          onRowClick={(row) => openEditor(row)}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={CalendarClock}
                title={rows.length ? "No schedules match these filters" : "No business hours yet"}
                description={
                  rows.length
                    ? "Try clearing the search or the enabled filter."
                    : "Without business hours the workspace counts as always open, and SLA targets run on calendar time."
                }
                action={
                  rows.length ? (
                    <Button
                      variant="outline"
                      className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                      onClick={() => {
                        setSearch("");
                        setEnabledFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    createButton
                  )
                }
              />
            </div>
          }
        />
      )}

      {editor ? (
        <BusinessHoursDialog
          key={editor.key}
          open
          hours={editor.hours}
          teams={teams}
          onCancel={() => setEditor(null)}
          onSave={handleSave}
        />
      ) : null}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete business hours</DialogTitle>
            <DialogDescription>
              Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>?
              {deleteUsers.length
                ? ` ${deleteUsers.length === 1 ? "1 SLA policy uses" : `${deleteUsers.length} SLA policies use`} it and will count calendar time instead.`
                : " No SLA policy uses it."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              className="bg-red-500/90 text-white hover:bg-red-500"
              onClick={() => void handleDelete(deleteTarget)}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainScreenWrapper>
  );
}

export default BusinessHoursScreen;
