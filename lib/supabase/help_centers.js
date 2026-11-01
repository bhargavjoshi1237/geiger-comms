"use client";

// Help centers data layer (help_centers, article_collections, help_center_articles; KB spec §8): pure, null / [] / false, never throws or toasts.
// theme/metadata writes go through the help_center_merge RPC, never a whole bag.

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";
import { slugify } from "@/lib/kb/slug";

const CENTERS = "help_centers";
const COLLECTIONS = "article_collections";
const PLACEMENTS = "help_center_articles";

export const DEFAULT_CENTER_NAME = "Help Center";
export const DEFAULT_CENTER_SLUG = "help";

// ---- normalize (snake -> camel) ---------------------------------------------

export function normalizeHelpCenter(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const locales = Array.isArray(row.locales) && row.locales.length ? row.locales : ["en-US"];
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    brandId: row.brand_id ?? null,
    name: row.name ?? "",
    slug: row.slug ?? "",
    domain: row.domain ?? "",
    domainVerifiedAt: row.domain_verified_at ?? null,
    theme: row.theme && typeof row.theme === "object" ? row.theme : {},
    locales,
    defaultLocale: locales[0],
    visibility: row.visibility ?? "public",
    isDefault: Boolean(row.is_default),
    isLive: row.is_live !== false,
    loginUrl: meta.loginUrl ?? "",
    indexing: meta.indexing !== false,
    gaTrackingId: meta.gaTrackingId ?? "",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
  };
}

export function normalizeCollection(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    helpCenterId: row.help_center_id ?? null,
    parentId: row.parent_id ?? null,
    name: row.name ?? "",
    description: row.description ?? "",
    slug: row.slug ?? "",
    icon: row.icon ?? null,
    position: row.position ?? 0,
    translations: meta.translations && typeof meta.translations === "object" ? meta.translations : {},
    metadata: meta,
    createdAt: row.created_at ?? null,
  };
}

export function normalizePlacement(row) {
  if (!row) return null;
  return {
    id: row.id,
    centerId: row.center_id,
    articleId: row.article_id,
    collectionId: row.collection_id ?? null,
    position: row.position ?? 0,
    createdAt: row.created_at ?? null,
  };
}

// ---- toRow (camel -> snake, only present keys) -------------------------------

function centerRow(input) {
  const row = {};
  const map = {
    visibility: "visibility",
    brandId: "brand_id",
    projectId: "project_id",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("name" in input) row.name = (input.name || "").trim();
  if ("slug" in input) row.slug = (input.slug || "").trim();
  if ("domain" in input) row.domain = (input.domain || "").trim().toLowerCase();
  if ("locales" in input) row.locales = input.locales;
  if ("isLive" in input) row.is_live = Boolean(input.isLive);
  return row;
}

function collectionRow(input) {
  const row = {};
  const map = {
    description: "description",
    icon: "icon",
    position: "position",
    parentId: "parent_id",
    helpCenterId: "help_center_id",
    projectId: "project_id",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("name" in input) {
    row.name = (input.name || "").trim();
    row.slug = slugify(input.name) || null;
  }
  return row;
}

// ---- help centers ------------------------------------------------------------

export async function listHelpCenters({ projectId } = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let query = sb
      .from(CENTERS)
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[helpCenters.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeHelpCenter);
  } catch (e) {
    console.error("[helpCenters.list]", e);
    return null;
  }
}

export async function createHelpCenter(input) {
  if (!input?.projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = centerRow(input);
    if (input.id) payload.id = input.id; // honor optimistic UUID
    if (input.isDefault) payload.is_default = true;
    const { data, error } = await sb.from(CENTERS).insert(payload).select("*").single();
    if (error) {
      console.error("[helpCenters.create]", error.message);
      return null;
    }
    return normalizeHelpCenter(data);
  } catch (e) {
    console.error("[helpCenters.create]", e);
    return null;
  }
}

// Plain columns only; theme and metadata keys go through mergeHelpCenter.
export async function updateHelpCenter(id, patch) {
  if (!id || !patch || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(CENTERS)
      .update(centerRow(patch))
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[helpCenters.update]", error.message);
      return null;
    }
    return normalizeHelpCenter(data);
  } catch (e) {
    console.error("[helpCenters.update]", e);
    return null;
  }
}

