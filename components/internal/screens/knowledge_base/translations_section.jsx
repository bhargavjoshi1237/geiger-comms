"use client";

// Translations (KB spec §9.5): one row per offered locale. A translation is its own article row in the source's
// group, opened by its own id, so the locale lives in the URL.

import { useState } from "react";
import { CheckCheck, ExternalLink, Languages, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import {
  ActionMenu,
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui";
import { DataTable, EmptyState } from "@/components/internal/shared/screen_kit";
import { AiUnavailableNotice } from "@/components/internal/shared/ai_unavailable";
import { featureAvailability } from "@/lib/ai/features";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  LOCALE_OPTIONS,
  TRANSLATION_STATE_MAP,
  formatRelative,
  localeLabel,
  translationStatus,
} from "./constants";

export function TranslationChip({ status }) {
  const meta = TRANSLATION_STATE_MAP[status] ?? TRANSLATION_STATE_MAP.draft;
  return (
    <Badge variant={meta.variant} className={meta.className}>
      {meta.label}
    </Badge>
  );
}

function AddLanguage({ kb, exclude }) {
  const { setTab } = useWorkspaceUrl();
  const [busy, setBusy] = useState(false);

  if (!kb.defaultCenter) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
        Create a help center to add languages.
        <Button
          variant="outline"
          size="sm"
          className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
          onClick={() => setTab("Help Centers")}
        >
          Go to Help Centers
        </Button>
      </div>
    );
  }
  if (!kb.canPublish) {
    return <p className="text-sm text-text-secondary">Ask a publisher to add languages to your help center.</p>;
  }

  const options = LOCALE_OPTIONS.filter((l) => !exclude.has(l.value));

  async function add(locale) {
    setBusy(true);
    await kb.addLocale(locale);
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2">
      <Select value="" onValueChange={add} disabled={busy || !options.length}>
        <SelectTrigger size="sm" className="w-56" aria-label="Add language">
          <SelectValue placeholder="Add language…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((l) => (
            <SelectItem key={l.value} value={l.value}>
              {l.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {busy ? <Loader2 className="h-4 w-4 animate-spin text-text-secondary" aria-hidden="true" /> : null}
    </div>
  );
}

export function TranslationsSection({ article, kb, ai, onDelete, onTranslate }) {
  const { openArticle } = useWorkspaceUrl();
  const [adding, setAdding] = useState(null);
  const canTranslate = !ai.loading && featureAvailability(ai.status, "translation").available;
  const source = kb.sourceOf(article);
  const rows = kb.groupById.get(source.id)?.rows ?? [article];
  const byLocale = new Map(rows.map((r) => [r.locale, r]));

  const locales = [source.locale];
  for (const l of [...kb.offeredLocales, ...rows.map((r) => r.locale)]) {
    if (!locales.includes(l)) locales.push(l);
  }
  const covered = new Set([...kb.offeredLocales, ...rows.map((r) => r.locale)]);

  async function addBlank(locale) {
    setAdding(locale);
    const created = await kb.addTranslation(source, locale);
    setAdding(null);
    if (created) openArticle(created.id);
  }

  if (locales.length === 1) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState
          icon={Languages}
          title="No Other Languages Yet"
          description="Add languages to your help center to translate this article."
          action={<AddLanguage kb={kb} exclude={covered} />}
        />
      </div>
    );
  }

  const tableRows = locales.map((locale) => ({ locale, row: byLocale.get(locale) ?? null }));

  const columns = [
    {
      key: "language",
      header: "Language",
      render: ({ locale, row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{localeLabel(locale)}</span>
          {row?.isSource ? <Badge variant="info">Source</Badge> : null}
          {row?.id === article.id ? <span className="text-xs text-text-tertiary">Open now</span> : null}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: ({ row }) => <TranslationChip status={translationStatus(row, source)} />,
    },
    {
      key: "updated",
      header: "Updated",
      render: ({ row }) => (
        <span className="text-sm text-text-secondary">{row ? formatRelative(row.lastEditedAt) : "—"}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "text-right",
      render: ({ locale, row }) =>
        row ? (
          <ActionMenu
            label={`Actions for ${localeLabel(locale)}`}
            items={[
              row.id !== article.id && { icon: ExternalLink, label: "Open", onSelect: () => openArticle(row.id) },
              translationStatus(row, source) === "out_of_date" && {
                icon: CheckCheck,
                label: "Mark as up to date",
                onSelect: () => kb.markCurrent(row),
              },
              !row.isSource && { separator: true },
              !row.isSource && {
                icon: Trash2,
                label: "Delete translation",
                variant: "destructive",
                onSelect: () => onDelete(row),
              },
            ]}
          />
        ) : (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!!adding}
              className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
              onClick={() => addBlank(locale)}
            >
              {adding === locale ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add translation
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!!adding || !canTranslate}
              className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
              onClick={() => onTranslate(locale)}
            >
              <Sparkles className="h-3.5 w-3.5" /> Translate with AI
            </Button>
          </div>
        ),
    },
  ];

  const missing = tableRows.some((r) => !r.row);

  return (
    <div className="space-y-4">
      <DataTable columns={columns} data={tableRows} getRowKey={(r) => r.locale} />
      {missing && !ai.loading && !canTranslate ? <AiUnavailableNotice status={ai.status} feature="translation" /> : null}
      <AddLanguage kb={kb} exclude={covered} />
    </div>
  );
}

export default TranslationsSection;
