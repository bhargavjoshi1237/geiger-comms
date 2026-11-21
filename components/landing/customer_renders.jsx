import { Building2, CheckSquare, FileSpreadsheet, MessageCircle, Star, StickyNote, Tag, Ticket, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, Dot, LINE, Window } from "@/components/landing/kit/mock_kit";
import styles from "@/components/landing/kit/product_pages.module.css";

// Customers and reports renders: the person timeline, segments, CSV import, analytics and CSAT.

const PROFILE_TABS = ["Overview", "Timeline", "Conversations", "Tickets", "Notes & tasks", "Attributes"];

const TIMELINE = [
  { icon: MessageCircle, title: "Conversation started", detail: "Refund for duplicate charge", time: "Today, 9:41" },
  { icon: Ticket, title: "Ticket created", detail: "Refund double charge · Back-office", time: "Today, 9:48" },
  { icon: Tag, title: "Tag added", detail: "billing", time: "Today, 9:48" },
  { icon: StickyNote, title: "Note by Aria", detail: "Refund issued, invoice to follow.", time: "Today, 9:52" },
  { icon: CheckSquare, title: "Task", detail: "Send the updated invoice", time: "Due tomorrow" },
  { icon: UserPlus, title: "Contact created", detail: "From the Messenger", time: "12 Mar" },
];

export function TimelinePanel() {
  return (
    <Window className="w-full max-w-[720px] text-[13px]">
      <div className={cn("flex items-center gap-3 border-b px-5 py-4", LINE)}>
        <Avatar name="Maya Chen" size={40} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium">Maya Chen</div>
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            maya@northwind.io · <Building2 className="size-3" /> Northwind
          </div>
        </div>
        <span className="rounded-full border border-foreground/[0.12] px-2.5 py-0.5 text-[11.5px] text-foreground/85">Customer</span>
      </div>
      <div className={cn("flex gap-4 overflow-hidden border-b px-5 text-[12px] whitespace-nowrap", LINE)}>
        {PROFILE_TABS.map((tab) => (
          <span key={tab} className={cn("py-2.5", tab === "Timeline" ? "border-b border-foreground font-medium text-foreground" : "text-muted-foreground")}>
            {tab}
          </span>
        ))}
      </div>
      <div className="relative px-5 py-4">
        <span className="absolute top-6 bottom-6 left-[33px] border-l border-foreground/[0.1]" />
        {TIMELINE.map(({ icon: Icon, title, detail, time }, index) => (
          <div key={title} className={cn("relative flex items-start gap-3 py-2", styles.popIn)} style={{ "--pop-delay": `${0.1 + index * 0.08}s` }}>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-foreground/[0.12] bg-surface-card dark:bg-surface-subtle">
              <Icon className="size-3 text-foreground/75" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground/90">{title}</div>
              <div className="truncate text-[12px] text-muted-foreground">{detail}</div>
            </div>
            <span className="shrink-0 text-[11.5px] text-muted-foreground">{time}</span>
          </div>
        ))}
      </div>
    </Window>
  );
}

const SEGMENT_RULES = [
  ["Lifecycle stage", "is", "Trial"],
  ["Created", "within the last", "30 days"],
  ["Email subscription", "is", "Subscribed"],
];

export function SegmentRender() {
  return (
    <div className="mx-auto w-[460px] rounded-xl border border-foreground/[0.1] bg-surface-card text-[13px] shadow-xl shadow-black/10 dark:bg-surface-subtle">
      <div className={cn("flex items-center gap-2 border-b px-4 py-3", LINE)}>
        <span className="font-medium">New trials this month</span>
        <span className="ml-auto text-[12px] text-muted-foreground">128 people</span>
      </div>
      <div className="flex flex-col gap-2 px-4 py-4">
        {SEGMENT_RULES.map(([field, operator, value], index) => (
          <div key={field} className="flex items-center gap-2">
            <span className="w-9 text-[11px] text-muted-foreground">{index === 0 ? "Where" : "and"}</span>
            {[field, operator, value].map((part, partIndex) => (
              <span
                key={part}
                className={cn(
                  "h-7 rounded-md border px-2.5 leading-7 whitespace-nowrap",
                  partIndex === 1 ? "border-transparent bg-foreground/[0.05] text-muted-foreground" : "border-foreground/[0.1] text-foreground/90",
                )}
              >
                {part}
              </span>
            ))}
          </div>
        ))}
        <span className="mt-1 w-fit rounded-md border border-dashed border-foreground/20 px-2.5 py-1 text-[12px] text-muted-foreground">+ Add rule</span>
      </div>
    </div>
  );
}

const IMPORT_COUNTS = [
  ["New", "918", "emerald"],
  ["Update", "301", "strong"],
  ["Unchanged", "17", "neutral"],
  ["Rejected", "4", "red"],
];

