"use client";

// The right pane: the conversation's contact record, its tags and a ticket shortcut.
// Inline from lg up; below lg the shell shows ContactDetails in a sheet opened from the thread header (spec §4.2).

import Link from "next/link";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  LogoLoading,
} from "@geiger/ui";
import { Building2, ExternalLink, Mail, PlusCircle, Tag as TagIcon, Ticket as TicketIcon } from "lucide-react";
import { tabToSlug } from "@/lib/workspace/tabs";
import { cn } from "@/lib/utils";
import { TagPicker } from "./tag_picker";
import { TAG_COLOR_MAP } from "./constants";

function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

// People detail for this contact (Customers → People reads ?person=<contactId>).
function personHref(projectId, contactId) {
  if (!projectId || !contactId) return null;
  return `/project/${projectId}/${tabToSlug("People")}?person=${encodeURIComponent(contactId)}`;
}

export function ContactDetails({ conversation, tags, projectId, onToggleTag, onCreateTag, onCreateTicket }) {
  const profileHref = personHref(projectId, conversation.contactId);
  const applied = conversation.tags || [];

  return (
    <div>
      {/* Contact identity */}
      <div className="flex flex-col items-center gap-2 border-b border-border pb-5 text-center">
        <Avatar className="h-14 w-14">
          <AvatarImage src={conversation.contactAvatar || undefined} alt="" />
          <AvatarFallback>{initials(conversation.contactName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 max-w-full">
          <p className="truncate text-sm font-semibold text-foreground">{conversation.contactName}</p>
          {conversation.contactEmail ? (
            <a
              href={`mailto:${conversation.contactEmail}`}
              className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{conversation.contactEmail}</span>
            </a>
          ) : null}
        </div>
        {profileHref ? (
          <Button asChild variant="outline" size="xs" className="border-border bg-surface-card">
            <Link href={profileHref}>
              <ExternalLink /> Open profile
            </Link>
          </Button>
        ) : null}
      </div>

      {/* Tags */}
      <div className="border-b border-border py-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Tags</span>
          <TagPicker
            tags={tags}
            selected={applied}
            onToggle={(tag) => onToggleTag?.(conversation, tag)}
            onCreate={(name) => onCreateTag?.(conversation, name)}
          >
            <Button variant="ghost" size="icon-sm" aria-label="Edit tags">
              <TagIcon />
            </Button>
          </TagPicker>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {applied.length === 0 ? (
            <span className="text-xs text-text-tertiary">No tags applied</span>
          ) : (
            applied.map((tag) => (
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-1.5 border-border bg-surface-card"
          onClick={() => onCreateTicket?.(conversation)}
        >
          <TicketIcon className="h-3.5 w-3.5" /> Create ticket from thread
        </Button>
      </div>
    </div>
  );
}

export function ContactPanel({ conversation, loading, ...rest }) {
  return (
    <aside
      aria-label="Contact details"
      className="hidden h-full min-h-0 w-[320px] shrink-0 overflow-y-auto border-l border-border p-4 lg:block"
    >
      {conversation ? (
        <ContactDetails conversation={conversation} {...rest} />
      ) : loading ? (
        <div className="flex h-full items-center justify-center">
          <LogoLoading size={36} />
        </div>
      ) : (
        <p className="py-8 text-center text-xs text-text-tertiary">Contact details appear when a conversation is open.</p>
      )}
    </aside>
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
