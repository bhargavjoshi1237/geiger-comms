import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  Hash,
  Languages,
  MessageCircle,
  Paperclip,
  SendHorizontal,
  Sparkles,
  Star,
  Tag,
  Timer,
  UserPlus,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, Bar, Chip, Dot, LINE, Typed, TypingDots, Window } from "@/components/landing/kit/mock_kit";
import styles from "@/components/landing/kit/product_pages.module.css";

// Core Comms renders (ported from geiger-dash intake/comms_renders.jsx). Messenger is the live inbound channel, so threads arrive by chat.

export const CONVERSATIONS = [
  { name: "Maya Chen", subject: "Refund for duplicate charge", preview: "I was charged twice this month — can you refund the extra?", time: "now", unread: true, urgent: true, waiting: "4m", tag: "billing", assignee: "Aria" },
  { name: "Devon Parker", subject: "How do I invite my team?", preview: "Thanks! And can teammates have different roles?", time: "14m", unread: true, assignee: "Aria" },
  { name: "Tomas Ruiz", subject: "Mobile app keeps logging me out", preview: "Still happening on the latest build, screenshot attached.", time: "32m", urgent: true, tag: "bug" },
  { name: "Priya Nair", subject: "API rate limit questions", preview: "Growth is 600 requests/min per token, right?", time: "1h", assignee: "Marco" },
  { name: "Amara Okafor", subject: "Invoice PDF missing VAT number", preview: "Our finance team needs it on every invoice.", time: "3h", tag: "billing", assignee: "Aria" },
  { name: "Diego Alvarez", subject: "Template approval question", preview: "Who signs off once the template is ready?", time: "5h", assignee: "Marco" },
  { name: "Hannah Feld", subject: "Loving the new dashboard", preview: "The saved views are exactly what we needed.", time: "2d", assignee: "Marco" },
];

export function ChannelAvatar({ name, size = 28 }) {
  return (
    <span className="relative shrink-0">
      <Avatar name={name} size={size} />
      <span className="absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-full bg-surface-card ring-2 ring-surface-card dark:bg-surface-subtle dark:ring-surface-subtle">
        <MessageCircle className="size-2.5 text-muted-foreground" strokeWidth={2.25} />
      </span>
    </span>
  );
}

export function Assignee({ name }) {
  if (!name) return <span className="size-4 rounded-full border border-dashed border-foreground/30" />;
  return <Avatar name={name} size={16} />;
}

export function InboxRow({ conversation, active = false }) {
  const { name, subject, preview, time, unread, urgent, waiting, tag, assignee } = conversation;
  return (
    <div className={cn("flex gap-3 border-b px-4 py-3", LINE, active && "bg-foreground/[0.045]")}>
      <ChannelAvatar name={name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn("truncate", unread ? "font-semibold text-foreground" : "text-foreground/80")}>{name}</span>
          {unread ? <Dot tone="strong" /> : null}
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{time}</span>
        </div>
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
          <span className="text-foreground/75">{subject}</span> — {preview}
        </p>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Dot tone={urgent ? "red" : "neutral"} />
          {urgent ? <span className="font-medium text-red-600 dark:text-red-400">Urgent</span> : <span>Open</span>}
          {waiting ? <span>Waiting {waiting}</span> : null}
          {tag ? <span className="rounded border border-foreground/10 px-1.5 leading-4">{tag}</span> : null}
          <span className="ml-auto">
            <Assignee name={assignee} />
          </span>
        </div>
      </div>
    </div>
  );
}

export function InboxList({ count = 6, activeIndex = 0, className }) {
  return (
    <div className={cn("flex flex-col", className)}>
      <div className={cn("flex h-12 items-center gap-2 border-b px-4", LINE)}>
        <span className="font-medium">All Conversations</span>
        <span className="text-muted-foreground">{CONVERSATIONS.length + 41}</span>
        <span className="ml-auto flex items-center gap-1 text-[12px] text-muted-foreground">
          Newest activity <ChevronDown className="size-3" />
        </span>
      </div>
      <div className={cn("flex gap-1 border-b px-3 py-2 text-[12px]", LINE)}>
        {["Open", "Snoozed", "Closed", "All"].map((tab, index) => (
          <span key={tab} className={cn("rounded-md px-2 py-0.5", index === 0 ? "bg-foreground/[0.07] text-foreground" : "text-muted-foreground")}>
            {tab}
          </span>
        ))}
      </div>
      {CONVERSATIONS.slice(0, count).map((conversation, index) => (
        <InboxRow key={conversation.name} conversation={conversation} active={index === activeIndex} />
      ))}
    </div>
  );
}