// theme deep-merges, metadata shallow-merges, in one statement — so two sections never drop each other's keys.
export async function mergeHelpCenter(id, { theme, metadata } = {}) {
  if (!id || (!theme && !metadata) || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb.rpc("help_center_merge", {
      p_id: id,
      p_theme: theme ?? null,
      p_meta: metadata ?? null,
    });
    if (error || !data) {
      console.error("[helpCenters.merge]", error?.message ?? "help center not found");
      return null;
    }
    return normalizeHelpCenter(data);
  } catch (e) {
    console.error("[helpCenters.merge]", e);
    return null;
  }
}

export async function setDefaultHelpCenter(id) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb.rpc("set_default_help_center", { p_center: id });
    if (error || !data) {
      console.error("[helpCenters.setDefault]", error?.message ?? "help center not found");
      return null;
    }
    return normalizeHelpCenter(data);
  } catch (e) {
    console.error("[helpCenters.setDefault]", e);
    return null;
  }
}

export async function addHelpCenterLocale(id, locale) {
  if (!id || !locale || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data: current, error: readError } = await sb
      .from(CENTERS)
      .select("locales")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (readError || !current) {
      console.error("[helpCenters.addLocale]", readError?.message ?? "help center not found");
      return null;
    }
    const locales = Array.isArray(current.locales) ? current.locales : [];
    if (locales.includes(locale)) return updateHelpCenter(id, { locales });
    return updateHelpCenter(id, { locales: [...locales, locale] });
  } catch (e) {
    console.error("[helpCenters.addLocale]", e);
    return null;
  }
}

export async function softDeleteHelpCenter(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(CENTERS)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id");
    if (error) {
      console.error("[helpCenters.delete]", error.message);
      return false;
    }
    return (data || []).length > 0; // RLS skips rows silently on update
  } catch (e) {
    console.error("[helpCenters.delete]", e);
    return false;
  }
}

// The project's default center, created as "Help Center" (live, default) when the project has none.
export async function ensureDefaultHelpCenter({ projectId, locale = "en-US" } = {}) {
  if (!projectId) return null;
  const centers = await listHelpCenters({ projectId });
  if (centers === null) return null;
  const existing = centers.find((c) => c.isDefault) ?? null;
  if (existing) return existing;
  if (centers.length) return setDefaultHelpCenter(centers[0].id);
  const created = await createHelpCenter({
    projectId,
    name: DEFAULT_CENTER_NAME,
    slug: DEFAULT_CENTER_SLUG,
    locales: [locale],
    isLive: true,
    isDefault: true,
  });
  if (created) return created;
  // Another tab may have created it first; the default index allows only one.
  const retry = await listHelpCenters({ projectId });
  return retry?.find((c) => c.isDefault) ?? null;
}

// ---- collections -------------------------------------------------------------

export async function listCollections({ projectId } = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let query = sb
      .from(COLLECTIONS)
      .select("*")
      .is("deleted_at", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[collections.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeCollection);
  } catch (e) {
    console.error("[collections.list]", e);
    return null;
  }
}

export async function createCollection(input) {
  if (!input?.projectId || !input?.helpCenterId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = collectionRow(input);
    if (input.id) payload.id = input.id; // honor optimistic UUID
    if (input.translations) payload.metadata = { translations: input.translations };
    const { data, error } = await sb.from(COLLECTIONS).insert(payload).select("*").single();
    if (error) {
      console.error("[collections.create]", error.message);
      return null;
    }
    return normalizeCollection(data);
  } catch (e) {
    console.error("[collections.create]", e);
    return null;
  }
}

