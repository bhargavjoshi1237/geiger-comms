"use client";

// Composing a single role: identity up top, then the whole catalog as one
// continuous divided list under sticky group headers. Deliberately flat — the
// old nested accordion-inside-a-card-inside-a-card was the boxiness.

import { useMemo } from "react";
import { Copy, Pencil, Trash2, Users, SlidersHorizontal } from "lucide-react";
import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@geiger/ui";
import { SearchInput } from "@/components/internal/shared/screen_kit";
import { CoverageBar } from "./coverage_bar";
import { OwnerNotice, PermissionGroupList } from "./role_sections";
import { filterGroups, isOwnerRole } from "./utils";

export function RoleDrawer({
  role,
  canManage,
  memberCount,
  query,
  setQuery,
  onOpenChange,
  onToggle,
  onToggleGroup,
  onEdit,
  onDuplicate,
  onDelete,
  onViewMembers,
  onOpenEditor,
}) {
  // Owner's list is read-only and unsearchable, so a query carried over from the
  // matrix must not silently hide half of it.
  const owner = isOwnerRole(role);
  const groups = useMemo(
    () => filterGroups(owner ? "" : query),
    [owner, query],
  );

  if (!role) return null;

  const locked = owner || !canManage;

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 gap-3 border-b border-border p-5 pr-12">
          <div className="flex min-w-0 items-center gap-2">
            <SheetTitle className="truncate text-lg">{role.name}</SheetTitle>
            <Badge variant={role.isSystem ? "neutral" : "info"}>
              {role.isSystem ? "System" : "Custom"}
            </Badge>
          </div>
          <SheetDescription>
            {role.description || "No description for this role yet."}
          </SheetDescription>

          <CoverageBar role={role} className="w-full" />

          <div className="flex flex-wrap items-center gap-2">
            {memberCount ? (
              <Button variant="outline" size="sm" onClick={() => onViewMembers(role)}>
                <Users className="h-3.5 w-3.5" />
                {memberCount} {memberCount === 1 ? "person" : "people"}
              </Button>
            ) : (
              <span className="text-xs text-text-tertiary">Nobody holds this role</span>
            )}
            <span className="flex-1" />
            {onOpenEditor ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onOpenEditor(role);
                }}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" /> Open editor
              </Button>
            ) : null}
            {canManage ? (
              <Button variant="outline" size="sm" onClick={() => onDuplicate(role)}>
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </Button>
            ) : null}
            {canManage && !owner ? (
              <Button variant="outline" size="sm" onClick={() => onEdit(role)}>
                <Pencil className="h-3.5 w-3.5" /> Rename
              </Button>
            ) : null}
            {canManage && !owner && !role.isSystem ? (
              <Button
                variant="outline"
                size="sm"
                aria-label="Delete role"
                className="text-red-400 hover:text-red-300"
                onClick={() => {
                  onOpenChange(false);
                  onDelete(role);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        </SheetHeader>

        {owner ? (
          <div className="shrink-0 border-b border-border p-4">
            <OwnerNotice />
          </div>
        ) : (
          <div className="shrink-0 border-b border-border p-4">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Filter permissions…"
            />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <PermissionGroupList
            role={role}
            groups={groups}
            locked={locked}
            query={query}
            onToggle={onToggle}
            onToggleGroup={onToggleGroup}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
