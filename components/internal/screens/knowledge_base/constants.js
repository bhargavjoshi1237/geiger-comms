// Lookups, filter options and formatters for the Knowledge Base screens (KB spec §7.4, §7.5, §9, §10).

export const ARTICLE_STATE_MAP = {
  draft: { label: "Draft", variant: "neutral", dotClass: "bg-zinc-400" },
  published: { label: "Published", variant: "success", dotClass: "bg-emerald-400" },
  changes_unpublished: { label: "Changes unpublished", variant: "warning", dotClass: "bg-amber-400" },
  archived: { label: "Archived", variant: "outline", dotClass: "bg-zinc-600" },
};

// Per-locale chip styles; out_of_date overlays the state when the source changed since the translation was made.
export const TRANSLATION_STATE_MAP = {
  missing: { label: "Missing", variant: "outline", className: "border-dashed border-border text-text-tertiary" },
  draft: { label: "Draft", variant: "neutral" },
  published: { label: "Published", variant: "success" },
  changes_unpublished: { label: "Changes unpublished", variant: "warning" },
  archived: { label: "Archived", variant: "outline" },
  out_of_date: { label: "Out of date", variant: "warning" },
};

export const STATUS_FILTER_OPTIONS = [
  { value: "active", label: "All except archived" },
  { value: "all", label: "All statuses" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "changes_unpublished", label: "Changes unpublished" },
  { value: "archived", label: "Archived" },
];

export const AUDIENCE_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "users", label: "Users" },
  { value: "leads", label: "Leads" },
  { value: "visitors", label: "Visitors" },
  { value: "users_and_leads", label: "Users and leads" },
  { value: "visitors_and_leads", label: "Visitors and leads" },
];

// Canonical locale form is the BCP-47 tag as stored (§2.1).
export const LOCALE_OPTIONS = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "fr", label: "French" },
  { value: "fr-CA", label: "French (Canada)" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "es-MX", label: "Spanish (Mexico)" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "pt-PT", label: "Portuguese (Portugal)" },
  { value: "it", label: "Italian" },
  { value: "nl", label: "Dutch" },
  { value: "sv", label: "Swedish" },
  { value: "da", label: "Danish" },
  { value: "nb", label: "Norwegian (Bokmål)" },
  { value: "fi", label: "Finnish" },
  { value: "pl", label: "Polish" },
  { value: "cs", label: "Czech" },
  { value: "tr", label: "Turkish" },
  { value: "ru", label: "Russian" },
  { value: "uk", label: "Ukrainian" },
  { value: "ar", label: "Arabic", rtl: true },
  { value: "he", label: "Hebrew", rtl: true },
  { value: "fa", label: "Persian", rtl: true },
  { value: "hi", label: "Hindi" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "zh-TW", label: "Chinese (Traditional)" },
  { value: "id", label: "Indonesian" },
  { value: "vi", label: "Vietnamese" },
  { value: "th", label: "Thai" },
];

const LOCALE_BY_CODE = new Map(LOCALE_OPTIONS.map((l) => [l.value, l]));

export const DEFAULT_LOCALE = "en-US";

export function localeLabel(code) {
  return LOCALE_BY_CODE.get(code)?.label ?? code ?? "";
}

