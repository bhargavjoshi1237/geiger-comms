"use client";

// A knowledge gap's drawer (KB spec §11.5): what customers asked, how often, and the actions that close it.
// Reached at ?gap=<id>.

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Link2, Loader2, Pencil, Plus, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import {
  Badge,
  Button,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  LogoLoading,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@geiger/ui";
import { SectionCard, StatGrid, StatusPill } from "@/components/internal/shared/screen_kit";
import { listGapSignals, listGapTimeline } from "@/lib/supabase/knowledge_gaps";
import { ARTICLE_STATE_MAP, GAP_STATE_MAP, effectiveContent, formatDate, formatRelative } from "./constants";

const WEEK_MS = 7 * 86_400_000;
const WEEKS = 13;
const CHART_CONFIG = { questions: { label: "Questions", color: "var(--primary)" } };
const OUTLINE = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

function weeklySeries(times) {
  const now = Date.now();
  const buckets = Array.from({ length: WEEKS }, (_, i) => ({
    start: now - (WEEKS - i) * WEEK_MS,
    questions: 0,
  }));
  for (const t of times) {
    const index = WEEKS - 1 - Math.floor((now - new Date(t).getTime()) / WEEK_MS);
    if (index >= 0 && index < WEEKS) buckets[index].questions += 1;
  }
  return buckets.map((b) => ({
    label: new Date(b.start).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    questions: b.questions,
  }));
}

const TREND_LABEL = { up: "Rising", down: "Falling", flat: "Steady" };

export function GapDrawer({ gap, articlesById, sourceMeta, aiAvailable, creating, onClose, onCreate, onLink, onDismiss, onReopen, onSuggestEdit, onOpenArticle, onOpenConversation }) {
  const [signals, setSignals] = useState(null);
  const [timeline, setTimeline] = useState(null);

  useEffect(() => {
    if (!gap?.topicId) return;
    let alive = true;
    Promise.all([listGapSignals(gap.topicId, { limit: 20 }), listGapTimeline(gap.topicId)]).then(([rows, times]) => {
      if (!alive) return;
      setSignals(rows ?? []);
      setTimeline(times ?? []);
    });
    return () => {
      alive = false;
    };
  }, [gap?.topicId]);

  const series = useMemo(() => weeklySeries(timeline ?? []), [timeline]);

  if (!gap) return null;

  const stats = [
    { label: "Impact", value: String(gap.impact) },
    { label: "Questions (30d)", value: String(gap.volume30d) },
    { label: "Trend", value: TREND_LABEL[gap.trend] ?? "Steady", hint: gap.trend !== "flat" ? `${gap.trendPct > 0 ? "+" : ""}${gap.trendPct}%` : null },
    { label: "First seen", value: gap.firstSeenAt ? formatDate(gap.firstSeenAt) : "—" },
  ];
  const linked = gap.linkedArticle;
  const matched = gap.kind === "edit_content"
    ? gap.matchedArticleIds.map((id) => articlesById[id]).filter(Boolean)
    : [];
  const open = gap.displayState === "open";

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={gap.displayState} map={GAP_STATE_MAP} />
            {gap.kind === "edit_content" ? <Badge variant="purple">Edit existing article</Badge> : null}
          </div>
          <SheetTitle className="text-lg">{gap.label || "Untitled gap"}</SheetTitle>
          {gap.description ? <SheetDescription>{gap.description}</SheetDescription> : null}
        </SheetHeader>

        <div className="space-y-5 px-4">
          <StatGrid stats={stats} columns={2} />

          {linked ? (
            <button
              type="button"
              onClick={() => onOpenArticle(linked.id)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface-card px-3 py-2 text-left text-sm hover:bg-surface-hover"
            >
              <span className="truncate text-foreground">
                {gap.displayState === "resolved" ? "Resolved by " : "Drafting "}
                <span className="font-medium">{effectiveContent(linked).title || "Untitled article"}</span>
              </span>
              <ExternalLink className="h-4 w-4 shrink-0 text-text-secondary" />
            </button>
          ) : null}

          <SectionCard title="Weekly Volume" description="Questions in this topic over the last 90 days.">
            {timeline === null ? (
              <div className="flex justify-center py-8">
                <LogoLoading size={40} aria-label="Loading volume" />
              </div>
            ) : (
              <ChartContainer config={CHART_CONFIG} className="h-40 w-full">
                <AreaChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={24}
                    tick={{ fill: "var(--text-tertiary)", fontSize: 11 }}
                  />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                  <Area
                    dataKey="questions"
                    type="monotone"
                    stroke="var(--color-questions)"
                    fill="var(--color-questions)"
                    fillOpacity={0.15}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </SectionCard>

          {matched.length ? (
            <SectionCard title="Articles That Almost Answer It">
              <div className="space-y-2">
                {matched.map((article) => (
                  <div key={article.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-card px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm text-foreground">{effectiveContent(article).title || "Untitled article"}</span>
                      <StatusPill status={article.displayState} map={ARTICLE_STATE_MAP} />
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {aiAvailable ? (
                        <Button variant="outline" size="sm" className={OUTLINE} onClick={() => onSuggestEdit(gap, article)}>
                          <Sparkles className="h-3.5 w-3.5" /> Suggest edit
                        </Button>
                      ) : null}
                      <Button variant="outline" size="sm" className={OUTLINE} onClick={() => onOpenArticle(article.id)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit article
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="What Customers Asked">
            {signals === null ? (
              <div className="flex justify-center py-8">
                <LogoLoading size={40} aria-label="Loading questions" />
              </div>
            ) : signals.length ? (
              <ul className="space-y-3">
                {signals.map((s) => {
                  const meta = sourceMeta[s.source] ?? sourceMeta.conversation;
                  const Icon = meta.icon;
                  const body = (
                    <>
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-label={meta.label} />
                      <span className="min-w-0 flex-1 text-sm text-foreground">{s.question}</span>
                      <span className="shrink-0 text-xs text-text-tertiary">{formatRelative(s.occurredAt)}</span>
                    </>
                  );
                  return (
                    <li key={s.id}>
                      {s.conversationId ? (
                        <button
                          type="button"
                          onClick={() => onOpenConversation(s.conversationId)}
                          className="flex w-full items-start gap-2 text-left hover:underline"
                        >
                          {body}
                        </button>
                      ) : (
                        <div className="flex items-start gap-2">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-text-secondary">No questions recorded for this topic.</p>
            )}
          </SectionCard>
        </div>

        <SheetFooter className="flex-row flex-wrap justify-end">
          {open ? (
            <>
              <Button variant="ghost" onClick={() => onDismiss(gap)}>
                <XCircle className="h-4 w-4" /> Dismiss
              </Button>
              <Button variant="outline" className={OUTLINE} onClick={() => onLink(gap)}>
                <Link2 className="h-4 w-4" /> Link existing
              </Button>
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={creating}
                onClick={() => onCreate(gap)}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create article
              </Button>
            </>
          ) : (
            <Button variant="outline" className={OUTLINE} onClick={() => onReopen(gap)}>
              <RotateCcw className="h-4 w-4" /> Reopen
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default GapDrawer;
