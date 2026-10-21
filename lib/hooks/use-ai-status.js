"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { useOptionalProject } from "@/context/project-context";
import { getAiSettings } from "@/lib/supabase/ai";

// The project's AiStatusVm (GET /api/ai/settings) for every AI control: cached per project for 60 s in a module map,
// shared by all mounted readers, and replaced right after any settings mutation (primeAiStatus / refreshAiStatus).

const TTL_MS = 60_000;
const EMPTY = Object.freeze({ status: null, at: 0 });
const cache = new Map();
const inflight = new Map();
const listeners = new Set();

function publish(projectId, status) {
  cache.set(projectId, { status, at: Date.now() });
  for (const listener of listeners) listener();
}

export function refreshAiStatus(projectId) {
  if (!projectId) return Promise.resolve(null);
  if (!inflight.has(projectId)) {
    inflight.set(
      projectId,
      getAiSettings(projectId).then((status) => {
        inflight.delete(projectId);
        publish(projectId, status);
        return status;
      }),
    );
  }
  return inflight.get(projectId);
}

// A settings write already returned the fresh status; share it without a round trip.
export function primeAiStatus(projectId, status) {
  if (projectId && status) publish(projectId, status);
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// -> { loading, status, refresh }. status is null while loading or when the status couldn't be read.
export function useAiStatus(projectIdArg) {
  const project = useOptionalProject();
  const projectId = projectIdArg ?? project?.projectId ?? null;
  const entry = useSyncExternalStore(
    subscribe,
    () => (projectId && cache.get(projectId)) || EMPTY,
    () => EMPTY,
  );

  useEffect(() => {
    if (!projectId) return;
    const cached = cache.get(projectId);
    if (!cached || Date.now() - cached.at > TTL_MS) void refreshAiStatus(projectId);
  }, [projectId]);

  const refresh = useCallback(() => refreshAiStatus(projectId), [projectId]);
  return { loading: Boolean(projectId) && entry === EMPTY, status: entry.status, refresh };
}

export default useAiStatus;