export function isRtlLocale(code) {
  return Boolean(LOCALE_BY_CODE.get(code)?.rtl);
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Dashboard preview styling for MarkdownView variant="article"; .gc-md lives only in the widget's stylesheet.
export const ARTICLE_PROSE_CLASS = [
  "text-sm leading-6 text-foreground",
  "[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2:first-child]:mt-0",
  "[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold",
  "[&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1",
  "[&_a]:text-primary [&_a]:underline [&_strong]:font-semibold",
  "[&_code]:rounded [&_code]:bg-surface-card [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px]",
  "[&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-surface-card [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_blockquote]:mb-3 [&_blockquote]:rounded-lg [&_blockquote]:border-l-2 [&_blockquote]:border-primary",
  "[&_blockquote]:bg-surface-subtle [&_blockquote]:px-3 [&_blockquote]:py-2",
  "[&_hr]:my-5 [&_hr]:border-border [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-lg",
].join(" ");

// Flipped in Phase 5, when the Messenger renders the article grammar too (§9.3).
export const MESSENGER_RICH_ARTICLES = false;

export const PUBLISH_PERMISSION = "comms.article.publish";
export const NEEDS_PUBLISH = "Needs the Publish articles permission";

// Why a published article isn't listed in the Messenger (§7.4), first match only. Reasons 2-6 read the group's
// source row and its placements. tone "info" has nothing to fix; "warning" does.
export function messengerReason(article, { source, placements = [], centersById = {} } = {}) {
  if (!article || article.state !== "published" || article.visibleInMessenger) return null;
  if (!article.isSource) {
    return {
      tone: "info",
      text: "Translations aren't shown in the Messenger yet — it shows the source language.",
    };
  }
  const row = source ?? article;
  const centers = placements.map((p) => centersById[p.centerId]).filter(Boolean);
  if (!centers.length) {
    return { tone: "info", text: "Unlisted — used by AI answers, not listed in the Help space." };
  }
  const primary = centers.find((c) => c.isDefault);
  if (!primary) return { tone: "warning", text: "Not in the default help center" };
  if (!primary.isLive) return { tone: "warning", text: "Help center isn't live" };
  if (primary.visibility === "private") return { tone: "warning", text: "Help center is private" };
  if (row.audience !== "everyone") return { tone: "warning", text: "Audience isn't Everyone" };
  return null;
}

// Per-locale status for the translations table and chips (§7.5).
export function translationStatus(row, source) {
  if (!row) return "missing";
  if (!row.isSource && source?.contentUpdatedAt && row.translatedFromAt
      && new Date(source.contentUpdatedAt) > new Date(row.translatedFromAt)) {
    return "out_of_date";
  }
  return row.displayState;
}

export function effectiveContent(article) {
  const draft = article?.draft;
  return {
    title: draft ? draft.title ?? "" : article?.title ?? "",
    summary: draft ? draft.summary ?? "" : article?.summary ?? "",
    body: draft ? draft.body ?? "" : article?.body ?? "",
  };
}

export function countTodos(body) {
  return (String(body ?? "").match(/\[TODO:/g) || []).length;
}

// Compact age of a timestamp ("3h ago"), falling back to the date after a month.
export function formatRelative(value) {
  const t = new Date(value).getTime();
  if (!value || !Number.isFinite(t)) return "—";
  const diff = Math.max(0, Date.now() - t);
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// A center's collections depth-first in position order: [{ collection, depth }] with depth 1..3.
export function collectionTree(collections, centerId) {
  const own = collections.filter((c) => c.helpCenterId === centerId);
  const byParent = new Map();
  for (const c of own) {
    const key = c.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(c);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.position - b.position || String(a.createdAt).localeCompare(String(b.createdAt)));
  }
  const out = [];
  const walk = (parentId, depth) => {
    for (const c of byParent.get(parentId) ?? []) {
      out.push({ collection: c, depth });
      if (depth < 3) walk(c.id, depth + 1);
    }
  };
  walk(null, 1);
  return out;
}

// ---- Help Centers (§10) ------------------------------------------------------

export const HELP_CENTER_STATUS_MAP = {
  live: { label: "Live", variant: "success", dotClass: "bg-emerald-400" },
  not_live: { label: "Not live", variant: "neutral", dotClass: "bg-zinc-400" },
};

export const VISIBILITY_MAP = {
  public: { label: "Public", variant: "neutral", dot: false },
  private: { label: "Private", variant: "warning", dot: false },
};

// The §10.1 honesty notice: no help-center website is served in this tranche.
export const WEBSITE_NOTICE =
  "Comms doesn't serve help-center websites yet. These settings are saved and shown in Preview; the default help center's collections and articles already power the Messenger's Help space.";

export const HELP_CENTER_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
export const GA_ID_RE = /^G-[A-Z0-9]{4,12}$/;

export const FONT_OPTIONS = ["Inter", "System", "Roboto", "Lato", "Merriweather"].map((f) => ({ value: f, label: f }));

export const LAYOUT_SECTION_LABELS = {
  hero: "Hero & search",
  collections: "Collections",
  featured: "Featured articles",
  content: "Content block",
};

export const MAX_FEATURED = 12;

// help_centers.theme shape (§10.5); a center's stored theme deep-merges over this for display.
export const DEFAULT_THEME = {
  colors: { action: "#2563eb", headerBg: "#0f172a", headerText: "#ffffff", bodyBg: "#ffffff" },
  header: { logoUrl: "", title: {}, links: [] },
  hero: {
    background: "color",
    gradientTo: "",
    imageUrl: "",
    height: 320,
    searchSize: "medium",
    align: "center",
    welcome: {},
  },
  font: "Inter",
  radius: 12,
  style: "card",
  showAuthors: true,
  layout: {
    sections: [
      { key: "hero", visible: true },
      { key: "collections", visible: true },
      { key: "featured", visible: false },
      { key: "content", visible: false },
    ],
    collectionColumns: 3,
    cardStyle: "classic",
    featuredArticleIds: [],
    content: { title: "", description: "", ctaLabel: "", ctaUrl: "" },
    article: { showToc: true, showRelated: true },
  },
  footer: { template: "simple", links: [], socialLinks: [] },
  faviconUrl: "",
  socialImageUrl: "",
};

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Client mirror of comms.jsonb_deep_merge: objects merge recursively, arrays and scalars replace.
export function mergeTheme(base, patch) {
  if (!isPlainObject(patch)) return patch === undefined ? base : patch;
  if (!isPlainObject(base)) return patch;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) out[key] = mergeTheme(base[key], value);
  return out;
}

export function themeOf(center) {
  return mergeTheme(DEFAULT_THEME, center?.theme ?? {});
}

export function httpsUrlError(value) {
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? null : "Use an https:// address.";
  } catch {
    return "Enter a full https:// address.";
  }
}