export function CustomerMessage({ name, time, children }) {
  return (
    <div className="flex gap-3">
      <Avatar name={name} size={28} />
      <div className="max-w-[78%]">
        <div className="mb-1 flex items-baseline gap-2 text-[12px]">
          <span className="font-medium text-foreground">{name}</span>
          <span className="text-muted-foreground">{time}</span>
        </div>
        <div className="rounded-xl rounded-tl-sm border border-foreground/[0.08] px-3.5 py-2.5 leading-5 text-foreground/90">{children}</div>
      </div>
    </div>
  );
}

export function TeammateMessage({ name, time, children }) {
  return (
    <div className="flex flex-row-reverse gap-3">
      <Avatar name={name} size={28} />
      <div className="max-w-[78%]">
        <div className="mb-1 flex items-baseline justify-end gap-2 text-[12px]">
          <span className="text-muted-foreground">{time}</span>
          <span className="font-medium text-foreground">{name}</span>
        </div>
        <div className="rounded-xl rounded-tr-sm bg-foreground px-3.5 py-2.5 leading-5 text-background">{children}</div>
      </div>
    </div>
  );
}

export function InternalNote({ name, children }) {
  return (
    <div className="ml-10 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3.5 py-2.5 leading-5">
      <div className="mb-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">Internal note · {name}</div>
      <p className="text-foreground/85">{children}</p>
    </div>
  );
}

export function Composer({ typed, text, className }) {
  return (
    <div className={cn("rounded-xl border border-foreground/[0.1] bg-background/40 dark:bg-foreground/[0.02]", className)}>
      <div className={cn("flex items-center gap-4 border-b px-3.5 pt-2.5 text-[12px]", LINE)}>
        <span className="border-b border-foreground pb-2 font-medium text-foreground">Reply</span>
        <span className="pb-2 text-muted-foreground">Note</span>
        <span className="ml-auto pb-2 text-muted-foreground">To Maya Chen by chat</span>
      </div>
      <div className="min-h-[3.25rem] px-3.5 py-3 leading-5">
        {typed ? <Typed text={typed} delay={1.4} /> : text ? <span className="text-foreground/90">{text}</span> : <span className="text-muted-foreground">Write a reply… Type # for a macro.</span>}
      </div>
      <div className="flex items-center gap-3 px-3 pb-2.5 text-muted-foreground">
        <Paperclip className="size-3.5" />
        <Hash className="size-3.5" />
        <Sparkles className="size-3.5" />
        <span className="ml-auto text-[11px]">Ctrl ↵ to send</span>
        <span className="flex h-7 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-[12px] font-medium text-background">
          Send <SendHorizontal className="size-3" />
        </span>
      </div>
    </div>
  );
}

export function SlaTimer({ tone = "ok", children }) {
  const tones = {
    ok: "border-foreground/10 text-muted-foreground",
    amber: "border-amber-500/30 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300",
    red: "border-red-500/30 bg-red-500/[0.08] text-red-600 dark:text-red-400",
    paused: "border-dashed border-foreground/20 text-muted-foreground",
  };
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] whitespace-nowrap", tones[tone])}>
      <Timer className="size-3" />
      {children}
    </span>
  );
}

export function ThreadPane({ typed, className }) {
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <div className={cn("flex h-12 shrink-0 items-center gap-2 border-b px-5", LINE)}>
        <span className="truncate font-medium">Refund for duplicate charge</span>
        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">Urgent</span>
        <div className="ml-auto flex items-center gap-3 text-muted-foreground">
          <SlaTimer>Resolution in 7h</SlaTimer>
          <UserPlus className="size-4" />
          <Clock className="size-4" />
          <Check className="size-4" />
          <Sparkles className="size-4" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 px-5 py-5">
        <CustomerMessage name="Maya Chen" time="9:41">
          Hi! I was charged twice this month — can you refund the extra?
        </CustomerMessage>
        <InternalNote name="Sam">
          <span className="font-medium text-amber-700 dark:text-amber-300">@Aria</span> flagging for you since you own billing — they were double-charged.
        </InternalNote>
        <TeammateMessage name="Aria" time="9:46">
          Sorry about that, Maya. I&apos;ve refunded the duplicate charge, and you&apos;ll see it on your statement in 3–5 days.
        </TeammateMessage>
        <CustomerMessage name="Maya Chen" time="9:47">
          That was quick, thank you! Could you also send me the updated invoice?
        </CustomerMessage>
      </div>
      <div className="px-5 pb-5">
        <Composer typed={typed} />
      </div>
    </div>
  );
}

