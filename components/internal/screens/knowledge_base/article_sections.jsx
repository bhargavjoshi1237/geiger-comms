"use client";

// Article editor nav + the Help centers and Details sections (KB spec §9.2, §9.4). Content, Translations,
// Insights and Version history live in their own files.

import { BarChart3, BookOpen, Copy, FileText, History, Languages, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@geiger/ui";
import {
  EmptyState,
  SectionCard,
  SettingRow,
  SettingsList,
} from "@/components/internal/shared/screen_kit";
import { Notice } from "@/components/internal/shared/notice";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  AUDIENCE_OPTIONS,
  LOCALE_OPTIONS,
  NEEDS_PUBLISH,
  collectionTree,
  formatDateTime,
  localeLabel,
} from "./constants";
import { Gated } from "@/components/internal/shared/gated";

const UNASSIGNED = "__unassigned__";
const NO_AUTHOR = "__none__";

export const ARTICLE_NAV = [
  {
    group: null,
    items: [
      {
        key: "overview",
        label: "Content",
        icon: FileText,
        desc: "Write the article. Edits save automatically.",
        ownHeader: true,
      },
    ],
  },
  {
    group: "Publishing",
    items: [
      {
        key: "placement",
        label: "Help centers",
        icon: BookOpen,
        desc: "Where this article is listed. Your default help center's articles appear in the Messenger.",
        showIf: (article) => article?.isSource,
      },
      {
        key: "details",
        label: "Details",
        icon: SlidersHorizontal,
        desc: "Author, audience and how AI answers may use this article.",
      },
      {
        key: "translations",
        label: "Translations",
        icon: Languages,
        desc: "This article in your help centers' languages.",
      },
    ],
  },
  {
    group: "Insights",
    items: [
      {
        key: "insights",
        label: "Insights",
        icon: BarChart3,
        desc: "How often the Messenger shows this article, over the last 30 days.",
      },
      {
        key: "history",
        label: "Version history",
        icon: History,
        desc: "Every published version and saved snapshot. Restoring one makes a new draft.",
      },
    ],
  },
];

function CenterBadges({ center }) {
  return (
    <span className="ml-2 inline-flex gap-1 align-middle">
      <Badge variant={center.isLive ? "success" : "neutral"}>{center.isLive ? "Live" : "Not live"}</Badge>
      {center.visibility === "private" ? <Badge variant="warning">Private</Badge> : null}
      {center.isDefault ? <Badge variant="info">Default</Badge> : null}
    </span>
  );
}

