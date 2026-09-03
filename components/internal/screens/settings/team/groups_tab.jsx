"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";

import {
  DataTable,
  EmptyState,
  Field,
  SearchInput,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import {
  ListPagination,
  usePagination,
} from "@/components/internal/shared/pagination";
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
import { formatDate } from "../constants";

// Rename / re-describe an existing group. The shared GroupDialog stays
// create-only, so editing gets this small local form instead.
function EditGroupDialog({ group, onOpenChange, onSubmit }) {
  const [name, setName] = useState(group?.name || "");
  const [description, setDescription] = useState(group?.description || "");

  return (
    <Dialog open={!!group} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit group</DialogTitle>
          <DialogDescription>
            Rename this group or change what it is for.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this group is for"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground"
            onClick={() => onSubmit(name, description)}
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GroupsTab({
  groups,
  counts,
  onCreate,
  onEdit,
  onDelete,
  onViewMembers,
}) {
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) =>
      `${g.name} ${g.description}`.toLowerCase().includes(q),
    );
  }, [groups, search]);

  const pager = usePagination(filtered, { resetKey: search });

  const submitEdit = (name, description) => {
    const group = editTarget;
    setEditTarget(null);
    if (!group) return;
    onEdit(group, { name: name.trim() || group.name, description });
  };

  const confirmDelete = () => {
    const group = deleteTarget;
    setDeleteTarget(null);
    if (group) onDelete(group);
  };

  const columns = [
    {
      key: "group",
      header: "Group",
      render: (g) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{g.name}</p>
          <p className="truncate text-xs text-text-tertiary">
            {g.description || "No description"}
          </p>
        </div>
      ),
    },
    {
      key: "members",
      header: "Members",
      align: "right",
      className: "text-right tabular-nums text-foreground",
      render: (g) => counts[g.id] || 0,
    },
    {
      key: "created",
      header: "Created",
      render: (g) => (
        <span className="text-xs text-text-secondary">{formatDate(g.createdAt)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (g) => (
        <div className="flex justify-end">
          <ActionMenu
            label={`Actions for ${g.name}`}
            items={[
              { icon: Pencil, label: "Edit", onSelect: () => setEditTarget(g) },
              {
                icon: Users,
                label: "View members",
                onSelect: () => onViewMembers(g),
              },
              { separator: true },
              {
                icon: Trash2,
                label: "Delete",
                variant: "destructive",
                onSelect: () => setDeleteTarget(g),
              },
            ]}
          />
        </div>
      ),
    },
  ];

  const createButton = (
    <Button onClick={onCreate} className="bg-primary text-primary-foreground">
      <Plus className="h-4 w-4" /> New Group
    </Button>
  );

  return (
    <div className="space-y-4">
      <Toolbar>
        <Button variant="outline" size="sm" onClick={onCreate}>
          <Plus className="h-4 w-4" /> New Group
        </Button>
        <SearchInput value={search} onChange={setSearch} placeholder="Search groups…" />
      </Toolbar>

      <DataTable
        columns={columns}
        data={pager.pageItems}
        getRowKey={(g) => g.id}
        onRowClick={(g) => onViewMembers(g)}
        empty={
          <div className="rounded-xl border border-border bg-surface-subtle">
            {groups.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No groups yet"
                description="Group members into sub-teams like Check-in staff or Marketing."
                action={createButton}
              />
            ) : (
              <EmptyState
                icon={Users}
                title="No matching groups"
                description="Try clearing the search."
              />
            )}
          </div>
        }
      />

      <ListPagination {...pager} itemLabel="groups" />

      {/* Keyed so the form remounts (and reseeds) per group. */}
      <EditGroupDialog
        key={editTarget?.id || "edit-closed"}
        group={editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onSubmit={submitEdit}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete group</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `Delete "${deleteTarget.name}"? Members keep their access — they just stop being grouped.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              className="bg-red-500/90 text-white hover:bg-red-500"
              onClick={confirmDelete}
            >
              <Trash2 className="h-4 w-4" /> Delete group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
