import { MessageSquarePlus, StickyNote, Timer, UserPlus, Workflow, Flag, Shuffle, Scale, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, Dot, LINE, Window } from "@/components/landing/kit/mock_kit";
import styles from "@/components/landing/kit/product_pages.module.css";

// Automation section renders: the workflow canvas, routing rules and run history.

const NODE_W = 220;

function Node({ at, kind, icon: Icon, label, detail, selected = false }) {
  return (
    <div
      className={cn(
        "absolute h-[58px] rounded-xl border bg-surface-card px-3 py-2 text-[12.5px] shadow-lg shadow-black/10 dark:bg-surface-subtle",
        selected ? "border-foreground/50 ring-4 ring-foreground/[0.06]" : "border-foreground/[0.1]",
      )}
      style={{ left: at[0], top: at[1], width: NODE_W }}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-md border border-foreground/[0.1] bg-background text-muted-foreground">
          <Icon className="size-3" />
        </span>
        <span className="font-mono text-[9.5px] tracking-wider text-muted-foreground uppercase">{kind}</span>
      </div>
      <div className="mt-1 truncate">
        <span className="font-medium text-foreground/90">{label}</span>
        {detail ? <span className="text-muted-foreground"> · {detail}</span> : null}
      </div>
    </div>
  );
}

const EDGES = [
  "M360 82 L360 110",
  "M360 168 C360 190 200 186 200 208",
  "M360 168 C360 190 540 186 540 208",
  "M200 266 L200 292",
  "M200 350 L200 376",
];