// ---- Knowledge Gaps (§11) ----------------------------------------------------------

export const GAP_STATE_MAP = {
  open: { label: "Open", variant: "info", dotClass: "bg-sky-400" },
  in_progress: { label: "In progress", variant: "info", dotClass: "bg-violet-400" },
  resolved: { label: "Resolved", variant: "success", dotClass: "bg-emerald-400" },
  dismissed: { label: "Dismissed", variant: "neutral", dotClass: "bg-zinc-400" },
  expired: { label: "Expired", variant: "outline", dotClass: "bg-zinc-600" },
};

export const GAP_STATUS_FILTER_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "expired", label: "Expired" },
  { value: "all", label: "All" },
];

// Messenger questions and reactions only arrive with the Messenger update (Phase 5).
export const GAP_SOURCE_FILTER_OPTIONS = [
  { value: "all", label: "All sources" },
  { value: "conversation", label: "Conversations" },
  ...(MESSENGER_RICH_ARTICLES
    ? [
        { value: "ask", label: "Messenger questions" },
        { value: "reaction", label: "Negative reactions" },
      ]
    : []),
];

export const GAP_TREND_FILTER_OPTIONS = [
  { value: "all", label: "All trends" },
  { value: "up", label: "Rising" },
  { value: "down", label: "Falling" },
  { value: "flat", label: "Steady" },
];

export const GAP_SORT_OPTIONS = [
  { value: "impact", label: "Sort: Impact" },
  { value: "questions", label: "Sort: Questions" },
  { value: "newest", label: "Sort: Newest" },
];

export const DISMISS_REASONS = [
  { value: "not_relevant", label: "Not relevant" },
  { value: "already_covered", label: "Already covered" },
  { value: "duplicate", label: "Duplicate topic" },
  { value: "other", label: "Other" },
];

// The body of a draft made from a gap without AI (§11.6).
export function gapTemplateBody(questions) {
  const asked = (questions || []).slice(0, 10).map((q) => `- ${q}`).join("\n");
  return `## Overview\n\n[TODO: answer]\n\n## What customers asked\n\n${asked}`;
}

export function withinDays(value, days) {
  const t = new Date(value).getTime();
  return Number.isFinite(t) && Date.now() - t <= days * 86_400_000;
}
