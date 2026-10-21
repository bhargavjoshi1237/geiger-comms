"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useOptionalProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { primeAiStatus } from "@/lib/hooks/use-ai-status";
import {
  createProvider,
  deleteProvider,
  detectEmbeddingDims,
  fetchProviderModels,
  getAiSettings,
  getAiUsage,
  listProviders,
  requestIndex,
  saveAiSettings,
  testProvider,
  updateProvider,
} from "@/lib/supabase/ai";
import { suggestedModelsFor } from "@/lib/ai/provider_kinds";

const NO_USAGE = { requests: 0, errors: 0 };

// Everything Settings → AI Providers knows and changes: the providers, the project's AiStatusVm and 30-day usage,
// plus every write. The screen keeps view state only (which dialog is open) and renders what this returns.
export function useAiProviders() {
  const { projectId } = useOptionalProject() ?? {};
  const clientCanView = useCan("comms.settings.view");
  const clientCanManage = useCan("comms.settings.manage");

  const [providers, setProviders] = useState([]);
  const [status, setStatus] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [usageLoading, setUsageLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [reindexing, setReindexing] = useState(null); // { done, total } while the re-index loop runs
  const [loadedFor, setLoadedFor] = useState(projectId);
  const [attempt, setAttempt] = useState(0);

  if (projectId !== loadedFor) {
    setLoadedFor(projectId);
    setLoading(true);
    setUsageLoading(true);
  }

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    Promise.all([listProviders(projectId), getAiSettings(projectId)]).then(([rows, next]) => {
      if (!alive) return;
      setProviders(rows ?? []);
      setStatus(next);
      setFailed(rows === null);
      setLoading(false);
      primeAiStatus(projectId, next);
    });
    getAiUsage(projectId).then((data) => {
      if (!alive) return;
      setUsage(data);
      setUsageLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, attempt]);

  const retry = useCallback(() => {
    setLoading(true);
    setUsageLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  const applyStatus = useCallback(
    (next) => {
      setStatus(next);
      primeAiStatus(projectId, next);
    },
    [projectId],
  );

  const refreshStatus = useCallback(async () => {
    const next = await getAiSettings(projectId);
    if (next) applyStatus(next);
    return next;
  }, [projectId, applyStatus]);

  const refreshUsage = useCallback(async () => {
    const data = await getAiUsage(projectId);
    if (data) setUsage(data);
  }, [projectId]);

  const mergeProvider = (provider) => setProviders((prev) => prev.map((p) => (p.id === provider.id ? { ...p, ...provider } : p)));

  // Toast for a write that (re-)tested the connection.
  const announceTested = (provider, defaultsAssigned) => {
    if (provider.status === "error") {
      toast.error(`Saved, but the connection test failed — ${provider.lastError?.message || "check the key."}`);
    } else if (defaultsAssigned?.chat || defaultsAssigned?.embed) {
      toast.success(`${provider.name} connected and set as default`);
    } else {
      toast.success(`${provider.name} connected`);
    }
  };

  const needsConsent = (next, defaultsAssigned) =>
    Boolean((defaultsAssigned?.chat || defaultsAssigned?.embed) && next && !next.dataSharingAcknowledged);

  // -> { ok, provider, needsConsent } — the dialog closes only on ok.
  const connect = async (input) => {
    const res = await createProvider({ projectId, ...input });
    if (!res.ok) {
      toast.error(res.message);
      return res;
    }
    setProviders((prev) => [...prev, { ...res.provider, usage30d: NO_USAGE }]);
    announceTested(res.provider, res.defaultsAssigned);
    const next = await refreshStatus();
    void refreshUsage();
    return { ...res, needsConsent: needsConsent(next, res.defaultsAssigned) };
  };

  // `retested`: the patch carried a key or endpoint change, so the server ran the connection test.
  const save = async (id, patch, { retested = false } = {}) => {
    const res = await updateProvider(id, patch);
    if (!res.ok) {
      toast.error(res.message);
      return res;
    }
    mergeProvider(res.provider);
    if (retested) announceTested(res.provider, res.defaultsAssigned);
    else toast.success(`${res.provider.name} saved`);
    const next = await refreshStatus();
    if (retested) void refreshUsage();
    return { ...res, needsConsent: needsConsent(next, res.defaultsAssigned) };
  };

  const test = async (row) => {
    setTestingId(row.id);
    const res = await testProvider(row.id);
    setTestingId(null);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    mergeProvider(res.provider);
    if (res.provider.status === "ok") toast.success(`${row.name} is connected`);
    else if (res.provider.status === "error") toast.error(`${row.name} couldn't be verified — ${res.provider.lastError?.message || "check the key."}`);
    else toast(`Nothing on ${row.name} could be tested automatically.`);
    void refreshStatus();
    void refreshUsage();
  };

  const remove = async (row) => {
    setProviders((prev) => prev.filter((p) => p.id !== row.id));
    const res = await deleteProvider(row.id);
    if (!res.ok) {
      toast.error(res.message);
      const rows = await listProviders(projectId);
      if (rows) setProviders(rows);
      return;
    }
    toast.success(`${row.name} deleted`);
    void refreshStatus();
  };

  // Optimistic settings write: `optimistic(status)` previews it, rolled back on failure. embedding_in_use is returned
  // untoasted so the caller can ask to re-index. -> the saveAiSettings result
  const saveSettings = async (patch, optimistic) => {
    const before = status;
    if (optimistic && before) setStatus(optimistic(before));
    const res = await saveAiSettings(projectId, patch);
    if (res.ok) {
      applyStatus(res.status);
      return res;
    }
    setStatus(before);
    if (res.code !== "embedding_in_use") toast.error(res.message);
    return res;
  };

  // -> { ok, dims } | { ok: false, code, message } (shown inline by the caller)
  const detectDims = (providerId, model) => detectEmbeddingDims({ providerId, model });

  // Row action "Use for chat / embeddings". -> the save result, with needsConsent
  const makeDefault = async (row, capability) => {
    if (capability === "chat") {
      const res = await saveSettings({ chatProviderId: row.id, chatModel: row.models[0] ?? null }, (s) => ({
        ...s,
        chat: { ...s.chat, providerId: row.id, providerName: row.name, model: row.models[0] ?? null },
      }));
      if (res.ok) toast.success(`${row.name} is now the default chat model`);
      return { ...res, needsConsent: res.ok && !res.status.dataSharingAcknowledged };
    }
    const model = (status?.embed?.providerId === row.id && status.embed.model) || suggestedModelsFor(row, "embed")[0]?.id;
    if (!model) {
      toast.error(`Choose an embedding model for ${row.name} in Default Models.`);
      return { ok: false };
    }
    const detected = await detectDims(row.id, model);
    if (!detected.ok) {
      toast.error(detected.message);
      return detected;
    }
    const res = await saveSettings({ embedProviderId: row.id, embedModel: model, embedDims: detected.dims });
    if (res.ok) toast.success(`${row.name} is now the default embedding model`);
    return { ...res, needsConsent: res.ok && !res.status.dataSharingAcknowledged };
  };

  // Rebuilds the stale knowledge index in bounded batches; leaving the screen is safe (the next publish continues it).
  const reindex = async (pending) => {
    const total = pending;
    let left = pending;
    setReindexing({ done: 0, total });
    while (left > 0) {
      const res = await requestIndex({ projectId });
      if (!res || res.pending >= left) break;
      left = res.pending;
      setReindexing({ done: total - left, total });
    }
    setReindexing(null);
    void refreshStatus();
  };

  return {
    projectId,
    providers,
    status,
    usage,
    loading,
    usageLoading,
    failed,
    canView: clientCanView && status?.canView !== false,
    canManage: clientCanManage && status?.canManage !== false,
    testingId,
    reindexing,
    retry,
    connect,
    save,
    test,
    remove,
    saveSettings,
    detectDims,
    fetchModels: fetchProviderModels,
    makeDefault,
    reindex,
  };
}
