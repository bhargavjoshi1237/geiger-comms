"use client";

// Articles area state (KB spec §9): articles, help centers, collections, placements, views, teammates and every optimistic write.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useOptionalProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { getCurrentTeammate, listTeammates } from "@/lib/supabase/teammates";
import { requestIndex } from "@/lib/supabase/ai";
import {
  archiveArticle,
  createArticle,
  createTranslation,
  discardChanges,
  displayStateOf,
  duplicateArticle,
  getArticle,
  getViewCounts,
  listArticles,
  markTranslationCurrent,
  publishArticle,
  publishChanges as publishStagedChanges,
  restoreArticle,
  softDeleteArticle,
  unpublishArticle,
  updateArticle,
} from "@/lib/supabase/articles";
import {
  addHelpCenterLocale,
  ensureDefaultHelpCenter,
  listCollections,
  listHelpCenters,
  listPlacements,
  placeArticle,
  unplaceArticle,
  updatePlacement,
} from "@/lib/supabase/help_centers";
import { DEFAULT_LOCALE, PUBLISH_PERMISSION, localeLabel, messengerReason } from "./constants";

const EMPTY_VIEWS = { byArticle: {}, total: { views: 0, viewers: 0 } };

// A local VM after a state/draft change, with its display state recomputed.
function withPatch(article, patch) {
  const next = { ...article, ...patch };
  next.displayState = displayStateOf(next.state, next.draft);
  next.hasPendingChanges = next.state === "published" && Boolean(next.draft);
  return next;
}

