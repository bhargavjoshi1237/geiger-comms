"use client";

// Knowledge Gaps (KB spec §11.5): questions customers ask that the articles don't answer, grouped into topics and
// ranked by how often they come up. A row opens its drawer at ?gap=<id>.

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  FileQuestion,
  Link2,
  ListChecks,
  Loader2,
  MessagesSquare,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Sparkles,
  ThumbsDown,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { ActionMenu, Badge, Button, LogoLoading, Progress } from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import {
  DataTable,
  EmptyState,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import { FilterDropdown } from "@/components/internal/shared/filter_dropdown";
import { Notice } from "@/components/internal/shared/notice";
import { featureAvailability } from "@/lib/ai/features";
import { useAiStatus } from "@/lib/hooks/use-ai-status";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  GAP_SORT_OPTIONS,
  GAP_SOURCE_FILTER_OPTIONS,
  GAP_STATE_MAP,
  GAP_STATUS_FILTER_OPTIONS,
  GAP_TREND_FILTER_OPTIONS,
  effectiveContent,
  formatRelative,
  withinDays,
} from "./constants";
import { useGaps } from "./use_gaps";
import { GapDrawer } from "./gap_drawer";
import { DismissGapDialog } from "./dismiss_gap_dialog";
import { LinkArticleDialog } from "./link_article_dialog";
import { AiSuggestionDialog, startAssist } from "./ai_suggestion_dialog";

const OUTLINE_ACTION =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

const SOURCE_META = {
  conversation: { label: "Conversations", icon: MessagesSquare },
  ask: { label: "Messenger questions", icon: Sparkles },
  reaction: { label: "Negative reactions", icon: ThumbsDown },
};

const EMPTY_INPUT = { title: "", summary: "", body: "", selection: "" };

function TrendCell({ gap }) {
  if (gap.trend === "up") {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-emerald-400">
        <TrendingUp className="h-3.5 w-3.5" /> +{gap.trendPct}%
      </span>
    );
  }
  if (gap.trend === "down") {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-red-400">
        <TrendingDown className="h-3.5 w-3.5" /> {gap.trendPct}%
      </span>
    );
  }
  return <Minus className="h-3.5 w-3.5 text-text-tertiary" aria-label="Steady" />;
}

