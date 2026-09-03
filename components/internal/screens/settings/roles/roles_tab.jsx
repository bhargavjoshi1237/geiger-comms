"use client";

import { Copy, Pencil, Plus, ShieldCheck, SlidersHorizontal, Trash2, Users } from "lucide-react";
import { ActionMenu, Badge, Button } from "@geiger/ui";
import { DataTable, EmptyState, SearchInput, Toolbar } from "@/components/internal/shared/screen_kit";
import {
  ListPagination,
  usePagination,
} from "@/components/internal/shared/pagination";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { ROLE_TYPE_FILTER_OPTIONS } from "../constants";
import { CoverageBar } from "./coverage_bar";
import { isOwnerRole } from "./utils";

export function RolesTab({
  roles,
  total,
  counts,
  canManage,
  search,
  setSearch,
  typeFilter,
  setTypeFilter,
  onOpen,
  onOpenEditor,
  onEdit,
  onDuplicate,
  onDelete,
  onViewMembers,
  onCreate,
}) {
  const pager = usePagination(roles, { resetKey: `${search}|${typeFilter}` });

  const columns = [
    {
      key: "name",
      header: "Role",
      render: (r) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="line-clamp-1 text-xs text-text-secondary">
            {r.description || "No description"}
          </span>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <Badge variant={r.isSystem ? "neutral" : "info"}>
          {r.isSystem ? "System" : "Custom"}
        </Badge>
      ),
    },
    {
      key: "people",
      header: "People",
      render: (r) => {
        const count = counts[r.id] || 0;
        if (!count) return <span className="text-xs text-text-tertiary">—</span>;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => onViewMembers(r)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-foreground"
            >
              <Users className="h-3.5 w-3.5" />
              {count} {count === 1 ? "person" : "people"}
            </button>
          </div>
        );
      },
    },
    {
      key: "coverage",
      header: "Access",
      render: (r) => <CoverageBar role={r} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "text-right",
      render: (r) => {
        const owner = isOwnerRole(r);
        return (
          <div className="flex justify-end">
            <ActionMenu
              label={`Actions for ${r.name}`}
              items={[
                { icon: Pencil, label: "Edit", onSelect: () => onOpenEditor(r) },
                {
                  icon: SlidersHorizontal,
                  label: "Edit permissions",
                  onSelect: () => onOpen(r),
                },
                canManage &&
                  !owner && {
                    icon: Pencil,
                    label: "Rename",
                    onSelect: () => onEdit(r),
                  },
                canManage && {
                  icon: Copy,
                  label: "Duplicate",
                  onSelect: () => onDuplicate(r),
                },
                counts[r.id] && {
                  icon: Users,
                  label: "View in Team",
                  onSelect: () => onViewMembers(r),
                },
                { separator: true },
                // Owner and the seeded system roles are never deletable.
                canManage &&
                  !owner &&
                  !r.isSystem && {
                    icon: Trash2,
                    label: "Delete",
                    variant: "destructive",
                    onSelect: () => onDelete(r),
                  },
              ]}
            />
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <Toolbar>
        <FilterDropdown
          value={typeFilter}
          onValueChange={setTypeFilter}
          options={ROLE_TYPE_FILTER_OPTIONS}
          placeholder="All Types"
          height="h-9"
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search roles…"
        />
      </Toolbar>

      <DataTable
        columns={columns}
        data={pager.pageItems}
        getRowKey={(r) => r.id}
        onRowClick={onOpen}
        empty={
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState
              icon={ShieldCheck}
              title={total ? "No roles match your filters" : "No roles yet"}
              description={
                total
                  ? "Try clearing the search or the type filter."
                  : "Create your first role to start controlling access."
              }
              action={
                canManage ? (
                  <Button
                    onClick={onCreate}
                    className="bg-primary text-primary-foreground"
                  >
                    <Plus className="h-4 w-4" /> Create role
                  </Button>
                ) : null
              }
            />
          </div>
        }
      />

      <ListPagination {...pager} itemLabel="roles" />
    </div>
  );
}
