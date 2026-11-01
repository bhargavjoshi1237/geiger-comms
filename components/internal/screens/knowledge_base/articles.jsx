"use client";

// Articles (KB spec §9.1): one row per source + translations group; ?article=<id> swaps to the editor, sharing the dialogs.

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Copy,
  CopyPlus,
  EyeOff,
  FileText,
  FolderTree,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import {
  ActionMenu,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  LogoLoading,
} from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import {
  DataTable,
  EmptyState,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import { FilterDropdown } from "@/components/internal/shared/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  ARTICLE_STATE_MAP,
  NEEDS_PUBLISH,
  STATUS_FILTER_OPTIONS,
  TRANSLATION_STATE_MAP,
  countTodos,
  effectiveContent,
  formatRelative,
  localeLabel,
  plural,
  translationStatus,
} from "./constants";
import { useArticles } from "./use_articles";
import { ArticleEditor } from "./article_editor";
import { copyId } from "./article_sections";
import { DeleteArticleDialog } from "./delete_article_dialog";
import { PublishDialog } from "./publish_dialog";
import { Gated } from "@/components/internal/shared/gated";

const OUTLINE_ACTION =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
const EMPTY_DRAFT_WINDOW_MS = 60 * 60 * 1000;

function initialsOf(name) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function latestEdit(rows) {
  return rows.reduce((max, r) => (!max || new Date(r.lastEditedAt) > new Date(max) ? r.lastEditedAt : max), null);
}

function LanguageChips({ group }) {
  return (
    <div className="flex flex-wrap gap-1">
      {group.rows.map((row) => {
        const status = translationStatus(row, group.source);
        const meta = TRANSLATION_STATE_MAP[status] ?? TRANSLATION_STATE_MAP.draft;
        return (
          <Badge key={row.id} variant={meta.variant} title={`${localeLabel(row.locale)} · ${meta.label}`}>
            {row.locale}
          </Badge>
        );
      })}
    </div>
  );
}

// An untouched draft made in the last hour is cleaned up silently when its editor is left.
function isAbandonedDraft(article, group, placements) {
  if (!article || article.state !== "draft" || !article.isSource) return false;
  if ((group?.rows.length ?? 1) > 1 || placements?.length) return false;
  if (article.title.trim() || article.summary.trim() || article.body.trim()) return false;
  const created = new Date(article.createdAt).getTime();
  return Number.isFinite(created) && Date.now() - created < EMPTY_DRAFT_WINDOW_MS;
}