export function PanelRow({ label, children }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-foreground/90">{children}</span>
    </div>
  );
}

export function ContactPanel({ className }) {
  return (
    <div className={cn("flex flex-col gap-5 px-5 py-5 text-[12px]", className)}>
      <div className="flex items-center gap-3">
        <Avatar name="Maya Chen" size={36} />
        <div>
          <div className="text-[13px] font-medium">Maya Chen</div>
          <div className="text-muted-foreground">maya@northwind.io</div>
        </div>
      </div>
      <div>
        <div className="mb-1 text-[11px] font-medium text-muted-foreground">Conversation</div>
        <PanelRow label="Status">
          <Dot tone="strong" /> Open
        </PanelRow>
        <PanelRow label="Assignee">
          <Avatar name="Aria" size={16} /> Aria
        </PanelRow>
        <PanelRow label="Priority">
          <Dot tone="red" /> Urgent
        </PanelRow>
        <PanelRow label="Tags">
          <Chip className="h-5 px-2 text-[11px]">billing</Chip>
        </PanelRow>
        <PanelRow label="Channel">
          <MessageCircle className="size-3.5 text-muted-foreground" /> Chat
        </PanelRow>
        <PanelRow label="Started">Today, 9:41</PanelRow>
      </div>
      <div>
        <div className="mb-2 text-[11px] font-medium text-muted-foreground">Ticket</div>
        <div className="rounded-lg border border-foreground/[0.08] px-3 py-2.5">
          <div className="font-medium text-foreground/90">Refund double charge</div>
          <div className="mt-1 flex items-center gap-2 text-muted-foreground">
            <Dot tone="amber" /> In progress · Back-office
          </div>
        </div>
      </div>
    </div>
  );
}

// The whole inbox: list, thread and the contact panel, as the hero's tilted plane and the section's main window.
export function InboxWindow({ typed, className }) {
  return (
    <Window className={cn("h-[700px] w-[1180px] flex-row", className)}>
      <div className="flex w-full">
        <InboxList count={7} className={cn("w-[340px] shrink-0 border-r", LINE)} />
        <ThreadPane typed={typed} className={cn("flex-1 border-r", LINE)} />
        <ContactPanel className="w-[250px] shrink-0" />
      </div>
    </Window>
  );
}

// What the customer sees: the Messenger on the business's own site.
export function MessengerWidget({ className }) {
  return (
    <div className={cn("flex w-[340px] flex-col overflow-hidden rounded-[22px] border border-foreground/[0.1] bg-surface-card text-[13px] shadow-2xl shadow-black/25 dark:bg-surface-subtle", className)}>
      <div className={cn("flex items-center gap-3 border-b px-4 py-3.5", LINE)}>
        <ArrowLeft className="size-4 text-muted-foreground" />
        <div className="flex -space-x-1.5">
          <Avatar name="Aria" size={26} />
          <Avatar name="Sam" size={26} />
        </div>
        <div>
          <div className="font-medium">Halcyon Support</div>
          <div className="text-[11px] text-muted-foreground">The team can help</div>
        </div>
      </div>
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-foreground px-3.5 py-2.5 leading-5 text-background">
          Hi! I was charged twice this month — can you refund the extra?
        </div>
        <div className="flex items-end gap-2">
          <Avatar name="Aria" size={22} />
          <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-foreground/[0.06] px-3.5 py-2.5 leading-5">
            Sorry about that, Maya. I&apos;ve refunded the duplicate charge, and you&apos;ll see it in 3–5 days.
          </div>
        </div>
        <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-foreground px-3.5 py-2.5 leading-5 text-background">
          That was quick, thank you!
        </div>
        <div className="flex items-end gap-2">
          <Avatar name="Aria" size={22} />
          <span className="rounded-2xl rounded-bl-md bg-foreground/[0.06] px-3.5 py-3 text-muted-foreground">
            <TypingDots />
          </span>
        </div>
      </div>
      <div className="mx-3 mb-3 flex items-center gap-2 rounded-full border border-foreground/[0.1] px-4 py-2.5 text-muted-foreground">
        Write a reply…
        <SendHorizontal className="ml-auto size-4" />
      </div>
    </div>
  );
}

