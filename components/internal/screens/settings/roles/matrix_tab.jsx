"use client";

// Every permission against every role at once. The single-role drawer is for
// composing one role; this is for answering "who can refund an order?" — the
// question a grid answers and a stack of accordions never could.

import { Fragment, useMemo } from "react";
import { Check, Plus, Search, ShieldCheck } from "lucide-react";
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@geiger/ui";
import { EmptyState, SearchInput, Toolbar } from "@/components/internal/shared/screen_kit";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { cn } from "@/lib/utils";
import { ALL_PERMISSION_KEYS } from "@/lib/rbac";
import { PERMISSION_GROUP_FILTER_OPTIONS } from "../constants";
import { filterGroups, grantedCount, grantsKey, isOwnerRole } from "./utils";

// Granted reads as a filled tick, locked-granted as a muted one (Owner, or a
// viewer without manage rights), and denied as an empty well that only hints at
// a tick on hover.
function MatrixCell({ checked, locked, label, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      disabled={locked}
      onClick={onClick}
      className={cn(
        "mx-auto flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
        checked && locked
          ? "border-border bg-surface-active text-text-secondary"
          : checked
            ? "border-primary/40 bg-primary/15 text-primary hover:bg-primary/25"
            : "border-border bg-surface-card text-transparent",
        !locked &&
          !checked &&
          "hover:border-border-strong hover:bg-surface-hover hover:text-text-tertiary",
        locked && "cursor-default",
      )}
    >
      <Check className="h-3.5 w-3.5" />
    </button>
  );
}

export function MatrixTab({
  roles,
  canManage,
  query,
  setQuery,
  groupFilter,
  setGroupFilter,
  onToggle,
  onOpenRole,
  onCreate,
}) {
  const groups = useMemo(
    () => filterGroups(query, groupFilter),
    [query, groupFilter],
  );

  if (!roles.length) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState
          icon={ShieldCheck}
          title="No roles yet"
          description="Create a role and its column shows up here."
          action={
            canManage ? (
              <Button onClick={onCreate} className="bg-primary text-primary-foreground">
                <Plus className="h-4 w-4" /> Create role
              </Button>
            ) : null
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Toolbar>
        <FilterDropdown
          value={groupFilter}
          onValueChange={setGroupFilter}
          options={PERMISSION_GROUP_FILTER_OPTIONS}
          placeholder="All Groups"
          height="h-9"
        />
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search permissions…"
        />
      </Toolbar>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={Search}
            title="No matching permissions"
            description="Try a different search, or switch back to all groups."
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="sticky left-0 z-20 min-w-[260px] bg-surface-subtle px-4">
                  Permission
                </TableHead>
                {roles.map((r) => (
                  <TableHead key={r.id} className="w-[132px] px-3 text-center">
                    <button
                      type="button"
                      onClick={() => onOpenRole(r)}
                      className="mx-auto flex w-full max-w-[116px] flex-col items-center gap-1 normal-case hover:text-foreground"
                    >
                      <span className="w-full truncate text-xs font-semibold tracking-normal text-foreground">
                        {r.name}
                      </span>
                      <span className="text-[10px] font-medium tracking-normal text-text-tertiary tabular-nums">
                        {isOwnerRole(r)
                          ? `all ${ALL_PERMISSION_KEYS.length}`
                          : `${grantedCount(r)}/${ALL_PERMISSION_KEYS.length}`}
                      </span>
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map(({ group, permissions }) => (
                <Fragment key={group}>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableCell
                      colSpan={roles.length + 1}
                      className="bg-surface-card px-4 py-2"
                    >
                      {/* The cell spans the table, so the label itself is what
                          pins — otherwise it scrolls away on a wide matrix. */}
                      <span className="sticky left-4 inline-block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                        {group}
                        <span className="ml-2 normal-case tracking-normal text-text-tertiary/70">
                          {permissions.length}
                        </span>
                      </span>
                    </TableCell>
                  </TableRow>
                  {permissions.map((perm) => (
                    <TableRow key={perm.key} className="group border-border">
                      <TableCell className="sticky left-0 z-10 bg-surface-subtle px-4 py-3 transition-colors group-hover:bg-surface-active">
                        <span className="flex items-center gap-1.5">
                          <span className="text-sm text-foreground">
                            {perm.label}
                          </span>
                          {perm.scopeBy ? (
                            <span className="shrink-0 rounded border border-border bg-surface-card px-1 py-px text-[10px] text-text-tertiary">
                              per {perm.scopeBy}
                            </span>
                          ) : null}
                        </span>
                        <span className="block font-mono text-[10px] text-text-tertiary">
                          {perm.key}
                        </span>
                      </TableCell>
                      {roles.map((r) => (
                        <TableCell key={r.id} className="px-3 py-3 text-center">
                          <MatrixCell
                            checked={grantsKey(r, perm.key)}
                            locked={!canManage || isOwnerRole(r)}
                            label={`${perm.label} for ${r.name}`}
                            onClick={() => onToggle(r, perm.key)}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
