"use client";

// The presentational list pane (spec §4.2); the header always renders so a filter change never unmounts the search box.

import { useCallback } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ExpandableSearch,
  Kbd,
  Label,
  LogoLoading,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@geiger/ui";
import {
  AlarmClock,
  ArrowUpDown,
  AtSign,
  Check,
  CheckCheck,
  ChevronDown,
  Inbox,
  Loader2,
  MessagesSquare,
  Radio,
  SlidersHorizontal,
  SquarePen,
  UserCheck,
  X,
} from "lucide-react";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { cn } from "@/lib/utils";
import ConversationRow from "./conversation_row";
import { BulkBar } from "./bulk_bar";
import { AvailabilityToggle } from "./availability_toggle";
import { presetFilter } from "./use_inbox_shell";
import {
  ASSIGNEE_FILTER_OPTIONS,
  CHANNEL_FILTER_OPTIONS,
  PRIORITY_FILTER_OPTIONS,
  SORT_OPTIONS,
  STATUS_TABS,
  TAG_COLOR_MAP,
} from "./constants";

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

// Snoozed/Closed tabs get their own copy; Open and All fall back to the preset's.
const TAB_EMPTY_COPY = {
  Snoozed: {
    icon: AlarmClock,
    title: "Nothing snoozed",
    description: "Snoozed conversations return to Open when their time is up.",
    create: false,
  },
  Closed: {
    icon: CheckCheck,
    title: "No closed conversations",
    description: "Conversations you close are kept here.",
    create: false,
  },
};

function FilterSection({ label, children }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

// A toggle pill in the filter menu.
function FilterPill({ selected, onClick, className, children }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "h-[26px] rounded-full border-border bg-transparent px-2.5 text-xs font-normal text-foreground hover:bg-surface-hover has-[>svg]:pl-2 has-[>svg]:pr-2.5",
        selected && "border-border-strong bg-surface-strong font-medium hover:bg-surface-strong",
        className,
      )}
    >
      {selected ? <Check className="size-3" /> : null}
      {children}
    </Button>
  );
}

