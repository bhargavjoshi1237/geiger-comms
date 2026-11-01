"use client";

// AI data layer: the browser client of the /api/ai/* and /api/kb/* routes (keys never reach it), owning no table; never throws or toasts.
// Reads are tri-state (null on not-configured or failure); writes, tests and detection return { ok: true, … } | { ok: false, code, message }.

import { apiPath } from "@/lib/widget/embed";
import { isSupabaseConfigured } from "./comms";

const FALLBACK_MESSAGE = "Something went wrong — try again.";

// -> { ok, status, data, code, message }
async function send(path, { method = "GET", body, op } = {}) {
  if (!isSupabaseConfigured()) return { ok: false, status: 0, code: "not_configured", message: FALLBACK_MESSAGE };
  try {
    const res = await fetch(apiPath(path), {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return { ok: true, status: 204, data: null };
    const data = await res.json().catch(() => null);
    if (res.ok && data !== null) return { ok: true, status: res.status, data };
    // A 2xx without a JSON body is a failure too, so no caller reads a missing payload.
    const code = res.ok ? "bad_response" : data?.error || "request_failed";
    console.error(`[ai.${op}]`, res.status, code);
    return { ok: false, status: res.status, data, code, message: data?.message || FALLBACK_MESSAGE };
  } catch (e) {
    console.error(`[ai.${op}]`, e?.name || "network_error");
    return { ok: false, status: 0, code: "network_error", message: FALLBACK_MESSAGE };
  }
}

const failure = ({ code, message }) => ({ ok: false, code, message });
const query = (params) => new URLSearchParams(params).toString();

// ---- providers --------------------------------------------------------------

export async function listProviders(projectId) {
  if (!projectId) return null;
  const res = await send(`/api/ai/providers?${query({ projectId })}`, { op: "listProviders" });
  return res.ok && Array.isArray(res.data) ? res.data : null;
}

// input: { projectId, provider, preset?, name, baseUrl?, capabilities?, models, apiKey? }
// -> { ok: true, provider, defaultsAssigned: { chat, embed } }
export async function createProvider(input) {
  const res = await send("/api/ai/providers", { method: "POST", body: input, op: "createProvider" });
  return res.ok ? { ok: true, provider: res.data.provider, defaultsAssigned: res.data.defaultsAssigned } : failure(res);
}

// -> { ok: true, provider, defaultsAssigned } (a key or URL change re-tests and may fill an empty default)
export async function updateProvider(id, patch) {
  const res = await send(`/api/ai/providers/${id}`, { method: "PATCH", body: patch, op: "updateProvider" });
  return res.ok ? { ok: true, provider: res.data.provider, defaultsAssigned: res.data.defaultsAssigned } : failure(res);
}

export async function deleteProvider(id) {
  const res = await send(`/api/ai/providers/${id}`, { method: "DELETE", op: "deleteProvider" });
  return res.ok ? { ok: true } : failure(res);
}

export async function testProvider(id) {
  const res = await send(`/api/ai/providers/${id}/test`, { method: "POST", op: "testProvider" });
  return res.ok ? { ok: true, provider: res.data } : failure(res);
}

// -> { ok: true, chat: string[], embed: string[] }
export async function fetchProviderModels(id) {
  const res = await send(`/api/ai/providers/${id}/models`, { op: "fetchProviderModels" });
  return res.ok ? { ok: true, chat: res.data.chat || [], embed: res.data.embed || [] } : failure(res);
}

// ---- settings, detection, usage ---------------------------------------------

// -> AiStatusVm | null
export async function getAiSettings(projectId) {
  if (!projectId) return null;
  const res = await send(`/api/ai/settings?${query({ projectId })}`, { op: "getAiSettings" });
  return res.ok ? res.data : null;
}

// patch: any of chatProviderId, chatModel, embedProviderId, embedModel, embedDims, features, limits,
// acknowledgeDataSharing, confirmReindex. -> { ok: true, status: AiStatusVm } | { ok: false, code, message, chunks? }
export async function saveAiSettings(projectId, patch) {
  const res = await send("/api/ai/settings", { method: "PUT", body: { projectId, ...patch }, op: "saveAiSettings" });
  if (res.ok) return { ok: true, status: res.data };
  return { ...failure(res), ...(res.code === "embedding_in_use" ? { chunks: res.data?.chunks ?? 0 } : {}) };
}

// -> { ok: true, dims }
export async function detectEmbeddingDims({ providerId, model }) {
  const res = await send("/api/ai/embeddings/detect", { method: "POST", body: { providerId, model }, op: "detectEmbeddingDims" });
  return res.ok ? { ok: true, dims: res.data.dims } : failure(res);
}

// -> { totals, byDay, byFeature, byProvider } | null
export async function getAiUsage(projectId, { days = 30 } = {}) {
  if (!projectId) return null;
  const res = await send(`/api/ai/usage?${query({ projectId, days })}`, { op: "getAiUsage" });
  return res.ok ? res.data : null;
}

// ---- article assist -----------------------------------------------------------

// One AI writing action for an article (POST /api/kb/assist); nothing is saved until the author applies it.
// body: { projectId, action, articleId?, input: { title, summary, body, selection }, options: { tone, targetLocale } }
// -> { ok: true, output, result, removedLinks, provider, model } | { ok: false, code, message }
export async function assist(body) {
  const res = await send("/api/kb/assist", { method: "POST", body, op: "assist" });
  return res.ok ? { ok: true, ...res.data } : failure(res);
}

// ---- knowledge index ----------------------------------------------------------

// One bounded indexing batch for the project (POST /api/kb/index); without articleIds it takes the stale queue.
// Background work: callers may ignore the result, and a failure only leaves the sources stale for the next run.
// -> { indexed, removed, pending, partial } | null
export async function requestIndex({ projectId, articleIds } = {}) {
  if (!projectId) return null;
  const res = await send("/api/kb/index", { method: "POST", body: articleIds ? { projectId, articleIds } : { projectId }, op: "requestIndex" });
  return res.ok ? res.data : null;
}

// ---- inbox copilot --------------------------------------------------------------

// A teammate-only summary of one conversation, notes included (POST /api/ai/inbox/summarize); nothing is saved.
// -> { ok: true, summary, removedLinks, provider, model } | { ok: false, code, message }
export async function summarizeConversation({ conversationId, language }) {
  const res = await send("/api/ai/inbox/summarize", { method: "POST", body: { conversationId, language }, op: "summarizeConversation" });
  return res.ok ? { ok: true, ...res.data } : failure(res);
}

// One rewrite of a reply draft (POST /api/ai/inbox/compose); action: rephrase | friendlier | formal | shorten | expand | fix.
// -> { ok: true, text, removedLinks, provider, model } | { ok: false, code, message }
export async function composeReply({ conversationId, action, draft }) {
  const res = await send("/api/ai/inbox/compose", { method: "POST", body: { conversationId, action, draft }, op: "composeReply" });
  return res.ok ? { ok: true, ...res.data } : failure(res);
}

// The draft into the customer's language ({ mode: "draft", draft }), or a customer message into `language`
// ({ mode: "message", messageId, language }) (POST /api/ai/inbox/translate); nothing is saved or sent.
// -> { ok: true, text, targetLanguage, sourceLanguage, truncated, removedLinks, provider, model } | { ok: false, code, message, language? }
export async function translateInbox(body) {
  const res = await send("/api/ai/inbox/translate", { method: "POST", body, op: "translateInbox" });
  if (res.ok) return { ok: true, ...res.data };
  return { ...failure(res), ...(res.data?.language ? { language: res.data.language } : {}) };
}