export function ImportRender() {
  return (
    <div className="mx-auto w-[460px] rounded-xl border border-foreground/[0.1] bg-surface-card text-[13px] shadow-xl shadow-black/10 dark:bg-surface-subtle">
      <div className={cn("flex items-center gap-2 border-b px-4 py-3", LINE)}>
        <FileSpreadsheet className="size-4 text-muted-foreground" />
        <span className="font-medium">people.csv</span>
        <span className="ml-auto text-[12px] text-muted-foreground">1,240 rows</span>
      </div>
      <div className={cn("grid grid-cols-4 border-b", LINE)}>
        {IMPORT_COUNTS.map(([label, value, tone], index) => (
          <div key={label} className={cn("px-3.5 py-3", index > 0 && "border-l", LINE)}>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Dot tone={tone} /> {label}
            </div>
            <div className="mt-0.5 text-[15px] font-medium tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      {[
        ["email", "Email"],
        ["full_name", "Name"],
        ["company", "Company name"],
        ["stage", "Lifecycle stage"],
      ].map(([column, field], index) => (
        <div key={column} className={cn("flex items-center gap-3 px-4 py-2", index > 0 && "border-t", LINE)}>
          <span className="w-24 font-mono text-[11.5px] text-muted-foreground">{column}</span>
          <span className="text-muted-foreground">→</span>
          <span className="text-foreground/90">{field}</span>
        </div>
      ))}
    </div>
  );
}

const METRICS = [
  ["Median first response", "4m 12s"],
  ["90th percentile", "38m"],
  ["Median time to close", "3h 05m"],
  ["Unanswered", "6"],
];

const DAYS = [
  [34, 30],
  [41, 38],
  [29, 33],
  [46, 40],
  [38, 41],
  [22, 24],
  [18, 20],
];

export function AnalyticsRender() {
  return (
    <div className="mx-auto w-[460px] rounded-xl border border-foreground/[0.1] bg-surface-card text-[13px] shadow-xl shadow-black/10 dark:bg-surface-subtle">
      <div className={cn("grid grid-cols-2 border-b", LINE)}>
        {METRICS.map(([label, value], index) => (
          <div key={label} className={cn("px-4 py-3", index % 2 === 1 && "border-l", index > 1 && "border-t", LINE)}>
            <div className="text-[11px] text-muted-foreground">{label}</div>
            <div className="mt-0.5 text-[17px] font-medium tracking-tight tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          Conversations
          <span className="ml-auto flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-foreground/70" /> New
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-foreground/20" /> Closed
          </span>
        </div>
        <div className="mt-3 flex h-[88px] items-end gap-3">
          {DAYS.map(([created, closed], index) => (
            <div key={index} className="flex flex-1 items-end gap-1">
              <span className={cn("flex-1 origin-bottom rounded-t-sm bg-foreground/70", styles.fill)} style={{ height: `${created * 1.8}px`, "--fill-delay": `${0.2 + index * 0.06}s` }} />
              <span className={cn("flex-1 origin-bottom rounded-t-sm bg-foreground/20", styles.fill)} style={{ height: `${closed * 1.8}px`, "--fill-delay": `${0.25 + index * 0.06}s` }} />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10.5px] text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <span key={day} className="flex-1 text-center">
              {day}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const DISTRIBUTION = [
  [5, 71],
  [4, 18],
  [3, 6],
  [2, 3],
  [1, 2],
];

export function CsatRender() {
  return (
    <div className="mx-auto flex w-[460px] gap-3 text-[13px]">
      <div className="flex w-[170px] shrink-0 flex-col justify-between rounded-xl border border-foreground/[0.1] bg-surface-card px-4 py-4 shadow-xl shadow-black/10 dark:bg-surface-subtle">
        <div className="text-[11px] text-muted-foreground">CSAT score</div>
        <div>
          <div className="text-[40px] leading-none font-medium tracking-tight tabular-nums">4.6</div>
          <div className="mt-1.5 text-[11.5px] text-muted-foreground">Average rating out of 5</div>
        </div>
        <div className="border-t border-foreground/[0.07] pt-3">
          <div className="text-[15px] font-medium tabular-nums">89%</div>
          <div className="text-[11.5px] text-muted-foreground">Positive · rated 4 or 5</div>
        </div>
      </div>
      <div className="flex-1 rounded-xl border border-foreground/[0.1] bg-surface-card px-4 py-4 shadow-xl shadow-black/10 dark:bg-surface-subtle">
        <div className="text-[11px] text-muted-foreground">Rating distribution</div>
        <div className="mt-3 flex flex-col gap-2.5">
          {DISTRIBUTION.map(([stars, share], index) => (
            <div key={stars} className="flex items-center gap-2 text-[12px]">
              <span className="flex w-7 items-center gap-0.5 text-muted-foreground tabular-nums">
                {stars} <Star className="size-3" />
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                <span
                  className={cn("block h-full origin-left rounded-full", stars >= 4 ? "bg-foreground/75" : stars === 3 ? "bg-foreground/40" : "bg-foreground/25", styles.fill)}
                  style={{ width: `${share}%`, "--fill-delay": `${0.2 + index * 0.08}s` }}
                />
              </span>
              <span className="w-8 text-right text-muted-foreground tabular-nums">{share}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
