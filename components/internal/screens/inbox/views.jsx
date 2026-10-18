"use client";

// Views (inbox spec §6): saved §3.3 conversation filters. Row click applies the view on All Conversations (?view=<id>); "Edit" in the row menu opens the editor here.

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
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
  isViewVisible,
  listViews,
  softDeleteView,
  updateView,
} from "@/lib/supabase/views";
import { countConversations } from "@/lib/supabase/comms";
import { getCurrentTeammate, listTeammates } from "@/lib/supabase/teammates";
import { listTags } from "@/lib/supabase/tags";
import { listChannels } from "@/lib/supabase/channels";
import { getUser } from "@/lib/supabase/user";
import {
  EMPTY_VIEW_FILTER,
  FilterBuilder,
  SHARED_FILTER_OPTIONS,
  SortSelect,
  VIEW_SHARED_MAP,
  cleanFilter,
  filterCount,
  filterSummary,
  ownerLabel,
  sharedKey,
} from "./view_sections";
import { ViewDetailScreen } from "./view_detail";

const EMPTY_DRAFT = { name: "", filter: EMPTY_VIEW_FILTER, sort: "newest" };
const EMPTY_LOOKUPS = { teammates: [], tags: [], channels: [] };
const COUNT_DEBOUNCE_MS = 400;

// Counts are cached per (view, filter, teammate) so an edited filter recounts and an unchanged one doesn't.
const countKey = (view, meId) =>
  `${view.id}|${JSON.stringify(cleanFilter(view.filter))}|${meId ?? ""}`;

// A view's live match count via comms.list_conversations' predicate; null when unknown.
async function countViewConversations(view, { projectId, teammateId }) {
  try {
    const n = await countConversations(
      { ...cleanFilter(view.filter), teammateId },
      { projectId },
    );
    return typeof n === "number" ? n : null;
  } catch (e) {
    console.error("[views.count]", e);
    return null;
  }
}

