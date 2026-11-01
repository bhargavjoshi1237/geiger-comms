"use client";

// Bulk assign / snooze / close / reopen / tag / priority over the selection or every match; useInboxShell owns the writes.

import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@geiger/ui";
import { AlarmClock, Check, Flag, Loader2, RotateCcw, Tag, UserMinus, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TagPicker } from "./tag_picker";
import { PRIORITY_FILTER_OPTIONS, PRIORITY_META, SNOOZE_PRESETS } from "./constants";

function BarButton({ label, disabledReason, disabled, className, ...props }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn("size-7", className)}
      aria-label={label}
      title={disabledReason || label}
      disabled={disabled || Boolean(disabledReason)}
      {...props}
    />
  );
}

export function BulkBar({
  bulk,
  loadedCount,
  hasMore,
  statusTab,
  teammates,
  me,
  tags,
  assignDisabledReason,
  closeDisabledReason,
}) {
  const allLoaded = bulk.all || (loadedCount > 0 && bulk.loadedCount === loadedCount);
  const canWidenToAll = !bulk.all && allLoaded && hasMore && bulk.total != null && bulk.total > loadedCount;
  const busy = bulk.busy;

  return (
    <div className="shrink-0 border-b border-border bg-surface-subtle px-3 py-2">
      <div className="flex h-7 items-center gap-1">
        <Checkbox
          checked={allLoaded}
          onCheckedChange={() => bulk.toggleLoaded()}
          aria-label={allLoaded ? "Clear selection" : "Select all loaded conversations"}
          className="mr-1.5"
        />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {busy ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-label="Updating" /> : null}
          {bulk.count} selected
        </span>

        {/* Assign */}
        {assignDisabledReason ? (
          <BarButton label="Assign" disabledReason={assignDisabledReason}>
            <UserPlus />
          </BarButton>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <BarButton label="Assign" disabled={busy}>
                <UserPlus />
              </BarButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto border-border bg-surface-subtle">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Assign {bulk.count} to
              </DropdownMenuLabel>
              {me ? (
                <DropdownMenuItem className="text-xs" onClick={() => bulk.assign(me)}>
                  <UserPlus /> Assign to me
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem className="text-xs" onClick={() => bulk.assign(null)}>
                <UserMinus /> Unassign
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              {teammates.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">No teammates yet</p>
              ) : (
                teammates.map((t) => (
                  <DropdownMenuItem key={t.id} className="text-xs" onClick={() => bulk.assign(t)}>
                    <span className="truncate">{t.name || t.email || "Teammate"}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Snooze — closed conversations have nothing to snooze */}
        {statusTab === "Closed" ? null : closeDisabledReason ? (
          <BarButton label="Snooze" disabledReason={closeDisabledReason}>
            <AlarmClock />
          </BarButton>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <BarButton label="Snooze" disabled={busy}>
                <AlarmClock />
              </BarButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-border bg-surface-subtle">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Snooze until
              </DropdownMenuLabel>
              {SNOOZE_PRESETS.map((preset) => (
                <DropdownMenuItem key={preset.value} className="text-xs" onClick={() => bulk.snooze(preset.value)}>
                  <AlarmClock /> {preset.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem className="text-xs" onClick={() => bulk.snooze("custom")}>
                <AlarmClock /> Custom…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {statusTab === "Closed" ? null : (
          <BarButton label="Close" disabledReason={closeDisabledReason} disabled={busy} onClick={() => bulk.close()}>
            <Check />
          </BarButton>
        )}
        {statusTab === "Open" ? null : (
          <BarButton label="Reopen" disabledReason={closeDisabledReason} disabled={busy} onClick={() => bulk.reopen()}>
            <RotateCcw />
          </BarButton>
        )}

        {/* Tag */}
        <TagPicker tags={tags} selected={[]} onToggle={(tag) => bulk.tag(tag)} onCreate={(name) => bulk.createTag(name)}>
          <BarButton label="Add a tag" disabled={busy}>
            <Tag />
          </BarButton>
        </TagPicker>

        {/* Priority */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <BarButton label="Set priority" disabled={busy}>
              <Flag />
            </BarButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-border bg-surface-subtle">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Priority</DropdownMenuLabel>
            {PRIORITY_FILTER_OPTIONS.map((option) => {
              const meta = PRIORITY_META[option.value];
              const Icon = meta?.icon;
              return (
                <DropdownMenuItem key={option.value} className="text-xs" onClick={() => bulk.priority(option.value)}>
                  {Icon ? <Icon className={cn("h-3.5 w-3.5", meta.className)} /> : null}
                  {option.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <BarButton label="Clear selection (Esc)" className="text-muted-foreground" onClick={() => bulk.clear()}>
          <X />
        </BarButton>
      </div>

      {bulk.all ? (
        <p className="mt-1 text-xs text-muted-foreground">
          All {bulk.count} matching conversations are selected.
        </p>
      ) : canWidenToAll ? (
        <p className="mt-1 text-xs text-muted-foreground">
          All {loadedCount} loaded conversations are selected.{" "}
          <button
            type="button"
            onClick={() => bulk.selectAll()}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Select all {bulk.total} matching
          </button>
        </p>
      ) : null}
    </div>
  );
}

export default BulkBar;