export function KnowledgeGapsScreen() {
  const g = useGaps();
  const ai = useAiStatus();
  const { gapId, openGap, closeGap, openArticleInTab, openConversationInTab, setTab } = useWorkspaceUrl();

  const [status, setStatus] = useState("open");
  const [source, setSource] = useState("all");
  const [trend, setTrend] = useState("all");
  const [sort, setSort] = useState("impact");
  const [search, setSearch] = useState("");
  const [dismissTarget, setDismissTarget] = useState(null);
  const [linkTarget, setLinkTarget] = useState(null);
  const [assistRequest, setAssistRequest] = useState(null);
  const [creating, setCreating] = useState(null);

  const draftsWithAi = featureAvailability(ai.status, "articleAssist").available;
  const clustersWithAi = featureAvailability(ai.status, "gapClustering").available;
  const open = gapId ? g.gaps.find((x) => x.id === gapId) ?? null : null;
  const openArticle = (id) => openArticleInTab(id, "Articles");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = g.gaps.filter((gap) => {
      if (status !== "all" && gap.displayState !== status) return false;
      if (source !== "all" && !gap.sources.includes(source)) return false;
      if (trend !== "all" && gap.trend !== trend) return false;
      if (q && ![gap.label, gap.description, ...gap.sampleQuestions].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
    const by = {
      impact: (a, b) => b.impact - a.impact,
      questions: (a, b) => b.volume30d - a.volume30d,
      newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    }[sort];
    return rows.sort(by);
  }, [g.gaps, status, source, trend, sort, search]);

  const pager = usePagination(filtered, { pageSize: 25, resetKey: `${status}|${source}|${trend}|${sort}|${search}` });
  const maxImpact = Math.max(1, ...g.gaps.map((gap) => gap.impact));

  const stats = useMemo(() => {
    const rate = g.stats?.conversations ? Math.round((g.stats.unanswered / g.stats.conversations) * 100) : 0;
    return [
      { label: "Open gaps", value: String(g.gaps.filter((x) => x.displayState === "open").length), footer: "Waiting for an article" },
      {
        label: "Questions (30 days)",
        value: (g.stats?.questions ?? 0).toLocaleString("en-US"),
        footer: "Not answered by an article",
      },
      {
        label: "Unanswered rate",
        value: `${rate}%`,
        footer: `${g.stats?.unanswered ?? 0} of ${g.stats?.conversations ?? 0} scanned conversations`,
      },
      {
        label: "Resolved (30 days)",
        value: String(
          g.gaps.filter((x) => x.displayState === "resolved" && withinDays(x.updatedAt, 30)).length,
        ),
        footer: "Answered by a published article",
      },
    ];
  }, [g.gaps, g.stats]);

  const hasFilters = status !== "open" || source !== "all" || trend !== "all" || !!search;

  function clearFilters() {
    setStatus("open");
    setSource("all");
    setTrend("all");
    setSearch("");
  }

  // §11.6 Create article: an AI draft to review first when AI is available, else the template draft at once.
  async function createArticle(gap) {
    if (draftsWithAi) {
      setAssistRequest(startAssist({
        action: "draft",
        gap,
        createLabel: "Create draft article",
        body: {
          projectId: g.projectId,
          action: "draft",
          input: { ...EMPTY_INPUT, title: gap.suggestedTitle },
          options: { gapId: gap.id },
        },
      }));
      return;
    }
    setCreating(gap.id);
    const created = await g.createFromGap(gap);
    setCreating(null);
    if (created) openArticle(created.id);
  }

  function suggestEdit(gap, article) {
    setAssistRequest(startAssist({
      action: "suggest_edit",
      gap,
      article,
      compareTo: effectiveContent(article).body,
      body: {
        projectId: g.projectId,
        action: "suggest_edit",
        input: EMPTY_INPUT,
        options: { gapId: gap.id, editArticleId: article.id },
      },
    }));
  }

  async function applyAssist(mode, result, meta) {
    const { gap, article } = assistRequest;
    if (mode === "create") {
      const created = await g.createFromGap(gap, { draft: result, ai: meta });
      if (created) openArticle(created.id);
      return Boolean(created);
    }
    return Boolean(await g.acceptEdit(gap, article, result.text, meta));
  }

  const rowActions = (gap) => {
    const view = { icon: ListChecks, label: "View questions", onSelect: () => openGap(gap.id) };
    const reopen = { icon: RotateCcw, label: "Reopen", onSelect: () => g.reopen(gap) };
    if (gap.displayState === "open") {
      return [
        { icon: Plus, label: "Create article", disabled: creating === gap.id, onSelect: () => createArticle(gap) },
        { icon: Link2, label: "Link existing article", onSelect: () => setLinkTarget(gap) },
        view,
        { separator: true },
        { icon: XCircle, label: "Dismiss…", onSelect: () => setDismissTarget(gap) },
      ];
    }
    if (gap.displayState === "in_progress" || gap.displayState === "resolved") {
      return [
        gap.articleId && { icon: ExternalLink, label: "Open article", onSelect: () => openArticle(gap.articleId) },
        view,
        reopen,
      ];
    }
    return [view, reopen];
  };

  const columns = [
    {
      key: "topic",
      header: "Topic",
      render: (gap) => (
        <div className="flex max-w-md flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{gap.label || "Untitled gap"}</span>
            {gap.kind === "edit_content" ? <Badge variant="purple">Edit existing article</Badge> : null}
          </div>
          {gap.description ? <span className="truncate text-xs text-text-secondary">{gap.description}</span> : null}
        </div>
      ),
    },
    {
      key: "impact",
      header: "Impact",
      render: (gap) => (
        <div className="flex items-center gap-2">
          <span className="w-8 tabular-nums text-foreground">{gap.impact}</span>
          <Progress value={(gap.impact / maxImpact) * 100} className="h-1.5 w-12" />
        </div>
      ),
    },
    {
      key: "questions",
      header: "Questions (30d)",
      align: "right",
      className: "text-right tabular-nums text-foreground",
      render: (gap) => gap.volume30d.toLocaleString("en-US"),
    },
    { key: "trend", header: "Trend", render: (gap) => <TrendCell gap={gap} /> },
    {
      key: "sources",
      header: "Sources",
      render: (gap) => (
        <div className="flex gap-1">
          {gap.sources.map((s) => {
            const meta = SOURCE_META[s];
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <Badge key={s} variant="neutral" title={meta.label}>
                <Icon aria-label={meta.label} />
              </Badge>
            );
          })}
        </div>
      ),
    },
    {
      key: "lastSeen",
      header: "Last seen",
      render: (gap) => <span className="text-sm text-text-secondary">{formatRelative(gap.lastSeenAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (gap) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill status={gap.displayState} map={GAP_STATE_MAP} />
          {gap.linkedArticle && (gap.displayState === "resolved" || gap.displayState === "in_progress") ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openArticle(gap.linkedArticle.id);
              }}
              className="max-w-48 truncate text-xs text-text-secondary hover:text-foreground hover:underline"
            >
              {gap.displayState === "resolved" ? "Resolved by " : "Drafting "}
              {effectiveContent(gap.linkedArticle).title || "Untitled article"}
            </button>
          ) : null}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "text-right",
      render: (gap) => <ActionMenu label={`Actions for ${gap.label || "gap"}`} items={rowActions(gap)} />,
    },
  ];

  const refreshButton = (
    <Button variant="outline" className={OUTLINE_ACTION} disabled={!!g.refreshing} onClick={g.refresh}>
      {g.refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {g.refreshing?.busy
        ? "A refresh is already running"
        : g.refreshing
          ? `Refreshing… ${g.refreshing.percent ?? 0}%`
          : "Refresh"}
    </Button>
  );

  let body;
  if (g.loading) {
    body = (
      <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
        <LogoLoading size={48} aria-label="Loading knowledge gaps" />
      </div>
    );
  } else if (g.loadFailed) {
    body = (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't Load Knowledge Gaps"
          description="Check your connection and try again."
          action={
            <Button variant="outline" className={OUTLINE_ACTION} onClick={g.retry}>
              <RotateCw className="h-4 w-4" /> Retry
            </Button>
          }
        />
      </div>
    );
  } else {
    body = (
      <div className="space-y-5">
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(gap) => gap.id}
          onRowClick={(gap) => openGap(gap.id)}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              {g.gaps.length ? (
                <EmptyState
                  icon={FileQuestion}
                  title="No Gaps Match These Filters"
                  description="Try a different status or search."
                  action={
                    hasFilters ? (
                      <Button variant="outline" className={OUTLINE_ACTION} onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : null
                  }
                />
              ) : (
                <EmptyState
                  icon={FileQuestion}
                  title="No Gaps Found Yet"
                  description="Refresh to scan recent conversations for questions your articles don't answer."
                  action={refreshButton}
                />
              )}
            </div>
          }
        />
        <ListPagination {...pager} itemLabel="gaps" />
      </div>
    );
  }

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Knowledge Gaps"
        description="Questions customers ask that your articles don't answer, grouped by topic and ranked by how often they come up."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {g.refreshState?.lastRefreshedAt ? (
              <span className="text-xs text-text-secondary">
                Last refreshed {formatRelative(g.refreshState.lastRefreshedAt)}
              </span>
            ) : null}
            {refreshButton}
          </div>
        }
      />

      {!ai.loading && !clustersWithAi ? (
        <Notice
          icon={Sparkles}
          action={
            ai.status?.canManage ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-border bg-transparent text-xs text-foreground hover:bg-surface-active"
                onClick={() => setTab("AI Providers")}
              >
                Set up AI
              </Button>
            ) : null
          }
        >
          Topics are grouped by keywords. Connect an AI provider for smarter grouping and AI-drafted articles.
        </Notice>
      ) : null}
      {g.aiError ? (
        <Notice icon={AlertTriangle}>
          AI grouping failed for part of the last refresh, so those questions were grouped by keywords.
        </Notice>
      ) : null}

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={status} onValueChange={setStatus} options={GAP_STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={source} onValueChange={setSource} options={GAP_SOURCE_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={trend} onValueChange={setTrend} options={GAP_TREND_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown value={sort} onValueChange={setSort} options={GAP_SORT_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search gaps…" />
      </Toolbar>

      {body}

      {open ? (
        <GapDrawer
          key={open.id}
          gap={open}
          articlesById={g.articlesById}
          sourceMeta={SOURCE_META}
          aiAvailable={draftsWithAi}
          creating={creating === open.id}
          onClose={closeGap}
          onCreate={createArticle}
          onLink={setLinkTarget}
          onDismiss={setDismissTarget}
          onReopen={g.reopen}
          onSuggestEdit={suggestEdit}
          onOpenArticle={openArticle}
          onOpenConversation={(id) => openConversationInTab(id, "All Conversations")}
        />
      ) : null}

      {dismissTarget ? (
        <DismissGapDialog gap={dismissTarget} onClose={() => setDismissTarget(null)} onDismiss={g.dismiss} />
      ) : null}
      {linkTarget ? (
        <LinkArticleDialog
          gap={linkTarget}
          articles={g.sources}
          onClose={() => setLinkTarget(null)}
          onLink={g.link}
        />
      ) : null}
      {assistRequest ? (
        <AiSuggestionDialog request={assistRequest} onClose={() => setAssistRequest(null)} onApply={applyAssist} />
      ) : null}
    </MainScreenWrapper>
  );
}

export default KnowledgeGapsScreen;
