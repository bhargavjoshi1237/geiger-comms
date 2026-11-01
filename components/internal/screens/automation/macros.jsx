"use client";

// Macros: saved replies (with optional actions) the team reuses. Suite list pattern over comms.macros; a row opens the editor (?macro=<id>). Personal macros only show to their owner.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Lock, Pencil, Plus, Trash2, Users, Zap } from "lucide-react";
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
} from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  ListPagination,
  usePagination,
} from "@/components/internal/shared/pagination";
import {
  DataTable,
  EmptyState,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import { Notice } from "@/components/internal/shared/notice";
import FilterDropdown from "../overview/filter_dropdown";
import { useOptionalProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  createMacro,
  listMacros,
  softDeleteMacro,
  updateMacro,
} from "@/lib/supabase/macros";
import { getUser } from "@/lib/supabase/user";
import {
  MACRO_SCOPE_FILTER_OPTIONS,
  MACRO_SCOPE_MAP,
  MANAGE_PERMISSION,
  formatDate,
  summarizeMacroActions,
} from "./constants";
import { MacroDialog } from "./macro_dialog";
import { MacroDetailScreen } from "./macro_detail";

// A team macro anyone can see; a personal one only its owner.
const isVisibleTo = (macro, userId) =>
  macro.scope === "team" || (Boolean(userId) && macro.createdBy === userId);

// Only the owner (or anyone, for an unowned macro) may make it private.
const canMakePrivate = (macro, userId) =>
  Boolean(userId) && (!macro.createdBy || macro.createdBy === userId);

// Mirrors the macros RLS: comms.settings.manage writes any macro, everyone else only their own personal ones.
const canWriteMacro = (macro, userId, canManage) =>
  canManage || (macro.scope === "personal" && Boolean(userId) && macro.createdBy === userId);

export function MacrosScreen() {
  const { projectId } = useOptionalProject() ?? {};
  const { macroId, openMacro, closeMacro } = useWorkspaceUrl();
  // Advisory: sharing, or changing a shared macro, needs comms.settings.manage; personal macros stay their owner's.
  const canManage = useCan(MANAGE_PERMISSION);

  const [macros, setMacros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listMacros({ projectId }), getUser()]).then(([rows, user]) => {
      if (!alive) return;
      setMacros(rows ?? []);
      setUserId(user?.id ?? null);
      setLoading(false);
      if (rows === null) toast.error("Couldn't load macros.");
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const visible = useMemo(
    () => macros.filter((m) => isVisibleTo(m, userId)),
    [macros, userId],
  );

  const selected = useMemo(
    () => (macroId ? visible.find((m) => m.id === macroId) || null : null),
    [macroId, visible],
  );

  const filtered = useMemo(() => {
    let rows = visible;
    if (scopeFilter !== "all") rows = rows.filter((m) => m.scope === scopeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (m) => m.name.toLowerCase().includes(q) || m.body.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [visible, scopeFilter, search]);

  const pager = usePagination(filtered, { resetKey: `${search}|${scopeFilter}` });

  const stats = useMemo(() => {
    const shared = visible.filter((m) => m.scope === "team").length;
    const mine = visible.filter((m) => m.scope === "personal").length;
    const uses = visible.reduce((sum, m) => sum + (m.usageCount || 0), 0);
    const withActions = visible.filter((m) => m.actions.length > 0).length;
    return [
      {
        label: "Macros",
        value: String(visible.length),
        footer: `${withActions} with actions`,
      },
      {
        label: "Shared with everyone",
        value: String(shared),
        footer: "Available to the whole team",
      },
      { label: "Only mine", value: String(mine), footer: "Visible to you alone" },
      {
        label: "Total uses",
        value: uses.toLocaleString("en-US"),
        footer: "Across every macro",
      },
    ];
  }, [visible]);

  async function handleCreate({ name, scope, body }) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const optimistic = {
      id,
      projectId: projectId ?? null,
      name: name.trim(),
      body,
      scope,
      actions: [],
      usageCount: 0,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    setMacros((prev) => [optimistic, ...prev]);
    const created = await createMacro(optimistic);
    if (!created) {
      setMacros((prev) => prev.filter((m) => m.id !== id));
      toast.error("Couldn't create the macro.");
      return null;
    }
    setMacros((prev) => prev.map((m) => (m.id === id ? created : m)));
    toast.success(`Created "${created.name}".`);
    openMacro(created.id);
    return created;
  }

  async function handleDuplicate(macro) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const copy = {
      ...macro,
      id,
      name: `${macro.name} (copy)`,
      usageCount: 0,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    setMacros((prev) => [copy, ...prev]);
    const created = await createMacro({
      id,
      projectId: projectId ?? null,
      name: copy.name,
      body: copy.body,
      scope: copy.scope,
      actions: copy.actions,
      createdBy: userId,
    });
    if (!created) {
      setMacros((prev) => prev.filter((m) => m.id !== id));
      toast.error("Couldn't duplicate the macro.");
      return;
    }
    setMacros((prev) => prev.map((m) => (m.id === id ? created : m)));
    toast.success(`Duplicated "${macro.name}".`);
  }

  async function handleScope(macro, scope) {
    const previous = macros;
    // Claiming an unowned macro as private makes you its owner, so it stays visible to you.
    const patch = scope === "personal" && !macro.createdBy ? { scope, createdBy: userId } : { scope };
    setMacros((prev) => prev.map((m) => (m.id === macro.id ? { ...m, ...patch } : m)));
    const saved = await updateMacro(macro.id, patch);
    if (!saved) {
      setMacros(previous);
      toast.error("Couldn't change who can use this macro.");
      return;
    }
    setMacros((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
    toast.success(scope === "team" ? "Shared with everyone" : "Now only visible to you");
  }

  // The editor lifts each save (and its rollback) back up.
  const handleUpdate = (updated) =>
    setMacros((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));

  async function handleDelete(macro) {
    setDeleteTarget(null);
    const previous = macros;
    setMacros((prev) => prev.filter((m) => m.id !== macro.id));
    if (macroId === macro.id) closeMacro();
    const ok = await softDeleteMacro(macro.id);
    if (!ok) {
      setMacros(previous);
      toast.error("Couldn't delete the macro.");
      return;
    }
    toast.success(`Deleted "${macro.name}".`);
  }

  const columns = [
    {
      key: "name",
      header: "Macro",
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <Zap className="h-4 w-4 shrink-0 text-text-tertiary" />
          <div className="min-w-0 max-w-md">
            <p className="truncate font-medium text-foreground">{row.name}</p>
            <p className="truncate text-xs text-text-secondary">
              {row.body || "No reply text"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "scope",
      header: "Availability",
      render: (row) => <StatusPill status={row.scope} map={MACRO_SCOPE_MAP} />,
    },
    {
      key: "actions-summary",
      header: "Actions",
      render: (row) => (
        <span
          className={
            row.actions.length ? "text-sm text-text-secondary" : "text-sm text-text-tertiary"
          }
        >
          {summarizeMacroActions(row.actions)}
        </span>
      ),
    },
    {
      key: "uses",
      header: "Uses",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (row) => (row.usageCount || 0).toLocaleString("en-US"),
    },
    {
      key: "updated",
      header: "Updated",
      render: (row) => (
        <span className="whitespace-nowrap text-sm text-text-secondary">
          {formatDate(row.updatedAt)}
        </span>
      ),
    },
    {
      key: "menu",
      header: "",
      align: "right",
      className: "text-right",
      render: (row) => {
        const writable = canWriteMacro(row, userId, canManage);
        return (
          <ActionMenu
            label={`Actions for ${row.name}`}
            items={[
              { icon: Pencil, label: writable ? "Edit" : "View", onSelect: () => openMacro(row.id) },
              // A copy keeps the scope, so copying a shared macro is creating one.
              { icon: Copy, label: "Duplicate", disabled: !writable, onSelect: () => void handleDuplicate(row) },
              row.scope === "personal"
                ? {
                    icon: Users,
                    label: "Share with everyone",
                    disabled: !canManage,
                    onSelect: () => void handleScope(row, "team"),
                  }
                : canMakePrivate(row, userId) && {
                    icon: Lock,
                    label: "Make private",
                    disabled: !canManage,
                    onSelect: () => void handleScope(row, "personal"),
                  },
              { separator: true },
              {
                icon: Trash2,
                label: "Delete",
                variant: "destructive",
                disabled: !writable,
                onSelect: () => setDeleteTarget(row),
              },
            ]}
          />
        );
      },
    },
  ];

  // Shared by the list and the editor's danger zone.
  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete macro</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Replies
            already sent with it stay in their conversations.
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
  );

  if (selected) {
    return (
      <>
        <MacroDetailScreen
          macro={selected}
          projectId={projectId}
          userId={userId}
          canManage={canManage}
          readOnly={!canWriteMacro(selected, userId, canManage)}
          onBack={closeMacro}
          onUpdate={handleUpdate}
          onDuplicate={(m) => void handleDuplicate(m)}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const createButton = (
    <Button
      className="bg-primary text-primary-foreground hover:bg-primary/90"
      onClick={() => setCreateOpen(true)}
    >
      <Plus className="h-4 w-4" /> New macro
    </Button>
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Macros"
        description="Saved replies your team reuses for common questions — each can also assign, tag, snooze or close the conversation."
        actions={createButton}
      />

      {!canManage && !loading ? (
        <Notice>
          You can create and change your own macros. Sharing one with everyone, or changing a shared one, needs the
          Manage settings permission.
        </Notice>
      ) : null}

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown
            value={scopeFilter}
            onValueChange={setScopeFilter}
            options={MACRO_SCOPE_FILTER_OPTIONS}
            placeholder="All macros"
            height="h-9"
          />
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search macros…"
          className="w-full sm:w-64"
        />
      </Toolbar>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
          <LogoLoading size={48} aria-label="Loading macros" />
        </div>
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(row) => row.id}
            onRowClick={(row) => openMacro(row.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Zap}
                  title={visible.length ? "No macros match" : "No macros yet"}
                  description={
                    visible.length
                      ? "Try clearing the search or the availability filter."
                      : "Save the replies your team types over and over — refunds, password resets, outage updates."
                  }
                  action={
                    visible.length ? (
                      <Button
                        variant="outline"
                        className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                        onClick={() => {
                          setSearch("");
                          setScopeFilter("all");
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
          <ListPagination {...pager} itemLabel="macros" />
        </div>
      )}

      <MacroDialog
        open={createOpen}
        canShare={canManage}
        onCancel={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />

      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default MacrosScreen;
