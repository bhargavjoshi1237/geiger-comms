"use client";

// Views — saved §3.3 conversation filters (spec §6). Follows the suite list
// pattern: header + create, KPI bar, toolbar filter/search, a DataTable of
// saved views and pagination. Selecting a row opens the view in the URL
// (?view=<id>) and swaps to the full-page editor; "Apply" is the separate
// handoff that carries the view over to All Conversations.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  ListFilter,
  Loader2,
  Pencil,
  Play,
  Plus,
  Share2,
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
  Input,
} from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  ListPagination,
  usePagination,
} from "@/components/internal/shared/pagination";
import {
  DataTable,
  EmptyState,
  Field,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useOptionalProject } from "@/context/project-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useCan } from "@/context/rbac-context";
import {
  createView,
  listViews,
  softDeleteView,
  updateView,
} from "@/lib/supabase/views";
import { getUser } from "@/lib/supabase/user";
import {
  ASSIGNEE_FILTER_OPTIONS,
  CHANNEL_FILTER_OPTIONS,
  PRIORITY_FILTER_OPTIONS,
  SORT_OPTIONS,
  STATUS_FILTER_OPTIONS,
} from "./constants";
import {
  MultiCheck,
  SHARED_FILTER_OPTIONS,
  VIEW_SHARED_MAP,
  filterCount,
  filterSummary,
  formatDate,
  sharedKey,
  sortLabel,
} from "./view_sections";
import { ViewDetailScreen } from "./view_detail";

const EMPTY_DRAFT = {
  name: "",
  status: [],
  channel: [],
  priority: [],
  assignee: "",
  unread: false,
  sort: "newest",
};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-border bg-surface-card px-3 text-sm text-foreground outline-none focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-border";

