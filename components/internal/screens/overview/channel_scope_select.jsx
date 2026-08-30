"use client";

// Scopes a widget's stats to a chosen set of channels. Empty selection means
// "all channels".

import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@geiger/ui";
import { CalendarDays, ChevronDown } from "lucide-react";

export function ChannelScopeSelect({ channels, selected, onChange }) {
  const all = selected.length === 0;
  // Clip a single channel's name to 5 chars + ellipsis so the trigger stays compact.
  const clip = (s) => (s.length > 5 ? `${s.slice(0, 5)}…` : s);
  const label = all
    ? "All"
    : selected.length === 1
      ? clip(channels.find((c) => c === selected[0]) || "1 channel")
      : `${selected.length} channels`;

  const toggle = (channel) =>
    onChange(
      selected.includes(channel)
        ? selected.filter((x) => x !== channel)
        : [...selected, channel],
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-9 gap-2 border-border bg-surface-card text-foreground hover:bg-surface-active"
          disabled={!channels.length}
        >
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="max-w-[160px] truncate">{label}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-72 w-56 overflow-y-auto border-border bg-surface-subtle"
      >
        <DropdownMenuCheckboxItem
          checked={all}
          onCheckedChange={() => onChange([])}
          onSelect={(e) => e.preventDefault()}
        >
          All Channels
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator className="bg-border" />
        {channels.map((channel) => (
          <DropdownMenuCheckboxItem
            key={channel}
            checked={selected.includes(channel)}
            onCheckedChange={() => toggle(channel)}
            onSelect={(e) => e.preventDefault()}
          >
            <span className="truncate">{channel}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