export function ArticlesScreen() {
  const kb = useArticles();
  const { articleId, openArticle, closeArticle, setTab, openCenterInTab } = useWorkspaceUrl();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [center, setCenter] = useState("all");
  const [collection, setCollection] = useState("all");
  const [language, setLanguage] = useState("all");
  const [selected, setSelected] = useState(() => new Set());
  const [creating, setCreating] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [discardTarget, setDiscardTarget] = useState(null);
  const [todoConfirm, setTodoConfirm] = useState(null);
  const [publishRequest, setPublishRequest] = useState(null);

  const open = articleId ? kb.articles.find((a) => a.id === articleId) ?? null : null;

  // Leaving an editor (URL change, not unmount, so StrictMode's double mount never fires it).
  const discardIfAbandoned = useEffectEvent((id) => {
    const article = kb.articles.find((a) => a.id === id);
    if (isAbandonedDraft(article, kb.groupById.get(id), kb.placementsByArticle[id])) {
      void kb.remove(article, { quiet: true });
    }
  });
  const previousOpen = useRef(null);
  useEffect(() => {
    const previous = previousOpen.current;
    previousOpen.current = articleId;
    if (previous && previous !== articleId) discardIfAbandoned(previous);
  }, [articleId]);

  // --- Derived ---------------------------------------------------------------

  const scopedCenter = center !== "all" && center !== "none" ? center : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kb.groups
      .filter((group) => {
        const { source, rows } = group;
        if (status === "active" && source.state === "archived") return false;
        if (status !== "active" && status !== "all" && source.displayState !== status) return false;
        const placements = kb.placementsByArticle[source.id] ?? [];
        if (center === "none" && placements.length) return false;
        if (scopedCenter) {
          const placement = placements.find((p) => p.centerId === scopedCenter);
          if (!placement) return false;
          if (collection === "unassigned" && placement.collectionId) return false;
          if (collection !== "all" && collection !== "unassigned" && placement.collectionId !== collection) {
            return false;
          }
        }
        if (language !== "all" && !rows.some((r) => r.locale === language)) return false;
        if (q) {
          const text = rows
            .map((r) => {
              const c = effectiveContent(r);
              return `${c.title} ${c.summary} ${c.body}`;
            })
            .join(" ")
            .toLowerCase();
          if (!text.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(latestEdit(b.rows) || 0) - new Date(latestEdit(a.rows) || 0));
  }, [kb.groups, kb.placementsByArticle, search, status, center, scopedCenter, collection, language]);

  const filterKey = `${search}|${status}|${center}|${collection}|${language}`;
  const pager = usePagination(filtered, { pageSize: 25, resetKey: filterKey });

  const stats = useMemo(() => {
    const sources = kb.groups.map((g) => g.source);
    const published = sources.filter((s) => s.state === "published");
    const translations = kb.articles.filter((a) => !a.isSource && kb.groupById.has(a.sourceId));
    const outOfDate = translations.filter(
      (t) => translationStatus(t, kb.groupById.get(t.sourceId)?.source) === "out_of_date",
    ).length;
    return [
      {
        label: "Published",
        value: String(published.length),
        footer: `${published.filter((s) => s.visibleInMessenger).length} in the Messenger`,
      },
      {
        label: "Drafts",
        value: String(sources.filter((s) => s.state === "draft").length),
        footer: `${sources.filter((s) => s.displayState === "changes_unpublished").length} with unpublished changes`,
      },
      {
        label: "Views (30 days)",
        value: kb.views.total.views.toLocaleString("en-US"),
        footer: `${kb.views.total.viewers.toLocaleString("en-US")} unique viewers`,
      },
      {
        label: "Translations",
        value: String(translations.length),
        footer: outOfDate ? <span className="text-amber-400">{outOfDate} out of date</span> : "0 out of date",
      },
    ];
  }, [kb.groups, kb.articles, kb.groupById, kb.views]);

  const languageOptions = useMemo(() => {
    const locales = new Set(kb.offeredLocales);
    for (const a of kb.articles) locales.add(a.locale);
    return [
      { value: "all", label: "All languages" },
      ...[...locales].map((l) => ({ value: l, label: localeLabel(l) })),
    ];
  }, [kb.offeredLocales, kb.articles]);

  const centerOptions = [
    { value: "all", label: "All help centers" },
    { value: "none", label: "Not in a help center" },
    ...kb.centers.map((c) => ({ value: c.id, label: c.name || "Untitled help center" })),
  ];

  const collectionOptions = scopedCenter
    ? [
        { value: "all", label: "All collections" },
        { value: "unassigned", label: "Unassigned" },
        ...kb.collections
          .filter((c) => c.helpCenterId === scopedCenter)
          .map((c) => ({ value: c.id, label: c.name || "Untitled collection" })),
      ]
    : null;

  const hasFilters = !!search || status !== "active" || center !== "all" || language !== "all";

  function clearFilters() {
    setSearch("");
    setStatus("active");
    setCenter("all");
    setCollection("all");
    setLanguage("all");
  }

  // --- Publishing -------------------------------------------------------------

  const needsPlacement = (article) =>
    article.isSource && article.state === "draft" && !(kb.placementsByArticle[article.id]?.length);

  async function proceedPublish(article) {
    if (article.displayState === "changes_unpublished") return kb.publishChanges(article);
    if (needsPlacement(article)) {
      setPublishRequest({ key: crypto.randomUUID(), articles: [article], placed: [], blank: 0, total: 1 });
      return null;
    }
    return kb.publish(article);
  }

  // Single publish from the editor or a row: title check, the TODO confirm, then placement if needed.
  async function requestPublish(article) {
    const content = effectiveContent(article);
    if (!content.title.trim()) {
      toast.error("Add a title to publish");
      return null;
    }
    const todos = countTodos(content.body);
    if (todos) {
      setTodoConfirm({ article, count: todos });
      return null;
    }
    return proceedPublish(article);
  }

  async function confirmPlacement(choice) {
    const request = publishRequest;
    const results = [];
    for (const article of request.articles) {
      results.push(await kb.publishWithPlacement(article, { ...choice, quiet: request.total > 1 }));
    }
    for (const article of request.placed) {
      const publishFn = article.displayState === "changes_unpublished" ? kb.publishChanges : kb.publish;
      results.push(await publishFn(article, { quiet: true }));
    }
    if (request.total > 1) summarize("Published", results.filter(Boolean).length, request.total, request.blank);
    setSelected(new Set());
    return results.some(Boolean);
  }

  // --- Bulk -------------------------------------------------------------------

  const selectedSources = kb.groups.filter((g) => selected.has(g.source.id)).map((g) => g.source);
  const selectionHasPublished = selectedSources.some((s) => s.state === "published");

  function summarize(verb, done, total, blank = 0) {
    const skipped = blank ? ` — ${blank} ${blank === 1 ? "has" : "have"} no title` : "";
    const message = `${verb} ${done} of ${total}${skipped}.`;
    if (done) toast.success(message);
    else toast.error(message);
  }

  async function runEach(rows, fn) {
    setBulkBusy(true);
    let done = 0;
    for (const row of rows) if (await fn(row)) done += 1;
    setBulkBusy(false);
    setSelected(new Set());
    return done;
  }

  async function bulkPublish() {
    const eligible = selectedSources.filter((s) => s.displayState === "draft" || s.displayState === "changes_unpublished");
    const titled = eligible.filter((s) => effectiveContent(s).title.trim());
    const blank = eligible.length - titled.length;
    const unplaced = titled.filter(needsPlacement);
    const placed = titled.filter((s) => !needsPlacement(s));
    if (!eligible.length) {
      toast.error("Nothing to publish — the selected articles are already published or archived.");
      return;
    }
    if (unplaced.length) {
      setPublishRequest({ key: crypto.randomUUID(), articles: unplaced, placed, blank, total: eligible.length });
      return;
    }
    const done = await runEach(placed, (s) =>
      (s.displayState === "changes_unpublished" ? kb.publishChanges : kb.publish)(s, { quiet: true }),
    );
    summarize("Published", done, eligible.length, blank);
  }

  async function bulkUnpublish() {
    const rows = selectedSources.filter((s) => s.state === "published");
    if (!rows.length) return toast.error("None of the selected articles are published.");
    summarize("Unpublished", await runEach(rows, (s) => kb.unpublish(s, { quiet: true })), rows.length);
  }

  async function bulkArchive() {
    const rows = selectedSources.filter((s) => s.state !== "archived");
    if (!rows.length) return toast.error("The selected articles are already archived.");
    summarize("Archived", await runEach(rows, (s) => kb.archive(s, { quiet: true })), rows.length);
  }

  async function bulkAi(on) {
    const rows = selectedSources.filter((s) => s.aiEnabled !== on);
    if (!rows.length) return toast.success(`AI answers are already ${on ? "on" : "off"} for these articles.`);
    const done = await runEach(rows, (s) => kb.updateFields(s, { aiEnabled: on }, { quiet: true }));
    summarize(on ? "Turned AI answers on for" : "Turned AI answers off for", done, rows.length);
  }

  // --- Deletion ---------------------------------------------------------------

  function askDelete(article) {
    const group = kb.groupById.get(article.sourceId);
    setDeleteTarget(
      article.isSource
        ? { kind: "source", article, translationCount: (group?.rows.length ?? 1) - 1 }
        : { kind: "translation", article, sourceTitle: group?.source.title },
    );
  }

  async function confirmDelete(target) {
    setDeleteTarget(null);
    if (target.kind === "bulk") {
      const done = await runEach(target.articles, (s) => kb.remove(s, { quiet: true }));
      summarize("Deleted", done, target.articles.length);
      return;
    }
    const { article } = target;
    if (articleId === article.id) {
      if (article.isSource) closeArticle();
      else openArticle(article.sourceId);
    }
    const ok = await kb.remove(article);
    if (ok) toast.success(article.isSource ? "Article deleted" : `${localeLabel(article.locale)} translation deleted`);
  }

  async function confirmDiscard() {
    const article = discardTarget;
    setDiscardTarget(null);
    if (article) await kb.discard(article);
  }

  // --- New article --------------------------------------------------------------

  async function newArticle() {
    setCreating(true);
    const created = await kb.createDraft();
    setCreating(false);
    if (created) openArticle(created.id);
  }

  function manageCollections() {
    if (kb.defaultCenter) openCenterInTab(kb.defaultCenter.id, "Help Centers", "content");
    else setTab("Help Centers");
  }

  // --- Shared dialogs -----------------------------------------------------------

  const dialogs = (
    <>
      <DeleteArticleDialog
        target={deleteTarget}
        onOpenChange={(next) => !next && setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
      {publishRequest ? (
        <PublishDialog
          key={publishRequest.key}
          open
          onOpenChange={(next) => !next && setPublishRequest(null)}
          centers={kb.centers}
          collections={kb.collections}
          defaultCenter={kb.defaultCenter}
          count={publishRequest.articles.length}
          onConfirm={confirmPlacement}
        />
      ) : null}
      <Dialog open={!!todoConfirm} onOpenChange={(next) => !next && setTodoConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publish with TODO notes?</DialogTitle>
            <DialogDescription>
              This article still has {plural(todoConfirm?.count ?? 0, "TODO note")}. Publish anyway?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTodoConfirm(null)}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                const { article } = todoConfirm;
                setTodoConfirm(null);
                void proceedPublish(article);
              }}
            >
              Publish anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!discardTarget} onOpenChange={(next) => !next && setDiscardTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discard unpublished changes?</DialogTitle>
            <DialogDescription>The published version stays live.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDiscardTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDiscard}>
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (open) {
    return (
      <>
        <ArticleEditor
          key={open.id}
          article={open}
          kb={kb}
          onBack={closeArticle}
          onPublish={requestPublish}
          onDelete={askDelete}
        />
        {dialogs}
      </>
    );
  }

  // --- Table --------------------------------------------------------------------

  const pageIds = pager.pageItems.map((g) => g.source.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = pageIds.some((id) => selected.has(id));

  function toggle(id, on) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function togglePage(on) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of pageIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  const gate = (article) => (article.state === "published" && !kb.canPublish ? NEEDS_PUBLISH : null);

  function rowActions(group) {
    const article = group.source;
    const locked = !kb.canPublish;
    const display = article.displayState;
    const groupPublished = group.rows.some((r) => r.state === "published");
    const common = [
      { icon: CopyPlus, label: "Duplicate", onSelect: () => kb.duplicate(article) },
      { icon: Copy, label: "Copy article ID", onSelect: () => copyId(article.id) },
    ];
    const archive = {
      icon: Archive,
      label: "Archive",
      disabled: article.state === "published" && locked,
      onSelect: () => kb.archive(article),
    };
    const byState = {
      draft: [
        { icon: Pencil, label: "Edit", onSelect: () => openArticle(article.id) },
        { icon: Upload, label: "Publish", disabled: locked, onSelect: () => requestPublish(article) },
        ...common,
        archive,
      ],
      published: [
        { icon: Pencil, label: "Edit", onSelect: () => openArticle(article.id) },
        { icon: EyeOff, label: "Unpublish", disabled: locked, onSelect: () => kb.unpublish(article) },
        ...common,
        archive,
      ],
      changes_unpublished: [
        { icon: Pencil, label: "Edit", onSelect: () => openArticle(article.id) },
        { icon: Upload, label: "Publish changes", disabled: locked, onSelect: () => requestPublish(article) },
        { icon: Undo2, label: "Discard changes", onSelect: () => setDiscardTarget(article) },
        ...common,
        archive,
      ],
      archived: [
        { icon: ArchiveRestore, label: "Restore to draft", onSelect: () => kb.restore(article) },
        ...common,
      ],
    }[display];
    return [
      ...byState,
      { separator: true },
      {
        icon: Trash2,
        label: "Delete",
        variant: "destructive",
        disabled: groupPublished && locked,
        onSelect: () => askDelete(article),
      },
    ];
  }

  const columns = [
    {
      key: "select",
      header: (
        <Checkbox
          aria-label="Select this page"
          checked={allOnPage ? true : someOnPage ? "indeterminate" : false}
          onCheckedChange={(on) => togglePage(on === true)}
        />
      ),
      headClassName: "w-10",
      render: (group) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            aria-label={`Select ${group.source.title || "untitled article"}`}
            checked={selected.has(group.source.id)}
            onCheckedChange={(on) => toggle(group.source.id, on === true)}
          />
        </div>
      ),
    },
    {
      key: "title",
      header: "Title",
      render: (group) => {
        const content = effectiveContent(group.source);
        const reason = kb.reasonFor(group.source);
        return (
          <div className="flex max-w-md flex-col gap-1">
            {content.title ? (
              <span className="font-medium text-foreground">{content.title}</span>
            ) : (
              <span className="font-medium text-text-tertiary">Untitled article</span>
            )}
            {content.summary ? (
              <span className="truncate text-xs text-text-secondary">{content.summary}</span>
            ) : null}
            {reason ? (
              <span className={reason.tone === "warning" ? "text-xs text-amber-400" : "text-xs text-text-secondary"}>
                {reason.tone === "warning" ? `Not in the Messenger: ${reason.text}` : reason.text}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (group) => <StatusPill status={group.source.displayState} map={ARTICLE_STATE_MAP} />,
    },
    {
      key: "languages",
      header: "Languages",
      render: (group) => <LanguageChips group={group} />,
    },
    {
      key: "centers",
      header: "Help centers",
      render: (group) => {
        const names = (kb.placementsByArticle[group.source.id] ?? [])
          .map((p) => kb.centersById[p.centerId]?.name)
          .filter(Boolean);
        if (!names.length) {
          return group.source.state === "published" ? (
            <Badge variant="outline">Unlisted</Badge>
          ) : (
            <span className="text-text-tertiary">—</span>
          );
        }
        return (
          <div className="flex flex-wrap gap-1">
            {names.slice(0, 2).map((name, i) => (
              <Badge key={`${name}-${i}`} variant="neutral">
                {name}
              </Badge>
            ))}
            {names.length > 2 ? <Badge variant="neutral">+{names.length - 2}</Badge> : null}
          </div>
        );
      },
    },
    {
      key: "collection",
      header: "Collection",
      render: (group) => {
        const placement = (kb.placementsByArticle[group.source.id] ?? []).find(
          (p) => p.centerId === kb.defaultCenter?.id,
        );
        if (!placement) return <span className="text-text-tertiary">—</span>;
        const name = placement.collectionId ? kb.collectionsById[placement.collectionId]?.name : null;
        return <span className="text-sm text-text-secondary">{name || "Unassigned"}</span>;
      },
    },
    {
      key: "author",
      header: "Written by",
      render: (group) => {
        const author = kb.teammatesById[group.source.authorId];
        const name = author?.name || group.source.authorName;
        if (!name) return <span className="text-text-tertiary">—</span>;
        return (
          <div className="flex items-center gap-2">
            <Avatar size="sm">
              {author?.avatarUrl ? <AvatarImage src={author.avatarUrl} alt="" /> : null}
              <AvatarFallback className="bg-surface-card text-[10px] text-text-secondary">{initialsOf(name)}</AvatarFallback>
            </Avatar>
            <span className="text-sm text-foreground">{name}</span>
          </div>
        );
      },
    },
    {
      key: "views",
      header: "Views (30d)",
      align: "right",
      className: "text-right tabular-nums text-foreground",
      render: (group) =>
        group.rows.reduce((n, r) => n + kb.viewsOf(r.id).views, 0).toLocaleString("en-US"),
    },
    {
      key: "updated",
      header: "Updated",
      render: (group) => <span className="text-sm text-text-secondary">{formatRelative(latestEdit(group.rows))}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "text-right",
      render: (group) => (
        <ActionMenu label={`Actions for ${group.source.title || "untitled article"}`} items={rowActions(group)} />
      ),
    },
  ];

  const newButton = (
    <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={newArticle} disabled={creating}>
      {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} New article
    </Button>
  );

  let body;
  if (kb.loading) {
    body = (
      <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
        <LogoLoading size={48} aria-label="Loading articles" />
      </div>
    );
  } else if (kb.loadFailed) {
    body = (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't Load Articles"
          description="Check your connection and try again."
          action={
            <Button variant="outline" className={OUTLINE_ACTION} onClick={kb.retry}>
              <RotateCw className="h-4 w-4" /> Retry
            </Button>
          }
        />
      </div>
    );
  } else {
    body = (
      <div className="space-y-5">
        {selectedSources.length ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-subtle px-4 py-2.5">
            <span className="mr-2 text-sm text-foreground">{plural(selectedSources.length, "article")} selected</span>
            <Gated reason={kb.canPublish ? null : NEEDS_PUBLISH}>
              <Button variant="outline" size="sm" className={OUTLINE_ACTION} disabled={bulkBusy || !kb.canPublish} onClick={bulkPublish}>
                <Upload className="h-3.5 w-3.5" /> Publish
              </Button>
            </Gated>
            <Gated reason={kb.canPublish ? null : NEEDS_PUBLISH}>
              <Button variant="outline" size="sm" className={OUTLINE_ACTION} disabled={bulkBusy || !kb.canPublish} onClick={bulkUnpublish}>
                <EyeOff className="h-3.5 w-3.5" /> Unpublish
              </Button>
            </Gated>
            <Gated reason={selectionHasPublished && !kb.canPublish ? NEEDS_PUBLISH : null}>
              <Button
                variant="outline"
                size="sm"
                className={OUTLINE_ACTION}
                disabled={bulkBusy || (selectionHasPublished && !kb.canPublish)}
                onClick={bulkArchive}
              >
                <Archive className="h-3.5 w-3.5" /> Archive
              </Button>
            </Gated>
            <Gated reason={selectionHasPublished && !kb.canPublish ? NEEDS_PUBLISH : null}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={OUTLINE_ACTION}
                    disabled={bulkBusy || (selectionHasPublished && !kb.canPublish)}
                  >
                    <Sparkles className="h-3.5 w-3.5" /> AI answers
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="border-border bg-surface-subtle">
                  <DropdownMenuItem className="cursor-pointer" onSelect={() => bulkAi(true)}>
                    On
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onSelect={() => bulkAi(false)}>
                    Off
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Gated>
            <Gated reason={kb.canPublish ? null : NEEDS_PUBLISH}>
              <Button
                variant="outline"
                size="sm"
                className="border-border bg-transparent text-red-400 hover:bg-red-500/10 hover:text-red-400"
                disabled={bulkBusy || !kb.canPublish}
                onClick={() => setDeleteTarget({ kind: "bulk", count: selectedSources.length, articles: selectedSources })}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </Gated>
            {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin text-text-secondary" aria-hidden="true" /> : null}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-text-secondary hover:bg-surface-active hover:text-foreground"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </Button>
          </div>
        ) : null}
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(group) => group.source.id}
          onRowClick={(group) => openArticle(group.source.id)}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              {kb.groups.length ? (
                <EmptyState
                  icon={FileText}
                  title="No Matching Articles"
                  description="Try a different search or clear the filters."
                  action={
                    hasFilters ? (
                      <Button variant="outline" className={OUTLINE_ACTION} onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : null
                  }
                />
              ) : (
                <EmptyState
                  icon={FileText}
                  title="No Articles Yet"
                  description="Write your first article — once it's published in a help center it shows up in the Messenger's Help space."
                  action={newButton}
                />
              )}
            </div>
          }
        />
        <ListPagination {...pager} itemLabel="articles" />
      </div>
    );
  }

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Articles"
        description="Write, translate and publish help content. Published articles in your default help center appear in the Messenger's Help space."
        actions={
          <>
            <Button variant="outline" className={OUTLINE_ACTION} onClick={manageCollections}>
              <FolderTree className="h-4 w-4" /> Manage collections
            </Button>
            {newButton}
          </>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={status} onValueChange={setStatus} options={STATUS_FILTER_OPTIONS} height="h-9" />
          <FilterDropdown
            value={center}
            onValueChange={(value) => {
              setCenter(value);
              setCollection("all");
            }}
            options={centerOptions}
            height="h-9"
          />
          {collectionOptions ? (
            <FilterDropdown value={collection} onValueChange={setCollection} options={collectionOptions} height="h-9" />
          ) : null}
          <FilterDropdown value={language} onValueChange={setLanguage} options={languageOptions} height="h-9" />
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search articles…" />
      </Toolbar>

      {body}

      {dialogs}
    </MainScreenWrapper>
  );
}

export default ArticlesScreen;