// An active filter shown under the search row, removable on its own.
function FilterChip({ icon: Icon, label, removeLabel, onRemove }) {
  return (
    <span className="inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-border bg-surface-active pl-2.5 pr-1 text-xs text-foreground">
      {Icon ? <Icon className="size-3 shrink-0 text-muted-foreground" /> : null}
      <span className="truncate">{label}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="size-[18px] rounded-full text-muted-foreground"
        aria-label={removeLabel}
        onClick={onRemove}
      >
        <X />
      </Button>
    </span>
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
  bulk,
  me,
  assignDisabledReason,
  closeDisabledReason,
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
  const toggleIn = (key, value) => {
    const current = filter[key] || [];
    set({ [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] });
  };

  const status = filter.status || [];
  const tabValue = status.length === 0 ? "all" : status.length === 1 ? status[0] : "";
  const baseAssignee = presetFilter(preset).assignee ?? null;
  const assigneeLabel =
    ASSIGNEE_FILTER_OPTIONS.find((o) => o.value === (filter.assignee || ""))?.label ??
    (teammates.find((t) => t.id === filter.assignee)?.name || "Teammate");

  // Every filter-menu choice as a removable chip; the status tab and search are not chips.
  const chips = [
    ...(filter.channel || []).map((value) => ({
      key: `channel:${value}`,
      label: value,
      remove: () => toggleIn("channel", value),
    })),
    ...(filter.priority || []).map((value) => ({
      key: `priority:${value}`,
      label: value,
      remove: () => toggleIn("priority", value),
    })),
    ...(filter.tagIds || []).map((id) => ({
      key: `tag:${id}`,
      label: tags.find((t) => t.id === id)?.name ?? "Tag",
      remove: () => toggleIn("tagIds", id),
    })),
    ...((filter.assignee || null) !== baseAssignee
      ? [{ key: "assignee", label: assigneeLabel, remove: () => set({ assignee: baseAssignee }) }]
      : []),
    ...(filter.unread ? [{ key: "unread", label: "Unread", remove: () => set({ unread: null }) }] : []),
  ];
  const clearMenu = () => set({ channel: [], priority: [], tagIds: [], assignee: baseAssignee, unread: null });

  const empty = TAB_EMPTY_COPY[tabValue] ?? EMPTY_COPY[preset] ?? EMPTY_COPY.all;
  const sortLabel = SORT_OPTIONS.find((o) => o.value === (filter.sort || "newest"))?.label;

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-r border-border">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 pt-4">
        <div className="flex h-8 items-center gap-2">
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-foreground">{title}</h1>
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Updating" /> : null}
          <div className="ml-auto flex items-center gap-1">
            <AvailabilityToggle />
            {onNewConversation ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="New conversation"
                title="New conversation"
                onClick={onNewConversation}
              >
                <SquarePen />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1" data-inbox-search="true">
            <ExpandableSearch
              open
              autoFocus={false}
              expandedWidth="100%"
              value={filter.search || ""}
              onChange={(search) => set({ search })}
              placeholder="Search messages and people"
              label="Search messages, subjects and people (press / to focus)"
              className="min-h-8 w-full"
              inputClassName="py-[5px] [&::-webkit-search-cancel-button]:appearance-none"
            />
            {filter.search ? null : (
              <Kbd
                aria-hidden="true"
                className="absolute right-2 top-1/2 h-[18px] min-w-[18px] -translate-y-1/2 border border-border bg-transparent font-mono text-[11px]"
              >
                /
              </Kbd>
            )}
          </div>

          {/* Filter menu */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                title="Filter"
                aria-label={chips.length ? `Filter conversations, ${chips.length} on` : "Filter conversations"}
                className={cn(
                  "relative border-border bg-surface-card",
                  chips.length > 0 && "border-border-strong bg-surface-hover",
                )}
              >
                <SlidersHorizontal />
                {chips.length > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-background bg-foreground px-1 text-[10px] font-semibold leading-none text-background">
                    {chips.length}
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[300px] rounded-lg border-border bg-surface-card p-0 shadow-xl">
              <div className="space-y-3.5 p-3">
                <FilterSection label="Channel">
                  {CHANNEL_FILTER_OPTIONS.map((option) => (
                    <FilterPill
                      key={option.value}
                      selected={(filter.channel || []).includes(option.value)}
                      onClick={() => toggleIn("channel", option.value)}
                    >
                      {option.label}
                    </FilterPill>
                  ))}
                </FilterSection>

                <FilterSection label="Priority">
                  {PRIORITY_FILTER_OPTIONS.map((option) => (
                    <FilterPill
                      key={option.value}
                      selected={(filter.priority || []).includes(option.value)}
                      onClick={() => toggleIn("priority", option.value)}
                    >
                      {option.label}
                    </FilterPill>
                  ))}
                </FilterSection>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Assignee</p>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full justify-between border-border bg-surface-subtle px-2.5 font-normal"
                      >
                        <span className="truncate">{assigneeLabel}</span>
                        <ChevronDown className="text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-72 w-[274px] overflow-y-auto border-border bg-surface-subtle">
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
                </div>

                <FilterSection label="Tags">
                  {(tags || []).length === 0 ? (
                    <span className="text-xs text-muted-foreground">No tags yet</span>
                  ) : (
                    tags.map((tag) => {
                      const selected = (filter.tagIds || []).includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleIn("tagIds", tag.id)}
                          className={cn(
                            "inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-opacity",
                            TAG_COLOR_MAP[tag.color] || TAG_COLOR_MAP.slate,
                            selected ? "opacity-100" : "opacity-60 hover:opacity-100",
                          )}
                        >
                          {selected ? <Check className="size-3" /> : null}
                          {tag.name}
                        </button>
                      );
                    })
                  )}
                </FilterSection>

                <div className="flex items-center justify-between">
                  <Label htmlFor="inbox-unread-only" className="text-[13px] font-normal text-foreground">
                    Unread only
                  </Label>
                  <Switch
                    id="inbox-unread-only"
                    checked={Boolean(filter.unread)}
                    onCheckedChange={(on) => set({ unread: on ? true : null })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  {chips.length === 0 ? "No filters on" : `${chips.length} filter${chips.length === 1 ? "" : "s"} on`}
                </span>
                <Button type="button" variant="ghost" size="xs" disabled={chips.length === 0} onClick={clearMenu}>
                  Clear all
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="border-border bg-surface-card"
                aria-label={`Sort: ${sortLabel}`}
                title={`Sort: ${sortLabel}`}
              >
                <ArrowUpDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-border bg-surface-subtle">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Sort by</DropdownMenuLabel>
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

        {/* Active filters, plus the connected-channel filter (?channel=<id> from Channels) */}
        {activeChannel || chips.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {activeChannel ? (
              <FilterChip
                icon={Radio}
                label={`Channel: ${activeChannel.name || "Connected channel"}`}
                removeLabel="Clear channel filter"
                onRemove={onClearChannel}
              />
            ) : null}
            {chips.map((chip) => (
              <FilterChip key={chip.key} label={chip.label} removeLabel={`Remove ${chip.label} filter`} onRemove={chip.remove} />
            ))}
            {chips.length > 0 ? (
              <Button type="button" variant="ghost" size="xs" className="h-6 px-1.5 text-muted-foreground" onClick={clearMenu}>
                Clear
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* Status tabs */}
        <Tabs
          value={tabValue}
          onValueChange={(value) => set({ status: value === "all" ? [] : [value] })}
          className="mt-2 gap-0"
        >
          <TabsList variant="line" aria-label="Conversation status" className="w-full justify-start gap-4 px-0">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex-none px-0 text-[13px] data-[state=inactive]:text-muted-foreground"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {bulk && bulk.count > 0 ? (
        <BulkBar
          bulk={bulk}
          loadedCount={conversations.length}
          hasMore={hasMore}
          statusTab={tabValue}
          teammates={teammates}
          me={me}
          tags={tags}
          assignDisabledReason={assignDisabledReason}
          closeDisabledReason={closeDisabledReason}
        />
      ) : null}

      {/* Rows */}
      <div onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
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
          <div className="flex flex-col gap-0.5">
            {conversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === activeId}
                focused={conversation.id === focusedId}
                showStatus={status.length !== 1}
                selected={bulk?.selectedIds.has(conversation.id) ?? false}
                selecting={(bulk?.count ?? 0) > 0}
                searchQuery={filter.search}
                onSelect={onSelect}
                onToggleSelect={bulk?.toggle}
              />
            ))}
            {hasMore && !refreshing ? (
              <button
                type="button"
                onClick={() => onLoadMore?.()}
                className="w-full rounded-lg py-3 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-card hover:text-foreground"
              >
                Load more conversations <ChevronDown className="inline h-3 w-3" />
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default ConversationList;
