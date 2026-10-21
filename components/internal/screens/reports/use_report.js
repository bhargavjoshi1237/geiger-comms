"use client";

import { useCallback, useEffect, useState } from "react";

// Loads one report section for `query`; it reads as loading until the response for this exact query (and retry) lands.
export function useReport(load, query) {
  const [result, setResult] = useState({ key: null, data: null });
  const [attempt, setAttempt] = useState(0);
  const key = query ? `${JSON.stringify(query)}#${attempt}` : null;

  useEffect(() => {
    if (!query) return undefined;
    let alive = true;
    load(query).then((data) => {
      if (alive) setResult({ key, data });
    });
    return () => {
      alive = false;
    };
  }, [load, query, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (!key || result.key !== key) return { status: "loading", data: null, retry };
  return { status: result.data === null ? "failed" : "ready", data: result.data, retry };
}
