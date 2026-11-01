"use client";

// Insights (KB spec §9.7): 30-day Messenger views from comms.article_views and, once the Messenger update
// records them, Helpful / Not helpful reactions.

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  LogoLoading,
  Progress,
} from "@geiger/ui";
import { EmptyState, SectionCard, StatGrid } from "@/components/internal/shared/screen_kit";
import { getArticleInsights } from "@/lib/supabase/articles";
import { countLinkedGaps } from "@/lib/supabase/knowledge_gaps";
import { MESSENGER_RICH_ARTICLES } from "./constants";

const DAYS = 30;
const CHART_CONFIG = { views: { label: "Views", color: "var(--primary)" } };

const dayLabel = (day) =>
  new Date(`${day}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function Helpfulness({ reactions }) {
  if (!MESSENGER_RICH_ARTICLES) {
    return (
      <p className="text-sm text-text-secondary">
        Feedback is collected from the Messenger once the Messenger update ships.
      </p>
    );
  }
  const total = reactions.happy + reactions.sad;
  if (!total) return <p className="text-sm text-text-secondary">No feedback yet.</p>;
  const rows = [
    { label: "Helpful", count: reactions.happy },
    { label: "Not helpful", count: reactions.sad },
  ];
  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const pct = Math.round((row.count / total) * 100);
        return (
          <div key={row.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">{row.label}</span>
              <span className="tabular-nums text-text-secondary">
                {row.count.toLocaleString("en-US")} · {pct}%
              </span>
            </div>
            <Progress value={pct} />
          </div>
        );
      })}
    </div>
  );
}

export function InsightsSection({ article }) {
  const [insights, setInsights] = useState(null);
  const [linkedGaps, setLinkedGaps] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([getArticleInsights(article.id, { days: DAYS }), countLinkedGaps(article.id)]).then(([result, gaps]) => {
      if (!alive) return;
      setInsights(result);
      setLinkedGaps(gaps);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [article.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
        <LogoLoading size={40} aria-label="Loading insights" />
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState icon={BarChart3} title="Couldn't Load Insights" description="Check your connection and try again." />
      </div>
    );
  }

  const { reactions } = insights;
  const rated = reactions.happy + reactions.sad;
  const helpful = MESSENGER_RICH_ARTICLES && rated ? `${Math.round((reactions.happy / rated) * 100)}%` : "—";
  const stats = [
    { label: "Views (30 days)", value: insights.views.toLocaleString("en-US") },
    { label: "Unique viewers", value: insights.viewers.toLocaleString("en-US") },
    {
      label: "Helpful",
      value: helpful,
      hint: MESSENGER_RICH_ARTICLES ? `${rated} rated` : "After the Messenger update",
    },
    { label: "Linked gaps", value: linkedGaps === null ? "—" : String(linkedGaps), hint: "Knowledge gaps it answers" },
  ];
  const data = insights.series.map((point) => ({ label: dayLabel(point.day), views: point.views }));

  return (
    <div className="space-y-6">
      <StatGrid stats={stats} />

      <SectionCard title="Views" description="Times the Messenger opened this article, per day.">
        {insights.views ? (
          <ChartContainer config={CHART_CONFIG} className="h-56 w-full">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tick={{ fill: "var(--text-tertiary)", fontSize: 11 }}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
              <Bar dataKey="views" fill="var(--color-views)" radius={3} />
            </BarChart>
          </ChartContainer>
        ) : (
          <p className="text-sm text-text-secondary">
            No views in the last {DAYS} days. Views are counted when the Messenger opens a published article.
          </p>
        )}
      </SectionCard>

      <SectionCard title="Was It Helpful?">
        <Helpfulness reactions={reactions} />
      </SectionCard>
    </div>
  );
}

export default InsightsSection;
