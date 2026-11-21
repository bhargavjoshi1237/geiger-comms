import { ChevronRight, Home, Mail, MessageCircle, MessageSquare, Newspaper, Search, SendHorizontal, Share2, Slack, Smartphone, Ticket, BookOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, Bar, Dot, LINE, Window } from "@/components/landing/kit/mock_kit";
import styles from "@/components/landing/kit/product_pages.module.css";

// Messenger section renders: the widget on a customer's site, its settings, topics and the channel line-up.

const TABS = [
  { icon: Home, label: "Home" },
  { icon: MessageCircle, label: "Messages" },
  { icon: BookOpen, label: "Help" },
  { icon: Newspaper, label: "News" },
  { icon: Ticket, label: "Tickets" },
];

function WidgetTabs({ active = "Home" }) {
  return (
    <div className={cn("grid grid-cols-5 border-t px-2 pt-2 pb-2.5", LINE)}>
      {TABS.map(({ icon: Icon, label }) => (
        <span key={label} className={cn("flex flex-col items-center gap-1 text-[10.5px]", label === active ? "text-foreground" : "text-muted-foreground")}>
          <Icon className="size-4" strokeWidth={label === active ? 2.2 : 1.75} />
          {label}
        </span>
      ))}
    </div>
  );
}

// The Messenger's Home space: greeting, "Send us a message", the latest conversation and help search.
export function WidgetHome({ className }) {
  return (
    <div className={cn("flex w-[360px] flex-col overflow-hidden rounded-[22px] border border-foreground/[0.1] bg-surface-card text-[13px] shadow-2xl shadow-black/30 dark:bg-surface-subtle", className)}>
      <div className="bg-linear-to-b from-foreground/[0.12] to-transparent px-5 pt-5 pb-6">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-semibold">
            <span className="flex size-6 items-center justify-center rounded-md bg-foreground text-[11px] text-background">H</span>
            Halcyon
          </span>
          <span className="flex items-center gap-2">
            <span className="flex -space-x-1.5">
              <Avatar name="Aria" size={24} />
              <Avatar name="Sam" size={24} />
              <Avatar name="Marco" size={24} />
            </span>
            <X className="size-4 text-muted-foreground" />
          </span>
        </div>
        <div className="mt-6 text-[22px] leading-7 font-semibold tracking-tight">Hi there.</div>
        <div className="text-[22px] leading-7 font-semibold tracking-tight text-muted-foreground">How can we help?</div>
      </div>
      <div className="flex flex-col gap-2.5 px-3.5 pb-3.5">
        <div className="flex items-center gap-3 rounded-2xl border border-foreground/[0.1] bg-background/60 px-4 py-3.5 dark:bg-foreground/[0.03]">
          <div className="flex-1">
            <div className="font-semibold">Send us a message</div>
            <div className="text-[12px] text-muted-foreground">We&apos;ll reply here as soon as we can.</div>
          </div>
          <SendHorizontal className="size-4" />
        </div>
        <div className="rounded-2xl border border-foreground/[0.1] bg-background/60 px-4 py-3 dark:bg-foreground/[0.03]">
          <div className="mb-2 text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase">Recent</div>
          <div className="flex items-center gap-3">
            <Avatar name="Aria" size={30} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">Aria</div>
              <div className="truncate text-[12px] text-muted-foreground">Your refund is on its way, Maya.</div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </div>
        </div>
        <div className="rounded-2xl border border-foreground/[0.1] bg-background/60 px-4 py-3 dark:bg-foreground/[0.03]">
          <div className="flex items-center gap-2 rounded-lg bg-foreground/[0.05] px-3 py-2 text-muted-foreground">
            Search for help
            <Search className="ml-auto size-3.5" />
          </div>
          {["Download an invoice", "Invite your team"].map((title) => (
            <div key={title} className="flex items-center gap-2 px-1 pt-2.5 text-[12.5px] text-foreground/85">
              {title}
              <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
            </div>
          ))}
        </div>
      </div>
      <WidgetTabs />
    </div>
  );
}

// A customer's site with the Messenger open in the corner.
export function MessengerStage() {
  return (
    <div className="relative h-[640px] w-[1000px]">
      <Window className="absolute inset-x-0 top-0 h-[700px]">
        <div className={cn("flex h-11 shrink-0 items-center gap-2 border-b px-4", LINE)}>
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
          </span>
          <span className="mx-auto flex h-6 w-[320px] items-center justify-center rounded-md bg-foreground/[0.05] text-[11.5px] text-muted-foreground">halcyon.app/pricing</span>
        </div>
        <div className="relative flex-1 overflow-hidden px-14 pt-10">
          <div className="flex items-center gap-6 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <span className="flex size-5 items-center justify-center rounded-md bg-foreground text-[10px] text-background">H</span>
              Halcyon
            </span>
            <span>Product</span>
            <span>Pricing</span>
            <span>Customers</span>
            <span className="ml-auto rounded-full border border-foreground/15 px-3 py-1 text-foreground/80">Sign in</span>
          </div>
          <div className="mt-16 max-w-[420px]">
            <div className="text-[34px] leading-[1.05] font-semibold tracking-tight text-foreground/90">Simple pricing for growing teams</div>
            <Bar className="mt-5 h-2.5 w-[340px]" />
            <Bar className="mt-2.5 h-2.5 w-[260px]" />
          </div>
          <div className="mt-12 grid w-[560px] grid-cols-2 gap-4">
            {["Starter", "Pro"].map((plan) => (
              <div key={plan} className={cn("rounded-xl border px-5 py-5", LINE)}>
                <div className="text-[13px] font-medium">{plan}</div>
                <Bar className="mt-4 h-5 w-20 bg-foreground/[0.1]" />
                <Bar className="mt-5 w-40" />
                <Bar className="mt-2.5 w-32" />
                <Bar className="mt-2.5 w-36" />
              </div>
            ))}
          </div>
        </div>
      </Window>
      <div className="absolute top-[66px] right-[30px] z-[2]">
        <WidgetHome />
      </div>
    </div>
  );
}

