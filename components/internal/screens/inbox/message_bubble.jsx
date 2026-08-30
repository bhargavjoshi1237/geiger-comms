"use client";

// One message in the thread pane: comment | note | ai_agent (spec §4.2).
// Notes are visually unmistakable — internal-only, never sent to the customer.

import { memo } from "react";
import { Avatar, AvatarFallback } from "@geiger/ui";
import { Bot, FileText, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

function formatTime(dateStr) {
  const t = new Date(dateStr);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const MessageBubble = memo(function MessageBubble({ message }) {
  const isNote = message.messageType === "note";
  const isAgent = message.authorRole === "agent";
  const isAi = message.authorRole === "ai_agent";

  return (
    <div className={cn("flex w-full gap-3", isAgent || isAi ? "flex-row-reverse" : "flex-row")}>
      <Avatar
        className={cn(
          "mt-0.5 h-7 w-7 shrink-0",
          isNote && "opacity-70",
        )}
      >
        <AvatarFallback
          className={cn(
            "text-[10px]",
            isAi && "bg-violet-400/10 text-violet-300",
            isNote && "bg-surface-hover text-text-secondary",
          )}
        >
          {isAi ? <Bot className="h-3.5 w-3.5" /> : initials(message.authorName)}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "flex min-w-0 max-w-[78%] flex-col gap-1",
          isAgent || isAi ? "items-end" : "items-start",
        )}
      >
        <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
          <span className="font-medium text-text-secondary">
            {message.authorName || (isAi ? "AI Agent" : "Customer")}
          </span>
          {isNote ? (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-1.5 py-px font-medium text-amber-300">
              <StickyNote className="h-2.5 w-2.5" /> Internal note
            </span>
          ) : null}
          <span>{formatTime(message.createdAt)}</span>
        </div>

        <div
          className={cn(
            "whitespace-pre-wrap break-words rounded-xl border px-3 py-2 text-sm leading-relaxed",
            isNote
              ? "border-amber-400/20 bg-amber-400/10 text-foreground"
              : isAgent
                ? "border-border bg-primary text-primary-foreground"
                : "border-border bg-surface-subtle text-foreground",
          )}
        >
          {message.body}
        </div>

        {(message.attachments || []).length > 0 ? (
          <div className={cn("flex flex-wrap gap-1.5", isAgent || isAi ? "justify-end" : "")}>
            {message.attachments.map((a, i) => (
              <a
                key={a.url ?? a.path ?? i}
                href={a.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-card px-2 py-1 text-[11px] text-text-secondary transition-colors hover:text-foreground"
              >
                <FileText className="h-3 w-3" />
                <span className="max-w-[160px] truncate">{a.name ?? a.path ?? "Attachment"}</span>
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default MessageBubble;
