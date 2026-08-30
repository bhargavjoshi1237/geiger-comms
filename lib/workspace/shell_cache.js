"use client";

import { useLayoutEffect, useRef } from "react";

// Last-known workspace-shell state — addon enablement, RBAC grants, sidebar
// curation — kept in memory and mirrored to localStorage.
//
// The shell's three contexts all answer the same question ("what does this
// user's sidebar look like?") and all need a round trip to answer it. Without a
// cache the sidebar paints the un-curated default first and corrects itself when
// the database replies, so every reload flashes entries the user has hidden.
// This lets them paint the answer they had last time on the first frame.
//
// It is a PAINT HINT, never a source of truth: every consumer still revalidates
// through its data layer on mount and overwrites what it finds here, and a
// failed read leaves the cached value alone rather than clobbering it with an
// empty one. Entries are scoped per project and stamped with the user they were
// written for — a second account on the same browser paints the previous one's
// sidebar only until its own load lands.

const PREFIX = "geiger-events:shell";

// Survives a remount within the session even when localStorage is unavailable.
const memory = new Map();

function storageKey(name, projectId) {
  return `${PREFIX}:${name}:${projectId}`;
}

// The cached `{ userId, value }` entry, or null when there is none.
function readShellCache(name, projectId) {
  if (!name || !projectId) return null;
  const key = storageKey(name, projectId);
  if (memory.has(key)) return memory.get(key);
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || typeof entry !== "object" || !("value" in entry)) return null;
    memory.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}

export function writeShellCache(name, projectId, userId, value) {
  if (!name || !projectId) return;
  const key = storageKey(name, projectId);
  const entry = { userId: userId ?? null, value };
  memory.set(key, entry);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Private mode or quota — the in-memory copy still serves this session.
  }
}

// Hand a provider its cached entry before the browser paints, so the first frame
// shows what the user had last time instead of the empty default the fetch will
// replace a round trip later.
//
// A layout effect rather than a state initialiser on purpose: localStorage
// doesn't exist while the page is server-rendered, so seeding during the first
// render would disagree with the server HTML and fail hydration. React flushes
// state set from a layout effect before the browser paints, so the extra render
// this costs is exactly the point — it is why nothing flashes.
export function usePaintFromShellCache(name, projectId, apply) {
  // Callers pass an inline closure, so `apply` changes identity every render and
  // the effect re-runs with it — which is what keeps the closure current when the
  // project changes. Seeding is idempotent per project, and re-applying a stale
  // cache over freshly loaded state would not be, so it happens exactly once.
  const seededFor = useRef(null);

  useLayoutEffect(() => {
    const key = `${name}:${projectId}`;
    if (!projectId || seededFor.current === key) return;
    seededFor.current = key;
    const entry = readShellCache(name, projectId);
    if (entry) apply(entry);
  }, [name, projectId, apply]);
}

// Same members in the same order? Used to keep a revalidation that changed
// nothing from handing consumers a fresh array and re-rendering the whole nav.
export function sameStringList(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((value, i) => value === b[i]);
}
