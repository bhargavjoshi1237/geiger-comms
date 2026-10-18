"use client";

// The middle-left pane: filter toolbar + the conversation rows. Presentational — InboxShell owns rows, selection and filters (spec §4.2).
// The toolbar always renders so a filter change never unmounts the search box; only the rows area shows the loader.

import { useCallback } from "react";
import { Button, LogoLoading } from "@geiger/ui";
import { AtSign, ChevronDown, Inbox, Loader2, MessagesSquare, Plus, Radio, UserCheck, X } from "lucide-react";
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
  TAG_COLOR_MAP,
} from "./constants";

const TRIGGER_CLASS =
  "h-8 gap-1 border-border bg-surface-card px-2.5 text-xs font-medium text-foreground hover:bg-surface-subtle";

// Copy for the "nothing here at all" state, per preset.
const EMPTY_COPY = {
  all: {
    icon: MessagesSquare,
    title: "No conversations yet",
    description: "Start one to see it appear here in real time.",
    create: true,
  },
  mine: {
    icon: UserCheck,
    title: "Nothing assigned to you",
    description: "Conversations assigned to you land here.",
    create: true,
  },
  mentions: {
    icon: AtSign,
    title: "No mentions yet",
    description: "When a teammate @mentions you in an internal note, the thread shows up here.",
    create: false,
  },
};

// Multi-select dropdown over an array-valued filter key. Empty array = all.
function MultiFilterDropdown({ label, options, selected, onChange, renderOption }) {
  const text =
    selected.length === 0
      ? label
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? label)
        : `${label}: ${selected.length}`;

  const toggle = (value) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn(TRIGGER_CLASS, selected.length > 0 && "border-border-strong")}>
          <span className="max-w-[110px] truncate">{text}</span>
          <ChevronDown className="h-3 w-3 text-text-secondary" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto border-border bg-surface-subtle">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-text-tertiary">{label}</DropdownMenuLabel>
        {options.length === 0 ? (
          <p className="px-2 py-2 text-xs text-text-tertiary">Nothing to filter by yet</p>
        ) : (
          options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={selected.includes(option.value)}
              onCheckedChange={() => toggle(option.value)}
              onSelect={(e) => e.preventDefault()}
              className="text-xs"
            >
              {renderOption ? renderOption(option) : option.label}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ConversationList({
  title,
  preset = "all",
  initialLoading,
  refreshing,
  error,
  conversations,
  activeId,
  focusedId,
  filter,
  isFiltered,
  teammates,
  tags,
  activeChannel,
  hasMore,
  onLoadMore,
  onSelect,
  onFilterChange,
  onClearFilters,
  onClearChannel,
  onNewConversation,
}) {
  // Keyset pagination: ask for the next page shortly before the bottom so the scroll never visibly empties out.
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
  const empty = EMPTY_COPY[preset] ?? EMPTY_COPY.all;
  const tagOptions = (tags || []).map((t) => ({ value: t.id, label: t.name, color: t.color }));

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-r border-border bg-background/40">
      {/* Toolbar */}
      <div className="shrink-0 space-y-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-sm font-semibold text-foreground">{title}</h1>
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-text-tertiary" aria-label="Updating" /> : null}
          {onNewConversation ? (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="ml-auto border-border bg-surface-card"
              aria-label="New conversation"
              title="New conversation"
              onClick={onNewConversation}
            >
              <Plus />
            </Button>
          ) : null}
        </div>
        <div className="relative" data-inbox-search="true">
          <SearchInput
            expanded
            value={filter.search || ""}
            onChange={(search) => set({ search })}
            placeholder="Search conversations…"
            aria-label="Search conversations (press / to focus)"
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
          <MultiFilterDropdown
            label="Tags"
            options={tagOptions}
            selected={filter.tagIds || []}
            onChange={(tagIds) => set({ tagIds })}
            renderOption={(option) => (
              <span
                className={cn(
                  "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                  TAG_COLOR_MAP[option.color] || TAG_COLOR_MAP.slate,
                )}
              >
                {option.label}
              </span>
            )}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className={cn(TRIGGER_CLASS, filter.assignee && "border-border-strong")}>
                <span className="max-w-[110px] truncate">
                  {ASSIGNEE_FILTER_OPTIONS.find((o) => o.value === (filter.assignee || ""))?.label ??
                    (teammates.find((t) => t.id === filter.assignee)?.name || "Assignee")}
                </span>
                <ChevronDown className="h-3 w-3 text-text-secondary" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto border-border bg-surface-subtle">
              <DropdownMenuRadioGroup
                value={filter.assignee || ""}
                onValueChange={(assignee) => set({ assignee: assignee || null })}
              >
                {ASSIGNEE_FILTER_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value} className="text-xs">
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
                {teammates.length > 0 ? <DropdownMenuSeparator className="bg-border" /> : null}
                {teammates.map((t) => (
                  <DropdownMenuRadioItem key={t.id} value={t.id} className="text-xs">
                    {t.name || t.email || "Teammate"}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="outline"
            aria-pressed={Boolean(filter.unread)}
            onClick={() => set({ unread: filter.unread ? null : true })}
            className={cn(TRIGGER_CLASS, filter.unread && "border-border-strong bg-surface-active")}
          >
            Unread
          </Button>
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className={TRIGGER_CLASS}>
                  {SORT_OPTIONS.find((o) => o.value === (filter.sort || "newest"))?.label}
                  <ChevronDown className="h-3 w-3 text-text-secondary" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-border bg-surface-subtle">
                <DropdownMenuRadioGroup value={filter.sort || "newest"} onValueChange={(sort) => set({ sort })}>
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

        {/* Active connected-channel filter (?channel=<id> from Channels) — clearable */}
        {activeChannel ? (
          <div className="flex items-center">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-active py-0.5 pl-2 pr-1 text-[11px] font-medium text-foreground">
              <Radio className="h-3 w-3 shrink-0 text-text-secondary" />
              <span className="truncate">Channel: {activeChannel.name || "Connected channel"}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-4 rounded-full"
                aria-label="Clear channel filter"
                onClick={onClearChannel}
              >
                <X />
              </Button>
            </span>
          </div>
        ) : null}
      </div>

      {/* Rows */}
      <div onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto">
        {initialLoading ? (
          <div className="flex h-full min-h-[200px] items-center justify-center">
            <LogoLoading size={40} />
          </div>
        ) : error ? (
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
              icon={empty.icon}
              title={empty.title}
              description={empty.description}
              action={
                empty.create && onNewConversation ? (
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
                focused={conversation.id === focusedId}
                onSelect={onSelect}
              />
            ))}
            {hasMore && !refreshing ? (
              <button
                type="button"
                onClick={() => onLoadMore?.()}
                className="w-full py-3 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                Load more conversations <ChevronDown className="inline h-3 w-3" />
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default ConversationList;
