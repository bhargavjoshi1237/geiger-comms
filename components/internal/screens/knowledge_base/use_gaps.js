"use client";

// Knowledge Gaps state (gaps, linked articles, 30-day stats, refresh) and optimistic, toasting actions (KB spec §11.5, §11.6).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useOptionalProject } from "@/context/project-context";
import { getCurrentTeammate } from "@/lib/supabase/teammates";
import { createArticle, listArticles, logAiAssist, updateArticle } from "@/lib/supabase/articles";
import { listHelpCenters } from "@/lib/supabase/help_centers";
import {
  acceptGap,
  dismissGap,
  getGapRefreshState,
  getGapStats,
  listGaps,
  refreshGaps,
  reopenGap,
} from "@/lib/supabase/knowledge_gaps";
import { DEFAULT_LOCALE, effectiveContent, gapTemplateBody } from "./constants";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const BUSY_POLL_MS = 3000;

export function useGaps() {
  const { projectId } = useOptionalProject() ?? {};
  const [gaps, setGaps] = useState([]);
  const [articles, setArticles] = useState([]);
  const [centers, setCenters] = useState([]);
  const [stats, setStats] = useState(null);
  const [refreshState, setRefreshState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(null); // { percent, busy? } while a run is going
  const [aiError, setAiError] = useState(null); // the last run fell back to keywords for part of its clustering
  const autoStarted = useRef(false);
  const autoStart = useRef(null); // the latest auto-start decision, called once the first load lands

  const load = useCallback(async () => {
    const [articleRows, centerRows, statRow, refreshRow] = await Promise.all([
      listArticles({ projectId }),
      listHelpCenters({ projectId }),
      getGapStats({ projectId }),
      getGapRefreshState({ projectId }),
    ]);
    const articlesById = Object.fromEntries((articleRows ?? []).map((a) => [a.id, a]));
    const gapRows = await listGaps({ projectId, articlesById });
    return { articleRows, centerRows, statRow, refreshRow, gapRows };
  }, [projectId]);

  const apply = useCallback(({ articleRows, centerRows, statRow, refreshRow, gapRows }) => {
    setArticles(articleRows ?? []);
    setCenters(centerRows ?? []);
    setStats(statRow);
    setRefreshState(refreshRow);
    setGaps(gapRows ?? []);
    setLoadFailed(gapRows === null || articleRows === null);
  }, []);

  useEffect(() => {
    let alive = true;
    load().then((data) => {
      if (!alive) return;
      apply(data);
      setLoading(false);
      if (!autoStarted.current && data.gapRows !== null) {
        autoStarted.current = true;
        autoStart.current?.(data.refreshRow);
      }
    });
    return () => {
      alive = false;
    };
  }, [load, apply, reloadKey]);

  const retry = useCallback(() => {
    setLoading(true);
    setLoadFailed(false);
    setReloadKey((k) => k + 1);
  }, []);

  const reload = useCallback(async () => apply(await load()), [load, apply]);

  const articlesById = useMemo(() => Object.fromEntries(articles.map((a) => [a.id, a])), [articles]);
  const sources = useMemo(() => articles.filter((a) => a.isSource), [articles]);
  const defaultLocale = centers.find((c) => c.isDefault)?.locales?.[0] ?? DEFAULT_LOCALE;

  // --- Refresh ------------------------------------------------------------------

  const waitForOtherRun = useCallback(async () => {
    setRefreshing({ percent: null, busy: true });
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, BUSY_POLL_MS));
      const state = await getGapRefreshState({ projectId });
      if (!state?.running) break;
    }
    await reload();
    setRefreshing(null);
  }, [projectId, reload]);

  const refresh = useCallback(async () => {
    if (!projectId || refreshing) return;
    setRefreshing({ percent: 0 });
    setAiError(null);
    let total = null;
    for (;;) {
      const res = await refreshGaps({ projectId });
      if (!res.ok) {
        if (res.code === "busy") {
          toast.message("A refresh is already running");
          await waitForOtherRun();
          return;
        }
        setRefreshing(null);
        toast.error(res.message || "Couldn't refresh knowledge gaps.");
        return;
      }
      const { scanned, clustered, remaining } = res.progress;
      const doneWork = scanned + clustered;
      total = Math.max(total ?? 0, doneWork + remaining);
      setRefreshing({ percent: total ? Math.min(99, Math.round((doneWork / total) * 100)) : 0 });
      if (res.aiError) setAiError(res.aiError);
      if (res.done) break;
    }
    await reload();
    setRefreshing(null);
  }, [projectId, refreshing, waitForOtherRun, reload]);

  // Auto-start when the last run is over a day old (or never ran) — there is no scheduler yet (§16).
  useEffect(() => {
    autoStart.current = (state) => {
      if (!state) return;
      const last = state.lastRefreshedAt ? new Date(state.lastRefreshedAt).getTime() : 0;
      if (Date.now() - last < STALE_AFTER_MS) return;
      if (state.running) void waitForOtherRun();
      else void refresh();
    };
  });

  // --- Actions ------------------------------------------------------------------

  // Optimistic local change -> write -> replace with the saved gap, or roll back and toast.
  const runGapWrite = useCallback(async (gap, local, write, failMessage) => {
    setGaps((prev) => prev.map((g) => (g.id === gap.id ? { ...g, ...local } : g)));
    const saved = await write();
    if (!saved) {
      setGaps((prev) => prev.map((g) => (g.id === gap.id ? gap : g)));
      toast.error(failMessage);
      return null;
    }
    setGaps((prev) => prev.map((g) => (g.id === gap.id ? saved : g)));
    return saved;
  }, []);

  const link = useCallback(
    async (gap, article) => {
      const saved = await runGapWrite(
        gap,
        {
          state: "accepted",
          articleId: article.id,
          linkedArticle: article,
          displayState: article.state === "published" ? "resolved" : "in_progress",
        },
        () => acceptGap(gap, article),
        "Couldn't link the article.",
      );
      if (saved) toast.success(saved.displayState === "resolved" ? "Gap resolved" : "Gap in progress");
      return saved;
    },
    [runGapWrite],
  );

  // A new draft for the gap (an AI draft when given, else the template), accepted with it as the linked article.
  const createFromGap = useCallback(
    async (gap, { draft, ai } = {}) => {
      const author = await getCurrentTeammate({ projectId });
      const created = await createArticle({
        id: crypto.randomUUID(),
        projectId,
        title: draft?.title || gap.suggestedTitle || gap.label,
        summary: draft?.summary ?? gap.description ?? "",
        body: draft?.body ?? gapTemplateBody(gap.sampleQuestions),
        locale: defaultLocale,
        authorId: author?.id ?? null,
        metadata: { fromGap: gap.id },
      });
      if (!created) {
        toast.error("Couldn't create the article.");
        return null;
      }
      setArticles((prev) => [created, ...prev]);
      if (ai) void logAiAssist(created.id, { action: "draft", provider: ai.provider, model: ai.model, at: new Date().toISOString() });
      await link(gap, created);
      return created;
    },
    [projectId, defaultLocale, link],
  );

  // Suggest edit (§11.6): the revised body lands in the staged draft of a published article, or the live body of a draft.
  const acceptEdit = useCallback(
    async (gap, article, body, ai) => {
      const content = { ...effectiveContent(article), body };
      const patch =
        article.state === "published" ? { draft: { ...content, savedAt: new Date().toISOString() } } : { body };
      const saved = await updateArticle(article.id, patch);
      if (!saved) {
        toast.error("Couldn't save the suggested edit.");
        return null;
      }
      setArticles((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
      void logAiAssist(saved.id, { action: "suggest_edit", provider: ai.provider, model: ai.model, at: new Date().toISOString() });
      await link(gap, saved);
      return saved;
    },
    [link],
  );

  const dismiss = useCallback(
    async (gap, reason) => {
      const saved = await runGapWrite(
        gap,
        { state: "dismissed", dismissReason: reason, displayState: "dismissed" },
        () => dismissGap(gap, reason),
        "Couldn't dismiss the gap.",
      );
      if (saved) toast.success("Gap dismissed");
      return saved;
    },
    [runGapWrite],
  );

  const reopen = useCallback(
    async (gap) => {
      const saved = await runGapWrite(
        gap,
        { state: "new", dismissReason: null, articleId: null, linkedArticle: null, displayState: "open" },
        () => reopenGap(gap),
        "Couldn't reopen the gap.",
      );
      if (saved) toast.success("Gap reopened");
      return saved;
    },
    [runGapWrite],
  );

  return {
    projectId,
    loading,
    loadFailed,
    retry,
    gaps,
    articles,
    articlesById,
    sources,
    stats,
    refreshState,
    refreshing,
    aiError,
    refresh,
    link,
    createFromGap,
    acceptEdit,
    dismiss,
    reopen,
  };
}

export default useGaps;
