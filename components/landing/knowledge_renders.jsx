import { ArrowUpRight, BookOpen, ChevronRight, FileText, Home, Languages, MessageCircle, Newspaper, Search, Sparkles, Ticket, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Bar, Dot, LINE, Window } from "@/components/landing/kit/mock_kit";
import styles from "@/components/landing/kit/product_pages.module.css";

// Knowledge base renders: the article editor with translations, Knowledge Gaps and the Messenger's Help tab.

const AI_ITEMS = ["Improve writing", "Shorten", "Expand", "Fix spelling & grammar", "Change tone", "Write description", "Suggest titles", "Translate with AI"];

const TRANSLATIONS = [
  { locale: "English (US)", code: "en-US", state: "Published", tone: "emerald" },
  { locale: "French", code: "fr", state: "Out of date", tone: "amber" },
  { locale: "German", code: "de", state: "Missing", tone: "missing" },
  { locale: "Spanish", code: "es", state: "Published", tone: "emerald" },
  { locale: "Japanese", code: "ja", state: "Changes unpublished", tone: "neutral" },
];

function StateLabel({ tone, children }) {
  if (tone === "missing") return <span className="rounded-full border border-dashed border-foreground/25 px-2 py-0.5 text-[11px] text-muted-foreground">{children}</span>;
  const tones = {
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    neutral: "bg-foreground/[0.06] text-foreground/75",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", tones[tone])}>
      <Dot tone={tone === "neutral" ? "neutral" : tone} /> {children}
    </span>
  );
}

