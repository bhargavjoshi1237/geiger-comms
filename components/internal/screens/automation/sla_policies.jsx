"use client";

// SLA Policies: ordered response + resolution targets over comms.sla_policies. The conversations_apply_sla trigger applies the first enabled match by position, so order matters and is editable here; live counts come from open conversations' sla_state.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Pause, Pencil, Play, Plus, Timer, Trash2 } from "lucide-react";
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
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import FilterDropdown from "../overview/filter_dropdown";
import { useOptionalProject } from "@/context/project-context";
import {
  createSlaPolicy,
  listSlaPolicies,
  listSlaUsage,
  reorderSlaPolicies,
  softDeleteSlaPolicy,
  updateSlaPolicy,
} from "@/lib/supabase/sla_policies";
import { listBusinessHours } from "@/lib/supabase/business_hours";
import { getUser } from "@/lib/supabase/user";
import { ENABLED_FILTER_OPTIONS, formatMinutes, summarizeMatch } from "./constants";
import { OrderButtons } from "./rule_fields";
import { SlaPolicyDialog } from "./sla_policy_dialog";

const EMPTY_USAGE = {
  totals: { on_track: 0, approaching: 0, breached: 0, paused: 0 },
  byPolicy: {},
};

// `a` catches everything `b` would: each of a's lists is empty ("any") or a superset of b's non-empty list.
function covers(a, b) {
  const within = (outer = [], inner = []) =>
    outer.length === 0 || (inner.length > 0 && inner.every((v) => outer.includes(v)));
  return (
    within(a.scope?.channels, b.scope?.channels) &&
    within(a.scope?.priorities, b.scope?.priorities)
  );
}

// The earlier enabled policy that makes an enabled policy unreachable (first match wins), if any.
function shadowsOf(policies) {
  const out = new Map();
  policies.forEach((p, i) => {
    if (!p.enabled) return;
    const blocker = policies.slice(0, i).find((q) => q.enabled && covers(q, p));
    if (blocker) out.set(p.id, blocker);
  });
  return out;
}

const nextPosition = (rows) =>
  rows.reduce((max, p) => Math.max(max, p.position ?? 0), -1) + 1;

