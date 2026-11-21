import { AtSign, Check, ChevronDown, Clock, CornerDownLeft, Inbox, ListFilter, Lock, Paperclip, Tag, Ticket, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, Dot, LINE, Window } from "@/components/landing/kit/mock_kit";
import { CONVERSATIONS, ContactPanel, InboxList, InboxRow, ThreadPane } from "@/components/landing/comms_renders";
import styles from "@/components/landing/kit/product_pages.module.css";

// Inbox section renders: the full three-pane inbox, snoozing, internal notes, tickets and bulk actions.

const VIEWS = [
  { icon: Inbox, label: "Your Inbox", count: 12, active: true },
  { icon: Inbox, label: "All Conversations", count: 48 },
  { icon: AtSign, label: "Mentions", count: 3 },
  { icon: ListFilter, label: "Views", count: null },
  { icon: Ticket, label: "Tickets", count: 7 },
];

const SAVED_VIEWS = ["Billing", "VIP customers", "Waiting on us"];

function InboxNav({ className }) {
  return (
    <div className={cn("flex flex-col gap-0.5 px-3 py-4 text-[12.5px]", className)}>
      <div className="mb-3 flex items-center gap-2 px-2">
        <span className="flex size-5 items-center justify-center rounded-md bg-foreground text-[10px] font-semibold text-background">H</span>
        <span className="font-medium">Halcyon</span>
        <ChevronDown className="ml-auto size-3 text-muted-foreground" />
      </div>
      {VIEWS.map(({ icon: Icon, label, count, active }) => (
        <div key={label} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5", active ? "bg-foreground/[0.07] text-foreground" : "text-foreground/75")}>
          <Icon className="size-3.5 text-muted-foreground" />
          {label}
          {count ? <span className="ml-auto text-[11px] text-muted-foreground">{count}</span> : null}
        </div>
      ))}
      <div className="mt-4 mb-1 px-2 text-[11px] text-muted-foreground">Saved views</div>
      {SAVED_VIEWS.map((label) => (
        <div key={label} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-foreground/75">
          <Dot tone="neutral" className="mx-1" />
          {label}
        </div>
      ))}
      <div className={cn("mt-auto flex items-center gap-2 rounded-lg border px-2.5 py-2", LINE)}>
        <Avatar name="Aria" size={20} />
        <span className="text-foreground/85">Aria</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
          <Dot tone="emerald" /> Available
        </span>
      </div>
    </div>
  );
}

// The whole workspace at a glance: navigation, queue, thread and the customer's details.
export function InboxStage() {
  return (
    <Window className="h-[680px] w-[1040px]">
      <div className="flex h-full">
        <InboxNav className={cn("w-[190px] shrink-0 border-r", LINE)} />
        <InboxList count={7} className={cn("w-[300px] shrink-0 border-r", LINE)} />
        <ThreadPane className={cn("min-w-0 flex-1 border-r", LINE)} />
      </div>
    </Window>
  );
}

const SNOOZE = ["In 1 hour", "In 3 hours", "Tomorrow 9am", "Next week", "Custom…"];