export function WorkflowCanvasStage() {
  return (
    <Window className="h-[680px] w-[1000px]">
      <div className={cn("flex h-12 shrink-0 items-center gap-3 border-b px-5", LINE)}>
        <Workflow className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground">Workflows</span>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">Escalate urgent conversations</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          <Dot tone="emerald" /> Live
        </span>
        <span className="ml-auto flex rounded-md bg-foreground/[0.06] p-0.5 text-[12px]">
          <span className="px-2 py-0.5 text-muted-foreground">List</span>
          <span className="rounded bg-surface-card px-2 py-0.5 text-foreground shadow-sm dark:bg-foreground/[0.12]">Canvas</span>
        </span>
        <span className="text-[12px] text-muted-foreground">Run History</span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="relative flex-1 bg-[radial-gradient(circle,color-mix(in_oklab,var(--foreground)_14%,transparent)_1px,transparent_1.5px)] [background-size:18px_18px]">
          <svg className="absolute inset-0 h-full w-full text-foreground/30" fill="none" aria-hidden="true">
            {EDGES.map((d) => (
              <path key={d} d={d} stroke="currentColor" strokeWidth="1.25" className={styles.flow} />
            ))}
          </svg>
          {EDGES.slice(1, 4).map((d, index) => (
            <span
              key={d}
              className={cn("absolute top-0 left-0 size-1.5 rounded-full bg-foreground opacity-0", styles.travel)}
              style={{ offsetPath: `path("${d}")`, "--travel-delay": `${index * 0.9}s`, "--travel-duration": "2.6s" }}
            />
          ))}
          <span className="absolute top-[178px] left-[252px] rounded-full border border-foreground/[0.12] bg-surface-card px-1.5 text-[10.5px] text-muted-foreground dark:bg-surface-subtle">Yes</span>
          <span className="absolute top-[178px] left-[446px] rounded-full border border-foreground/[0.12] bg-surface-card px-1.5 text-[10.5px] text-muted-foreground dark:bg-surface-subtle">No</span>
          <Node at={[250, 24]} kind="Trigger" icon={MessageSquarePlus} label="New conversation" detail="Any channel" />
          <Node at={[250, 110]} kind="Condition" icon={Flag} label="Priority is Urgent" />
          <Node at={[90, 208]} kind="Action" icon={UserPlus} label="Assign" detail="Tier 2" />
          <Node at={[90, 292]} kind="Action" icon={Timer} label="Apply SLA" detail="VIP urgent" selected />
          <Node at={[90, 376]} kind="Action" icon={StickyNote} label="Add a note" detail="Escalated" />
          <Node at={[430, 208]} kind="Action" icon={UserPlus} label="Assign" detail="Round robin" />
        </div>
        <div className={cn("flex w-[270px] shrink-0 flex-col gap-4 border-l px-5 py-5 text-[12.5px]", LINE)}>
          <div>
            <div className="font-mono text-[9.5px] tracking-wider text-muted-foreground uppercase">Action</div>
            <div className="mt-1 text-[14px] font-medium">Apply SLA</div>
          </div>
          {[
            ["Policy", "VIP urgent"],
            ["First response", "30m"],
            ["Next response", "1h"],
            ["Resolution", "8h"],
            ["Hours", "US support hours"],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">{label}</span>
              <span className="rounded-md border border-foreground/[0.1] px-2.5 py-1.5 text-foreground/90">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </Window>
  );
}

const METHODS = [
  { icon: Shuffle, name: "Round robin", body: "Rotate through available teammates" },
  { icon: Scale, name: "Balanced", body: "Whoever has the fewest open" },
  { icon: UserCheck, name: "Direct", body: "Always one teammate" },
];

const RULES = [
  { name: "Billing chats", when: "Tags #billing", method: "Round robin", to: "Billing" },
  { name: "Urgent first", when: "Priority is Urgent", method: "Direct", to: "Aria" },
  { name: "Everything else", when: "Every channel", method: "Balanced", to: "Support" },
];

export function RoutingRender() {
  return (
    <div className="mx-auto flex w-[460px] flex-col gap-3 text-[13px]">
      <div className="grid grid-cols-3 gap-2">
        {METHODS.map(({ icon: Icon, name, body }, index) => (
          <div
            key={name}
            className={cn("rounded-xl border px-3 py-3", index === 0 ? "border-foreground/40 bg-foreground/[0.04]" : "border-foreground/[0.1] bg-surface-card dark:bg-surface-subtle")}
          >
            <Icon className="size-4 text-foreground/80" />
            <div className="mt-2 font-medium">{name}</div>
            <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{body}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-foreground/[0.1] bg-surface-card dark:bg-surface-subtle">
        {RULES.map((rule, index) => (
          <div key={rule.name} className={cn("flex items-center gap-3 px-3.5 py-2.5", index > 0 && "border-t", LINE)}>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{rule.name}</div>
              <div className="truncate text-[11.5px] text-muted-foreground">{rule.when}</div>
            </div>
            <span className="rounded-full border border-foreground/[0.1] px-2 py-0.5 text-[11px] text-foreground/80">{rule.method}</span>
            <span className="flex w-[72px] items-center gap-1.5 text-[12px] text-foreground/85">
              <Avatar name={rule.to} size={16} /> {rule.to}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const RUNS = [
  { name: "Escalate urgent conversations", status: "Running", tone: "amber", time: "now", duration: "—" },
  { name: "Tag billing questions", status: "Success", tone: "emerald", time: "2m", duration: "0.8s" },
  { name: "Escalate urgent conversations", status: "Success", tone: "emerald", time: "14m", duration: "1.2s" },
  { name: "Nudge unresponsive customers", status: "Skipped", tone: "neutral", time: "31m", duration: "0.1s" },
  { name: "Send to billing webhook", status: "Failed", tone: "red", time: "1h", duration: "4.0s" },
];

const STATUS_TONES = {
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
  neutral: "bg-foreground/[0.06] text-muted-foreground",
};

export function RunHistoryRender() {
  return (
    <div className="mx-auto w-[460px] rounded-xl border border-foreground/[0.1] bg-surface-card text-[13px] shadow-xl shadow-black/10 dark:bg-surface-subtle">
      <div className={cn("grid grid-cols-4 border-b", LINE)}>
        {[
          ["Total runs", "1,284"],
          ["Success rate", "98.2%"],
          ["Failed", "23"],
          ["Avg duration", "1.1s"],
        ].map(([label, value], index) => (
          <div key={label} className={cn("px-3.5 py-3", index > 0 && "border-l", LINE)}>
            <div className="text-[10.5px] text-muted-foreground">{label}</div>
            <div className="mt-0.5 text-[15px] font-medium tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      {RUNS.map((run, index) => (
        <div key={`${run.name}-${index}`} className={cn("flex items-center gap-3 px-3.5 py-2.5", index > 0 && "border-t", LINE)}>
          <span className="min-w-0 flex-1 truncate text-foreground/90">{run.name}</span>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_TONES[run.tone])}>
            <Dot tone={run.tone} /> {run.status}
          </span>
          <span className="w-9 text-right text-[11.5px] text-muted-foreground tabular-nums">{run.duration}</span>
          <span className="w-8 text-right text-[11.5px] text-muted-foreground">{run.time}</span>
        </div>
      ))}
    </div>
  );
}
