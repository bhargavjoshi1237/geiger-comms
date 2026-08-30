"use client";

// Views — saved §3.3 filters over an ordinary MainScreenWrapper frame
// (spec §6): ScreenHeader → StatsBar-less DataTable with a create/edit dialog
// that builds the filter object. Row click applies the view and navigates to
// All Conversations with ?view=<id>.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from "@geiger/ui";
import { Copy, ListFilter, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  DataTable,
  EmptyState,
  Field,
  ScreenHeader,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import { useOptionalProject } from "@/context/project-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useCan } from "@/context/rbac-context";
import {
  createView,
  listViews,
  softDeleteView,
  updateView,
} from "@/lib/supabase/views";
import {
  ASSIGNEE_FILTER_OPTIONS,
  CHANNEL_FILTER_OPTIONS,
  PRIORITY_FILTER_OPTIONS,
  SORT_OPTIONS,
  STATUS_FILTER_OPTIONS,
} from "./constants";

const EMPTY_DRAFT = {
  name: "",
  status: [],
  channel: [],
  priority: [],
  assignee: "",
  unread: false,
  sort: "newest",
};

function filterSummary(filter = {}) {
  const parts = [];
  if (filter.status?.length) parts.push(`Status: ${filter.status.join(", ")}`);
  if (filter.channel?.length) parts.push(`Channel: ${filter.channel.join(", ")}`);
  if (filter.priority?.length) parts.push(`Priority: ${filter.priority.join(", ")}`);
  if (filter.assignee === "me") parts.push("Assigned to me");
  if (filter.assignee === "unassigned") parts.push("Unassigned");
  if (filter.unread) parts.push("Unread only");
  return parts.length ? parts.join(" · ") : "All conversations";
}

export function ViewsScreen() {
  const { projectId } = useOptionalProject() ?? {};
  const { openViewInTab } = useWorkspaceUrl();
  // comms.settings.manage gates who may edit shared configuration surfaces;
  // viewing is open like the rest of the workspace by default.
  const canManage = useCan("comms.settings.manage");

  const [views, setViews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | "new" | view row
  const [draft, setDraft] = useState(EMPTY_DRAFT);

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

  function openCreate() {
    setDraft(EMPTY_DRAFT);
    setEditing("new");
  }

  function openEdit(view) {
    setDraft({
      name: view.name,
      status: view.filter.status ?? [],
      channel: view.filter.channel ?? [],
      priority: view.filter.priority ?? [],
      assignee: view.filter.assignee ?? "",
      unread: Boolean(view.filter.unread),
      sort: view.sort ?? "newest",
    });
    setEditing(view);
  }

  async function save() {
    if (!draft.name.trim()) {
      toast.error("Give the view a name.");
      return;
    }
    const payload = {
      name: draft.name.trim(),
      sort: draft.sort,
      filter: {
        status: draft.status,
        channel: draft.channel,
        priority: draft.priority,
        assignee: draft.assignee || null,
        unread: draft.unread ? true : null,
      },
    };
    if (editing === "new") {
      const created = await createView({ ...payload, projectId });
      if (!created) {
        toast.error("Couldn't create the view.");
        return;
      }
      setViews((prev) => [...prev, created]);
      toast.success("View created");
    } else {
      const saved = await updateView(editing.id, payload);
      if (!saved) {
        toast.error("Couldn't save the view.");
        return;
      }
      setViews((prev) => prev.map((v) => (v.id === saved.id ? saved : v)));
      toast.success("View saved");
    }
    setEditing(null);
  }

  function applyView(view) {
    // One navigation: All Conversations with ?view=<id> applied (spec §6).
    openViewInTab(view.id, "All Conversations");
  }

  async function duplicate(view) {
    const copy = await createView({
      name: `${view.name} copy`,
      sort: view.sort,
      filter: { ...view.filter },
      projectId,
    });
    if (!copy) {
      toast.error("Couldn't duplicate the view.");
      return;
    }
    setViews((prev) => [...prev, copy]);
    toast.success("View duplicated");
  }

  async function toggleShare(view) {
    const previous = views;
    setViews((prev) => prev.map((v) => (v.id === view.id ? { ...v, shared: !v.shared } : v)));
    const saved = await updateView(view.id, { shared: !view.shared });
    if (!saved) {
      setViews(previous);
      toast.error("Couldn't update sharing.");
      return;
    }
    toast.success(saved.shared ? "Shared with the team" : "Sharing off");
  }

  async function remove(view) {
    const previous = views;
    setViews((prev) => prev.filter((v) => v.id !== view.id));
    const ok = await softDeleteView(view.id);
    if (!ok) {
      setViews(previous);
      toast.error("Couldn't delete the view.");
      return;
    }
    toast.success("View deleted");
  }

  // Plain array (not memoized): the row-action closures read the freshest
  // state through functional updates either way, and the table is small.
  const columns = [
    {
      key: "name",
      header: "Name",
      render: (row) => (
        <div className="flex items-center gap-2">
          <ListFilter className="h-4 w-4 text-text-tertiary" />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.name}</p>
            <p className="truncate text-xs text-text-secondary">{filterSummary(row.filter)}</p>
          </div>
        </div>
      ),
    },
    {
      key: "shared",
      header: "Shared",
      render: (row) =>
        row.shared ? (
          <StatusPill
            status="Shared"
            map={{ Shared: { label: "Shared", variant: "success", dotClass: "bg-emerald-400" } }}
          />
        ) : (
          <span className="text-xs text-text-tertiary">Private</span>
        ),
    },
    {
      key: "sort",
      header: "Sort",
      render: (row) => (
        <span className="text-sm text-text-secondary">
          {SORT_OPTIONS.find((o) => o.value === row.sort)?.label ?? row.sort}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-12",
      render: (row) => (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`${row.name} actions`}>
                <Pencil />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-border bg-surface-subtle">
              <DropdownMenuItem className="text-xs" onClick={() => openEdit(row)}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={() => void duplicate(row)}>
                <Copy /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={() => void toggleShare(row)}>
                <Share2 /> {row.shared ? "Stop sharing" : "Share with team"}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem variant="destructive" className="text-xs" onClick={() => void remove(row)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Views"
        description="Saved filters for the conversations list. Apply one from here or share it with the team."
        actions={
          canManage ? (
            <Button type="button" size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="size-3.5" /> New view
            </Button>
          ) : null
        }
      />

      {loading ? (
        <div className="space-y-2 rounded-xl border border-border bg-surface-subtle p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 rounded-md border border-border bg-surface-card" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={views}
          getRowKey={(row) => row.id}
          onRowClick={applyView}
          empty={
            <EmptyState
              icon={ListFilter}
              title="No views yet"
              description="Create a view to save a conversation filter — e.g. “Urgent & unassigned”."
              action={
                canManage ? (
                  <Button type="button" size="sm" onClick={openCreate}>
                    New view
                  </Button>
                ) : null
              }
              className="rounded-xl border border-border bg-surface-subtle"
            />
          }
        />
      )}

      {/* Edit / create dialog */}
      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "New view" : "Edit view"}</DialogTitle>
            <DialogDescription>
              A view is a saved conversation filter. It means the right thing for
              each person when it uses “assigned to me”.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Name" htmlFor="view-name">
              <Input
                id="view-name"
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

            <Field label="Assignee" htmlFor="view-assignee">
              <select
                id="view-assignee"
                value={draft.assignee}
                onChange={(e) => setDraft((d) => ({ ...d, assignee: e.target.value }))}
                className="h-9 w-full rounded-md border border-border bg-surface-card px-3 text-sm text-foreground outline-none focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-border"
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

            <Field label="Sort" htmlFor="view-sort">
              <select
                id="view-sort"
                value={draft.sort}
                onChange={(e) => setDraft((d) => ({ ...d, sort: e.target.value }))}
                className="h-9 w-full rounded-md border border-border bg-surface-card px-3 text-sm text-foreground outline-none focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-border"
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
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void save()} disabled={!draft.name.trim()}>
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainScreenWrapper>
  );
}

// Checkbox group used inside the view builder.
function MultiCheck({ label, options, selected, onChange }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                onChange(
                  active
                    ? selected.filter((v) => v !== option.value)
                    : [...selected, option.value],
                )
              }
              className={
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors " +
                (active
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border bg-surface-card text-text-secondary hover:text-foreground")
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default ViewsScreen;