export function SnoozeRender() {
  return (
    <div className="relative mx-auto h-[300px] w-[460px]">
      <div className={cn("absolute inset-x-0 top-0 rounded-xl border border-foreground/[0.1] bg-surface-card text-[13px] dark:bg-surface-subtle", styles.fadeBottom)}>
        <div className={cn("flex h-11 items-center gap-2 border-b px-4", LINE)}>
          <span className="truncate font-medium">Template approval question</span>
          <div className="ml-auto flex items-center gap-3 text-muted-foreground">
            <UserPlus className="size-4" />
            <span className="flex size-6 items-center justify-center rounded-md bg-foreground/[0.08] text-foreground">
              <Clock className="size-4" />
            </span>
            <Check className="size-4" />
          </div>
        </div>
        <div className="h-[220px]" />
      </div>
      <div className="absolute top-[52px] right-[18px] w-[220px] rounded-xl border border-foreground/[0.1] bg-surface-card p-1.5 text-[13px] shadow-xl shadow-black/20 dark:bg-surface-dialog">
        <div className="flex items-center justify-between px-2.5 pt-1 pb-2 text-[11px] text-muted-foreground">
          Snooze until
          <span className="rounded border border-foreground/[0.12] px-1 font-sans">S</span>
        </div>
        {SNOOZE.map((label, index) => (
          <div key={label} className={cn("flex items-center rounded-md px-2.5 py-1.5", index === 2 ? "bg-foreground/[0.07] text-foreground" : "text-foreground/80")}>
            {label}
            {index === 2 ? <span className="ml-auto text-[11px] text-muted-foreground">Fri 9:00</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function NoteRender() {
  return (
    <div className="relative mx-auto h-[300px] w-[460px]">
      <div className="absolute inset-x-0 bottom-0 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] text-[13px]">
        <div className="flex items-center gap-4 border-b border-amber-500/20 px-3.5 pt-2.5 text-[12px]">
          <span className="pb-2 text-muted-foreground">Reply</span>
          <span className="border-b border-amber-600 pb-2 font-medium text-amber-700 dark:border-amber-300 dark:text-amber-300">Note</span>
          <span className="ml-auto inline-flex items-center gap-1 pb-2 text-muted-foreground">
            <Lock className="size-3" /> Only team can see notes
          </span>
        </div>
        <div className="px-3.5 py-3 leading-6 text-foreground/90">
          Customer was double-charged in October.{" "}
          <span className="rounded bg-amber-500/15 px-1 font-medium text-amber-700 dark:text-amber-300">@Ar</span>
          <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-foreground" />
        </div>
        <div className="flex items-center gap-3 px-3 pb-2.5 text-muted-foreground">
          <Paperclip className="size-3.5" />
          <AtSign className="size-3.5" />
          <span className="ml-auto flex h-7 items-center gap-1.5 rounded-md bg-amber-500/90 px-2.5 text-[12px] font-medium text-black">
            Add note <CornerDownLeft className="size-3" />
          </span>
        </div>
      </div>
      <div className="absolute top-0 left-[150px] w-[230px] rounded-xl border border-foreground/[0.1] bg-surface-card p-1.5 text-[13px] shadow-xl shadow-black/20 dark:bg-surface-dialog">
        <div className="px-2.5 pt-1 pb-2 text-[11px] text-muted-foreground">Mention a teammate</div>
        {[
          ["Aria", "Billing"],
          ["Ann", "Support"],
          ["Marco", "Support"],
        ].map(([name, team], index) => (
          <div key={name} className={cn("flex items-center gap-2 rounded-md px-2.5 py-1.5", index === 0 && "bg-foreground/[0.07]")}>
            <Avatar name={name} size={20} />
            <span className="text-foreground/90">{name}</span>
            <span className="ml-auto text-[11px] text-muted-foreground">{team}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TICKET_STATES = ["Submitted", "In progress", "Waiting", "Resolved"];

export function TicketRender() {
  return (
    <div className="mx-auto w-[440px] rounded-xl border border-foreground/[0.1] bg-surface-card text-[13px] shadow-xl shadow-black/10 dark:bg-surface-subtle">
      <div className={cn("flex items-center gap-2 border-b px-4 py-3", LINE)}>
        <Ticket className="size-4 text-muted-foreground" />
        <span className="font-medium">Refund double charge</span>
        <span className="ml-auto rounded-full border border-foreground/[0.1] px-2 py-0.5 text-[11px] text-muted-foreground">Back-office</span>
      </div>
      <div className="px-4 py-4">
        <div className="flex items-center gap-1.5">
          {TICKET_STATES.map((state, index) => (
            <div key={state} className="flex flex-1 flex-col gap-1.5">
              <span className={cn("h-1 rounded-full", index < 2 ? (index === 1 ? "bg-amber-500" : "bg-foreground/60") : "bg-foreground/10")} />
              <span className={cn("text-[11px]", index === 1 ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>{state}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-[88px_1fr] gap-y-2 text-[12px]">
          <span className="text-muted-foreground">Type</span>
          <span className="flex gap-1.5">
            {["Customer", "Back-office", "Tracker"].map((type) => (
              <span key={type} className={cn("rounded-md px-1.5", type === "Back-office" ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground")}>
                {type}
              </span>
            ))}
          </span>
          <span className="text-muted-foreground">Assignee</span>
          <span className="flex items-center gap-1.5 text-foreground/90">
            <Avatar name="Aria" size={16} /> Aria
          </span>
          <span className="text-muted-foreground">Conversations</span>
          <span className="flex items-center gap-1.5 text-foreground/90">
            <Avatar name="Maya Chen" size={16} /> Refund for duplicate charge
          </span>
        </div>
      </div>
    </div>
  );
}

export function BulkRender() {
  const rows = CONVERSATIONS.slice(1, 5);
  return (
    <div className="relative mx-auto h-[300px] w-[460px]">
      <div className={cn("absolute inset-x-0 top-0 h-[270px] overflow-hidden rounded-xl border border-foreground/[0.1] bg-surface-card text-[13px] dark:bg-surface-subtle", styles.fadeBottom)}>
        {rows.map((conversation, index) => (
          <div key={conversation.name} className="flex items-center">
            <span className={cn("ml-4 flex size-4 shrink-0 items-center justify-center rounded border", index < 3 ? "border-foreground bg-foreground text-background" : "border-foreground/25")}>
              {index < 3 ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <InboxRow conversation={conversation} />
            </div>
          </div>
        ))}
      </div>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-foreground/[0.12] bg-surface-card p-1.5 text-[12px] whitespace-nowrap shadow-2xl shadow-black/30 dark:bg-surface-dialog">
        <span className="px-2 font-medium">3 selected</span>
        {[
          [UserPlus, "Assign"],
          [Clock, "Snooze"],
          [Check, "Close"],
          [Tag, "Add a tag"],
        ].map(([Icon, label]) => (
          <span key={label} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-foreground/80">
            <Icon className="size-3.5 text-muted-foreground" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Hero plane for the landing page: the inbox with a reply being typed.
export function HeroInbox({ typed }) {
  return (
    <Window className="h-[700px] w-[1180px]">
      <div className="flex h-full">
        <InboxList count={7} className={cn("w-[340px] shrink-0 border-r", LINE)} />
        <ThreadPane typed={typed} className={cn("min-w-0 flex-1 border-r", LINE)} />
        <ContactPanel className="w-[250px] shrink-0" />
      </div>
    </Window>
  );
}