// translations replace metadata.translations; `metadata` is the row's current bag, so other keys survive.
export async function updateCollection(id, patch, metadata = {}) {
  if (!id || !patch || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = collectionRow(patch);
    if ("translations" in patch) payload.metadata = { ...metadata, translations: patch.translations };
    const { data, error } = await sb
      .from(COLLECTIONS)
      .update(payload)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[collections.update]", error.message);
      return null;
    }
    return normalizeCollection(data);
  } catch (e) {
    console.error("[collections.update]", e);
    return null;
  }
}

// Reparents and renumbers siblings atomically.
export async function moveCollection(id, { parentId = null, position = 0 } = {}) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb.rpc("move_collection", {
      p_id: id,
      p_parent: parentId,
      p_position: position,
    });
    if (error) {
      console.error("[collections.move]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[collections.move]", e);
    return false;
  }
}

// Sub-collections are soft-deleted and placements move to Unassigned by the database cascade.
export async function softDeleteCollection(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(COLLECTIONS)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id");
    if (error) {
      console.error("[collections.delete]", error.message);
      return false;
    }
    return (data || []).length > 0; // RLS skips rows silently on update
  } catch (e) {
    console.error("[collections.delete]", e);
    return false;
  }
}

// ---- placements --------------------------------------------------------------

export async function listPlacements({ projectId } = {}) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let query = sb
      .from(PLACEMENTS)
      .select("id, center_id, article_id, collection_id, position, created_at, help_centers!inner(project_id)")
      .is("deleted_at", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (projectId) query = query.eq("help_centers.project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[placements.list]", error.message);
      return null;
    }
    return (data || []).map(normalizePlacement);
  } catch (e) {
    console.error("[placements.list]", e);
    return null;
  }
}

export async function placeArticle({ id, centerId, articleId, collectionId = null, position = 0 } = {}) {
  if (!centerId || !articleId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = {
      center_id: centerId,
      article_id: articleId,
      collection_id: collectionId,
      position,
    };
    if (id) payload.id = id;
    const { data, error } = await sb.from(PLACEMENTS).insert(payload).select("*").single();
    if (error) {
      console.error("[placements.create]", error.message);
      return null;
    }
    return normalizePlacement(data);
  } catch (e) {
    console.error("[placements.create]", e);
    return null;
  }
}

export async function placeArticles(centerId, articleIds, collectionId = null, startPosition = 0) {
  if (!centerId || !articleIds?.length || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const rows = articleIds.map((articleId, i) => ({
      center_id: centerId,
      article_id: articleId,
      collection_id: collectionId,
      position: startPosition + i,
    }));
    const { data, error } = await sb.from(PLACEMENTS).insert(rows).select("*");
    if (error) {
      console.error("[placements.createMany]", error.message);
      return null;
    }
    return (data || []).map(normalizePlacement);
  } catch (e) {
    console.error("[placements.createMany]", e);
    return null;
  }
}

export async function updatePlacement(id, patch) {
  if (!id || !patch || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = {};
    if ("collectionId" in patch) payload.collection_id = patch.collectionId;
    if ("position" in patch) payload.position = patch.position;
    const { data, error } = await sb
      .from(PLACEMENTS)
      .update(payload)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) {
      console.error("[placements.update]", error.message);
      return null;
    }
    return normalizePlacement(data);
  } catch (e) {
    console.error("[placements.update]", e);
    return null;
  }
}

// Into a collection (null = Unassigned) at a position, renumbering both lists atomically.
export async function movePlacement(id, { collectionId = null, position = 0 } = {}) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb.rpc("move_placement", {
      p_id: id,
      p_collection: collectionId,
      p_position: position,
    });
    if (error) {
      console.error("[placements.move]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[placements.move]", e);
    return false;
  }
}

export async function unplaceArticle(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(PLACEMENTS)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id");
    if (error) {
      console.error("[placements.delete]", error.message);
      return false;
    }
    return (data || []).length > 0; // RLS skips rows silently on update
  } catch (e) {
    console.error("[placements.delete]", e);
    return false;
  }
}