// Section stage: the customer's Messenger on the left, the same thread in the team's inbox on the right.
export function InboxStage() {
  return (
    <div className="relative h-[640px] w-[1000px]">
      <div className="absolute top-[64px] left-0 opacity-80">
        <MessengerWidget className="h-[540px]" />
      </div>
      <Window className="absolute top-0 left-[270px] z-[2] h-[700px] w-[730px]">
        <div className="flex h-full">
          <ThreadPane className={cn("flex-1 border-r", LINE)} />
          <ContactPanel className="w-[230px] shrink-0" />
        </div>
      </Window>
    </div>
  );
}

const AI_ITEMS = ["Rephrase", "Make friendlier", "Make more formal", "Shorten", "Expand", "Fix spelling & grammar"];

export function CopilotRender() {
  return (
    <div className="relative mx-auto h-[300px] w-[460px]">
      <div className={cn("absolute inset-x-0 top-0 rounded-xl border border-foreground/[0.1] bg-surface-card dark:bg-surface-subtle", styles.fadeBottom)}>
        <div className="flex items-center gap-2 border-b border-violet-500/0 px-4 py-2.5 text-[11px] text-muted-foreground">
          <Sparkles className="size-3" /> AI-generated · Made friendlier
          <span className="ml-auto">Undo</span>
        </div>
        <p className="px-4 pb-16 text-[13px] leading-6 text-foreground/90">
          Hi Maya, thanks so much for flagging this! I&apos;ve refunded the duplicate charge, and it should land back on your card within 3–5 days.
        </p>
      </div>
      <div className="absolute top-[118px] left-[150px] w-[250px] rounded-xl border border-foreground/[0.1] bg-surface-card p-1.5 text-[13px] shadow-xl shadow-black/20 dark:bg-surface-dialog">
        {AI_ITEMS.map((item, index) => (
          <div key={item} className={cn("flex items-center gap-2 rounded-md px-2.5 py-1.5", index === 1 ? "bg-foreground/[0.07] text-foreground" : "text-foreground/80")}>
            <Sparkles className="size-3.5 text-muted-foreground" />
            {item}
          </div>
        ))}
        <div className={cn("mt-1 flex items-center gap-2 border-t px-2.5 pt-2 pb-1 text-foreground/80", LINE)}>
          <Languages className="size-3.5 text-muted-foreground" />
          Translate to the customer&apos;s language
        </div>
      </div>
    </div>
  );
}

const SLA_ROWS = [
  { name: "Maya Chen", subject: "Refund for duplicate charge", tone: "ok", label: "First response in 2h" },
  { name: "Tomas Ruiz", subject: "Mobile app keeps logging me out", tone: "amber", label: "Next response in 12m" },
  { name: "Amara Okafor", subject: "Invoice PDF missing VAT number", tone: "red", label: "Resolution overdue 15m" },
  { name: "Diego Alvarez", subject: "Template approval question", tone: "paused", label: "SLA paused" },
];

export function SlaRender() {
  return (
    <div className="mx-auto flex w-[460px] flex-col gap-2.5">
      <div className="mb-1 flex items-center justify-between px-1 text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground">VIP urgent</span>
        <span>First response 30m · Resolution 8h</span>
      </div>
      {SLA_ROWS.map((row, index) => (
        <div
          key={row.name}
          className={cn("flex items-center gap-3 rounded-xl border border-foreground/[0.08] bg-surface-card px-3.5 py-3 text-[13px] dark:bg-surface-subtle", styles.popIn)}
          style={{ "--pop-delay": `${0.2 + index * 0.12}s` }}
        >
          <Avatar name={row.name} size={24} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{row.name}</div>
            <div className="truncate text-[12px] text-muted-foreground">{row.subject}</div>
          </div>
          <SlaTimer tone={row.tone}>{row.label}</SlaTimer>
        </div>
      ))}
    </div>
  );
}

