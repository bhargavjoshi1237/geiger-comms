"use client";

// Article editor (KB spec §9.2): debounced autosave writes a draft's live columns, or stages a published article's edits in `draft`.

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Copy,
  CopyPlus,
  EyeOff,
  Loader2,
  Save,
  Trash2,
  Undo2,
  Upload,
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
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import { InlineTitleInput } from "@/components/internal/shared/screen_kit";
import { Notice } from "@/components/internal/shared/notice";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useAiStatus } from "@/lib/hooks/use-ai-status";
import { getUser } from "@/lib/supabase/user";
import { displayStateOf, logAiAssist, saveSnapshot, updateArticle } from "@/lib/supabase/articles";
import { cn } from "@/lib/utils";
import {
  ARTICLE_STATE_MAP,
  NEEDS_PUBLISH,
  effectiveContent,
  formatRelative,
  localeLabel,
} from "./constants";
import { ARTICLE_NAV, DetailsSection, PlacementSection, copyId } from "./article_sections";
import { MarkdownEditor } from "./markdown_editor";
import { TranslationsSection } from "./translations_section";
import { InsightsSection } from "./insights_section";
import { HistorySection } from "./history_section";
import { Gated } from "@/components/internal/shared/gated";
import { AiAssistMenu } from "./ai_assist_menu";
import { AiSuggestionDialog, startAssist } from "./ai_suggestion_dialog";

const SAVE_DEBOUNCE_MS = 600;
const OUTLINE_ACTION =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
const PRIMARY_ACTION = "bg-primary text-primary-foreground hover:bg-primary/90";
const ADD_TRANSLATION = "__add_translation__";

// Live columns on a draft; the staged `draft` on a published article, cleared once it matches what's live again.
function contentWrite(article, content, userId) {
  if (article.state !== "published") {
    return { title: content.title, summary: content.summary, body: content.body };
  }
  const unchanged =
    content.title === article.title && content.summary === article.summary && content.body === article.body;
  return {
    draft: unchanged ? null : { ...content, savedAt: new Date().toISOString(), savedBy: userId ?? null },
  };
}

// The list's optimistic copy of an unsaved edit, so it never reads the article as empty or stale.
function applyWrite(article, write) {
  const next = { ...article, ...write, lastEditedAt: new Date().toISOString() };
  next.displayState = displayStateOf(next.state, next.draft);
  next.hasPendingChanges = next.state === "published" && Boolean(next.draft);
  return next;
}

function MessengerLine({ reason }) {
  if (!reason) return null;
  return reason.tone === "warning" ? (
    <span className="text-xs text-amber-400">Not in the Messenger: {reason.text}</span>
  ) : (
    <span className="text-xs text-text-secondary">{reason.text}</span>
  );
}