// One row per help center: a switch places or unplaces the group's source, a select picks its collection.
export function PlacementSection({ article, kb, locked }) {
  const { setTab } = useWorkspaceUrl();
  const placements = kb.placementsByArticle[article.sourceId] ?? [];
  const reason = locked ? NEEDS_PUBLISH : null;

  if (!kb.centers.length) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState
          icon={BookOpen}
          title="No Help Centers Yet"
          description="Publishing this article creates your default help center, or set one up first."
          action={
            <Button
              variant="outline"
              className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
              onClick={() => setTab("Help Centers")}
            >
              Go to Help Centers
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <SectionCard title="Help Centers">
      <SettingsList>
        {kb.centers.map((center) => {
          const placement = placements.find((p) => p.centerId === center.id) ?? null;
          const tree = collectionTree(kb.collections, center.id);
          return (
            <SettingRow
              key={center.id}
              title={
                <>
                  {center.name || "Untitled help center"}
                  <CenterBadges center={center} />
                </>
              }
              description={
                placement ? (
                  <span className="mt-2 block w-64">
                    <Gated reason={reason}>
                      <Select
                        value={placement.collectionId ?? UNASSIGNED}
                        onValueChange={(v) => kb.setPlacementCollection(placement, v === UNASSIGNED ? null : v)}
                        disabled={locked}
                      >
                        <SelectTrigger size="sm" aria-label={`Collection in ${center.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                          {tree.map(({ collection, depth }) => (
                            <SelectItem key={collection.id} value={collection.id}>
                              <span style={{ paddingLeft: `${(depth - 1) * 12}px` }}>
                                {collection.name || "Untitled collection"}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Gated>
                  </span>
                ) : (
                  "Not shown in this help center"
                )
              }
              control={
                <Gated reason={reason}>
                  <Switch
                    checked={!!placement}
                    disabled={locked}
                    aria-label={`Show in ${center.name}`}
                    onCheckedChange={(on) => (on ? kb.place(article, center.id) : kb.unplace(placement))}
                  />
                </Gated>
              }
            />
          );
        })}
      </SettingsList>
    </SectionCard>
  );
}

function DetailSelect({ value, onChange, options, disabled, label, reason }) {
  return (
    <Gated reason={reason}>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger size="sm" className="w-52" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Gated>
  );
}

export function copyId(id) {
  navigator.clipboard?.writeText(id).then(
    () => toast.success("Article ID copied"),
    () => toast.error("Couldn't copy the article ID."),
  );
}

export function DetailsSection({ article, kb, locked }) {
  const reason = locked ? NEEDS_PUBLISH : null;
  const group = kb.groupById.get(article.sourceId);
  const hasTranslations = (group?.rows.length ?? 1) > 1;
  const nameOfUser = (userId) => kb.teammatesByUser[userId]?.name;
  const authorOptions = [
    { value: NO_AUTHOR, label: "No author" },
    ...kb.teammates.map((t) => ({ value: t.id, label: t.name || t.email || "Teammate" })),
  ];
  const languageOptions = LOCALE_OPTIONS.filter(
    (l) => l.value === article.locale || !group?.rows.some((r) => r.locale === l.value),
  );

  const stamp = (at, userId) =>
    [formatDateTime(at), nameOfUser(userId) ? `by ${nameOfUser(userId)}` : null].filter(Boolean).join(" ") || "—";

  return (
    <div className="space-y-6">
      <SectionCard title="Publishing">
        <SettingsList>
          <SettingRow
            title="Written by"
            description="Shown as the byline in the Messenger."
            control={
              <DetailSelect
                label="Written by"
                value={article.authorId ?? NO_AUTHOR}
                options={authorOptions}
                disabled={locked}
                reason={reason}
                onChange={(v) => kb.updateFields(article, { authorId: v === NO_AUTHOR ? null : v })}
              />
            }
          />
          <SettingRow
            title="Audience"
            description="Who this article is meant for."
            control={
              <DetailSelect
                label="Audience"
                value={article.audience}
                options={AUDIENCE_OPTIONS}
                disabled={locked}
                reason={reason}
                onChange={(v) => kb.updateFields(article, { audience: v })}
              />
            }
          />
          <SettingRow
            title="Use in AI answers"
            description="AI features may answer from this article once it's published."
            control={
              <Gated reason={reason}>
                <Switch
                  checked={article.aiEnabled}
                  disabled={locked}
                  aria-label="Use in AI answers"
                  onCheckedChange={(on) => kb.updateFields(article, { aiEnabled: on })}
                />
              </Gated>
            }
          />
          <SettingRow
            title="Language"
            description={
              article.isSource && hasTranslations
                ? "The source language can't change while it has translations."
                : article.isSource
                  ? "The language this article is written in."
                  : "Translations keep the language they were created for."
            }
            control={
              article.isSource && !hasTranslations ? (
                <DetailSelect
                  label="Language"
                  value={article.locale}
                  options={languageOptions}
                  disabled={locked}
                  reason={reason}
                  onChange={(v) => kb.updateFields(article, { locale: v })}
                />
              ) : (
                <span className="text-sm text-foreground">{localeLabel(article.locale)}</span>
              )
            }
          />
        </SettingsList>
        {article.audience !== "everyone" ? (
          <div className="mt-4">
            <Notice>Restricted articles aren&apos;t shown in the Messenger yet.</Notice>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="About">
        <SettingsList>
          <SettingRow
            title="Article ID"
            description={<span className="font-mono">{article.id}</span>}
            control={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Copy article ID"
                className="text-text-secondary hover:bg-surface-active hover:text-foreground"
                onClick={() => copyId(article.id)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            }
          />
          <SettingRow title="Created" description={stamp(article.createdAt, article.createdBy)} control={null} />
          <SettingRow title="Last updated" description={stamp(article.lastEditedAt, article.updatedBy)} control={null} />
          <SettingRow
            title="Slug"
            description={<span className="font-mono">{article.slug || "—"}</span>}
            control={null}
          />
        </SettingsList>
      </SectionCard>
    </div>
  );
}

