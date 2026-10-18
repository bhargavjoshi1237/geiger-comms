"use client";

// Searchable tag picker: toggles tags on a conversation one at a time, or creates a tag inline from the query.

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Input, Popover, PopoverContent, PopoverTrigger } from "@geiger/ui";
import { cn } from "@/lib/utils";
import { TAG_COLOR_MAP } from "./constants";

export function TagPicker({ tags, selected, onToggle, onCreate, align = "end", children }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedIds = new Set((selected || []).map((t) => t.id));
  const trimmed = query.trim();
  const q = trimmed.toLowerCase();
  const matches = q ? (tags || []).filter((t) => t.name.toLowerCase().includes(q)) : tags || [];
  const exact = (tags || []).find((t) => t.name.toLowerCase() === q) ?? null;

  function handleOpenChange(next) {
    setOpen(next);
    if (!next) setQuery("");
  }

  function submit() {
    if (!trimmed) return;
    if (exact) onToggle?.(exact);
    else onCreate?.(trimmed);
    setQuery("");
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-60 border-border bg-surface-subtle p-0">
        <div className="border-b border-border p-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Search or create a tag…"
            aria-label="Search or create a tag"
            className="h-8 border-border bg-surface-card text-xs"
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1" role="listbox" aria-multiselectable="true" aria-label="Tags">
          {matches.map((tag) => {
            const on = selectedIds.has(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => onToggle?.(tag)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover"
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-foreground">
                  {on ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
                <span
                  className={cn(
                    "truncate rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                    TAG_COLOR_MAP[tag.color] || TAG_COLOR_MAP.slate,
                  )}
                >
                  {tag.name}
                </span>
              </button>
            );
          })}
          {trimmed && !exact ? (
            <button
              type="button"
              onClick={submit}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Create “{trimmed}”</span>
            </button>
          ) : null}
          {!trimmed && matches.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-text-tertiary">No tags yet — type to create one.</p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default TagPicker;
