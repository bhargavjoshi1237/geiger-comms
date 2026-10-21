"use client";

// One message in the thread pane: comment | note | ai_agent (spec §4.2).
// Notes are visually unmistakable — internal-only, never sent to the customer. `grouped` drops the header for a same-author follow-up.

import { memo } from "react";
import { Avatar, AvatarFallback } from "@geiger/ui";
import { Bot, FileText, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClock, initials } from "./constants";

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Splits a note body so each "@Teammate Name" renders highlighted; a name must end at a non-word char.
function withMentions(body, names) {
  const known = (names || []).filter(Boolean).sort((a, b) => b.length - a.length);
  if (known.length === 0 || !body.includes("@")) return body;
  const pattern = new RegExp(`(@(?:${known.map(escapeRegExp).join("|")}))(?![\\p{L}\\p{N}_])`, "gu");
  return body.split(pattern).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="font-semibold text-amber-300">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export const MessageBubble = memo(function MessageBubble({ message, grouped, mentionNames }) {
  const isNote = message.messageType === "note";
  const isAgent = message.authorRole === "agent";
  const isAi = message.authorRole === "ai_agent";
  const outbound = isAgent || isAi;
  const author = message.authorName || (isAi ? "AI Agent" : "Customer");

  return (
    <div className={cn("flex w-full gap-3", outbound ? "flex-row-reverse" : "flex-row", grouped && "-mt-3.5")}>
      {grouped ? (
        <span className="w-7 shrink-0" aria-hidden="true" />
      ) : (
        <Avatar className="size-7 shrink-0">
          <AvatarFallback
            className={cn(
              "text-[11px] font-medium text-foreground",
              isAi ? "bg-violet-400/10 text-violet-300" : outbound ? "bg-surface-strong" : "bg-surface-hover",
            )}
          >
            {isAi ? <Bot className="h-3.5 w-3.5" /> : initials(author)}
          </AvatarFallback>
        </Avatar>
      )}

      <div className={cn("flex min-w-0 max-w-[min(560px,85%)] flex-col gap-1.5", outbound ? "items-end" : "items-start")}>
        {grouped ? null : (
          <div className="flex items-center gap-2">
            {isNote ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-300">
                <StickyNote className="h-3 w-3" /> Internal note
              </span>
            ) : null}
            <span className="text-[13px] font-semibold text-foreground">{author}</span>
            <span className="text-xs text-muted-foreground">{formatClock(message.createdAt)}</span>
          </div>
        )}

        <div
          title={grouped ? formatClock(message.createdAt) : undefined}
          className={cn(
            "whitespace-pre-wrap break-words rounded-xl border px-3.5 py-2.5 text-sm leading-[1.55] text-foreground",
            outbound ? "rounded-tr-sm" : "rounded-tl-sm",
            isNote
              ? "border-amber-400/30 bg-amber-400/[0.08]"
              : outbound
                ? "border-transparent bg-surface-strong"
                : "border-border bg-surface-card",
          )}
        >
          {isNote ? withMentions(message.body, mentionNames) : message.body}
        </div>

        {(message.attachments || []).length > 0 ? (
          <div className={cn("flex flex-wrap gap-1.5", outbound ? "justify-end" : "")}>
            {message.attachments.map((a, i) => (
              <a
                key={a.url ?? a.path ?? i}
                href={a.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-card px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
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