export function ViewsScreen() {
  const { projectId } = useOptionalProject() ?? {};
  const { viewId, openView, closeView, openViewInTab } = useWorkspaceUrl();
  // Advisory: managers may edit or delete the team's shared views; owners always manage their own.
  const canManage = useCan("comms.settings.manage");

  const [views, setViews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [userId, setUserId] = useState(null);
  const [lookups, setLookups] = useState(EMPTY_LOOKUPS);
  const [counts, setCounts] = useState({});
  const [search, setSearch] = useState("");
  const [shared, setShared] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const meId = me?.id ?? null;

  useEffect(() => {
    let alive = true;
    Promise.all([getCurrentTeammate({ projectId }), getUser()]).then(
      async ([current, user]) => {
        const [rows, teammates, tags, channels] = await Promise.all([
          listViews({ projectId, teammateId: current?.id, userId: user?.id }),
          listTeammates({ projectId }),
          listTags({ projectId }),
          listChannels({ projectId }),
        ]);
        if (!alive) return;
        setMe(current ?? null);
        setUserId(user?.id ?? null);
        setViews(rows ?? []);
        setLookups({
          teammates: teammates ?? [],
          tags: tags ?? [],
          channels: channels ?? [],
        });
        setLoading(false);
        if (rows === null) toast.error("Couldn't load views.");
      },
    );
    return () => {
      alive = false;
    };
  }, [projectId]);

  const summaryLookups = useMemo(() => ({ ...lookups, meId }), [lookups, meId]);

  // listViews already scopes visibility; this drops a view the moment it stops being visible (e.g. a manager un-shares someone else's).
  const visibleViews = useMemo(
    () => views.filter((v) => isViewVisible(v, { teammateId: meId, userId })),
    [views, meId, userId],
  );

  const canEdit = useCallback(
    (view) => {
      if (view.ownerId) return view.ownerId === meId || canManage;
      return canManage || (Boolean(userId) && view.createdBy === userId);
    },
    [meId, userId, canManage],
  );

  const selected = useMemo(
    () =>
      viewId
        ? visibleViews.find((v) => v.id === viewId && canEdit(v)) || null
        : null,
    [viewId, visibleViews, canEdit],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleViews.filter((v) => {
      if (shared === "mine" && !(meId && v.ownerId === meId)) return false;
      if ((shared === "shared" || shared === "private") && sharedKey(v) !== shared) {
        return false;
      }
      if (
        q &&
        !`${v.name} ${filterSummary(v.filter, summaryLookups)} ${ownerLabel(v, summaryLookups)}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [visibleViews, search, shared, meId, summaryLookups]);

  const pager = usePagination(filtered, { resetKey: `${search}|${shared}` });

  // ---- per-view conversation counts (only the rows on screen, debounced so editor typing recounts once) ----
  const missingCounts = useMemo(
    () =>
      (selected ? [selected] : pager.pageItems).filter(
        (v) => !(countKey(v, meId) in counts),
      ),
    [selected, pager.pageItems, counts, meId],
  );

  useEffect(() => {
    if (loading || missingCounts.length === 0) return;
    let alive = true;
    const timer = setTimeout(() => {
      Promise.all(
        missingCounts.map((v) =>
          countViewConversations(v, { projectId, teammateId: meId }).then((n) => [
            countKey(v, meId),
            n,
          ]),
        ),
      ).then((entries) => {
        if (alive) setCounts((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      });
    }, COUNT_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [missingCounts, loading, projectId, meId]);

  const countOf = (view) => counts[countKey(view, meId)];

  const stats = useMemo(() => {
    const sharedCount = visibleViews.filter((v) => v.shared).length;
    const scoped = visibleViews.filter((v) => filterCount(v.filter) > 0).length;
    return [
      {
        label: "Views",
        value: String(visibleViews.length),
        footer: `${sharedCount} shared with the team`,
      },
      { label: "Shared", value: String(sharedCount), footer: "Visible to everyone" },
      {
        label: "Private",
        value: String(visibleViews.length - sharedCount),
        footer: "Only visible to you",
      },
      { label: "Scoped", value: String(scoped), footer: "With at least one filter" },
    ];
  }, [visibleViews]);

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
    if (!me) {
      toast.error("Sign in to save views.");
      return;
    }
    const optimisticId = crypto.randomUUID();
    const payload = {
      id: optimisticId,
      name: draft.name.trim(),
      sort: draft.sort,
      filter: cleanFilter(draft.filter),
      ownerId: me.id,
      shared: false,
      projectId,
      createdBy: userId,
    };
    setCreateOpen(false);
    setViews((prev) => [
      ...prev,
      { ...payload, createdAt: new Date().toISOString() },
    ]);
    const created = await createView(payload);
    if (!created) {
      setViews((prev) => prev.filter((v) => v.id !== optimisticId));
      toast.error("Couldn't create the view.");
      return;
    }
    setViews((prev) => prev.map((v) => (v.id === created.id ? created : v)));
    toast.success("View created", {
      action: { label: "Apply", onClick: () => applyView(created) },
    });
  }

  // The editor lifts every edit back up so the list and the open row agree.
  const handleUpdate = (updated) =>
    setViews((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));

  const applyView = (view) => openViewInTab(view.id, "All Conversations");

  async function handleDuplicate(view) {
    if (!me) {
      toast.error("Sign in to save views.");
      return;
    }
    const optimisticId = crypto.randomUUID();
    const copy = {
      id: optimisticId,
      name: `${view.name} copy`,
      sort: view.sort,
      filter: cleanFilter(view.filter),
      ownerId: me.id,
      shared: false,
      projectId,
      createdBy: userId,
    };
    setViews((prev) => [...prev, { ...copy, createdAt: new Date().toISOString() }]);
    const created = await createView(copy);
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
              {filterSummary(row.filter, summaryLookups)}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      render: (row) => (
        <span className="text-sm text-text-secondary">
          {ownerLabel(row, summaryLookups)}
        </span>
      ),
    },
    {
      key: "shared",
      header: "Sharing",
      render: (row) => <StatusPill status={sharedKey(row)} map={VIEW_SHARED_MAP} />,
    },
    {
      key: "count",
      header: "Conversations",
      align: "right",
      render: (row) => {
        const n = countOf(row);
        if (n === undefined) {
          return (
            <Loader2
              className="ml-auto h-3.5 w-3.5 animate-spin text-text-tertiary"
              aria-label="Counting"
            />
          );
        }
        return (
          <span className="text-sm tabular-nums text-foreground">
            {n === null ? "—" : n.toLocaleString()}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-12 text-right",
      render: (row) => {
        const editable = canEdit(row);
        return (
          <ActionMenu
            label={`Actions for ${row.name}`}
            items={[
              { icon: Play, label: "Apply", onSelect: () => applyView(row) },
              editable && { icon: Pencil, label: "Edit", onSelect: () => openView(row.id) },
              me && { icon: Copy, label: "Duplicate", onSelect: () => handleDuplicate(row) },
              editable && {
                icon: Share2,
                label: row.shared ? "Stop sharing" : "Share with team",
                onSelect: () => handleToggleShare(row),
              },
              { separator: true },
              editable && {
                icon: Trash2,
                label: "Delete",
                variant: "destructive",
                onSelect: () => setDeleteTarget(row),
              },
            ]}
          />
        );
      },
    },
  ];

  // Confirmation lives outside the list/editor branch so the editor's danger zone shares it.
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
          lookups={summaryLookups}
          count={countOf(selected)}
          onBack={closeView}
          onUpdate={handleUpdate}
          onDelete={setDeleteTarget}
          onApply={applyView}
        />
        {deleteDialog}
      </>
    );
  }

  const createButton = (
    <Button
      className="bg-primary text-primary-foreground hover:bg-primary/90"
      onClick={openCreate}
    >
      <Plus className="h-4 w-4" /> New view
    </Button>
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Views"
        description="Saved conversation filters. Click a view to open it in All Conversations, or share it with the team."
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
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
          <LogoLoading size={48} aria-label="Loading views" />
        </div>
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(row) => row.id}
            onRowClick={applyView}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={ListFilter}
                  title={visibleViews.length ? "No views match your filters" : "No views yet"}
                  description={
                    visibleViews.length
                      ? "Try clearing the search or the owner/sharing filter."
                      : "Create a view to save a conversation filter — e.g. “Urgent & unassigned”."
                  }
                  action={
                    visibleViews.length ? (
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
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>New view</DialogTitle>
            <DialogDescription>
              A saved conversation filter, private to you until you share it. “Assigned to me” means the right thing for each teammate.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5">
            <Field label="Name" htmlFor="view-draft-name">
              <Input
                id="view-draft-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Urgent & unassigned"
              />
            </Field>

            <FilterBuilder
              filter={draft.filter}
              onChange={(filter) => setDraft((d) => ({ ...d, filter }))}
              lookups={lookups}
              idPrefix="view-draft"
            />

            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={Boolean(draft.filter.unread)}
                onCheckedChange={(next) =>
                  setDraft((d) => ({
                    ...d,
                    filter: { ...d.filter, unread: next === true ? true : null },
                  }))
                }
              />
              Unread only
            </label>

            <Field label="Sort" htmlFor="view-draft-sort">
              <SortSelect
                id="view-draft-sort"
                value={draft.sort}
                onChange={(sort) => setDraft((d) => ({ ...d, sort }))}
              />
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
