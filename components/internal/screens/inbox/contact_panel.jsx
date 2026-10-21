"use client";

// The right pane: who the customer is, the conversation's editable properties (assignee, priority, tags) and a ticket shortcut.
// Inline from lg up; below lg the shell shows ContactDetails in a sheet opened from the thread header (spec §4.2).

import Link from "next/link";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  LogoLoading,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@geiger/ui";
import { CircleDot, ExternalLink, Plus, Ticket as TicketIcon, User, UserMinus, UserPlus } from "lucide-react";
import { tabToSlug } from "@/lib/workspace/tabs";
import { cn } from "@/lib/utils";
import { TagPicker } from "./tag_picker";
import {
  CONVERSATION_STATUS_MAP,
  PRIORITY_FILTER_OPTIONS,
  PRIORITY_META,
  TAG_COLOR_MAP,
  channelMeta,
  contactLabel,
  formatDayTime,
  initials,
  isKnownContact,
} from "./constants";

// The ghost button that holds an editable property value.
const VALUE_BUTTON =
  "h-[30px] w-full justify-start gap-2 px-2 text-[13px] font-normal text-foreground hover:bg-surface-card has-[>svg]:px-2";

// People detail for this contact (Customers → People reads ?person=<contactId>).
function personHref(projectId, contactId) {
  if (!projectId || !contactId) return null;
  return `/project/${projectId}/${tabToSlug("People")}?person=${encodeURIComponent(contactId)}`;
}

function Property({ label, alignTop, children }) {
  return (
    <>
      <dt className={cn("text-[13px] text-muted-foreground", alignTop && "self-start leading-[30px]")}>{label}</dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </>
  );
}

function PropertyText({ children }) {
  return <div className="flex h-[30px] min-w-0 items-center gap-2 px-2 text-[13px] text-foreground">{children}</div>;
}