export function ArticleStage() {
  return (
    <div className="relative h-[620px] w-[1000px]">
      <Window className="absolute inset-x-0 top-0 h-[700px]">
        <div className={cn("flex h-12 shrink-0 items-center gap-2 border-b px-5", LINE)}>
          <FileText className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Articles</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">Enable SSO (SAML/OIDC)</span>
          <span className="ml-2">
            <StateLabel tone="emerald">Published</StateLabel>
          </span>
          <span className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-foreground/[0.1] px-2.5 text-[12px] text-foreground/85">
            <Sparkles className="size-3.5" /> AI
          </span>
          <span className="flex h-7 items-center rounded-md bg-foreground px-3 text-[12px] font-medium text-background">Publish changes</span>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="relative flex-1 px-14 py-10">
            <div className="text-[11.5px] text-muted-foreground">Account &amp; security</div>
            <div className="mt-2 text-[26px] leading-tight font-semibold tracking-tight">Enable SSO (SAML/OIDC)</div>
            <p className="mt-2 text-[14px] text-muted-foreground">Let your team sign in with the identity provider you already use.</p>
            <div className="mt-7 flex flex-col gap-4 text-[13.5px] leading-6 text-foreground/85">
              <p>
                Single sign-on is available on every plan. Before you start, make sure you&apos;re an Owner or Admin in the workspace and have access to your identity provider&apos;s
                admin console.
              </p>
              <p className="rounded-sm bg-foreground/[0.08] ring-4 ring-foreground/[0.08]">
                Open Settings, choose Security, then select Single sign-on. Pick SAML or OIDC, paste the metadata URL from your provider, and save.
              </p>
              <div>
                <div className="font-semibold text-foreground">Test the connection</div>
                <Bar className="mt-3 w-[420px]" />
                <Bar className="mt-2.5 w-[360px]" />
                <Bar className="mt-2.5 w-[390px]" />
              </div>
            </div>
            <div className="absolute top-[250px] left-[300px] w-[230px] rounded-xl border border-foreground/[0.1] bg-surface-card p-1.5 text-[13px] shadow-2xl shadow-black/25 dark:bg-surface-dialog">
              {AI_ITEMS.map((item, index) => (
                <div key={item} className={cn("flex items-center gap-2 rounded-md px-2.5 py-1.5", index === 0 ? "bg-foreground/[0.07] text-foreground" : "text-foreground/80")}>
                  {item === "Translate with AI" ? <Languages className="size-3.5 text-muted-foreground" /> : <Sparkles className="size-3.5 text-muted-foreground" />}
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className={cn("w-[290px] shrink-0 border-l px-5 py-5 text-[12.5px]", LINE)}>
            <div className="flex items-center justify-between">
              <span className="font-medium">Translations</span>
              <span className="text-[11px] text-muted-foreground">31 locales</span>
            </div>
            <div className="mt-3 flex flex-col">
              {TRANSLATIONS.map(({ locale, code, state, tone }) => (
                <div key={code} className={cn("flex items-center gap-2 border-t py-2.5", LINE)}>
                  <span className="min-w-0 flex-1 truncate text-foreground/85">{locale}</span>
                  <StateLabel tone={tone}>{state}</StateLabel>
                </div>
              ))}
            </div>
            <div className="mt-5 text-[11px] text-muted-foreground">Collection</div>
            <div className="mt-1 rounded-md border border-foreground/[0.1] px-2.5 py-1.5 text-foreground/85">Account &amp; security</div>
            <div className="mt-4 text-[11px] text-muted-foreground">Help center</div>
            <div className="mt-1 rounded-md border border-foreground/[0.1] px-2.5 py-1.5 text-foreground/85">Halcyon Help</div>
          </div>
        </div>
      </Window>
    </div>
  );
}

const GAPS = [
  { topic: "Resetting two-factor authentication", impact: 42, questions: 37, trend: "Rising", delta: "+18%" },
  { topic: "Refund for duplicate charges", impact: 31, questions: 26, trend: "Steady", delta: "0%" },
  { topic: "Exporting invoices as CSV", impact: 18, questions: 15, trend: "Falling", delta: "−9%" },
];

const TREND_ICON = { Rising: TrendingUp, Falling: TrendingDown, Steady: Minus };

export function GapsRender() {
  return (
    <div className="relative mx-auto w-[460px] text-[13px]">
      <div className="rounded-xl border border-foreground/[0.1] bg-surface-card shadow-xl shadow-black/10 dark:bg-surface-subtle">
        <div className={cn("grid grid-cols-[1fr_52px_64px_72px] gap-2 border-b px-3.5 py-2 text-[10.5px] text-muted-foreground", LINE)}>
          <span>Topic</span>
          <span className="text-right">Impact</span>
          <span className="text-right">Qs (30d)</span>
          <span className="text-right">Trend</span>
        </div>
        {GAPS.map((gap, index) => {
          const Icon = TREND_ICON[gap.trend];
          return (
            <div key={gap.topic} className={cn("grid grid-cols-[1fr_52px_64px_72px] items-center gap-2 px-3.5 py-2.5", index > 0 && "border-t", LINE, index === 0 && "bg-foreground/[0.035]")}>
              <span className="truncate text-foreground/90">{gap.topic}</span>
              <span className="text-right tabular-nums">{gap.impact}</span>
              <span className="text-right text-muted-foreground tabular-nums">{gap.questions}</span>
              <span className={cn("flex items-center justify-end gap-1 text-[11.5px]", gap.trend === "Rising" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
                <Icon className="size-3" /> {gap.delta}
              </span>
            </div>
          );
        })}
      </div>
      <div className={cn("relative z-[1] mx-6 -mt-1 rounded-b-xl border border-t-0 border-foreground/[0.1] bg-surface-card px-4 pt-4 pb-3.5 shadow-lg shadow-black/10 dark:bg-surface-dialog", styles.popIn)} style={{ "--pop-delay": "0.3s" }}>
        <div className="text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">What customers asked</div>
        <div className="mt-2 flex flex-col gap-1.5 text-[12.5px] text-foreground/85">
          <span>“Lost my phone, can&apos;t log in with 2FA”</span>
          <span>“2FA codes stopped working after I changed phones”</span>
        </div>
        <div className="mt-3 flex gap-2 text-[12px]">
          <span className="rounded-md bg-foreground px-2.5 py-1 font-medium text-background">Create article</span>
          <span className="rounded-md border border-foreground/[0.12] px-2.5 py-1 text-foreground/85">Link existing article</span>
        </div>
      </div>
    </div>
  );
}

const COLLECTIONS = [
  { name: "Getting started", count: 8 },
  { name: "Billing", count: 12 },
  { name: "Account & security", count: 6 },
];

const TABS = [
  [Home, "Home"],
  [MessageCircle, "Messages"],
  [BookOpen, "Help"],
  [Newspaper, "News"],
  [Ticket, "Tickets"],
];

export function HelpTabRender() {
  return (
    <div className="mx-auto w-[320px] overflow-hidden rounded-[22px] border border-foreground/[0.1] bg-surface-card text-[13px] shadow-xl shadow-black/15 dark:bg-surface-subtle">
      <div className="px-4 pt-4 pb-3">
        <div className="font-semibold">Help</div>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-foreground/[0.05] px-3 py-2 text-muted-foreground">
          <span className="text-foreground/90">two-factor</span>
          <span className="inline-block h-4 w-px bg-foreground" />
          <Search className="ml-auto size-3.5" />
        </div>
      </div>
      <div className="px-2 pb-2">
        {COLLECTIONS.map(({ name, count }) => (
          <div key={name} className="flex items-center gap-3 rounded-lg px-2.5 py-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-foreground/[0.06]">
              <BookOpen className="size-3.5 text-foreground/75" />
            </span>
            <div className="flex-1">
              <div className="font-medium">{name}</div>
              <div className="text-[11.5px] text-muted-foreground">{count} articles</div>
            </div>
            <ChevronRight className="size-3.5 text-muted-foreground" />
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] text-foreground/85">
          Enable SSO (SAML/OIDC) <ArrowUpRight className="ml-auto size-3.5 text-muted-foreground" />
        </div>
      </div>
      <div className={cn("grid grid-cols-5 border-t px-2 pt-2 pb-2.5", LINE)}>
        {TABS.map(([Icon, label]) => (
          <span key={label} className={cn("flex flex-col items-center gap-1 text-[10.5px]", label === "Help" ? "text-foreground" : "text-muted-foreground")}>
            <Icon className="size-4" strokeWidth={label === "Help" ? 2.2 : 1.75} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