const WORKFLOW_STEPS = [
  { kind: "Trigger", icon: MessageCircle, label: "New conversation" },
  { kind: "Condition", icon: Tag, label: "Priority is Urgent" },
  { kind: "Action", icon: UserPlus, label: "Assign · Direct: Tier 2" },
  { kind: "Action", icon: Timer, label: "Apply SLA · VIP urgent" },
  { kind: "Action", icon: Zap, label: "Add a note · Urgent — escalated to Tier 2." },
];

export function WorkflowRender() {
  return (
    <div className="relative mx-auto w-[420px]">
      <div className="mb-3 flex items-center gap-2 px-1 text-[12px]">
        <span className="font-medium">Escalate urgent conversations</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          <Dot tone="emerald" /> Live
        </span>
      </div>
      <div className="relative flex flex-col gap-3">
        <span className="absolute top-6 bottom-6 left-[24px] border-l border-dashed border-foreground/20" />
        {WORKFLOW_STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className="relative flex items-center gap-3 rounded-xl border border-foreground/[0.08] bg-surface-card px-3 py-2.5 text-[13px] dark:bg-surface-subtle">
              <span className="flex size-6 items-center justify-center rounded-md border border-foreground/[0.1] bg-background text-muted-foreground">
                <Icon className="size-3.5" />
              </span>
              <span className="w-[68px] shrink-0 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">{step.kind}</span>
              <span className="truncate text-foreground/90">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MACROS = [
  { name: "Refund approved", body: "Hi {{contact.name}}, your refund is on its way…", active: true },
  { name: "Invite your team", body: "You can invite teammates from Settings → Members…" },
  { name: "Share the invoice", body: "Here's your updated invoice, {{contact.name}}…" },
  { name: "Escalate to billing", body: "I've passed this to our billing team…" },
];

export function MacroRender() {
  return (
    <div className="relative mx-auto h-[300px] w-[460px]">
      <div className="absolute inset-x-0 top-0 w-[300px] rounded-xl border border-foreground/[0.1] bg-surface-card p-1.5 text-[13px] shadow-xl shadow-black/20 dark:bg-surface-dialog">
        <div className="px-2.5 pt-1 pb-2 text-[11px] text-muted-foreground">Macros</div>
        {MACROS.map((macro) => (
          <div key={macro.name} className={cn("rounded-md px-2.5 py-1.5", macro.active && "bg-foreground/[0.07]")}>
            <div className="text-foreground/90">{macro.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">{macro.body}</div>
          </div>
        ))}
      </div>
      <div className="absolute right-0 bottom-0 left-[120px] rounded-xl border border-foreground/[0.1] bg-surface-card px-3.5 py-3 text-[13px] shadow-lg shadow-black/10 dark:bg-surface-subtle">
        <div className="text-foreground/90">
          Hi Maya, your refund is on its way<Bar className="mt-2 w-3/4" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          On send
          <Chip className="h-5 px-2 text-[11px]">Add tag: billing</Chip>
          <Chip className="h-5 px-2 text-[11px]">Close</Chip>
        </div>
      </div>
    </div>
  );
}

const RATINGS = ["Poor", "Fair", "Okay", "Good", "Great"];

export function RatingRender() {
  return (
    <div className="mx-auto w-[300px] rounded-[22px] border border-foreground/[0.1] bg-surface-card p-5 text-center text-[13px] shadow-xl shadow-black/15 dark:bg-surface-subtle">
      <div className="font-medium">How did we do?</div>
      <div className="mt-1 text-[12px] text-muted-foreground">Your conversation with Aria was closed.</div>
      <div className="mt-4 flex justify-center gap-1.5">
        {RATINGS.map((label, index) => (
          <span key={label} className="flex flex-col items-center gap-1">
            <Star className={cn("size-6", index < 4 ? "fill-foreground text-foreground" : "text-foreground/25")} strokeWidth={1.5} />
          </span>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">Good</div>
      <div className="mt-4 flex gap-2">
        <span className="flex-1 rounded-full border border-foreground/[0.1] py-1.5 text-muted-foreground">Skip</span>
        <span className="flex-1 rounded-full bg-foreground py-1.5 font-medium text-background">Send rating</span>
      </div>
    </div>
  );
}
