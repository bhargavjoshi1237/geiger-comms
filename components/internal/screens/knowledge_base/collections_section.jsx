"use client";

// Collections & articles (KB spec §10.4): a help center's collection tree, up to three levels, with Unassigned
// first. Up/down buttons reorder (no drag-and-drop dependency); every move renumbers atomically in the database.

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  FolderInput,
  FolderPlus,
  FolderTree,
  Loader2,
  MinusCircle,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  ActionMenu,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  IconPicker,
  Input,
  LucideIcon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@geiger/ui";
import { EmptyState, Field, StatusPill } from "@/components/internal/shared/screen_kit";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { ARTICLE_STATE_MAP, collectionTree, effectiveContent, localeLabel } from "./constants";
import { AddArticlesDialog } from "./add_articles_dialog";

const OUTLINE = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
const ICON_BUTTON = "text-text-secondary hover:bg-surface-active hover:text-foreground";
const TOP = "__top__";
const UNASSIGNED = "__unassigned__";

const byPosition = (a, b) => a.position - b.position || String(a.createdAt).localeCompare(String(b.createdAt));

// Levels below a collection (0 when it has no children).
function heightOf(collection, collections) {
  const children = collections.filter((c) => c.parentId === collection.id);
  return children.length ? 1 + Math.max(...children.map((c) => heightOf(c, collections))) : 0;
}

function descendantsOf(collection, collections) {
  const out = new Set();
  const walk = (id) => {
    for (const c of collections) {
      if (c.parentId === id && !out.has(c.id)) {
        out.add(c.id);
        walk(c.id);
      }
    }
  };
  walk(collection.id);
  return out;
}

function CollectionDialog({ state, center, onClose, onSave }) {
  const editing = state.collection ?? null;
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [translations, setTranslations] = useState(editing?.translations ?? {});
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const otherLocales = center.locales.filter((l) => l !== center.defaultLocale);

  const setTranslation = (locale, key, value) =>
    setTranslations((prev) => ({ ...prev, [locale]: { ...prev[locale], [key]: value } }));

  async function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (!name.trim()) return;
    setBusy(true);
    const ok = await onSave({ name: name.trim(), description: description.trim(), translations });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit collection" : state.parent ? "New sub-collection" : "New collection"}</DialogTitle>
            <DialogDescription>
              {state.parent ? `Inside ${state.parent.name || "Untitled collection"}.` : `In ${center.name}.`}
            </DialogDescription>
          </DialogHeader>
          <Field
            label="Name"
            hint={touched && !name.trim() ? <span className="text-red-400">A name is required.</span> : null}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Description">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {otherLocales.map((locale) => {
            const t = translations[locale] ?? {};
            return (
              <div key={locale} className="grid gap-3 rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">{localeLabel(locale)}</p>
                <Field
                  label="Name"
                  hint={
                    t.name?.trim() ? null : (
                      <span className="text-amber-400">Needs a title — hidden in {localeLabel(locale)} until it has one</span>
                    )
                  }
                >
                  <Input value={t.name ?? ""} onChange={(e) => setTranslation(locale, "name", e.target.value)} />
                </Field>
                <Field label="Description">
                  <Textarea
                    rows={2}
                    value={t.description ?? ""}
                    onChange={(e) => setTranslation(locale, "description", e.target.value)}
                  />
                </Field>
              </div>
            );
          })}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing ? "Save collection" : "Create collection"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// "Move to…" for a collection (new parent) or an article (new collection).
