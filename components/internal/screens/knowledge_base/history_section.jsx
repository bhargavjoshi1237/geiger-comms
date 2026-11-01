"use client";

// Version history (KB spec §9.7): published versions (written by the database on publish) and saved snapshots.
// Restoring one makes a new draft of it — it never publishes.

import { useEffect, useMemo, useState } from "react";
import { History, Loader2, RotateCcw } from "lucide-react";
import {
  Badge,
  Button,
  LogoLoading,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
} from "@geiger/ui";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { MarkdownView } from "@/components/widget/markdown_view";
import { listVersions } from "@/lib/supabase/articles";
import { lineDiff } from "@/lib/kb/line_diff";
import { cn } from "@/lib/utils";
import { ARTICLE_PROSE_CLASS, effectiveContent, formatDateTime, formatRelative } from "./constants";

const KIND_BADGE = {
  published: { label: "Published", variant: "success" },
  snapshot: { label: "Snapshot", variant: "neutral" },
};

const DIFF_LINE = {
  same: "text-text-secondary",
  added: "bg-emerald-500/10 text-emerald-400",
  removed: "bg-red-500/10 text-red-400 line-through",
};

export function DiffView({ before, after }) {
  const lines = useMemo(() => lineDiff(before, after), [before, after]);
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-surface-card p-3 font-mono text-[12px] leading-5">
      {lines.map((line, i) => (
        <div key={i} className={cn("whitespace-pre-wrap px-1", DIFF_LINE[line.type])}>
          {line.text || " "}
        </div>
      ))}
    </pre>
  );
}

function VersionSheet({ version, current, authorName, onClose, onRestore }) {
  const [highlight, setHighlight] = useState(false);
  const [busy, setBusy] = useState(false);

  async function restore() {
    setBusy(true);
    const ok = await onRestore(version);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet open={!!version} onOpenChange={(open) => !open && !busy && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        {version ? (
          <>
            <SheetHeader>
              <SheetTitle>{version.title || "Untitled article"}</SheetTitle>
              <SheetDescription>
                {KIND_BADGE[version.kind]?.label ?? "Version"} · {formatDateTime(version.createdAt)}
                {authorName ? ` · ${authorName}` : ""}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4">
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <Switch checked={highlight} onCheckedChange={setHighlight} />
                Highlight changes against the current content
              </label>
              {version.summary ? <p className="text-sm text-text-secondary">{version.summary}</p> : null}
              {highlight ? (
                <DiffView before={current.body} after={version.body} />
              ) : (
                <div className="rounded-xl border border-border bg-surface-subtle p-5">
                  <MarkdownView text={version.body} variant="article" className={ARTICLE_PROSE_CLASS} />
                </div>
              )}
            </div>
            <SheetFooter>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={restore} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Restore this version
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function HistorySection({ article, kb, form, refreshKey, onRestore }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let alive = true;
    listVersions(article.id).then((rows) => {
      if (!alive) return;
      setVersions(rows ?? []);
      setFailed(rows === null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [article.id, refreshKey]);

  const nameOf = (userId) => kb.teammatesByUser[userId]?.name ?? "";

  let body;
  if (loading) {
    body = (
      <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
        <LogoLoading size={40} aria-label="Loading version history" />
      </div>
    );
  } else if (failed) {
    body = (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState icon={History} title="Couldn't Load Version History" description="Check your connection and try again." />
      </div>
    );
  } else if (!versions.length) {
    body = (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState
          icon={History}
          title="No Versions Yet"
          description="Publishing records a version automatically. Save version (⌘S) keeps a snapshot of your draft."
        />
      </div>
    );
  } else {
    body = (
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-subtle">
        {versions.map((version) => {
          const kind = KIND_BADGE[version.kind] ?? KIND_BADGE.snapshot;
          return (
            <button
              key={version.id}
              type="button"
              onClick={() => setOpen(version)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-hover"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{version.title || "Untitled article"}</p>
                <p className="text-xs text-text-secondary">
                  {[nameOf(version.createdBy), formatRelative(version.createdAt)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Badge variant={kind.variant}>{kind.label}</Badge>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <>
      {body}
      <VersionSheet
        version={open}
        current={form ?? effectiveContent(article)}
        authorName={open ? nameOf(open.createdBy) : ""}
        onClose={() => setOpen(null)}
        onRestore={onRestore}
      />
    </>
  );
}

export default HistorySection;
