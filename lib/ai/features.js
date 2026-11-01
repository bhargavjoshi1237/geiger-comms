// The AI feature switches (knowledge-base-and-ai-providers spec §5.3) — the single source of truth for
// ai_settings.features / .limits keys and for the ai_usage_events.feature value each switch records. Pure.

export const AI_FEATURES = {
  articleAssist: { usage: "article_assist", label: "Article writing assistant" },
  translation: { usage: "translate", label: "Article translation" },
  gapClustering: { usage: "gap_cluster", label: "Knowledge gap clustering" },
  inboxAssist: { usage: "inbox_assist", label: "Inbox copilot" },
  inboxTranslation: { usage: "inbox_translate", label: "Inbox translation" },
  messengerAnswers: { usage: "messenger_answer", label: "Answers in the Messenger" },
};

// ai_usage_events.feature values that are not switches: manager-only checks and the knowledge index.
export const NON_FEATURE_USAGE = ["test", "models", "detect_dims", "embed_index", "embed_query"];

// Mirror the ai_settings column defaults (ai_providers, then ai_inbox_features).
export const DEFAULT_FEATURES = {
  articleAssist: true,
  translation: true,
  gapClustering: true,
  inboxAssist: true,
  inboxTranslation: true,
  messengerAnswers: false,
};
export const DEFAULT_LIMITS = {
  articleAssist: 300,
  translation: 100,
  gapClustering: 40,
  inboxAssist: 300,
  inboxTranslation: 100,
  messengerAnswers: 0,
  perUserPerMinute: 10,
};

export const MAX_DAILY_LIMIT = 100_000;

export function isFeatureKey(key) {
  return Object.prototype.hasOwnProperty.call(AI_FEATURES, key);
}

// -> { available, reason } for one switch key from an AiStatusVm, in the order chatModelFor refuses:
// no provider or default, the switch (a 0 limit is "off"), consent, provider health, then today's cap.
export function featureAvailability(status, feature) {
  if (!status) return { available: false, reason: "unknown" };
  const chatReason = status.chat?.available ? null : status.chat?.reason || "not_configured";
  if (chatReason === "not_configured" || chatReason === "no_default") return { available: false, reason: chatReason };
  const limit = Number(status.limits?.[feature] ?? 0);
  if (!status.features?.[feature] || limit <= 0) return { available: false, reason: "feature_disabled" };
  if (chatReason) return { available: false, reason: chatReason };
  if (Number(status.usageToday?.[feature] ?? 0) >= limit) return { available: false, reason: "quota_exceeded" };
  return { available: true, reason: null };
}
