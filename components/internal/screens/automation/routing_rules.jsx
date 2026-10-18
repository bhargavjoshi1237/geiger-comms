"use client";

// Routing Rules: the ordered list comms.assign_next reads top to bottom — strategy, team or teammate, conditions, enabled. Editing happens in RoutingRuleDialog.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Route,
  Trash2,
} from "lucide-react";
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
import FilterDropdown from "../overview/filter_dropdown";
import { useOptionalProject } from "@/context/project-context";
import { cn } from "@/lib/utils";
import {
  createRoutingRule,
  listRoutingRules,
  reorderRoutingRules,
  softDeleteRoutingRule,
  updateRoutingRule,
} from "@/lib/supabase/routing_rules";
import { listTeammates } from "@/lib/supabase/teammates";
import { listGroups } from "@/lib/supabase/team";
import { listTags } from "@/lib/supabase/tags";
import { getUser } from "@/lib/supabase/user";
import { InlineNotice, OrderButtons } from "./rule_fields";
import { RoutingRuleDialog } from "./routing_rule_dialog";
import {
  AVAILABILITY_MAP,
  ENABLED_FILTER_OPTIONS,
  ROUTING_STRATEGY_FILTER_OPTIONS,
  ROUTING_STRATEGY_MAP,
  summarizeMatch,
} from "./constants";

const nextPosition = (rules) =>
  rules.reduce((max, r) => Math.max(max, r.position ?? 0), -1) + 1;

// Direct rules name one teammate (with presence); pooled rules name the team.
function AssignsTo({ rule, teammateById, teamName }) {
  if (rule.strategy === "direct") {
    const mate = teammateById.get(rule.fallbackAssigneeId);
    if (!mate) {
      return <span className="text-sm text-text-tertiary">No teammate chosen</span>;
    }
    const availability = AVAILABILITY_MAP[mate.availability || "available"];
    return (
      <span className="flex items-center gap-2 text-sm text-foreground">
        <span
          className={cn("h-1.5 w-1.5 rounded-full", availability?.dotClass)}
          title={availability?.label}
        />
        {mate.name || mate.email || "Teammate"}
      </span>
    );
  }
  return (
    <span className={cn("text-sm", rule.teamId ? "text-foreground" : "text-text-secondary")}>
      {teamName(rule.teamId)}
    </span>
  );
}

