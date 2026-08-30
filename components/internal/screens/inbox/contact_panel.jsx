"use client";

// The right pane: the conversation's contact record, its tags (editable), and
// a shortcut to create a ticket from this thread. Collapses to a toggle in
// below-lg layouts (the shell owns that).

import { useState } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
} from "@geiger/ui";
import { Building2, Mail, PlusCircle, Tag as TagIcon, Ticket as TicketIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@geiger/ui";
import { cn } from "@/lib/utils";
import { TAG_COLOR_MAP } from "./constants";

function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

export function ContactPanel({ conversation, tags, onSetTags, onCreateTicket }) {
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const active = new Set((conversation?.tags || []).map((t) => t.id));

  function toggleTag(tag) {
    const nextIds = active.has(tag.id)
      ? (conversation.tags || []).filter((t) => t.id !== tag.id).map((t) => t.id)
      : [...(conversation.tags || []).map((t) => t.id), tag.id];
    onSetTags?.(conversation, nextIds);
  }

  if (!conversation) {
    return (
      <div className="hidden h-full w-[320px] shrink-0 overflow-y-auto border-l border-border p-4 lg:block">
        <p className="py-8 text-center text-xs text-text-tertiary">
          Contact details appear when a conversation is open.
        </p>
      </div>
    );
  }

  return (
    <div className="hidden h-full w-[320px] shrink-0 overflow-y-auto border-l border-border p-4 lg:block">
      {/* Contact identity */}
      <div className="flex flex-col items-center gap-2 border-b border-border pb-5 text-center">
        <Avatar className="h-14 w-14">
          <AvatarImage src={conversation.contactAvatar || undefined} alt="" />
          <AvatarFallback>{initials(conversation.contactName)}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-semibold text-foreground">{conversation.contactName}</p>
          {conversation.contactEmail ? (
            <a
              href={`mailto:${conversation.contactEmail}`}
              className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Mail className="h-3 w-3" /> {conversation.contactEmail}
            </a>
          ) : null}
        </div>
      </div>

      {/* Tags */}
      <div className="border-b border-border py-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
            Tags
          </span>
          <DropdownMenu open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Edit tags">
                <TagIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-64 w-52 overflow-y-auto border-border bg-surface-subtle">
              {(tags || []).length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-text-tertiary">No tags yet</p>
              ) : (
                (tags || []).map((tag) => (
                  <DropdownMenuCheckboxItem
                    key={tag.id}
                    checked={active.has(tag.id)}
                    onCheckedChange={() => toggleTag(tag)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span
                      className={cn(
                        "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                        TAG_COLOR_MAP[tag.color] || TAG_COLOR_MAP.slate,
                      )}
                    >
                      {tag.name}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(conversation.tags || []).length === 0 ? (
            <span className="text-xs text-text-tertiary">No tags applied</span>
          ) : (
            conversation.tags.map((tag) => (
              <Badge key={tag.id} variant="outline" className={cn("border", TAG_COLOR_MAP[tag.color] || TAG_COLOR_MAP.slate)}>
                {tag.name}
              </Badge>
            ))
          )}
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2.5 border-b border-border py-4 text-xs">
        <DetailRow icon={Building2} label="Channel" value={conversation.channel || "Chat"} />
        <DetailRow icon={TicketIcon} label="Priority" value={conversation.priority} />
        <DetailRow icon={PlusCircle} label="Created" value={formatDate(conversation.createdAt)} />
      </div>

      {/* Actions */}
      <div className="pt-4">
        <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 border-border bg-surface-card" onClick={() => onCreateTicket?.(conversation)}>
          <TicketIcon className="h-3.5 w-3.5" /> Create ticket from thread
        </Button>
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-text-tertiary">
        <Icon className="h-3 w-3" /> {label}
      </span>
      <span className="truncate font-medium text-text-secondary">{value}</span>
    </div>
  );
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default ContactPanel;