export function ContactDetails({
  conversation,
  tags,
  teammates = [],
  me,
  projectId,
  assignDisabledReason,
  onAssign,
  onPriority,
  onToggleTag,
  onCreateTag,
  onCreateTicket,
}) {
  const profileHref = personHref(projectId, conversation.contactId);
  const applied = conversation.tags || [];
  const status = CONVERSATION_STATUS_MAP[conversation.status] || CONVERSATION_STATUS_MAP.Open;
  const priority = PRIORITY_META[conversation.priority] || PRIORITY_META.Normal;
  const PriorityIcon = priority.icon;
  const channel = conversation.channel || "Chat";
  const ChannelIcon = channelMeta(channel).icon;
  const assignee = teammates.find((t) => t.id === conversation.assigneeId) ?? null;
  const assigneeName = assignee?.name || conversation.assignee || "";
  const started = formatDayTime(conversation.createdAt) || "—";

  const assigneeValue = (
    <Button variant="ghost" size="sm" disabled={Boolean(assignDisabledReason)} className={VALUE_BUTTON}>
      {assigneeName ? (
        <Avatar className="size-[18px]">
          <AvatarImage src={assignee?.avatarUrl || undefined} alt="" />
          <AvatarFallback className="bg-surface-strong text-[8px] font-semibold text-foreground">
            {initials(assigneeName)}
          </AvatarFallback>
        </Avatar>
      ) : null}
      <span className={cn("truncate", !assigneeName && "text-muted-foreground")}>{assigneeName || "Unassigned"}</span>
    </Button>
  );

  return (
    <div>
      {/* Contact */}
      <div className="flex items-center gap-3">
        <Avatar className="size-10">
          <AvatarImage src={conversation.contactAvatar || undefined} alt="" />
          <AvatarFallback className="bg-surface-hover text-sm font-medium text-foreground">
            {isKnownContact(conversation) ? initials(conversation.contactName) : <User className="size-4 text-muted-foreground" />}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{contactLabel(conversation)}</p>
          {conversation.contactEmail && conversation.contactEmail !== contactLabel(conversation) ? (
            <a
              href={`mailto:${conversation.contactEmail}`}
              className="block truncate text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {conversation.contactEmail}
            </a>
          ) : null}
        </div>
        {profileHref ? (
          <Button asChild variant="ghost" size="icon-sm" className="size-7 shrink-0">
            <Link href={profileHref} aria-label={`Open ${contactLabel(conversation)}'s profile`} title="Open profile">
              <ExternalLink />
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="mb-4 mt-5 h-px bg-border" />

      {/* Conversation properties */}
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">Conversation</h3>
      <dl className="m-0 grid grid-cols-[84px_minmax(0,1fr)] items-center gap-y-0.5">
        <Property label="Status">
          <PropertyText>
            <span className={cn("size-[7px] shrink-0 rounded-full", status.dotClass)} />
            <span className="truncate">{status.label}</span>
          </PropertyText>
        </Property>

        <Property label="Assignee">
          {assignDisabledReason ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="flex rounded-md">
                  {assigneeValue}
                </span>
              </TooltipTrigger>
              <TooltipContent>{assignDisabledReason}</TooltipContent>
            </Tooltip>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>{assigneeValue}</DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto border-border bg-surface-subtle">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Assign to
                </DropdownMenuLabel>
                {me && conversation.assigneeId !== me.id ? (
                  <DropdownMenuItem className="text-xs" onClick={() => onAssign?.(conversation, me)}>
                    <UserPlus /> Assign to me
                  </DropdownMenuItem>
                ) : null}
                {conversation.assigneeId ? (
                  <DropdownMenuItem className="text-xs" onClick={() => onAssign?.(conversation, null)}>
                    <UserMinus /> Unassign
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator className="bg-border" />
                {teammates.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">No teammates yet</p>
                ) : (
                  teammates.map((t) => (
                    <DropdownMenuItem
                      key={t.id}
                      className={cn("text-xs", conversation.assigneeId === t.id && "bg-surface-active")}
                      onClick={() => onAssign?.(conversation, t)}
                    >
                      <span className="truncate">{t.name || t.email || "Teammate"}</span>
                      {conversation.assigneeId === t.id ? <CircleDot className="ml-auto h-3 w-3" /> : null}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </Property>

        <Property label="Priority">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={VALUE_BUTTON}
                aria-label={`Priority: ${priority.label}. Change priority`}
              >
                <PriorityIcon className={cn("size-3.5", priority.className)} />
                {priority.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="border-border bg-surface-subtle">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Priority
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={conversation.priority}
                onValueChange={(value) => onPriority?.(conversation, value)}
              >
                {PRIORITY_FILTER_OPTIONS.map((option) => {
                  const meta = PRIORITY_META[option.value];
                  const Icon = meta?.icon;
                  return (
                    <DropdownMenuRadioItem key={option.value} value={option.value} className="text-xs">
                      {Icon ? <Icon className={cn("h-3.5 w-3.5", meta.className)} /> : null}
                      {option.label}
                    </DropdownMenuRadioItem>
                  );
                })}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </Property>

        <Property label="Tags" alignTop>
          <div className="flex min-h-[30px] flex-wrap items-center gap-1.5 px-2 py-[5px]">
            {applied.map((tag) => (
              <span
                key={tag.id}
                className={cn(
                  "inline-flex h-5 max-w-full items-center truncate rounded-full border px-2 text-xs font-medium",
                  TAG_COLOR_MAP[tag.color] || TAG_COLOR_MAP.slate,
                )}
              >
                {tag.name}
              </span>
            ))}
            <TagPicker
              tags={tags}
              selected={applied}
              onToggle={(tag) => onToggleTag?.(conversation, tag)}
              onCreate={(name) => onCreateTag?.(conversation, name)}
              align="start"
            >
              <Button
                variant="ghost"
                size="xs"
                className="h-5 gap-0.5 rounded-full px-1.5 text-xs font-normal text-muted-foreground has-[>svg]:px-1.5"
                aria-label="Edit tags"
              >
                <Plus /> {applied.length === 0 ? "Add tag" : "Add"}
              </Button>
            </TagPicker>
          </div>
        </Property>

        <Property label="Channel">
          <PropertyText>
            <ChannelIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{channel}</span>
          </PropertyText>
        </Property>

        <Property label="Started">
          <PropertyText>
            <span className="truncate">{started}</span>
          </PropertyText>
        </Property>
      </dl>

      <div className="my-4 h-px bg-border" />

      {/* Ticket */}
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">Ticket</h3>
      <p className="mb-3 text-[13px] text-muted-foreground">
        Turn this conversation into a ticket to track the fix with your team.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 border-border bg-surface-card"
        onClick={() => onCreateTicket?.(conversation)}
      >
        <TicketIcon className="h-3.5 w-3.5" /> Create ticket
      </Button>
    </div>
  );
}

export function ContactPanel({ conversation, loading, ...rest }) {
  return (
    <aside
      aria-label="Conversation details"
      className="hidden h-full min-h-0 w-[300px] shrink-0 overflow-y-auto border-l border-border p-5 lg:block"
    >
      {conversation ? (
        <ContactDetails conversation={conversation} {...rest} />
      ) : loading ? (
        <div className="flex h-full items-center justify-center">
          <LogoLoading size={36} />
        </div>
      ) : (
        <p className="py-8 text-center text-xs text-muted-foreground">Details appear when a conversation is open.</p>
      )}
    </aside>
  );
}

export default ContactPanel;