export function useArticles() {
  const { projectId } = useOptionalProject() ?? {};
  const canPublish = useCan(PUBLISH_PERMISSION);

  const [articles, setArticles] = useState([]);
  const [centers, setCenters] = useState([]);
  const [collections, setCollections] = useState([]);
  const [placements, setPlacements] = useState([]);
  const [views, setViews] = useState(EMPTY_VIEWS);
  const [teammates, setTeammates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listArticles({ projectId }),
      listHelpCenters({ projectId }),
      listCollections({ projectId }),
      listPlacements({ projectId }),
      getViewCounts({ projectId, days: 30 }),
      listTeammates({ projectId }),
    ]).then(([articleRows, centerRows, collectionRows, placementRows, viewCounts, teammateRows]) => {
      if (!alive) return;
      setArticles(articleRows ?? []);
      setCenters(centerRows ?? []);
      setCollections(collectionRows ?? []);
      setPlacements(placementRows ?? []);
      setViews(viewCounts ?? EMPTY_VIEWS);
      setTeammates(teammateRows ?? []);
      setLoadFailed(articleRows === null || centerRows === null || placementRows === null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, reloadKey]);

  const retry = useCallback(() => {
    setLoading(true);
    setLoadFailed(false);
    setReloadKey((k) => k + 1);
  }, []);

  // --- Derived ---------------------------------------------------------------

  const centersById = useMemo(() => Object.fromEntries(centers.map((c) => [c.id, c])), [centers]);
  const defaultCenter = useMemo(() => centers.find((c) => c.isDefault) ?? null, [centers]);
  const collectionsById = useMemo(
    () => Object.fromEntries(collections.map((c) => [c.id, c])),
    [collections],
  );
  const teammatesById = useMemo(() => Object.fromEntries(teammates.map((t) => [t.id, t])), [teammates]);
  const teammatesByUser = useMemo(
    () => Object.fromEntries(teammates.filter((t) => t.userId).map((t) => [t.userId, t])),
    [teammates],
  );

  const placementsByArticle = useMemo(() => {
    const map = {};
    for (const p of placements) (map[p.articleId] ||= []).push(p);
    return map;
  }, [placements]);

  // A group is the source row plus its translations; translations whose source is gone are not listed.
  const groups = useMemo(() => {
    const bySource = new Map();
    for (const a of articles) if (a.isSource) bySource.set(a.id, { source: a, rows: [a] });
    for (const a of articles) if (!a.isSource) bySource.get(a.sourceId)?.rows.push(a);
    return [...bySource.values()];
  }, [articles]);

  const groupById = useMemo(() => new Map(groups.map((g) => [g.source.id, g])), [groups]);

  const offeredLocales = useMemo(() => {
    const set = new Set();
    for (const c of centers) for (const l of c.locales) set.add(l);
    return [...set];
  }, [centers]);

  const sourceLocale = defaultCenter?.locales?.[0] ?? DEFAULT_LOCALE;

  const reasonFor = useCallback(
    (article) =>
      messengerReason(article, {
        source: groupById.get(article.sourceId)?.source,
        placements: placementsByArticle[article.sourceId] ?? [],
        centersById,
      }),
    [groupById, placementsByArticle, centersById],
  );

  const viewsOf = useCallback((id) => views.byArticle[id] ?? { views: 0, viewers: 0 }, [views]);

  // --- Local state helpers ---------------------------------------------------

  const replaceArticle = useCallback(
    (row) => setArticles((prev) => prev.map((a) => (a.id === row.id ? row : a))),
    [],
  );

  // Placement writes change derived columns (published, collection_title) in the database; read them back.
  const refreshArticle = useCallback(
    async (id) => {
      const row = await getArticle(id);
      if (row) replaceArticle(row);
      return row;
    },
    [replaceArticle],
  );

  // Optimistic local patch -> write -> replace with the saved row, or roll back and toast (unless quiet, for bulk).
  const runWrite = useCallback(
    async (article, patch, write, failMessage, quiet = false) => {
      setArticles((prev) => prev.map((a) => (a.id === article.id ? withPatch(a, patch) : a)));
      const saved = await write();
      if (!saved) {
        setArticles((prev) => prev.map((a) => (a.id === article.id ? article : a)));
        if (!quiet) toast.error(failMessage);
        return null;
      }
      replaceArticle(saved);
      return saved;
    },
    [replaceArticle],
  );

  // What AI answers may use changed: re-index in the background. Never toasts; a failure leaves the source stale.
  const reindex = useCallback(
    (ids) => {
      if (projectId && ids.length) void requestIndex({ projectId, articleIds: ids.slice(0, 10) });
    },
    [projectId],
  );

  const sourceOf = useCallback(
    (article) => groupById.get(article.sourceId)?.source ?? article,
    [groupById],
  );

  // The source revision a translation is published or marked current against.
  const sourceRevision = useCallback(
    (article) => {
      const source = sourceOf(article);
      return source.contentUpdatedAt ?? source.updatedAt ?? null;
    },
    [sourceOf],
  );

  // `context` overrides placements/centers that a same-call write added after this render.
  const announcePublished = useCallback(
    (saved, verb = "Article published", context = {}) => {
      if (!saved.isSource) {
        toast.success("Published — the Messenger shows the source language for now.");
        return;
      }
      if (saved.visibleInMessenger) {
        toast.success(verb);
        return;
      }
      const reason = messengerReason(saved, {
        source: saved,
        placements: context.placements ?? placementsByArticle[saved.id] ?? [],
        centersById: context.centersById ?? centersById,
      });
      if (reason?.tone === "info") toast.success("Published unlisted");
      else if (reason) toast.success(`Published — not in the Messenger: ${reason.text}`);
      else toast.success(verb);
    },
    [placementsByArticle, centersById],
  );

  // --- Creation --------------------------------------------------------------

  const createDraft = useCallback(
    async ({ title = "", summary = "", body = "", metadata } = {}) => {
      if (!projectId) return null;
      const id = crypto.randomUUID();
      const author = await getCurrentTeammate({ projectId });
      const optimistic = {
        id,
        projectId,
        title,
        summary,
        body,
        slug: "",
        locale: sourceLocale,
        draft: null,
        state: "draft",
        displayState: "draft",
        hasPendingChanges: false,
        visibleInMessenger: false,
        groupId: null,
        isSource: true,
        sourceId: id,
        authorId: author?.id ?? null,
        authorName: author?.name ?? "",
        audience: "everyone",
        aiEnabled: true,
        readMinutes: 1,
        collectionTitle: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastEditedAt: new Date().toISOString(),
        ...(metadata || {}),
      };
      setArticles((prev) => [optimistic, ...prev]);
      const created = await createArticle({
        id,
        projectId,
        title,
        summary,
        body,
        locale: sourceLocale,
        authorId: author?.id ?? null,
        metadata,
      });
      if (!created) {
        setArticles((prev) => prev.filter((a) => a.id !== id));
        toast.error("Couldn't create the article.");
        return null;
      }
      replaceArticle(created);
      return created;
    },
    [projectId, sourceLocale, replaceArticle],
  );

  const duplicate = useCallback(
    async (article) => {
      const newId = crypto.randomUUID();
      const author = await getCurrentTeammate({ projectId });
      const optimistic = withPatch(
        {
          ...article,
          id: newId,
          title: `${article.title || "Untitled article"} (copy)`,
          groupId: null,
          isSource: true,
          sourceId: newId,
          visibleInMessenger: false,
          authorId: author?.id ?? null,
          authorName: author?.name ?? "",
          createdAt: new Date().toISOString(),
          lastEditedAt: new Date().toISOString(),
        },
        { state: "draft", draft: null },
      );
      setArticles((prev) => [optimistic, ...prev]);
      const created = await duplicateArticle(article.id, { newId, authorId: author?.id ?? null });
      if (!created) {
        setArticles((prev) => prev.filter((a) => a.id !== newId));
        toast.error("Couldn't duplicate the article.");
        return null;
      }
      replaceArticle(created);
      toast.success(`Duplicated "${article.title || "Untitled article"}".`);
      return created;
    },
    [projectId, replaceArticle],
  );

  // --- Publishing verbs (§7.4) -----------------------------------------------

  const publish = useCallback(
    async (article, { quiet = false } = {}) => {
      const translatedFromAt = article.isSource ? undefined : sourceRevision(article);
      const saved = await runWrite(
        article,
        { state: "published", draft: null },
        () => publishArticle(article.id, { translatedFromAt }),
        "Couldn't publish the article.",
        quiet,
      );
      if (saved) reindex([saved.id]);
      if (saved && !quiet) announcePublished(saved);
      return saved;
    },
    [runWrite, sourceRevision, announcePublished, reindex],
  );

  // First publish of an unplaced source: place it (or leave it unlisted), then publish (§9.4).
  const publishWithPlacement = useCallback(
    async (article, { centerId, collectionId = null, unlisted = false, createDefault = false, quiet = false }) => {
      const context = { placements: [], centersById };
      if (!unlisted) {
        let targetId = centerId;
        if (createDefault) {
          const center = await ensureDefaultHelpCenter({ projectId, locale: article.locale });
          if (!center) {
            if (!quiet) toast.error("Couldn't create the help center.");
            return null;
          }
          setCenters((prev) => (prev.some((c) => c.id === center.id) ? prev : [...prev, center]));
          context.centersById = { ...centersById, [center.id]: center };
          targetId = center.id;
        }
        const position = placements.filter((p) => p.centerId === targetId).length;
        const placement = await placeArticle({
          id: crypto.randomUUID(),
          centerId: targetId,
          articleId: article.sourceId,
          collectionId,
          position,
        });
        if (!placement) {
          if (!quiet) toast.error("Couldn't add the article to the help center.");
          return null;
        }
        setPlacements((prev) => [...prev, placement]);
        context.placements = [placement];
      }
      const saved = await runWrite(
        article,
        { state: "published", draft: null },
        () => publishArticle(article.id),
        "Couldn't publish the article.",
        quiet,
      );
      if (saved) reindex([saved.id]);
      if (saved && !quiet) {
        if (unlisted) toast.success("Published unlisted");
        else announcePublished(saved, "Article published", context);
      }
      return saved;
    },
    [projectId, placements, centersById, runWrite, announcePublished, reindex],
  );

  const publishChanges = useCallback(
    async (article, { quiet = false } = {}) => {
      if (!article.draft) return null;
      const translatedFromAt = article.isSource ? undefined : sourceRevision(article);
      const saved = await runWrite(
        article,
        { state: "published", draft: null, ...article.draft },
        () => publishStagedChanges(article.id, article.draft, { translatedFromAt }),
        "Couldn't publish the changes.",
        quiet,
      );
      if (saved) reindex([saved.id]);
      if (saved && !quiet) announcePublished(saved, "Changes published");
      return saved;
    },
    [runWrite, sourceRevision, announcePublished, reindex],
  );

  const discard = useCallback(
    async (article) => {
      const saved = await runWrite(
        article,
        { draft: null },
        () => discardChanges(article.id),
        "Couldn't discard the changes.",
      );
      if (saved) toast.success("Changes discarded");
      return saved;
    },
    [runWrite],
  );

  const unpublish = useCallback(
    async (article, { quiet = false } = {}) => {
      const fold = article.draft ? { ...article.draft, draft: null } : {};
      const saved = await runWrite(
        article,
        { state: "draft", ...fold },
        () => unpublishArticle(article.id, article.draft),
        "Couldn't unpublish the article.",
        quiet,
      );
      if (saved) reindex([saved.id]);
      if (saved && !quiet) toast.success("Article unpublished");
      return saved;
    },
    [runWrite, reindex],
  );

  const archive = useCallback(
    async (article, { quiet = false } = {}) => {
      const fold = article.draft ? { ...article.draft, draft: null } : {};
      const saved = await runWrite(
        article,
        { state: "archived", ...fold },
        () => archiveArticle(article.id, article.draft),
        "Couldn't archive the article.",
        quiet,
      );
      if (saved && article.state === "published") reindex([saved.id]);
      if (saved && !quiet) toast.success("Article archived");
      return saved;
    },
    [runWrite, reindex],
  );

  const restore = useCallback(
    async (article) => {
      const saved = await runWrite(
        article,
        { state: "draft" },
        () => restoreArticle(article.id),
        "Couldn't restore the article.",
      );
      if (saved) toast.success("Restored to draft");
      return saved;
    },
    [runWrite],
  );

  // Details fields (author, audience, AI answers, language) write straight through.
  const updateFields = useCallback(
    async (article, patch, { quiet = false } = {}) => {
      const saved = await runWrite(
        article,
        patch,
        () => updateArticle(article.id, patch),
        "Couldn't save changes — reverted.",
        quiet,
      );
      if (saved && "aiEnabled" in patch && saved.state === "published") reindex([saved.id]);
      return saved;
    },
    [runWrite, reindex],
  );

  // A source takes its translations and placements with it; a translation goes alone.
  const remove = useCallback(
    async (article, { quiet = false } = {}) => {
      const goneRows = article.isSource ? articles.filter((a) => a.sourceId === article.id) : [article];
      const gone = new Set(goneRows.map((a) => a.id));
      const gonePlacements = placements.filter((p) => gone.has(p.articleId));
      setArticles((prev) => prev.filter((a) => !gone.has(a.id)));
      setPlacements((prev) => prev.filter((p) => !gone.has(p.articleId)));
      const ok = await softDeleteArticle(article.id);
      if (!ok) {
        // Put back only this delete's rows, so a bulk run never revives rows an earlier call deleted.
        setArticles((prev) => [...prev, ...goneRows.filter((r) => !prev.some((a) => a.id === r.id))]);
        setPlacements((prev) => [...prev, ...gonePlacements.filter((r) => !prev.some((p) => p.id === r.id))]);
        if (!quiet) toast.error(article.isSource ? "Couldn't delete the article." : "Couldn't delete the translation.");
        return false;
      }
      reindex(goneRows.filter((a) => a.state === "published").map((a) => a.id));
      return true;
    },
    [articles, placements, reindex],
  );

  // --- Translations (§7.5, §9.5) ---------------------------------------------

  const addTranslation = useCallback(
    async (source, locale, { title, summary, body, machine } = {}) => {
      const id = crypto.randomUUID();
      const created = await createTranslation(source.id, {
        id,
        locale,
        title: title ?? "",
        summary: summary ?? "",
        body: body ?? "",
        machine,
      });
      if (!created) {
        toast.error(`Couldn't add the ${localeLabel(locale)} translation.`);
        return null;
      }
      setArticles((prev) => [
        ...prev.map((a) => (a.id === source.id && !a.groupId ? { ...a, groupId: a.id } : a)),
        created,
      ]);
      toast.success(`${localeLabel(locale)} draft created`);
      return created;
    },
    [],
  );

  const markCurrent = useCallback(
    async (translation) => {
      const revision = sourceRevision(translation);
      const saved = await runWrite(
        translation,
        { translatedFromAt: revision },
        () => markTranslationCurrent(translation.id, revision),
        "Couldn't update the translation.",
      );
      if (saved) toast.success("Marked as up to date");
      return saved;
    },
    [runWrite, sourceRevision],
  );

  // The default center's locale list drives which translations are offered.
  const addLocale = useCallback(
    async (locale) => {
      if (!defaultCenter) return null;
      const previous = defaultCenter;
      setCenters((prev) =>
        prev.map((c) => (c.id === previous.id ? { ...c, locales: [...c.locales, locale] } : c)),
      );
      const saved = await addHelpCenterLocale(previous.id, locale);
      if (!saved) {
        setCenters((prev) => prev.map((c) => (c.id === previous.id ? previous : c)));
        toast.error(`Couldn't add ${localeLabel(locale)} to the help center.`);
        return null;
      }
      setCenters((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
      toast.success(`${localeLabel(locale)} added to ${saved.name}`);
      return saved;
    },
    [defaultCenter],
  );

  // --- Placement (§9.4 Help centers section) ---------------------------------

  const place = useCallback(
    async (article, centerId, collectionId = null) => {
      const id = crypto.randomUUID();
      const optimistic = {
        id,
        centerId,
        articleId: article.sourceId,
        collectionId,
        position: placements.filter((p) => p.centerId === centerId).length,
      };
      setPlacements((prev) => [...prev, optimistic]);
      const saved = await placeArticle(optimistic);
      if (!saved) {
        setPlacements((prev) => prev.filter((p) => p.id !== id));
        toast.error("Couldn't add the article to the help center.");
        return null;
      }
      setPlacements((prev) => prev.map((p) => (p.id === id ? saved : p)));
      await refreshArticle(article.sourceId);
      return saved;
    },
    [placements, refreshArticle],
  );

  const unplace = useCallback(
    async (placement) => {
      setPlacements((prev) => prev.filter((p) => p.id !== placement.id));
      const ok = await unplaceArticle(placement.id);
      if (!ok) {
        setPlacements((prev) => [...prev, placement]);
        toast.error("Couldn't remove the article from the help center.");
        return false;
      }
      await refreshArticle(placement.articleId);
      return true;
    },
    [refreshArticle],
  );

  const setPlacementCollection = useCallback(
    async (placement, collectionId) => {
      setPlacements((prev) => prev.map((p) => (p.id === placement.id ? { ...p, collectionId } : p)));
      const saved = await updatePlacement(placement.id, { collectionId });
      if (!saved) {
        setPlacements((prev) => prev.map((p) => (p.id === placement.id ? placement : p)));
        toast.error("Couldn't move the article.");
        return null;
      }
      setPlacements((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      await refreshArticle(placement.articleId);
      return saved;
    },
    [refreshArticle],
  );

  return {
    projectId,
    canPublish,
    loading,
    loadFailed,
    retry,
    articles,
    centers,
    collections,
    placements,
    views,
    teammates,
    centersById,
    collectionsById,
    teammatesById,
    teammatesByUser,
    defaultCenter,
    placementsByArticle,
    groups,
    groupById,
    offeredLocales,
    sourceLocale,
    reasonFor,
    viewsOf,
    sourceOf,
    replaceArticle,
    createDraft,
    duplicate,
    publish,
    publishWithPlacement,
    publishChanges,
    discard,
    unpublish,
    archive,
    restore,
    updateFields,
    remove,
    addTranslation,
    markCurrent,
    addLocale,
    place,
    unplace,
    setPlacementCollection,
  };
}

export default useArticles;