function Toggle({ on = true }) {
  return (
    <span className={cn("inline-flex h-4 w-7 items-center rounded-full p-0.5", on ? "bg-foreground" : "bg-foreground/20")}>
      <span className={cn("size-3 rounded-full bg-background transition-transform", on && "translate-x-3")} />
    </span>
  );
}

const SWATCHES = ["bg-foreground", "bg-foreground/70", "bg-foreground/45", "bg-foreground/25"];

export function MessengerSettingsRender() {
  return (
    <div className="mx-auto w-[440px] rounded-xl border border-foreground/[0.1] bg-surface-card text-[13px] shadow-xl shadow-black/10 dark:bg-surface-subtle">
      {[
        [
          "Launcher colour",
          <span key="swatches" className="flex gap-1.5">
            {SWATCHES.map((swatch, index) => (
              <span key={swatch} className={cn("size-5 rounded-full", swatch, index === 0 && "ring-2 ring-foreground/30 ring-offset-2 ring-offset-surface-card dark:ring-offset-surface-subtle")} />
            ))}
          </span>,
        ],
        ["Greeting", <span key="greeting" className="rounded-md border border-foreground/[0.1] px-2 py-1 text-foreground/85">Hi there. How can we help?</span>],
        [
          "Position",
          <span key="position" className="flex rounded-md bg-foreground/[0.06] p-0.5 text-[12px]">
            <span className="px-2 py-0.5 text-muted-foreground">Bottom left</span>
            <span className="rounded bg-surface-card px-2 py-0.5 text-foreground shadow-sm dark:bg-foreground/[0.12]">Bottom right</span>
          </span>,
        ],
        ["Show avatars", <Toggle key="avatars" />],
        ["Office-hours note", <span key="note" className="truncate text-foreground/85">We reply within a few hours.</span>],
      ].map(([label, control], index) => (
        <div key={label} className={cn("flex items-center justify-between gap-4 px-4 py-3", index > 0 && "border-t", LINE)}>
          <span className="shrink-0 text-muted-foreground">{label}</span>
          {control}
        </div>
      ))}
    </div>
  );
}

const TOPICS = ["An order", "Returns", "Billing", "Account", "Something else"];

export function TopicsRender() {
  return (
    <div className="mx-auto w-[320px] overflow-hidden rounded-[22px] border border-foreground/[0.1] bg-surface-card text-[13px] shadow-xl shadow-black/15 dark:bg-surface-subtle">
      <div className={cn("border-b px-4 py-3.5 font-medium", LINE)}>New conversation</div>
      <div className="flex flex-col gap-2 px-4 py-4">
        <div className="mb-1 text-[12px] text-muted-foreground">What&apos;s this about?</div>
        {TOPICS.map((topic, index) => (
          <span
            key={topic}
            className={cn(
              "flex items-center justify-between rounded-xl border px-3.5 py-2.5",
              index === 2 ? "border-foreground bg-foreground text-background" : "border-foreground/[0.1] text-foreground/85",
              styles.popIn,
            )}
            style={{ "--pop-delay": `${0.15 + index * 0.08}s` }}
          >
            {topic}
            <ChevronRight className={cn("size-3.5", index === 2 ? "text-background" : "text-muted-foreground")} />
          </span>
        ))}
      </div>
    </div>
  );
}

const CHANNELS = [
  { icon: MessageCircle, name: "Messenger", detail: "Chat widget on your site", state: "live" },
  { icon: Mail, name: "Email", detail: "Replies go out by email", state: "replies" },
  { icon: Smartphone, name: "WhatsApp", detail: "Business number", state: "soon" },
  { icon: MessageSquare, name: "SMS", detail: "Text messages", state: "soon" },
  { icon: Share2, name: "Social", detail: "Instagram, Facebook, X", state: "soon" },
  { icon: Slack, name: "Slack", detail: "Shared channels", state: "soon" },
];

export function ChannelsRender() {
  return (
    <div className="mx-auto w-[440px] rounded-xl border border-foreground/[0.1] bg-surface-card text-[13px] shadow-xl shadow-black/10 dark:bg-surface-subtle">
      {CHANNELS.map(({ icon: Icon, name, detail, state }, index) => (
        <div key={name} className={cn("flex items-center gap-3 px-4 py-2.5", index > 0 && "border-t", LINE, state === "soon" && "opacity-60")}>
          <span className="flex size-7 items-center justify-center rounded-lg border border-foreground/[0.1] bg-foreground/[0.04]">
            <Icon className="size-3.5 text-foreground/80" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{name}</div>
            <div className="truncate text-[11.5px] text-muted-foreground">{detail}</div>
          </div>
          {state === "live" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              <Dot tone="emerald" /> Live
            </span>
          ) : state === "replies" ? (
            <span className="rounded-full border border-foreground/[0.12] px-2 py-0.5 text-[11px] text-foreground/80">Replies</span>
          ) : (
            <span className="rounded-full border border-dashed border-foreground/25 px-2 py-0.5 text-[11px] text-muted-foreground">On the way</span>
          )}
        </div>
      ))}
    </div>
  );
}
