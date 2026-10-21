"use client";

// Help center Preview (KB spec §10.5): an in-app rendering of the home page and an article page — no website is
// served yet. The customer's brand colours are user data, applied as inline CSS variables inside this frame only.

import { useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import {
  LucideIcon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui";
import { SegmentedTabs } from "@/components/internal/shared/screen_kit";
import { MarkdownView } from "@/components/widget/markdown_view";
import { safeUrl, IMAGE_SCHEMES } from "@/lib/markdown/parse";
import { isRtlLocale, localeLabel } from "./constants";

const DEVICES = [
  { label: "Desktop", value: "desktop" },
  { label: "Tablet", value: "tablet" },
  { label: "Mobile", value: "mobile" },
];
const WIDTHS = { desktop: "100%", tablet: "768px", mobile: "390px" };
const FONT_STACKS = {
  Inter: "Inter, ui-sans-serif, system-ui, sans-serif",
  System: "ui-sans-serif, system-ui, -apple-system, sans-serif",
  Roboto: "Roboto, ui-sans-serif, system-ui, sans-serif",
  Lato: "Lato, ui-sans-serif, system-ui, sans-serif",
  Merriweather: "Merriweather, ui-serif, Georgia, serif",
};

// Article prose inside the frame takes the customer's colours, never the dashboard's tokens.
const PREVIEW_PROSE = [
  "text-sm leading-6",
  "[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:font-semibold",
  "[&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_a]:text-(--hc-action) [&_a]:underline [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1",
  "[&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/5 [&_pre]:p-3",
  "[&_blockquote]:mb-3 [&_blockquote]:border-l-2 [&_blockquote]:border-(--hc-action) [&_blockquote]:px-3",
  "[&_hr]:my-5 [&_hr]:opacity-20 [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-lg",
].join(" ");

// Dark text on light backgrounds and the reverse, from the customer's hex.
function readableOn(hex) {
  const n = Number.parseInt(String(hex).slice(1), 16);
  if (!Number.isFinite(n)) return "#111827";
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#111827" : "#f9fafb";
}

function heroBackground(theme) {
  const { hero, colors } = theme;
  const image = safeUrl(hero.imageUrl, IMAGE_SCHEMES);
  if (hero.background === "image" && image) return `center / cover no-repeat url("${image}")`;
  if (hero.background === "gradient" && hero.gradientTo) {
    return `linear-gradient(135deg, ${colors.headerBg}, ${hero.gradientTo})`;
  }
  return colors.headerBg;
}

const SEARCH_WIDTH = { short: "max-w-xs", medium: "max-w-md", long: "max-w-xl" };

export function HelpCenterPreview({ center, hc, theme }) {
  const [device, setDevice] = useState("desktop");
  const [locale, setLocale] = useState(center.defaultLocale);
  const [openId, setOpenId] = useState(null);
  const isDefaultLocale = locale === center.defaultLocale;

  // The published row a reader in `locale` sees for each placed source (its translation, or the source itself).
  const readable = useMemo(() => {
    const out = new Map();
    for (const p of hc.placements.filter((x) => x.centerId === center.id)) {
      const source = hc.articlesById[p.articleId];
      if (!source) continue;
      const row = isDefaultLocale
        ? source
        : hc.articles.find((a) => a.sourceId === source.id && a.locale === locale) ?? null;
      if (row && row.state === "published") out.set(source.id, { row, placement: p });
    }
    return out;
  }, [hc.placements, hc.articlesById, hc.articles, center.id, locale, isDefaultLocale]);

  // A collection without a name in this locale is hidden there (Intercom's rule).
  const collectionName = (c) => (isDefaultLocale ? c.name : c.translations?.[locale]?.name?.trim());
  const collections = hc.collections
    .filter((c) => c.helpCenterId === center.id && !c.parentId && collectionName(c))
    .sort((a, b) => a.position - b.position);
  const countIn = (collection) => {
    const ids = new Set([collection.id]);
    // Two passes reach the third level whatever the order.
    for (let pass = 0; pass < 2; pass += 1) {
      for (const c of hc.collections) if (c.parentId && ids.has(c.parentId)) ids.add(c.id);
    }
    return [...readable.values()].filter(({ placement }) => ids.has(placement.collectionId)).length;
  };

  const featured = theme.layout.featuredArticleIds.map((id) => readable.get(id)?.row).filter(Boolean);
  const columns = device === "mobile" ? 1 : device === "tablet" ? Math.min(2, theme.layout.collectionColumns) : theme.layout.collectionColumns;
  const title = theme.header.title?.[locale] || center.name || "Help Center";
  const welcome = theme.hero.welcome?.[locale] || "How can we help?";
  const logo = safeUrl(theme.header.logoUrl, IMAGE_SCHEMES);
  const radius = `${theme.radius}px`;
  const cardStyle = theme.layout.cardStyle;
  const frameStyle = {
    "--hc-action": theme.colors.action,
    width: WIDTHS[device],
    maxWidth: "100%",
    background: theme.colors.bodyBg,
    color: readableOn(theme.colors.bodyBg),
    fontFamily: FONT_STACKS[theme.font] ?? FONT_STACKS.System,
  };
  const card = {
    borderRadius: radius,
    border: "1px solid rgb(0 0 0 / 0.08)",
    boxShadow: theme.style === "floating" ? "0 8px 24px rgb(0 0 0 / 0.08)" : "none",
  };
  const open = openId ? readable.get(openId)?.row ?? null : null;

  const sections = {
    hero: (
      <div
        key="hero"
        className="px-6 py-10"
        style={{
          background: heroBackground(theme),
          color: theme.colors.headerText,
          minHeight: `${Math.min(theme.hero.height, 480) * (device === "mobile" ? 0.6 : 1)}px`,
          textAlign: theme.hero.align === "left" ? "left" : "center",
        }}
      >
        <h2 className="text-2xl font-semibold">{welcome}</h2>
        <div
          className={`mt-5 flex items-center gap-2 bg-white px-4 py-2.5 text-sm text-gray-500 ${SEARCH_WIDTH[theme.hero.searchSize] ?? SEARCH_WIDTH.medium} ${theme.hero.align === "left" ? "" : "mx-auto"}`}
          style={{ borderRadius: radius }}
        >
          <Search className="h-4 w-4" aria-hidden="true" /> Search for articles…
        </div>
      </div>
    ),
    collections: collections.length ? (
      <div
        key="collections"
        className="grid gap-4 px-6 py-6"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {collections.map((c) => (
          <div key={c.id} className="p-4" style={card}>
            {cardStyle !== "compact" ? (
              <LucideIcon
                name={c.icon || "Folder"}
                className={cardStyle === "visual" ? "mb-3 h-8 w-8" : "mb-2 h-5 w-5"}
                style={{ color: theme.colors.action }}
              />
            ) : null}
            <p className="font-semibold">{collectionName(c)}</p>
            {cardStyle !== "compact" && (isDefaultLocale ? c.description : c.translations?.[locale]?.description) ? (
              <p className="mt-1 text-sm opacity-70">
                {isDefaultLocale ? c.description : c.translations?.[locale]?.description}
              </p>
            ) : null}
            <p className="mt-2 text-xs opacity-60">
              {countIn(c)} {countIn(c) === 1 ? "article" : "articles"}
            </p>
          </div>
        ))}
      </div>
    ) : null,
    featured: featured.length ? (
      <div key="featured" className="px-6 py-6">
        <p className="mb-3 text-sm font-semibold">Featured articles</p>
        <div className="grid gap-2">
          {featured.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setOpenId(a.sourceId)}
              className="px-4 py-3 text-left text-sm"
              style={card}
            >
              {a.title || "Untitled article"}
            </button>
          ))}
        </div>
      </div>
    ) : null,
    content:
      theme.layout.content.title || theme.layout.content.description ? (
        <div key="content" className="mx-6 my-6 p-6" style={card}>
          <p className="font-semibold">{theme.layout.content.title}</p>
          <p className="mt-1 text-sm opacity-70">{theme.layout.content.description}</p>
          {theme.layout.content.ctaLabel ? (
            <span
              className="mt-4 inline-block px-4 py-2 text-sm font-medium"
              style={{ background: theme.colors.action, color: readableOn(theme.colors.action), borderRadius: radius }}
            >
              {theme.layout.content.ctaLabel}
            </span>
          ) : null}
        </div>
      ) : null,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs tabs={DEVICES} value={device} onChange={setDevice} />
        <Select value={locale} onValueChange={(l) => { setLocale(l); setOpenId(null); }}>
          <SelectTrigger size="sm" className="w-48" aria-label="Preview language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {center.locales.map((l) => (
              <SelectItem key={l} value={l}>
                {localeLabel(l)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface-card p-4">
        <div className="mx-auto overflow-hidden rounded-lg" style={frameStyle} dir={isRtlLocale(locale) ? "rtl" : "ltr"}>
          <div
            className="flex items-center gap-3 px-6 py-4"
            style={{ background: theme.colors.headerBg, color: theme.colors.headerText }}
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-7 w-auto" referrerPolicy="no-referrer" />
            ) : null}
            <span className="font-semibold">{title}</span>
          </div>

          {open ? (
            <div className="px-6 py-8">
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="mb-4 inline-flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> All articles
              </button>
              <h1 className="text-2xl font-semibold">{open.title || "Untitled article"}</h1>
              {theme.showAuthors && open.authorName ? (
                <p className="mt-1 text-sm opacity-60">Written by {open.authorName}</p>
              ) : null}
              {open.summary ? <p className="mt-3 opacity-70">{open.summary}</p> : null}
              <div className="mt-6">
                <MarkdownView text={open.body} variant="article" className={PREVIEW_PROSE} />
              </div>
            </div>
          ) : (
            <>
              {theme.layout.sections.filter((s) => s.visible).map((s) => sections[s.key] ?? null)}
              {!readable.size ? (
                <p className="px-6 py-8 text-center text-sm opacity-60">
                  No published articles in {localeLabel(locale)} yet.
                </p>
              ) : (
                <div className="px-6 py-6">
                  <p className="mb-3 text-sm font-semibold">All articles</p>
                  <div className="grid gap-1">
                    {[...readable.values()].map(({ row }) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setOpenId(row.sourceId)}
                        className="truncate text-left text-sm underline-offset-2 hover:underline"
                        style={{ color: theme.colors.action }}
                      >
                        {row.title || "Untitled article"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {theme.footer.links.length ? (
            <div className="flex flex-wrap gap-4 border-t px-6 py-4 text-xs opacity-70" style={{ borderColor: "rgb(0 0 0 / 0.08)" }}>
              {theme.footer.links.map((link) => (
                <span key={`${link.label}-${link.url}`}>{link.label}</span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default HelpCenterPreview;
