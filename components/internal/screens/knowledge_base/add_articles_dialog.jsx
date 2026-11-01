"use client";

// Add articles to a help center (KB spec §10.4): a searchable checklist of source articles not yet placed here,
// and the collection they land in. Closes only once the placement succeeds.

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui";
import { Field, StatusPill } from "@/components/internal/shared/screen_kit";
import { ARTICLE_STATE_MAP, collectionTree, effectiveContent } from "./constants";

const UNASSIGNED = "__unassigned__";

export function AddArticlesDialog({ open, onOpenChange, center, hc }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [collectionId, setCollectionId] = useState(UNASSIGNED);
  const [busy, setBusy] = useState(false);

  const placedHere = useMemo(
    () => new Set(hc.placements.filter((p) => p.centerId === center.id).map((p) => p.articleId)),
    [hc.placements, center.id],
  );
  const tree = collectionTree(hc.collections, center.id);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hc.sources
      .filter((a) => !placedHere.has(a.id) && a.state !== "archived")
      .filter((a) => !q || effectiveContent(a).title.toLowerCase().includes(q));
  }, [hc.sources, placedHere, query]);

  function toggle(id, on) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function close(next) {
    if (busy) return;
    onOpenChange(next);
  }

  async function submit() {
    setBusy(true);
    const created = await hc.addArticles(center, [...picked], collectionId === UNASSIGNED ? null : collectionId);
    setBusy(false);
    if (created) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add articles</DialogTitle>
          <DialogDescription>
            {center.isDefault
              ? "Published articles you add here appear in the Messenger's Help space."
              : "This help center isn't the Messenger's, so these articles won't show in the Help space."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search articles…" autoFocus />
          <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface-card">
            {candidates.length ? (
              candidates.map((a) => {
                const id = `add-${a.id}`;
                return (
                  <div key={a.id} className="flex items-center gap-3 px-3 py-2">
                    <Checkbox id={id} checked={picked.has(a.id)} onCheckedChange={(on) => toggle(a.id, on === true)} />
                    <Label htmlFor={id} className="min-w-0 flex-1 truncate text-sm font-normal text-foreground">
                      {effectiveContent(a).title || "Untitled article"}
                    </Label>
                    <StatusPill status={a.displayState} map={ARTICLE_STATE_MAP} />
                  </div>
                );
              })
            ) : (
              <p className="px-3 py-6 text-center text-sm text-text-secondary">
                {query ? "No articles match." : "Every article is already in this help center."}
              </p>
            )}
          </div>
          <Field label="Collection">
            <Select value={collectionId} onValueChange={setCollectionId} disabled={busy}>
              <SelectTrigger>
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
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={busy || !picked.size}
            onClick={submit}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add {picked.size || ""} {picked.size === 1 ? "article" : "articles"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddArticlesDialog;
