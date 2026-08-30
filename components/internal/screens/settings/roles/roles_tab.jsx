"use client";

import { Copy, Pencil, Plus, ShieldCheck, SlidersHorizontal, Trash2, Users, MoreHorizontal } from "lucide-react";
import { Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@geiger/ui";
import { DataTable, EmptyState, SearchInput, Toolbar } from "@/components/internal/shared/screen_kit";
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
  onEdit,
  onDuplicate,
  onDelete,
  onViewMembers,
  onCreate,
}) {
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
          <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Role actions"
                  className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48 border-border bg-surface-subtle shadow-xl"
              >
                <DropdownMenuItem
                  className="cursor-pointer gap-2 focus:bg-surface-hover"
                  onClick={() => onOpen(r)}
                >
                  <SlidersHorizontal className="h-4 w-4" /> Edit permissions
                </DropdownMenuItem>
                {canManage && !owner ? (
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 focus:bg-surface-hover"
                    onClick={() => onEdit(r)}
                  >
                    <Pencil className="h-4 w-4" /> Rename
                  </DropdownMenuItem>
                ) : null}
                {canManage ? (
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 focus:bg-surface-hover"
                    onClick={() => onDuplicate(r)}
                  >
                    <Copy className="h-4 w-4" /> Duplicate
                  </DropdownMenuItem>
                ) : null}
                {counts[r.id] ? (
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 focus:bg-surface-hover"
                    onClick={() => onViewMembers(r)}
                  >
                    <Users className="h-4 w-4" /> View in Team
                  </DropdownMenuItem>
                ) : null}
                {canManage && !owner && !r.isSystem ? (
                  <>
                    <DropdownMenuSeparator className="bg-surface-strong" />
                    <DropdownMenuItem
                      className="cursor-pointer gap-2 text-red-400 focus:bg-red-500/10 focus:text-red-300"
                      onClick={() => onDelete(r)}
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
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
        data={roles}
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
    </div>
  );
}
