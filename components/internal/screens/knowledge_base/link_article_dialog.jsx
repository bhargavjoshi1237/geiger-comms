"use client";

// Link an existing article to a knowledge gap (KB spec §11.6, Intercom's "Mark as done"). A published article
// resolves the gap at once; a draft keeps it In progress until it's published.

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@geiger/ui";
import { StatusPill } from "@/components/internal/shared/screen_kit";
import { cn } from "@/lib/utils";
import { ARTICLE_STATE_MAP, effectiveContent } from "./constants";

export function LinkArticleDialog({ gap, articles, onClose, onLink }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles
      .filter((a) => a.state !== "archived")
      .filter((a) => !q || effectiveContent(a).title.toLowerCase().includes(q))
      .slice(0, 50);
  }, [articles, query]);

  async function submit() {
    setBusy(true);
    const ok = await onLink(gap, picked);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link existing article</DialogTitle>
          <DialogDescription>Pick the article that answers “{gap.label}”.</DialogDescription>
        </DialogHeader>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search articles…" autoFocus />
        <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface-card">
          {matches.length ? (
            matches.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setPicked(a)}
                aria-pressed={picked?.id === a.id}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors",
                  picked?.id === a.id ? "bg-surface-active text-foreground" : "text-foreground hover:bg-surface-hover",
                )}
              >
                <span className="truncate">{effectiveContent(a).title || "Untitled article"}</span>
                <StatusPill status={a.displayState} map={ARTICLE_STATE_MAP} />
              </button>
            ))
          ) : (
            <p className="px-3 py-6 text-center text-sm text-text-secondary">No articles match.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy || !picked} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Link article
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LinkArticleDialog;
