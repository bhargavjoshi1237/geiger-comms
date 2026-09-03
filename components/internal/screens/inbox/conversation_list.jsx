"use client";

// The middle-left pane: filter toolbar + the conversation rows. Presentational
// — InboxShell owns rows, selection and the filter state (spec §4.2).

import { useCallback } from "react";
import { Button, Skeleton } from "@geiger/ui";
import { ChevronDown, Inbox, MessagesSquare, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@geiger/ui";
import { SearchInput, EmptyState } from "@/components/internal/shared/screen_kit";
import { cn } from "@/lib/utils";
import ConversationRow from "./conversation_row";
import {
  ASSIGNEE_FILTER_OPTIONS,
  CHANNEL_FILTER_OPTIONS,
  PRIORITY_FILTER_OPTIONS,
  SORT_OPTIONS,
  STATUS_FILTER_OPTIONS,
} from "./constants";

// Multi-select dropdown over an array-valued filter key. Empty array = all.
function MultiFilterDropdown({ label, options, selected, onChange }) {
  const text =
    selected.length === 0
      ? label
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? label)
        : `${label}: ${selected.length}`;

  const toggle = (value) =>
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-8 gap-1 border-border bg-surface-card px-2.5 text-xs font-medium text-foreground hover:bg-surface-subtle">
          <span className="max-w-[110px] truncate">{text}</span>
          <ChevronDown className="h-3 w-3 text-text-secondary" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="border-border bg-surface-subtle">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-text-tertiary">
          {label}
        </DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={() => toggle(option.value)}
            onSelect={(e) => e.preventDefault()}
            className="text-xs"
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ConversationList({
  loading,
  error,
  conversations,
  activeId,
  filter,
  teammates,
  mentionIds,
  hasMore,
  onLoadMore,
  onSelect,
  onFilterChange,
  onClearFilters,
  onNewConversation,
}) {
  // Keyset pagination: ask for the next page shortly before the bottom so the
  // scroll never visibly empties out.
  const handleScroll = useCallback(
    (event) => {
      if (!hasMore || !onLoadMore) return;
      const el = event.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight > 240) return;
      onLoadMore();
    },
    [hasMore, onLoadMore],
  );

  const set = (patch) => onFilterChange?.({ ...filter, ...patch });
  const isFiltered =
    (filter.status?.length || 0) +
      (filter.channel?.length || 0) +
      (filter.priority?.length || 0) +
      (filter.tagIds?.length || 0) >
      0 ||
    Boolean(filter.assignee) ||
    filter.unread != null ||
    Boolean(filter.search);

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col border-r border-border">
        <div className="shrink-0 space-y-2 border-b border-border p-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="min-h-0 flex-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-3 border-b border-border px-4 py-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-r border-border bg-background/40">
      {/* Toolbar */}
      <div className="shrink-0 space-y-2 border-b border-border p-3">
        <div className="relative" data-inbox-search="true">
          <SearchInput
            expanded
            value={filter.search || ""}
            onChange={(search) => set({ search })}
            placeholder="Search conversations…"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <MultiFilterDropdown
            label="Status"
            options={STATUS_FILTER_OPTIONS}
            selected={filter.status || []}
            onChange={(status) => set({ status })}
          />
          <MultiFilterDropdown
            label="Channel"
            options={CHANNEL_FILTER_OPTIONS}
            selected={filter.channel || []}
            onChange={(channel) => set({ channel })}
          />
          <MultiFilterDropdown
            label="Priority"
            options={PRIORITY_FILTER_OPTIONS}
            selected={filter.priority || []}
            onChange={(priority) => set({ priority })}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-8 gap-1 border-border bg-surface-card px-2.5 text-xs font-medium text-foreground hover:bg-surface-subtle">
                {ASSIGNEE_FILTER_OPTIONS.find((o) => o.value === (filter.assignee || ""))?.label ??
                  (teammates.find((t) => t.id === filter.assignee)?.name || "Assignee")}
                <ChevronDown className="h-3 w-3 text-text-secondary" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="border-border bg-surface-subtle">
              <DropdownMenuRadioGroup
                value={filter.assignee || ""}
                onValueChange={(assignee) => set({ assignee: assignee || null })}
              >
                {ASSIGNEE_FILTER_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value} className="text-xs">
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
                <DropdownMenuSeparator className="bg-border" />
                {teammates.map((t) => (
                  <DropdownMenuRadioItem key={t.id} value={t.id} className="text-xs">
                    {t.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant={filter.unread ? "secondary" : "outline"}
            onClick={() => set({ unread: filter.unread ? null : true })}
            className="h-8 border-border bg-surface-card px-2.5 text-xs font-medium text-foreground hover:bg-surface-subtle"
          >
            Unread
          </Button>
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-8 gap-1 border-border bg-surface-card px-2.5 text-xs font-medium text-foreground hover:bg-surface-subtle">
                  {SORT_OPTIONS.find((o) => o.value === (filter.sort || "newest"))?.label}
                  <ChevronDown className="h-3 w-3 text-text-secondary" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-border bg-surface-subtle">
                <DropdownMenuRadioGroup
                  value={filter.sort || "newest"}
                  onValueChange={(sort) => set({ sort })}
                >
                  {SORT_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value} className="text-xs">
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Rows */}
      <div onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <EmptyState
            icon={Inbox}
            title="Couldn't load conversations"
            description="Something went wrong reading the inbox."
            action={
              <Button type="button" size="sm" variant="outline" onClick={() => window.location.reload()}>
                Retry
              </Button>
            }
          />
        ) : conversations.length === 0 ? (
          isFiltered ? (
            <EmptyState
              icon={MessagesSquare}
              title="No conversations match"
              description="Nothing here for these filters."
              action={
                <Button type="button" size="sm" variant="outline" onClick={() => onClearFilters?.()}>
                  <X className="h-3.5 w-3.5" /> Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={MessagesSquare}
              title="No conversations yet"
              description="Start one to see it appear here in real time."
              action={
                onNewConversation ? (
                  <Button type="button" size="sm" onClick={onNewConversation}>
                    New conversation
                  </Button>
                ) : null
              }
            />
          )
        ) : (
          <>
            {conversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === activeId}
                onSelect={onSelect}
              />
            ))}
            {hasMore ? (
              <button
                type="button"
                onClick={() => onLoadMore?.()}
                className="w-full py-3 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                Load older conversations <ChevronDown className="inline h-3 w-3" />
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default ConversationList;