export function RoutingRulesScreen() {
  const { projectId } = useOptionalProject() ?? {};

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teammates, setTeammates] = useState([]);
  const [teams, setTeams] = useState([]);
  const [tagNames, setTagNames] = useState([]);
  const [userId, setUserId] = useState(null);
  const [search, setSearch] = useState("");
  const [strategyFilter, setStrategyFilter] = useState("all");
  const [enabledFilter, setEnabledFilter] = useState("all");
  const [dialog, setDialog] = useState({ open: false, rule: null });
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listRoutingRules({ projectId }),
      listTeammates({ projectId }),
      projectId ? listGroups(projectId) : Promise.resolve([]),
      listTags({ projectId }),
      getUser(),
    ]).then(([rows, mates, groups, tags, user]) => {
      if (!alive) return;
      setRules(rows ?? []);
      setTeammates(mates ?? []);
      setTeams(groups ?? []);
      setTagNames((tags ?? []).map((t) => t.name).filter(Boolean));
      setUserId(user?.id ?? null);
      setLoading(false);
      if (rows === null) toast.error("Couldn't load routing rules.");
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const teammateById = useMemo(
    () => new Map(teammates.map((t) => [t.id, t])),
    [teammates],
  );
  const teamName = useMemo(() => {
    const names = new Map(teams.map((g) => [g.id, g.name || "Untitled team"]));
    return (id) => (id ? names.get(id) || "Removed team" : "All available teammates");
  }, [teams]);

  // Rule order is shown from the full list, so a filtered view keeps true positions.
  const orderIndex = useMemo(
    () => new Map(rules.map((r, i) => [r.id, i])),
    [rules],
  );

  const filtersActive =
    Boolean(search.trim()) || strategyFilter !== "all" || enabledFilter !== "all";

  const filtered = useMemo(() => {
    let rows = rules;
    if (strategyFilter !== "all") rows = rows.filter((r) => r.strategy === strategyFilter);
    if (enabledFilter !== "all") {
      rows = rows.filter((r) => (enabledFilter === "on" ? r.enabled : !r.enabled));
    }
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    return rows;
  }, [rules, search, strategyFilter, enabledFilter]);

  const stats = useMemo(() => {
    const enabled = rules.filter((r) => r.enabled).length;
    const byStrategy = (s) => rules.filter((r) => r.strategy === s).length;
    const availability = (a) =>
      teammates.filter((t) => (t.availability || "available") === a).length;
    const covered = new Set(rules.map((r) => r.teamId).filter(Boolean)).size;
    return [
      {
        label: "Rules",
        value: String(rules.length),
        footer: `${enabled} enabled`,
      },
      {
        label: "Round robin",
        value: String(byStrategy("round_robin")),
        footer: `${byStrategy("load")} balanced · ${byStrategy("direct")} direct`,
      },
      {
        label: "Available now",
        value: String(availability("available")),
        footer: `${availability("away")} away · ${availability("offline")} offline`,
      },
      {
        label: "Teams covered",
        value: teams.length ? `${covered}/${teams.length}` : String(covered),
        footer: teams.length ? "Teams with their own rule" : "No teams set up yet",
      },
    ];
  }, [rules, teammates, teams]);

  async function handleSave(draft) {
    const editing = dialog.rule;
    if (editing) {
      const previous = rules;
      setRules((prev) => prev.map((r) => (r.id === editing.id ? { ...r, ...draft } : r)));
      const saved = await updateRoutingRule(editing.id, draft);
      if (!saved) {
        setRules(previous);
        toast.error("Couldn't save the rule.");
        return false;
      }
      setRules((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      toast.success(`Saved "${saved.name}".`);
      return true;
    }
    const id = crypto.randomUUID();
    const optimistic = {
      ...draft,
      id,
      projectId: projectId ?? null,
      position: nextPosition(rules),
      lastAssigneeId: null,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    };
    setRules((prev) => [...prev, optimistic]);
    const created = await createRoutingRule(optimistic);
    if (!created) {
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast.error("Couldn't create the rule.");
      return false;
    }
    setRules((prev) => prev.map((r) => (r.id === created.id ? created : r)));
    toast.success(`Created "${created.name}".`);
    return true;
  }

  async function handleToggle(rule, enabled) {
    const previous = rules;
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled } : r)));
    const saved = await updateRoutingRule(rule.id, { enabled });
    if (!saved) {
      setRules(previous);
      toast.error("Couldn't update the rule.");
      return;
    }
    toast.success(enabled ? `Enabled "${rule.name}".` : `Disabled "${rule.name}".`);
  }

  async function handleDuplicate(rule) {
    const id = crypto.randomUUID();
    const copy = {
      ...rule,
      id,
      name: `${rule.name} (copy)`,
      position: nextPosition(rules),
      lastAssigneeId: null,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    };
    setRules((prev) => [...prev, copy]);
    const created = await createRoutingRule(copy);
    if (!created) {
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast.error("Couldn't duplicate the rule.");
      return;
    }
    setRules((prev) => prev.map((r) => (r.id === created.id ? created : r)));
    toast.success(`Duplicated "${rule.name}".`);
  }

  async function handleMove(rule, dir) {
    const from = orderIndex.get(rule.id);
    const to = from + dir;
    if (from == null || to < 0 || to >= rules.length) return;
    const previous = rules;
    const next = [...rules];
    [next[from], next[to]] = [next[to], next[from]];
    setRules(next.map((r, i) => ({ ...r, position: i })));
    const ok = await reorderRoutingRules(next.map((r) => r.id));
    if (!ok) {
      setRules(previous);
      toast.error("Couldn't reorder the rules.");
    }
  }

  async function handleDelete(rule) {
    setDeleteTarget(null);
    const previous = rules;
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
    const ok = await softDeleteRoutingRule(rule.id);
    if (!ok) {
      setRules(previous);
      toast.error("Couldn't delete the rule.");
      return;
    }
    toast.success(`Deleted "${rule.name}".`);
  }

  const openCreate = () => setDialog({ open: true, rule: null });
  const openEdit = (rule) => setDialog({ open: true, rule });

  const columns = [
    {
      key: "order",
      header: "#",
      className: "w-24",
      render: (row) => {
        const index = orderIndex.get(row.id) ?? 0;
        return (
          <div className="flex items-center gap-1">
            <span className="w-5 text-right text-xs tabular-nums text-text-tertiary">
              {index + 1}
            </span>
            <OrderButtons
              label={row.name}
              onUp={() => void handleMove(row, -1)}
              onDown={() => void handleMove(row, 1)}
              disableUp={filtersActive || index === 0}
              disableDown={filtersActive || index === rules.length - 1}
            />
          </div>
        );
      },
    },
    {
      key: "rule",
      header: "Rule",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.name || "Untitled rule"}</p>
          <p className="truncate text-xs text-text-secondary">{summarizeMatch(row.match)}</p>
        </div>
      ),
    },
    {
      key: "strategy",
      header: "Strategy",
      render: (row) => <StatusPill status={row.strategy} map={ROUTING_STRATEGY_MAP} />,
    },
    {
      key: "assigns",
      header: "Assigns to",
      render: (row) => (
        <AssignsTo rule={row} teammateById={teammateById} teamName={teamName} />
      ),
    },
    {
      key: "enabled",
      header: "Enabled",
      render: (row) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={row.enabled}
            onCheckedChange={(v) => void handleToggle(row, v)}
            aria-label={row.enabled ? `Disable ${row.name}` : `Enable ${row.name}`}
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
            { icon: Pencil, label: "Edit", onSelect: () => openEdit(row) },
            { icon: Copy, label: "Duplicate", onSelect: () => void handleDuplicate(row) },
            row.enabled
              ? { icon: PowerOff, label: "Disable", onSelect: () => void handleToggle(row, false) }
              : { icon: Power, label: "Enable", onSelect: () => void handleToggle(row, true) },
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
      onClick={openCreate}
    >
      <Plus className="h-4 w-4" /> New rule
    </Button>
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Routing Rules"
        description="Decide who gets new conversations — round robin, balanced by workload, or straight to one teammate. Rules are checked top to bottom."
        actions={createButton}
      />

      <InlineNotice title="Auto-assignment isn't switched on yet">
        Rules are saved in order, but new conversations aren&apos;t assigned
        automatically yet. Once it&apos;s on, the first enabled rule that matches a
        conversation decides its assignee.
      </InlineNotice>

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown
            value={strategyFilter}
            onValueChange={setStrategyFilter}
            options={ROUTING_STRATEGY_FILTER_OPTIONS}
            placeholder="All strategies"
            height="h-9"
          />
          <FilterDropdown
            value={enabledFilter}
            onValueChange={setEnabledFilter}
            options={ENABLED_FILTER_OPTIONS}
            placeholder="Enabled & disabled"
            height="h-9"
          />
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search rules…"
          className="w-full sm:w-64"
        />
      </Toolbar>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
          <LogoLoading size={48} aria-label="Loading routing rules" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(row) => row.id}
          onRowClick={openEdit}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={Route}
                title={rules.length ? "No rules match these filters" : "No routing rules yet"}
                description={
                  rules.length
                    ? "Try clearing the search, strategy or enabled filter."
                    : "Add a rule to decide who picks up new conversations — e.g. round robin across your support team."
                }
                action={
                  rules.length ? (
                    <Button
                      variant="outline"
                      className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                      onClick={() => {
                        setSearch("");
                        setStrategyFilter("all");
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

      <RoutingRuleDialog
        open={dialog.open}
        rule={dialog.rule}
        teams={teams}
        teammates={teammates}
        tagNames={tagNames}
        onCancel={() => setDialog({ open: false, rule: null })}
        onSave={handleSave}
      />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete routing rule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">{deleteTarget?.name}</span>?
              Conversations already assigned keep their assignee.
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

export default RoutingRulesScreen;