export function ViewsScreen() {
  const { projectId } = useOptionalProject() ?? {};
  const { viewId, openView, closeView, openViewInTab } = useWorkspaceUrl();
  // comms.settings.manage gates who may edit shared configuration surfaces;
  // viewing is open like the rest of the workspace by default.
  const canManage = useCan("comms.settings.manage");

  const [views, setViews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [shared, setShared] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let alive = true;
    listViews({ projectId }).then((rows) => {
      if (!alive) return;
      setViews(rows ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const selected = useMemo(
    () => (viewId ? views.find((v) => v.id === viewId) || null : null),
    [viewId, views],
  );

  const filtered = useMemo(
    () =>
      views.filter((v) => {
        if (shared !== "all" && sharedKey(v) !== shared) return false;
        if (
          search &&
          !`${v.name} ${filterSummary(v.filter)}`
            .toLowerCase()
            .includes(search.toLowerCase())
        )
          return false;
        return true;
      }),
    [views, search, shared],
  );

  const pager = usePagination(filtered, { resetKey: `${search}|${shared}` });

  const stats = useMemo(() => {
    const sharedCount = views.filter((v) => v.shared).length;
    const scoped = views.filter((v) => filterCount(v.filter) > 0).length;
    return [
      {
        label: "Views",
        value: String(views.length),
        footer: `${sharedCount} shared with the team`,
      },
      { label: "Shared", value: String(sharedCount), footer: "Visible to everyone" },
      {
        label: "Private",
        value: String(views.length - sharedCount),
        footer: "Only visible to you",
      },
      { label: "Scoped", value: String(scoped), footer: "With at least one filter" },
    ];
  }, [views]);

  function openCreate() {
    setDraft(EMPTY_DRAFT);
    setCreateOpen(true);
  }

  // The dialog is create-only — editing an existing view happens in the editor.
  async function handleCreate() {
    if (!draft.name.trim()) {
      toast.error("Give the view a name.");
      return;
    }
    const optimisticId = crypto.randomUUID();
    const user = await getUser();
    const payload = {
      id: optimisticId,
      name: draft.name.trim(),
      sort: draft.sort,
      filter: {
        status: draft.status,
        channel: draft.channel,
        priority: draft.priority,
        assignee: draft.assignee || null,
        unread: draft.unread ? true : null,
      },
      projectId,
      createdBy: user?.id ?? null,
    };
    setCreateOpen(false);
    setViews((prev) => [
      ...prev,
      { ...payload, shared: false, createdAt: new Date().toISOString() },
    ]);
    const created = await createView(payload);
    if (!created) {
      setViews((prev) => prev.filter((v) => v.id !== optimisticId));
      toast.error("Couldn't create the view.");
      return;
    }
    setViews((prev) => prev.map((v) => (v.id === created.id ? created : v)));
    toast.success("View created");
    openView(created.id);
  }

  // The editor lifts every edit back up so the list and the open row agree.
  const handleUpdate = (updated) =>
    setViews((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));

  // "Apply" is the handoff to All Conversations — distinct from opening the
  // editor, which keeps you on this tab.
  const applyView = (view) => openViewInTab(view.id, "All Conversations");

  async function handleDuplicate(view) {
    const optimisticId = crypto.randomUUID();
    const user = await getUser();
    const copy = {
      ...view,
      id: optimisticId,
      name: `${view.name} copy`,
      shared: false,
      createdAt: new Date().toISOString(),
    };
    setViews((prev) => [...prev, copy]);
    const created = await createView({
      id: optimisticId,
      name: copy.name,
      sort: view.sort,
      filter: { ...view.filter },
      projectId,
      createdBy: user?.id ?? null,
    });
    if (!created) {
      setViews((prev) => prev.filter((v) => v.id !== optimisticId));
      toast.error("Couldn't duplicate the view.");
      return;
    }
    setViews((prev) => prev.map((v) => (v.id === created.id ? created : v)));
    toast.success("View duplicated");
  }

  async function handleToggleShare(view) {
    const next = !view.shared;
    setViews((prev) =>
      prev.map((v) => (v.id === view.id ? { ...v, shared: next } : v)),
    );
    const saved = await updateView(view.id, { shared: next });
    if (!saved) {
      setViews((prev) => prev.map((v) => (v.id === view.id ? view : v)));
      toast.error("Couldn't update sharing.");
      return;
    }
    toast.success(next ? "Shared with the team" : "Sharing off");
  }

  async function handleDelete(view) {
    setDeleteTarget(null);
    const previous = views;
    setViews((prev) => prev.filter((v) => v.id !== view.id));
    if (viewId === view.id) closeView();
    const ok = await softDeleteView(view.id);
    if (!ok) {
      setViews(previous);
      toast.error("Couldn't delete the view.");
      return;
    }
    toast.success(`Deleted “${view.name}”.`);
  }

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (row) => (
        <div className="flex items-center gap-2">
          <ListFilter className="h-4 w-4 shrink-0 text-text-tertiary" />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.name}</p>
            <p className="truncate text-xs text-text-secondary">
              {filterSummary(row.filter)}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "shared",
      header: "Sharing",
      render: (row) => <StatusPill status={sharedKey(row)} map={VIEW_SHARED_MAP} />,
    },
    {
      key: "sort",
      header: "Sort",
      render: (row) => (
        <span className="text-sm text-text-secondary">{sortLabel(row.sort)}</span>
      ),
    },
    {
      key: "created",
      header: "Created",
      render: (row) => (
        <span className="text-sm text-text-secondary">
          {formatDate(row.createdAt) || "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-12 text-right",
      render: (row) => (
        <ActionMenu
          label={`Actions for ${row.name}`}
          items={[
            { icon: Pencil, label: "Edit", onSelect: () => openView(row.id) },
            { icon: Play, label: "Apply", onSelect: () => applyView(row) },
            { icon: Copy, label: "Duplicate", onSelect: () => handleDuplicate(row) },
            {
              icon: Share2,
              label: row.shared ? "Stop sharing" : "Share with team",
              onSelect: () => handleToggleShare(row),
            },
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

  // Confirmation lives outside the list/editor branch so the editor's danger
  // zone gets the same dialog the row action does.
  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete view</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{deleteTarget?.name}</span>?
            Conversations are untouched — only the saved filter goes away.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            className="bg-red-500/90 text-white hover:bg-red-500"
            onClick={() => handleDelete(deleteTarget)}
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
        <ViewDetailScreen
          view={selected}
          onBack={closeView}
          onUpdate={handleUpdate}
          onDelete={setDeleteTarget}
          onApply={applyView}
        />
        {deleteDialog}
      </>
    );
  }

  const createButton = canManage ? (
    <Button
      className="bg-primary text-primary-foreground hover:bg-primary/90"
      onClick={openCreate}
    >
      <Plus className="h-4 w-4" /> New view
    </Button>
  ) : null;

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Views"
        description="Saved filters for the conversations list. Apply one from here or share it with the team."
        actions={createButton}
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown
            value={shared}
            onValueChange={setShared}
            options={SHARED_FILTER_OPTIONS}
            height="h-9"
          />
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search views…" />
      </Toolbar>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-subtle px-6 py-16 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading views…
        </div>
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(row) => row.id}
            onRowClick={(row) => openView(row.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={ListFilter}
                  title={views.length ? "No views match your filters" : "No views yet"}
                  description={
                    views.length
                      ? "Try clearing the search or the sharing filter."
                      : "Create a view to save a conversation filter — e.g. “Urgent & unassigned”."
                  }
                  action={
                    views.length ? (
                      <Button
                        variant="outline"
                        className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                        onClick={() => {
                          setSearch("");
                          setShared("all");
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
          <ListPagination {...pager} itemLabel="views" />
        </div>
      )}

      {/* Create-only: an existing view is edited on its own page. */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New view</DialogTitle>
            <DialogDescription>
              A view is a saved conversation filter. It means the right thing for
              each person when it uses “assigned to me”.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Name" htmlFor="view-draft-name">
              <Input
                id="view-draft-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Urgent & unassigned"
              />
            </Field>

            <MultiCheck
              label="Status"
              options={STATUS_FILTER_OPTIONS}
              selected={draft.status}
              onChange={(status) => setDraft((d) => ({ ...d, status }))}
            />
            <MultiCheck
              label="Channel"
              options={CHANNEL_FILTER_OPTIONS}
              selected={draft.channel}
              onChange={(channel) => setDraft((d) => ({ ...d, channel }))}
            />
            <MultiCheck
              label="Priority"
              options={PRIORITY_FILTER_OPTIONS}
              selected={draft.priority}
              onChange={(priority) => setDraft((d) => ({ ...d, priority }))}
            />

            <Field label="Assignee" htmlFor="view-draft-assignee">
              <select
                id="view-draft-assignee"
                value={draft.assignee}
                onChange={(e) => setDraft((d) => ({ ...d, assignee: e.target.value }))}
                className={SELECT_CLASS}
              >
                {ASSIGNEE_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={draft.unread}
                onChange={(e) => setDraft((d) => ({ ...d, unread: e.target.checked }))}
                className="h-4 w-4 rounded border-border accent-[var(--primary)]"
              />
              Unread only
            </label>

            <Field label="Sort" htmlFor="view-draft-sort">
              <select
                id="view-draft-sort"
                value={draft.sort}
                onChange={(e) => setDraft((d) => ({ ...d, sort: e.target.value }))}
                className={SELECT_CLASS}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => void handleCreate()}
              disabled={!draft.name.trim()}
            >
              Create view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default ViewsScreen;
