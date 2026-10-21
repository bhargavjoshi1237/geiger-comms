"use client";

// Help Centers state (centers, collections, placements, articles, brands, views) and its toasting writes (KB spec §10); writes need comms.article.publish.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useOptionalProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { getViewCounts, listArticles } from "@/lib/supabase/articles";
import { listBrands } from "@/lib/supabase/brands";
import {
  createCollection,
  createHelpCenter,
  listCollections,
  listHelpCenters,
  listPlacements,
  mergeHelpCenter,
  moveCollection,
  movePlacement,
  placeArticles,
  setDefaultHelpCenter,
  softDeleteCollection,
  softDeleteHelpCenter,
  unplaceArticle,
  updateCollection,
  updateHelpCenter,
} from "@/lib/supabase/help_centers";
import { PUBLISH_PERMISSION, mergeTheme } from "./constants";

const EMPTY_VIEWS = { byArticle: {}, total: { views: 0, viewers: 0 } };

export function useHelpCenters() {
  const { projectId } = useOptionalProject() ?? {};
  const canPublish = useCan(PUBLISH_PERMISSION);

  const [centers, setCenters] = useState([]);
  const [collections, setCollections] = useState([]);
  const [placements, setPlacements] = useState([]);
  const [articles, setArticles] = useState([]);
  const [brands, setBrands] = useState([]);
  const [views, setViews] = useState(EMPTY_VIEWS);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listHelpCenters({ projectId }),
      listCollections({ projectId }),
      listPlacements({ projectId }),
      listArticles({ projectId }),
      listBrands({ projectId }),
      getViewCounts({ projectId, days: 30 }),
    ]).then(([centerRows, collectionRows, placementRows, articleRows, brandRows, viewCounts]) => {
      if (!alive) return;
      setCenters(centerRows ?? []);
      setCollections(collectionRows ?? []);
      setPlacements(placementRows ?? []);
      setArticles(articleRows ?? []);
      setBrands(brandRows ?? []);
      setViews(viewCounts ?? EMPTY_VIEWS);
      setLoadFailed(centerRows === null || collectionRows === null || placementRows === null);
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

  // Center and placement writes re-derive articles.published in the database; read the flags back.
  const refreshArticles = useCallback(async () => {
    const rows = await listArticles({ projectId });
    if (rows) setArticles(rows);
  }, [projectId]);

  // --- Derived -----------------------------------------------------------------

  const articlesById = useMemo(() => Object.fromEntries(articles.map((a) => [a.id, a])), [articles]);
  const sources = useMemo(() => articles.filter((a) => a.isSource), [articles]);
  const brandsById = useMemo(() => Object.fromEntries(brands.map((b) => [b.id, b])), [brands]);

  const statsOf = useCallback(
    (center) => {
      const own = placements.filter((p) => p.centerId === center.id);
      const placed = own.map((p) => articlesById[p.articleId]).filter(Boolean);
      return {
        placements: own,
        published: placed.filter((a) => a.state === "published").length,
        inMessenger: center.isDefault ? placed.filter((a) => a.visibleInMessenger).length : 0,
        collections: collections.filter((c) => c.helpCenterId === center.id).length,
        views: placed.reduce((n, a) => n + (views.byArticle[a.id]?.views ?? 0), 0),
      };
    },
    [placements, articlesById, collections, views],
  );

  // --- Centers -------------------------------------------------------------------

  const createCenter = useCallback(
    async ({ name, slug, locale, brandId, isLive }) => {
      const id = crypto.randomUUID();
      const isDefault = centers.length === 0;
      const optimistic = {
        id,
        projectId,
        brandId: brandId ?? null,
        name,
        slug,
        domain: "",
        domainVerifiedAt: null,
        theme: {},
        locales: [locale],
        defaultLocale: locale,
        visibility: "public",
        isDefault,
        isLive,
        loginUrl: "",
        indexing: true,
        gaTrackingId: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setCenters((prev) => [...prev, optimistic]);
      const created = await createHelpCenter({
        id,
        projectId,
        name,
        slug,
        locales: [locale],
        brandId: brandId ?? null,
        isLive,
        isDefault,
      });
      if (!created) {
        setCenters((prev) => prev.filter((c) => c.id !== id));
        toast.error("Couldn't create the help center.");
        return null;
      }
      setCenters((prev) => prev.map((c) => (c.id === id ? created : c)));
      toast.success(`${created.name} created`);
      return created;
    },
    [centers.length, projectId],
  );

  // Latest write per center: only it reconciles, so a slower earlier save never overwrites a newer optimistic edit.
  const centerWrites = useRef({});
  const writeCenter = useCallback(async (center, local, write, quiet) => {
    const seq = (centerWrites.current[center.id] ?? 0) + 1;
    centerWrites.current[center.id] = seq;
    setCenters((prev) => prev.map((c) => (c.id === center.id ? local(c) : c)));
    const saved = await write();
    const latest = centerWrites.current[center.id] === seq;
    if (!saved) {
      if (latest) setCenters((prev) => prev.map((c) => (c.id === center.id ? center : c)));
      if (!quiet) toast.error("Couldn't save changes — reverted.");
      return null;
    }
    if (latest) setCenters((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    return saved;
  }, []);

  // Plain columns; resolves to the saved row or null (rolled back, and toasted unless quiet).
  const updateCenter = useCallback(
    async (center, patch, { quiet = false, rederives = false } = {}) => {
      const local = patch.locales ? { ...patch, defaultLocale: patch.locales[0] } : patch;
      const saved = await writeCenter(center, (c) => ({ ...c, ...local }), () => updateHelpCenter(center.id, patch), quiet);
      if (saved && rederives) await refreshArticles();
      return saved;
    },
    [writeCenter, refreshArticles],
  );

  // theme keys deep-merge and metadata keys shallow-merge in one RPC, so sections never drop each other's keys.
  const mergeCenter = useCallback(
    (center, { theme, metadata }) =>
      writeCenter(
        center,
        (c) => ({ ...c, theme: theme ? mergeTheme(c.theme, theme) : c.theme, ...(metadata ?? {}) }),
        () => mergeHelpCenter(center.id, { theme, metadata }),
        false,
      ),
    [writeCenter],
  );

  const setDefault = useCallback(
    async (center) => {
      const previous = centers;
      setCenters((prev) => prev.map((c) => ({ ...c, isDefault: c.id === center.id })));
      const saved = await setDefaultHelpCenter(center.id);
      if (!saved) {
        setCenters(previous);
        toast.error("Couldn't change the default help center.");
        return null;
      }
      setCenters((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
      await refreshArticles();
      toast.success(`${saved.name} is now the default — the Messenger shows its articles.`);
      return saved;
    },
    [centers, refreshArticles],
  );

  const setLive = useCallback(
    async (center, isLive) => {
      const saved = await updateCenter(center, { isLive }, { rederives: true });
      if (saved) toast.success(isLive ? `${saved.name} is live` : `${saved.name} is not live`);
      return saved;
    },
    [updateCenter],
  );

  // The database cascades the soft delete to the center's collections and placements.
  const removeCenter = useCallback(
    async (center) => {
      const previous = { centers, collections, placements };
      setCenters((prev) => prev.filter((c) => c.id !== center.id));
      setCollections((prev) => prev.filter((c) => c.helpCenterId !== center.id));
      setPlacements((prev) => prev.filter((p) => p.centerId !== center.id));
      const ok = await softDeleteHelpCenter(center.id);
      if (!ok) {
        setCenters(previous.centers);
        setCollections(previous.collections);
        setPlacements(previous.placements);
        toast.error("Couldn't delete the help center.");
        return false;
      }
      await refreshArticles();
      toast.success(`${center.name || "Help center"} deleted`);
      return true;
    },
    [centers, collections, placements, refreshArticles],
  );

  // --- Collections -------------------------------------------------------------------

  const addCollection = useCallback(
    async (center, { name, description, parentId = null, translations }) => {
      const id = crypto.randomUUID();
      const siblings = collections.filter((c) => c.helpCenterId === center.id && c.parentId === parentId);
      const input = {
        id,
        projectId,
        helpCenterId: center.id,
        parentId,
        name,
        description,
        position: siblings.length,
        translations,
      };
      setCollections((prev) => [
        ...prev,
        { ...input, slug: "", icon: null, metadata: { translations }, createdAt: new Date().toISOString() },
      ]);
      const created = await createCollection(input);
      if (!created) {
        setCollections((prev) => prev.filter((c) => c.id !== id));
        toast.error("Couldn't create the collection.");
        return null;
      }
      setCollections((prev) => prev.map((c) => (c.id === id ? created : c)));
      return created;
    },
    [collections, projectId],
  );

  const editCollection = useCallback(
    async (collection, patch) => {
      setCollections((prev) => prev.map((c) => (c.id === collection.id ? { ...c, ...patch } : c)));
      const saved = await updateCollection(collection.id, patch, collection.metadata);
      if (!saved) {
        setCollections((prev) => prev.map((c) => (c.id === collection.id ? collection : c)));
        toast.error("Couldn't save the collection.");
        return null;
      }
      setCollections((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
      if ("name" in patch) await refreshArticles();
      return saved;
    },
    [refreshArticles],
  );

  // Reparent and/or reorder; positions are renumbered by the database, so re-read the collections after.
  const relocateCollection = useCallback(
    async (collection, { parentId, position }) => {
      const ok = await moveCollection(collection.id, { parentId, position });
      if (!ok) {
        toast.error("Couldn't move the collection.");
        return false;
      }
      const rows = await listCollections({ projectId });
      if (rows) setCollections(rows);
      return true;
    },
    [projectId],
  );

  // Children go with it; its articles move to Unassigned and stay in the help center.
  const removeCollection = useCallback(
    async (collection) => {
      const previous = { collections, placements };
      const gone = new Set([collection.id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const c of collections) {
          if (c.parentId && gone.has(c.parentId) && !gone.has(c.id)) {
            gone.add(c.id);
            grew = true;
          }
        }
      }
      setCollections((prev) => prev.filter((c) => !gone.has(c.id)));
      setPlacements((prev) => prev.map((p) => (gone.has(p.collectionId) ? { ...p, collectionId: null } : p)));
      const ok = await softDeleteCollection(collection.id);
      if (!ok) {
        setCollections(previous.collections);
        setPlacements(previous.placements);
        toast.error("Couldn't delete the collection.");
        return false;
      }
      await refreshArticles();
      toast.success(`${collection.name || "Collection"} deleted`);
      return true;
    },
    [collections, placements, refreshArticles],
  );

  // --- Placements -------------------------------------------------------------------

  const addArticles = useCallback(
    async (center, articleIds, collectionId = null) => {
      const start = placements.filter((p) => p.centerId === center.id && p.collectionId === collectionId).length;
      const created = await placeArticles(center.id, articleIds, collectionId, start);
      if (!created) {
        toast.error("Couldn't add the articles.");
        return null;
      }
      setPlacements((prev) => [...prev, ...created]);
      await refreshArticles();
      toast.success(`Added ${created.length} ${created.length === 1 ? "article" : "articles"} to ${center.name}`);
      return created;
    },
    [placements, refreshArticles],
  );

  const relocatePlacement = useCallback(
    async (placement, { collectionId, position }) => {
      const ok = await movePlacement(placement.id, { collectionId, position });
      if (!ok) {
        toast.error("Couldn't move the article.");
        return false;
      }
      const rows = await listPlacements({ projectId });
      if (rows) setPlacements(rows);
      if (collectionId !== placement.collectionId) await refreshArticles();
      return true;
    },
    [projectId, refreshArticles],
  );

  const removePlacement = useCallback(
    async (placement) => {
      setPlacements((prev) => prev.filter((p) => p.id !== placement.id));
      const ok = await unplaceArticle(placement.id);
      if (!ok) {
        setPlacements((prev) => [...prev, placement]);
        toast.error("Couldn't remove the article from the help center.");
        return false;
      }
      await refreshArticles();
      return true;
    },
    [refreshArticles],
  );

  return {
    projectId,
    canPublish,
    loading,
    loadFailed,
    retry,
    centers,
    collections,
    placements,
    articles,
    articlesById,
    sources,
    brands,
    brandsById,
    views,
    statsOf,
    createCenter,
    updateCenter,
    mergeCenter,
    setDefault,
    setLive,
    removeCenter,
    addCollection,
    editCollection,
    relocateCollection,
    removeCollection,
    addArticles,
    relocatePlacement,
    removePlacement,
  };
}

export default useHelpCenters;