function LocaleSwitcher({ article, rows, onOpen, onAdd }) {
  return (
    <Select value={article.id} onValueChange={(v) => (v === ADD_TRANSLATION ? onAdd() : onOpen(v))}>
      <SelectTrigger size="sm" className="w-auto gap-2" aria-label="Language">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {rows.map((row) => (
          <SelectItem key={row.id} value={row.id}>
            <span
              aria-hidden="true"
              className={cn("h-1.5 w-1.5 rounded-full", ARTICLE_STATE_MAP[row.displayState]?.dotClass)}
            />
            {localeLabel(row.locale)}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={ADD_TRANSLATION}>Add translation…</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function ArticleEditor({ article, kb, onBack, onPublish, onDelete }) {
  const { section, setSection, openArticle } = useWorkspaceUrl();
  const ai = useAiStatus(article.projectId);
  const [assistRequest, setAssistRequest] = useState(null);
  const selectionRef = useRef(null);
  const [form, setForm] = useState(() => effectiveContent(article));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [versionsKey, setVersionsKey] = useState(0);
  const [userId, setUserId] = useState(null);
  const sectionKey = section === "placement" && !article.isSource ? "overview" : section;
  const timer = useRef(null);
  const pending = useRef(null); // the write not yet sent
  const inflight = useRef(null); // the latest write sent or queued
  const failures = useRef(0); // bumped by a failed write, so writes queued behind it are dropped with its revert
  const lastSaved = useRef(article); // what the database last confirmed

  useEffect(() => {
    let alive = true;
    getUser().then((u) => alive && setUserId(u?.id ?? null));
    return () => {
      alive = false;
    };
  }, []);

  // With nothing unsaved, the list's row is the truth (verbs, Details edits and placement refreshes land there).
  useEffect(() => {
    if (!pending.current && !inflight.current) lastSaved.current = article;
  }, [article]);

  function flush() {
    clearTimeout(timer.current);
    const write = pending.current;
    pending.current = null;
    if (!write) return Promise.resolve(lastSaved.current);
    const previous = inflight.current;
    const epoch = failures.current;
    // Writes go out one at a time, so an older response can never land after a newer one.
    const run = (async () => {
      if (previous) await previous;
      if (failures.current !== epoch) return null;
      const row = await updateArticle(article.id, write);
      if (row) {
        lastSaved.current = row;
        kb.replaceArticle(row);
        if (!pending.current && inflight.current === run) {
          setSaving(false);
          setSaved(true);
        }
        return row;
      }
      failures.current += 1;
      clearTimeout(timer.current);
      pending.current = null;
      setForm(effectiveContent(lastSaved.current));
      kb.replaceArticle(lastSaved.current);
      setSaving(false);
      toast.error("Couldn't save changes — reverted.");
      return null;
    })();
    inflight.current = run;
    run.finally(() => {
      if (inflight.current === run) inflight.current = null;
    });
    return run;
  }

  // Every deliberate action first lands pending edits, then acts on the row the database confirmed.
  async function settle() {
    if (pending.current) return flush();
    if (inflight.current) return inflight.current;
    return lastSaved.current;
  }

  const flushOnLeave = useEffectEvent(() => {
    if (pending.current) void flush();
  });
  useEffect(() => () => flushOnLeave(), []);

  function persist(patch) {
    const next = { ...form, ...patch };
    setForm(next);
    const write = contentWrite(lastSaved.current, next, userId);
    pending.current = write;
    kb.replaceArticle(applyWrite(lastSaved.current, write));
    clearTimeout(timer.current);
    setSaving(true);
    setSaved(false);
    timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
  }

  async function act(run) {
    setBusy(true);
    const latest = await settle();
    if (latest) await run(latest);
    setBusy(false);
  }

  async function saveVersion() {
    const latest = await settle();
    if (!latest) return;
    const version = await saveSnapshot({
      id: crypto.randomUUID(),
      articleId: latest.id,
      projectId: latest.projectId,
      ...effectiveContent(latest),
      locale: latest.locale,
    });
    if (!version) {
      toast.error("Couldn't save the version.");
      return;
    }
    setVersionsKey((k) => k + 1);
    toast.success("Version saved");
  }

  const onShortcut = useEffectEvent((e) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void saveVersion();
    }
  });
  useEffect(() => {
    const handler = (e) => onShortcut(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  async function restoreVersion(version) {
    const content = { title: version.title, summary: version.summary, body: version.body };
    setForm(content);
    pending.current = contentWrite(lastSaved.current, content, userId);
    kb.replaceArticle(applyWrite(lastSaved.current, pending.current));
    setSaving(true);
    const row = await flush();
    if (row) toast.success("Version restored as a draft");
    return Boolean(row);
  }

  // AI assist acts on the body selection while Content is open, otherwise on the whole body.
  function runAssist(action, options = {}) {
    const sel = sectionKey === "overview" ? selectionRef.current : null;
    const range = sel && sel.end > sel.start ? sel : null;
    const selection = range ? form.body.slice(range.start, range.end) : "";
    setAssistRequest(startAssist({
      action,
      range,
      hasSelection: Boolean(range),
      bodyEmpty: !form.body.trim(),
      body: {
        projectId: article.projectId,
        action,
        articleId: article.id,
        input: { ...form, selection },
        options,
      },
    }));
  }

  function translateWithAi(locale) {
    const source = kb.sourceOf(article);
    const content = source.id === article.id ? form : effectiveContent(source);
    setAssistRequest(startAssist({
      action: "translate",
      locale,
      targetLabel: localeLabel(locale),
      body: {
        projectId: article.projectId,
        action: "translate",
        articleId: source.id,
        input: { ...content, selection: "" },
        options: { targetLocale: locale },
      },
    }));
  }

  async function applyAssist(mode, result, { provider, model }) {
    const request = assistRequest;
    const entry = { action: request.action, provider, model, at: new Date().toISOString() };
    if (mode === "translation") {
      const created = await kb.addTranslation(kb.sourceOf(article), request.locale, {
        ...result,
        machine: { provider, model, at: entry.at },
      });
      if (!created) return false;
      void logAiAssist(created.id, entry);
      openArticle(created.id);
      return true;
    }
    const { range } = request;
    if (mode === "draft") {
      persist({ title: form.title.trim() ? form.title : result.title, summary: result.summary, body: result.body });
    } else if (mode === "description") {
      persist({ summary: result.summary });
    } else if (mode === "title") {
      persist({ title: result.title });
    } else if (mode === "replace") {
      persist({ body: range ? form.body.slice(0, range.start) + result.text + form.body.slice(range.end) : result.text });
    } else {
      const at = range ? range.end : form.body.length;
      const before = form.body.slice(0, at).replace(/\s+$/, "");
      const after = form.body.slice(at).replace(/^\s+/, "");
      persist({ body: [before, result.text, after].filter(Boolean).join("\n\n") });
    }
    void logAiAssist(article.id, entry);
    return true;
  }

  async function discard() {
    setConfirmDiscard(false);
    await act(async (latest) => {
      const row = await kb.discard(latest);
      if (row) setForm(effectiveContent(row));
    });
  }

  const group = kb.groupById.get(article.sourceId);
  const rows = group?.rows ?? [article];
  const display = article.displayState;
  const locked = article.state === "published" && !kb.canPublish;
  const groupPublished = rows.some((r) => r.state === "published");
  const titleMissing = !form.title.trim();
  const publishBlock = !kb.canPublish ? NEEDS_PUBLISH : titleMissing ? "Add a title to publish" : null;
  const reason = kb.reasonFor(article);

  const updatedBy = kb.teammatesByUser[article.updatedBy]?.name;
  const meta = [
    `Updated ${formatRelative(article.lastEditedAt)}${updatedBy ? ` by ${updatedBy}` : ""}`,
    article.authorName ? `Written by ${article.authorName}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  let saveState = null;
  if (saving) {
    saveState = (
      <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        Saving…
      </span>
    );
  } else if (saved) {
    saveState = <span className="text-xs text-text-secondary">Saved</span>;
  }

  const primary = {
    draft: (
      <Gated reason={publishBlock}>
        <Button className={PRIMARY_ACTION} disabled={busy || !!publishBlock} onClick={() => act(onPublish)}>
          <Upload className="h-4 w-4" /> Publish
        </Button>
      </Gated>
    ),
    published: (
      <Gated reason={locked ? NEEDS_PUBLISH : null}>
        <Button
          variant="outline"
          className={OUTLINE_ACTION}
          disabled={busy || locked}
          onClick={() => act(kb.unpublish)}
        >
          <EyeOff className="h-4 w-4" /> Unpublish
        </Button>
      </Gated>
    ),
    changes_unpublished: (
      <>
        <Button
          variant="ghost"
          className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
          disabled={busy}
          onClick={() => setConfirmDiscard(true)}
        >
          <Undo2 className="h-4 w-4" /> Discard changes
        </Button>
        <Gated reason={publishBlock}>
          <Button className={PRIMARY_ACTION} disabled={busy || !!publishBlock} onClick={() => act(onPublish)}>
            <Upload className="h-4 w-4" /> Publish changes
          </Button>
        </Gated>
      </>
    ),
    archived: (
      <Button className={PRIMARY_ACTION} disabled={busy} onClick={() => act(kb.restore)}>
        <ArchiveRestore className="h-4 w-4" /> Restore to draft
      </Button>
    ),
  }[display];

  const machine = article.machineTranslated && article.state !== "published" ? article.machineTranslated : null;

  return (
    <>
      <EditorShell
        back={{ label: "Articles", onClick: onBack }}
        title={
          <InlineTitleInput
            value={form.title}
            onChange={(e) => persist({ title: e.target.value })}
            placeholder="Untitled article"
            aria-label="Article title"
            className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
          />
        }
        status={display}
        statusMap={ARTICLE_STATE_MAP}
        badges={
          <>
            <LocaleSwitcher
              article={article}
              rows={rows}
              onOpen={openArticle}
              onAdd={() => setSection("translations")}
            />
            {saveState}
            <MessengerLine reason={reason} />
          </>
        }
        meta={meta}
        actions={
          <>
            {primary}
            <AiAssistMenu
              status={ai.status}
              loading={ai.loading}
              bodyEmpty={!form.body.trim()}
              onRun={runAssist}
            />
            <ActionMenu
              label="More article actions"
              items={[
                { icon: CopyPlus, label: "Duplicate", onSelect: () => act(kb.duplicate) },
                { icon: Save, label: "Save version", onSelect: () => void saveVersion() },
                { icon: Copy, label: "Copy article ID", onSelect: () => copyId(article.id) },
                display !== "archived" && {
                  icon: Archive,
                  label: "Archive",
                  disabled: locked,
                  onSelect: () => act(kb.archive),
                },
                { separator: true },
                {
                  icon: Trash2,
                  label: "Delete",
                  variant: "destructive",
                  disabled: groupPublished && !kb.canPublish,
                  onSelect: () => onDelete(article),
                },
              ]}
            />
          </>
        }
        beforeBody={
          machine ? (
            <Notice>
              Machine translated by {machine.provider} · {machine.model}. Review before publishing.
            </Notice>
          ) : null
        }
        nav={ARTICLE_NAV}
        subject={article}
        active={sectionKey}
        onActiveChange={setSection}
      >
        {({ active }) => {
          if (active === "placement") return <PlacementSection article={article} kb={kb} locked={locked} />;
          if (active === "details") return <DetailsSection article={article} kb={kb} locked={locked} />;
          if (active === "translations") {
            return (
              <TranslationsSection
                article={article}
                kb={kb}
                ai={ai}
                onDelete={onDelete}
                onTranslate={translateWithAi}
              />
            );
          }
          if (active === "insights") return <InsightsSection article={article} />;
          if (active === "history") {
            return (
              <HistorySection
                article={article}
                kb={kb}
                form={form}
                refreshKey={versionsKey}
                onRestore={restoreVersion}
              />
            );
          }
          return (
            <MarkdownEditor
              selectionRef={selectionRef}
              summary={form.summary}
              body={form.body}
              onSummaryChange={(summary) => persist({ summary })}
              onBodyChange={(body) => persist({ body })}
            />
          );
        }}
      </EditorShell>

      {assistRequest ? (
        <AiSuggestionDialog
          request={assistRequest}
          onClose={() => setAssistRequest(null)}
          onApply={applyAssist}
        />
      ) : null}

      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discard unpublished changes?</DialogTitle>
            <DialogDescription>The published version stays live.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={discard}>
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ArticleEditor;