function MoveDialog({ state, options, onClose, onMove }) {
  const [target, setTarget] = useState(state.current);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const ok = await onMove(target);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move {state.label}</DialogTitle>
          <DialogDescription>{state.description}</DialogDescription>
        </DialogHeader>
        <Select value={target} onValueChange={setTarget} disabled={busy}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <span style={{ paddingLeft: `${(o.depth ?? 0) * 12}px` }}>{o.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={busy || target === state.current}
            onClick={submit}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArticleRows({ placements, hc, readOnly, onOpen, onMove }) {
  if (!placements.length) {
    return <p className="px-4 py-3 text-xs text-text-tertiary">No articles here yet.</p>;
  }
  return (
    <div className="divide-y divide-border">
      {placements.map((placement, i) => {
        const article = hc.articlesById[placement.articleId];
        if (!article) return null;
        return (
          <div key={placement.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <button
              type="button"
              onClick={() => onOpen(article.id)}
              className="min-w-0 truncate text-left text-sm text-foreground hover:underline"
            >
              {effectiveContent(article).title || "Untitled article"}
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <StatusPill status={article.displayState} map={ARTICLE_STATE_MAP} />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Move up"
                disabled={readOnly || i === 0}
                className={ICON_BUTTON}
                onClick={() => hc.relocatePlacement(placement, { collectionId: placement.collectionId, position: i - 1 })}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Move down"
                disabled={readOnly || i === placements.length - 1}
                className={ICON_BUTTON}
                onClick={() => hc.relocatePlacement(placement, { collectionId: placement.collectionId, position: i + 1 })}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <ActionMenu
                label={`Actions for ${article.title || "untitled article"}`}
                items={[
                  { icon: ExternalLink, label: "Open article", onSelect: () => onOpen(article.id) },
                  { icon: FolderInput, label: "Move to collection", disabled: readOnly, onSelect: () => onMove(placement, article) },
                  { separator: true },
                  {
                    icon: MinusCircle,
                    label: "Remove from help center",
                    variant: "destructive",
                    disabled: readOnly,
                    onSelect: () => hc.removePlacement(placement),
                  },
                ]}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CollectionsSection({ center, hc, readOnly }) {
  const { openArticleInTab } = useWorkspaceUrl();
  const [editState, setEditState] = useState(null);
  const [moveState, setMoveState] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [adding, setAdding] = useState(false);
  const [addKey, setAddKey] = useState(0);

  const own = hc.collections.filter((c) => c.helpCenterId === center.id);
  const tree = collectionTree(own, center.id);
  const ownPlacements = hc.placements.filter((p) => p.centerId === center.id);
  const placementsIn = (collectionId) =>
    ownPlacements.filter((p) => (p.collectionId ?? null) === collectionId).sort(byPosition);
  const siblingsOf = (c) => own.filter((x) => (x.parentId ?? null) === (c.parentId ?? null)).sort(byPosition);
  const countIn = (c) => {
    const ids = new Set([c.id, ...descendantsOf(c, own)]);
    return ownPlacements.filter((p) => ids.has(p.collectionId)).length;
  };
  const openArticle = (id) => openArticleInTab(id, "Articles");

  function moveCollectionOptions(collection) {
    const blocked = descendantsOf(collection, own);
    const height = heightOf(collection, own);
    return [
      { value: TOP, label: "Top level", depth: 0 },
      ...tree
        .filter(({ collection: c, depth }) => c.id !== collection.id && !blocked.has(c.id) && depth + 1 + height <= 3)
        .map(({ collection: c, depth }) => ({ value: c.id, label: c.name || "Untitled collection", depth })),
    ];
  }

  const collectionTargets = [
    { value: UNASSIGNED, label: "Unassigned", depth: 0 },
    ...tree.map(({ collection: c, depth }) => ({ value: c.id, label: c.name || "Untitled collection", depth: depth - 1 })),
  ];

  async function saveCollection(values) {
    if (editState.collection) return Boolean(await hc.editCollection(editState.collection, values));
    return Boolean(await hc.addCollection(center, { ...values, parentId: editState.parent?.id ?? null }));
  }

  async function confirmDelete() {
    const collection = deleteTarget;
    setDeleteTarget(null);
    await hc.removeCollection(collection);
  }

  const toolbar = (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        className={OUTLINE}
        disabled={readOnly}
        onClick={() => setEditState({ collection: null, parent: null })}
      >
        <FolderPlus className="h-4 w-4" /> New collection
      </Button>
      <Button
        className="bg-primary text-primary-foreground hover:bg-primary/90"
        disabled={readOnly}
        onClick={() => {
          setAddKey((k) => k + 1);
          setAdding(true);
        }}
      >
        <Plus className="h-4 w-4" /> Add articles
      </Button>
    </div>
  );

  const unassigned = placementsIn(null);

  return (
    <div className="space-y-5">
      {toolbar}

      {!own.length && !ownPlacements.length ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={FolderTree}
            title="No Collections Or Articles Yet"
            description="Add articles to this help center, then group them into collections."
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Unassigned</p>
            <p className="text-xs text-text-secondary">
              {unassigned.length} {unassigned.length === 1 ? "article" : "articles"} not in a collection
            </p>
          </div>
          <ArticleRows
            placements={unassigned}
            hc={hc}
            readOnly={readOnly}
            onOpen={openArticle}
            onMove={(placement, article) =>
              setMoveState({ kind: "placement", placement, current: UNASSIGNED, label: article.title || "article" })
            }
          />
          {tree.map(({ collection, depth }) => {
            const siblings = siblingsOf(collection);
            const index = siblings.findIndex((s) => s.id === collection.id);
            const articles = placementsIn(collection.id);
            return (
              <div key={collection.id} className="border-t border-border">
                <div
                  className="flex items-center justify-between gap-3 px-4 py-3"
                  style={{ paddingLeft: `${16 + (depth - 1) * 24}px` }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {depth === 1 ? (
                      <IconPicker
                        value={collection.icon ?? ""}
                        disabled={readOnly}
                        onValueChange={(icon) => hc.editCollection(collection, { icon })}
                        aria-label={`Icon for ${collection.name}`}
                      />
                    ) : (
                      <LucideIcon name="Folder" className="h-4 w-4 text-text-tertiary" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {collection.name || "Untitled collection"}
                      </p>
                      <p className="truncate text-xs text-text-secondary">
                        {[collection.description, `${countIn(collection)} ${countIn(collection) === 1 ? "article" : "articles"}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Move up"
                      disabled={readOnly || index <= 0}
                      className={ICON_BUTTON}
                      onClick={() => hc.relocateCollection(collection, { parentId: collection.parentId, position: index - 1 })}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Move down"
                      disabled={readOnly || index === siblings.length - 1}
                      className={ICON_BUTTON}
                      onClick={() => hc.relocateCollection(collection, { parentId: collection.parentId, position: index + 1 })}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <ActionMenu
                      label={`Actions for ${collection.name || "collection"}`}
                      disabled={readOnly}
                      items={[
                        { icon: Pencil, label: "Edit", onSelect: () => setEditState({ collection }) },
                        depth < 3 && {
                          icon: FolderPlus,
                          label: "Add sub-collection",
                          onSelect: () => setEditState({ collection: null, parent: collection }),
                        },
                        {
                          icon: FolderInput,
                          label: "Move to…",
                          onSelect: () =>
                            setMoveState({
                              kind: "collection",
                              collection,
                              current: collection.parentId ?? TOP,
                              label: collection.name || "collection",
                            }),
                        },
                        { separator: true },
                        {
                          icon: Trash2,
                          label: "Delete",
                          variant: "destructive",
                          onSelect: () => setDeleteTarget(collection),
                        },
                      ]}
                    />
                  </div>
                </div>
                <div style={{ paddingLeft: `${(depth - 1) * 24}px` }}>
                  <ArticleRows
                    placements={articles}
                    hc={hc}
                    readOnly={readOnly}
                    onOpen={openArticle}
                    onMove={(placement, article) =>
                      setMoveState({ kind: "placement", placement, current: collection.id, label: article.title || "article" })
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editState ? (
        <CollectionDialog
          key={editState.collection?.id ?? `new-${editState.parent?.id ?? "top"}`}
          state={editState}
          center={center}
          onClose={() => setEditState(null)}
          onSave={saveCollection}
        />
      ) : null}

      {moveState ? (
        <MoveDialog
          state={{
            ...moveState,
            description:
              moveState.kind === "collection"
                ? "Its sub-collections and articles move with it. Collections nest up to three levels."
                : "An article sits in one collection per help center.",
          }}
          options={moveState.kind === "collection" ? moveCollectionOptions(moveState.collection) : collectionTargets}
          onClose={() => setMoveState(null)}
          onMove={(target) =>
            moveState.kind === "collection"
              ? hc.relocateCollection(moveState.collection, {
                  parentId: target === TOP ? null : target,
                  position: own.filter((c) => (c.parentId ?? TOP) === target).length,
                })
              : hc.relocatePlacement(moveState.placement, {
                  collectionId: target === UNASSIGNED ? null : target,
                  position: placementsIn(target === UNASSIGNED ? null : target).length,
                })
          }
        />
      ) : null}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete collection</DialogTitle>
            <DialogDescription>
              Delete <span className="font-medium text-foreground">{deleteTarget?.name || "this collection"}</span>?
              Its sub-collections are deleted too. Articles move to Unassigned and stay in this help center.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddArticlesDialog key={addKey} open={adding} onOpenChange={setAdding} center={center} hc={hc} />
    </div>
  );
}

export default CollectionsSection;
