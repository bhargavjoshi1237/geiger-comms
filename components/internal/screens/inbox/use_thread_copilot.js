"use client";

// Copilot state for the open thread (summary + message translations), keyed by conversation so a late answer for a thread you left is dropped.

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAiStatus } from "@/lib/hooks/use-ai-status";
import { featureAvailability } from "@/lib/ai/features";
import { detectLanguage, languageCode } from "@/lib/inbox/language";
import { summarizeConversation, translateInbox } from "@/lib/supabase/ai";
import { copilotError, isAiRefusal } from "./copilot";

const noop = () => () => {};
const NO_TRANSLATIONS = Object.freeze({});

// The teammate's own language, from the browser; the server render assumes English.
function useTeammateLanguage() {
  return useSyncExternalStore(noop, () => navigator.language || "en", () => "en");
}

export function useThreadCopilot(conversationId, messages) {
  const { status, loading, refresh } = useAiStatus();
  const language = useTeammateLanguage();
  const [summary, setSummary] = useState(null); // { key, run, state, text, provider, model, removed, message }
  const [translations, setTranslations] = useState({ key: null, items: {} }); // items[messageId] = { state, text, … }
  const runs = useRef(0);

  // Customer messages worth offering a translation for: not already in the teammate's language (or undetectable).
  const translatable = useMemo(() => {
    const mine = languageCode(language) || "en";
    const ids = new Set();
    for (const m of messages || []) {
      if (m.authorRole === "customer" && m.messageType !== "note" && m.body?.trim() && detectLanguage(m.body) !== mine) ids.add(m.id);
    }
    return ids;
  }, [messages, language]);

  const summarize = useCallback(async () => {
    const key = conversationId;
    if (!key) return;
    if (!featureAvailability(status, "inboxAssist").available) {
      setSummary({ key, state: "unavailable" });
      return;
    }
    runs.current += 1;
    const run = runs.current;
    setSummary({ key, run, state: "loading" });
    const res = await summarizeConversation({ conversationId: key, language });
    if (!res.ok && isAiRefusal(res.code)) void refresh();
    setSummary((prev) => {
      if (prev?.key !== key || prev.run !== run) return prev;
      return res.ok
        ? { key, run, state: "ready", text: res.summary, provider: res.provider, model: res.model, removed: res.removedLinks?.length ?? 0 }
        : { key, run, state: "error", message: copilotError(res) };
    });
  }, [conversationId, status, language, refresh]);

  const dismissSummary = useCallback(() => setSummary(null), []);

  // Writes one message's entry for the open conversation (starting fresh when the conversation changed).
  const putTranslation = useCallback(
    (key, id, update) =>
      setTranslations((prev) => {
        const items = prev.key === key ? prev.items : {};
        const next = update(items[id]);
        if (next === items[id]) return prev;
        const rest = { ...items };
        if (next) rest[id] = next;
        else delete rest[id];
        return { key, items: rest };
      }),
    [],
  );

  const translate = useCallback(
    async (message) => {
      const key = conversationId;
      if (!key || !message?.id) return;
      if (!featureAvailability(status, "inboxTranslation").available) {
        putTranslation(key, message.id, () => ({ state: "unavailable" }));
        return;
      }
      putTranslation(key, message.id, () => ({ state: "loading" }));
      const res = await translateInbox({ conversationId: key, mode: "message", messageId: message.id, language });
      if (!res.ok && isAiRefusal(res.code)) void refresh();
      putTranslation(key, message.id, (current) => {
        if (current?.state !== "loading") return current;
        return res.ok
          ? { state: "ready", text: res.text, sourceLanguage: res.sourceLanguage, truncated: res.truncated, original: false }
          : { state: "error", message: copilotError(res) };
      });
    },
    [conversationId, status, language, refresh, putTranslation],
  );

  const toggleOriginal = useCallback(
    (id) => putTranslation(conversationId, id, (current) => (current?.state === "ready" ? { ...current, original: !current.original } : current)),
    [conversationId, putTranslation],
  );

  const dismissTranslation = useCallback((id) => putTranslation(conversationId, id, () => null), [conversationId, putTranslation]);

  return {
    status,
    loading,
    summary: summary?.key === conversationId ? summary : null,
    summarize,
    dismissSummary,
    translatable,
    translations: translations.key === conversationId ? translations.items : NO_TRANSLATIONS,
    translate,
    toggleOriginal,
    dismissTranslation,
  };
}

export default useThreadCopilot;