export function SLAPoliciesScreen() {
  const { projectId } = useOptionalProject() ?? {};

  const [policies, setPolicies] = useState([]);
  const [usage, setUsage] = useState(EMPTY_USAGE);
  const [hours, setHours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [enabledFilter, setEnabledFilter] = useState("all");
  const [editor, setEditor] = useState(null); // { policy | null, key }
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listSlaPolicies({ projectId }),
      listSlaUsage({ projectId }),
      listBusinessHours({ projectId }),
    ]).then(([rows, live, bh]) => {
      if (!alive) return;
      setPolicies(rows ?? []);
      setUsage(live ?? EMPTY_USAGE);
      setHours(bh ?? []);
      setLoading(false);
      if (rows === null) toast.error("Couldn't load SLA policies.");
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const hoursName = useMemo(() => {
    const names = new Map(hours.map((h) => [h.id, h.name || "Untitled hours"]));
    return (id) => (id ? names.get(id) || "Unknown hours" : "24/7");
  }, [hours]);

  const shadows = useMemo(() => shadowsOf(policies), [policies]);
  const rankOf = useMemo(
    () => new Map(policies.map((p, i) => [p.id, i + 1])),
    [policies],
  );

  const filtersActive = Boolean(search.trim()) || enabledFilter !== "all";

  const filtered = useMemo(() => {
    let rows = policies;
    if (enabledFilter === "on") rows = rows.filter((p) => p.enabled);
    if (enabledFilter === "off") rows = rows.filter((p) => !p.enabled);
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((p) => p.name.toLowerCase().includes(q));
    return rows;
  }, [policies, enabledFilter, search]);

  const stats = useMemo(() => {
    const enabled = policies.filter((p) => p.enabled).length;
    const { on_track, approaching, breached } = usage.totals;
    return [
      {
        label: "Active policies",
        value: String(enabled),
        footer: `of ${policies.length} ${policies.length === 1 ? "policy" : "policies"}`,
      },
      { label: "On track", value: String(on_track), footer: "Open conversations within target" },
      { label: "Approaching", value: String(approaching), footer: "Open, under 25% of the window left" },
      { label: "Breached", value: String(breached), footer: "Open conversations past target" },
    ];
  }, [policies, usage]);

  const openEditor = (policy) => setEditor({ policy, key: crypto.randomUUID() });

  async function handleSave(draft) {
    const target = editor?.policy;
    if (target) {
      const previous = policies;
      setPolicies((prev) => prev.map((p) => (p.id === target.id ? { ...p, ...draft } : p)));
      const saved = await updateSlaPolicy(target.id, draft);
      if (!saved) {
        setPolicies(previous);
        toast.error("Couldn't save the policy.");
        return false;
      }
      setPolicies((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      toast.success(`Saved "${saved.name}".`);
      return true;
    }
    return createFrom(draft, `Created "${draft.name}".`);
  }

  async function createFrom(fields, successMessage) {
    const user = await getUser();
    const optimistic = {
      ...fields,
      id: crypto.randomUUID(),
      projectId: projectId ?? null,
      position: nextPosition(policies),
      createdBy: user?.id ?? null,
      createdAt: new Date().toISOString(),
    };
    setPolicies((prev) => [...prev, optimistic]);
    const created = await createSlaPolicy(optimistic);
    if (!created) {
      setPolicies((prev) => prev.filter((p) => p.id !== optimistic.id));
      toast.error("Couldn't create the policy.");
      return false;
    }
    setPolicies((prev) => prev.map((p) => (p.id === created.id ? created : p)));
    toast.success(successMessage);
    return true;
  }

  function handleDuplicate(policy) {
    void createFrom(
      {
        name: `${policy.name} (copy)`,
        scope: policy.scope,
        firstResponseMins: policy.firstResponseMins,
        nextResponseMins: policy.nextResponseMins,
        resolutionMins: policy.resolutionMins,
        businessHoursId: policy.businessHoursId,
        enabled: false,
      },
      `Duplicated "${policy.name}" — the copy is disabled until you turn it on.`,
    );
  }

  async function handleToggle(policy, enabled) {
    setPolicies((prev) => prev.map((p) => (p.id === policy.id ? { ...p, enabled } : p)));
    const saved = await updateSlaPolicy(policy.id, { enabled });
    if (!saved) {
      setPolicies((prev) =>
        prev.map((p) => (p.id === policy.id ? { ...p, enabled: !enabled } : p)),
      );
      toast.error("Couldn't update the policy.");
      return;
    }
    toast.success(enabled ? `"${policy.name}" enabled.` : `"${policy.name}" disabled.`);
  }

  async function handleMove(policy, dir) {
    const from = policies.findIndex((p) => p.id === policy.id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= policies.length) return;
    const previous = policies;
    const next = [...policies];
    [next[from], next[to]] = [next[to], next[from]];
    setPolicies(next.map((p, i) => ({ ...p, position: i })));
    const ok = await reorderSlaPolicies(next.map((p) => p.id));
    if (!ok) {
      setPolicies(previous);
      toast.error("Couldn't reorder the policies.");
    }
  }

  async function handleDelete(policy) {
    setDeleteTarget(null);
    const previous = policies;
    setPolicies((prev) => prev.filter((p) => p.id !== policy.id));
    const ok = await softDeleteSlaPolicy(policy.id);
    if (!ok) {
      setPolicies(previous);
      toast.error("Couldn't delete the policy.");
      return;
    }
    toast.success(`Deleted "${policy.name}".`);
  }

  const columns = [
    {
      key: "order",
      header: "#",
      headClassName: "w-24",
      className: "w-24",
      render: (row) => {
        const rank = rankOf.get(row.id) ?? 0;
        return (
          <div className="flex items-center gap-1.5">
            <span className="w-5 text-right text-sm tabular-nums text-text-tertiary">{rank}</span>
            {filtersActive ? null : (
              <OrderButtons
                label={row.name}
                onUp={() => void handleMove(row, -1)}
                onDown={() => void handleMove(row, 1)}
                disableUp={rank <= 1}
                disableDown={rank >= policies.length}
              />
            )}
          </div>
        );
      },
    },
    {
      key: "name",
      header: "Policy",
      render: (row) => {
        const blocker = shadows.get(row.id);
        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-medium text-foreground">{row.name || "Untitled policy"}</span>
            <span className="truncate text-xs text-text-secondary">{summarizeMatch(row.scope)}</span>
            {blocker ? (
              <span className="truncate text-xs text-amber-400">
                Never applies — &ldquo;{blocker.name}&rdquo; above matches first
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "first",
      header: "First response",
      className: "tabular-nums text-foreground",
      render: (row) => formatMinutes(row.firstResponseMins),
    },
    {
      key: "next",
      header: "Next response",
      className: "tabular-nums text-text-secondary",
      render: (row) => formatMinutes(row.nextResponseMins),
    },
    {
      key: "resolution",
      header: "Resolution",
      className: "tabular-nums text-foreground",
      render: (row) => formatMinutes(row.resolutionMins),
    },
    {
      key: "hours",
      header: "Hours",
      className: "text-text-secondary",
      render: (row) => hoursName(row.businessHoursId),
    },
    {
      key: "live",
      header: "Live",
      render: (row) => {
        const live = usage.byPolicy[row.id];
        if (!live?.open) return <span className="text-text-tertiary">—</span>;
        return (
          <span className="whitespace-nowrap text-sm text-text-secondary">
            {live.open} open
            {live.breached ? (
              <span className="text-red-400"> · {live.breached} breached</span>
            ) : null}
          </span>
        );
      },
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
      <Plus className="h-4 w-4" /> New policy
    </Button>
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="SLA Policies"
        description="Response and resolution targets for your conversations. Policies are checked top to bottom; the first one that matches a conversation's channel and priority applies."
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
          placeholder="Search policies…"
          className="w-full sm:w-64"
        />
      </Toolbar>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
          <LogoLoading size={48} aria-label="Loading SLA policies" />
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
                icon={Timer}
                title={policies.length ? "No policies match these filters" : "No SLA policies yet"}
                description={
                  policies.length
                    ? "Try clearing the search or the enabled filter."
                    : "Set first response and resolution targets — e.g. reply to urgent chats within 15 minutes."
                }
                action={
                  policies.length ? (
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
        <SlaPolicyDialog
          key={editor.key}
          open
          policy={editor.policy}
          businessHours={hours}
          onCancel={() => setEditor(null)}
          onSave={handleSave}
        />
      ) : null}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete SLA policy</DialogTitle>
            <DialogDescription>
              Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>?
              Conversations already on its clock keep their due times; new ones fall through to the
              next matching policy.
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

export default SLAPoliciesScreen;
