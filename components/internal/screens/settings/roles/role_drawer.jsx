"use client";

// Composing a single role: identity up top, then the whole catalog as one
// continuous divided list under sticky group headers. Deliberately flat — the
// old nested accordion-inside-a-card-inside-a-card was the boxiness.

import { useMemo } from "react";
import { Copy, Lock, Pencil, Search, Trash2, Users } from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Switch,
} from "@geiger/ui";
import { cn } from "@/lib/utils";
import { CoverageBar } from "./coverage_bar";
import { Notice } from "./notice";
import { filterGroups, grantsKey, isOwnerRole } from "./utils";

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
            <Notice icon={Lock}>
              Owner holds every permission — including ones added to the product
              later. It is deliberately not editable, so a workspace always keeps
              at least one role that can administer it.
            </Notice>
          </div>
        ) : (
          <div className="relative shrink-0 border-b border-border p-4">
            <Search className="pointer-events-none absolute left-7 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter permissions…"
              className="h-9 bg-surface-card pl-9 text-sm"
            />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {groups.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-text-tertiary">
              No permission matches “{query}”.
            </p>
          ) : (
            groups.map(({ group, permissions }) => {
              const keys = permissions.map((p) => p.key);
              const on = keys.filter((k) => grantsKey(role, k)).length;
              const allOn = on === keys.length;
              return (
                <section key={group}>
                  <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface-card px-5 py-2">
                    <span className="flex-1 truncate text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                      {group}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                        on ? "bg-primary/15 text-primary" : "text-text-tertiary",
                      )}
                    >
                      {on}/{keys.length}
                    </span>
                    {!locked ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] text-text-secondary"
                        onClick={() => onToggleGroup(role, keys, !allOn)}
                      >
                        {allOn ? "Clear" : "Select all"}
                      </Button>
                    ) : null}
                  </div>

                  <div className="divide-y divide-border px-5">
                    {permissions.map((perm) => (
                      <label
                        key={perm.key}
                        className={cn(
                          "flex items-center justify-between gap-4 py-3",
                          !locked && "cursor-pointer",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm text-foreground">
                              {perm.label}
                            </span>
                            {perm.scopeBy ? (
                              <span className="shrink-0 rounded border border-border bg-surface-card px-1 py-px text-[10px] text-text-tertiary">
                                per {perm.scopeBy}
                              </span>
                            ) : null}
                          </span>
                          <span className="block truncate font-mono text-[10px] text-text-tertiary">
                            {perm.key}
                          </span>
                        </span>
                        <Switch
                          checked={grantsKey(role, perm.key)}
                          disabled={locked}
                          onCheckedChange={() => onToggle(role, perm.key)}
                        />
                      </label>
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
