"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Badge, Input } from "@geiger/ui";

import { cn } from "@/lib/utils";

// Free-form tag list: Enter/comma commits a removable Badge chip; `list` names a <datalist> of suggestions.
export function TagInput({ value = [], onChange, placeholder, validate, className, list, "aria-label": ariaLabel }) {
  const [draft, setDraft] = useState("");

  // Commits every entry in one onChange, so a multi-tag paste doesn't overwrite itself; an invalid entry keeps the draft.
  const addTags = (raws) => {
    const next = [...value];
    let invalid = false;
    for (const raw of raws) {
      const tag = raw.trim();
      if (!tag || next.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
      if (validate && !validate(tag)) {
        toast.error(`"${tag}" isn't valid.`);
        invalid = true;
        continue;
      }
      next.push(tag);
    }
    if (next.length > value.length) onChange?.(next);
    if (!invalid) setDraft("");
  };
  const addTag = (raw) => addTags([raw]);

  const removeTag = (tag) => {
    onChange?.(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (e) => {
    // IME composition (picking a CJK candidate) also fires "Enter" — not a tag commit.
    if (e.key === "Enter" && !e.nativeEvent?.isComposing) {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === ",") {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      removeTag(value[value.length - 1]);
    }
  };

  // A pasted "a, b, c" commits every entry at once.
  const handlePaste = (e) => {
    const text = e.clipboardData?.getData("text") ?? "";
    if (!text.includes(",")) return;
    e.preventDefault();
    addTags(text.split(","));
  };

  return (
    <div
      className={cn(
        "flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface-card px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring/40",
        className,
      )}
    >
      {value.map((tag) => (
        <Badge key={tag} variant="neutral" className="gap-1 pr-1">
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => removeTag(tag)}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-surface-active hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={() => addTag(draft)}
        placeholder={value.length ? "" : placeholder}
        list={list}
        aria-label={ariaLabel}
        className="h-7 min-w-[8rem] flex-1 border-none bg-transparent px-1 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}

export default TagInput;
