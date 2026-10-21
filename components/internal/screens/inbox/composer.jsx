"use client";

// Reply / note composer (spec §5.5): @mentions (notes), "#" macros, attachments and undoable AI drafts; InboxShell owns the optimistic send.

import { useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Kbd,
  KbdGroup,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@geiger/ui";
import { AtSign, FileText, Loader2, Lock, Paperclip, SendHorizonal, StickyNote, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiStatus } from "@/lib/hooks/use-ai-status";
import { composeReply, translateInbox } from "@/lib/supabase/ai";
import { languageName } from "@/lib/kb/prompts";
import { summarizeMacroActions } from "../automation/constants";
import { AiDraftStrip, COMPOSE_DONE, ComposerAiMenu, copilotError, isAiRefusal } from "./copilot";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  ATTACHMENT_TYPES,
  channelMeta,
  formatBytes,
  macroActionLabel,
  unfilledMacroTokens,
} from "./constants";

// The active mention token: an "@query" at the very end of the draft (the natural typing position).
const MENTION_TRIGGER = /(^|\s)@([^\s@]*)$/;
// The active macro token: a "#query" at the end of the draft; macro names have spaces, so only a newline ends it.
const MACRO_TRIGGER = /(^|\s)#([^\n#]*)$/;

const MODES = [
  { value: "reply", label: "Reply" },
  { value: "note", label: "Note", icon: StickyNote },
];

const noop = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);
const hasFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

export function Composer({
  ref,
  conversationId,
  teammates,
  me,
  recipient,
  channel,
  macros = [],
  disabled,
  disabledReason,
  onSend,
  onResolveMacro,
  onRunMacro,
  onUpload,
}) {
  const [tab, setTab] = useState("reply"); // reply | note
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pickIndex, setPickIndex] = useState(0);
  const [pickDismissed, setPickDismissed] = useState(false);
  const [files, setFiles] = useState([]); // { key, name, size, file, attachment } — attachment is null while uploading
  const [pending, setPending] = useState(null); // { names, actions } of the macros picked into this draft
  const [dragging, setDragging] = useState(false);
  const [ai, setAi] = useState(null); // { kind: rewrite | translate | summary, label, model, removed } while the draft is unedited AI text
  const [undo, setUndo] = useState(null); // { draft, tab } the AI text replaced
  const [aiBusy, setAiBusy] = useState(false);
  const { status: aiStatus, loading: aiLoading, refresh: refreshAi } = useAiStatus();
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const isNote = tab === "note";
  // Cmd on Apple keyboards, Ctrl elsewhere; the server render assumes Ctrl.
  const mod = useSyncExternalStore(noop, () => (isMac() ? "⌘" : "Ctrl"), () => "Ctrl");

  // The open autocomplete: teammates after "@" (notes only), else macros after "#".
  const picker = useMemo(() => {
    if (pickDismissed) return null;
    const mention = isNote ? draft.match(MENTION_TRIGGER) : null;
    if (mention) {
      const q = mention[2].toLowerCase();
      const items = teammates
        .filter((t) => t.id !== me?.id && t.name && t.name.toLowerCase().includes(q))
        .slice(0, 6);
      return { kind: "mention", items };
    }
    const macro = macros.length > 0 ? draft.match(MACRO_TRIGGER) : null;
    if (macro) {
      const q = macro[2].trim().toLowerCase();
      const byName = macros.filter((m) => m.name.toLowerCase().includes(q));
      const byBody = q ? macros.filter((m) => !byName.includes(m) && m.body.toLowerCase().includes(q)) : [];
      return { kind: "macro", items: [...byName, ...byBody].slice(0, 20) };
    }
    return null;
  }, [draft, isNote, pickDismissed, teammates, me?.id, macros]);

  const items = picker?.items ?? [];
  const highlighted = Math.min(pickIndex, Math.max(items.length - 1, 0));
  const uploading = files.some((f) => !f.attachment);
  const ready = files.filter((f) => f.attachment).map((f) => f.attachment);
  const unfilled = unfilledMacroTokens(draft);
  // An unedited AI summary draws on internal notes, so it can only be added as a note.
  const summaryInReply = ai?.kind === "summary" && !isNote;
  const canSend =
    Boolean(draft.trim() || ready.length) && !uploading && !sending && !aiBusy && !summaryInReply && unfilled.length === 0;

  // Any edit by the teammate makes the text theirs: the AI label and its undo go.
  function changeDraft(value) {
    setDraft(value);
    setPickIndex(0);
    setPickDismissed(false);
    setAi(null);
    setUndo(null);
  }

  // Swaps AI text into the draft (optionally switching mode), keeping what it replaced for one-step undo.
  function applyAi(text, meta, nextTab = tab) {
    setUndo({ draft, tab });
    setTab(nextTab);
    setDraft(text);
    setPickDismissed(true);
    setAi(meta);
    inputRef.current?.focus();
  }

  function undoAi() {
    if (!undo) return;
    setDraft(undo.draft);
    setTab(undo.tab);
    setPickDismissed(true);
    setAi(null);
    setUndo(null);
    inputRef.current?.focus();
  }

  // One rewrite or translation of the current reply draft; a failure leaves the draft as it was.
  async function runAi(action) {
    const source = draft.trim();
    if (!source || aiBusy || !conversationId) return;
    setAiBusy(true);
    const res =
      action === "translate"
        ? await translateInbox({ conversationId, mode: "draft", draft: source })
        : await composeReply({ conversationId, action, draft: source });
    setAiBusy(false);
    if (!res.ok) {
      if (isAiRefusal(res.code)) void refreshAi();
      toast.error(copilotError(res));
      return;
    }
    applyAi(res.text, {
      kind: action === "translate" ? "translate" : "rewrite",
      label: action === "translate" ? `Translated to ${languageName(res.targetLanguage)}` : COMPOSE_DONE[action],
      model: res.model,
      removed: res.removedLinks?.length ?? 0,
    });
  }

  // The thread's "Insert as note": the summary becomes an undoable note draft; the teammate still adds it.
  useImperativeHandle(ref, () => ({
    insertNote(text, { model } = {}) {
      applyAi(text, { kind: "summary", label: "Conversation summary", model, removed: 0 }, "note");
    },
  }));

  // Replaces the trailing "@query" with "@Full Name " — the "@" stays so the shell can resolve the mention.
  function applyMention(teammate) {
    changeDraft(draft.replace(MENTION_TRIGGER, (_, lead) => `${lead}@${teammate.name} `));
    inputRef.current?.focus();
  }

  // Swaps the trailing "#query" for the macro's filled body; text typed while it resolves is kept after it.
  async function applyMacro(macro) {
    const match = draft.match(MACRO_TRIGGER);
    const at = match ? match.index + match[1].length : draft.length;
    changeDraft(draft.slice(0, at));
    inputRef.current?.focus();
    const hasBody = Boolean(macro.body.trim());
    if (macro.actions.length > 0) {
      if (hasBody) {
        setPending((prev) => ({
          names: [...(prev?.names ?? []), macro.name],
          actions: [...(prev?.actions ?? []), ...macro.actions],
        }));
      } else {
        onRunMacro?.(macro);
      }
    }
    if (!hasBody) return;
    const body = (await onResolveMacro?.(macro)) ?? macro.body;
    setDraft((current) => current.slice(0, at) + body + current.slice(at));
  }

  function removePendingAction(index) {
    setPending((prev) => {
      const actions = (prev?.actions ?? []).filter((_, i) => i !== index);
      return actions.length > 0 ? { ...prev, actions } : null;
    });
  }

  // The Mention / Macro buttons start a fresh "@" / "#" token, which opens its autocomplete.
  function startToken(char) {
    changeDraft(`${draft}${draft && !/\s$/.test(draft) ? " " : ""}${char}`);
    inputRef.current?.focus();
  }

  // Checks type, size and count locally (the server re-checks), then uploads each file straight away.
  function addFiles(list) {
    const picked = Array.from(list || []);
    if (picked.length === 0 || !onUpload) return;
    const room = ATTACHMENT_MAX_COUNT - files.length;
    if (picked.length > room) toast.error(`Up to ${ATTACHMENT_MAX_COUNT} attachments per message.`);
    const accepted = [];
    for (const file of picked.slice(0, Math.max(room, 0))) {
      if (!ATTACHMENT_TYPES.includes(file.type)) {
        toast.error(`${file.name}: only images and PDFs can be attached.`);
      } else if (file.size > ATTACHMENT_MAX_BYTES) {
        toast.error(`${file.name} is over ${formatBytes(ATTACHMENT_MAX_BYTES)}.`);
      } else {
        accepted.push({ key: crypto.randomUUID(), name: file.name, size: file.size, attachment: null, file });
      }
    }
    if (accepted.length === 0) return;
    setFiles((prev) => [...prev, ...accepted]);
    for (const entry of accepted) {
      onUpload(entry.file).then((attachment) => {
        setFiles((prev) =>
          attachment
            ? prev.map((f) => (f.key === entry.key ? { ...f, attachment } : f))
            : prev.filter((f) => f.key !== entry.key),
        );
      });
    }
  }

  async function send() {
    if (unfilled.length > 0) {
      toast.error(`Fill in ${unfilled.join(", ")} before sending.`);
      return;
    }
    if (!canSend) return;
    setSending(true);
    try {
      // On a falsy return we keep the draft so nothing is silently lost.
      const ok = await onSend?.({
        body: draft.trim(),
        messageType: isNote ? "note" : "comment",
        attachments: ready,
        macro: pending ? { name: pending.names.join(", "), actions: pending.actions } : null,
      });
      if (ok !== false) {
        changeDraft("");
        setFiles([]);
        setPending(null);
      }
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(event) {
    // Cmd/Ctrl+Z right after an AI change restores what it replaced (the textarea's own undo can't see it).
    if (undo && (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoAi();
      return;
    }
    if (items.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setPickIndex((highlighted + 1) % items.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setPickIndex((highlighted - 1 + items.length) % items.length);
        return;
      }
      if ((event.key === "Enter" && !event.metaKey && !event.ctrlKey) || event.key === "Tab") {
        event.preventDefault();
        if (picker.kind === "mention") applyMention(items[highlighted]);
        else void applyMacro(items[highlighted]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setPickDismissed(true);
        return;
      }
    }
    // Cmd/Ctrl+Enter sends.
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void send();
    }
  }

  const context = isNote
    ? "Only team can see notes"
    : recipient
      ? `To ${recipient} ${channelMeta(channel).via}`
      : "Sent to the customer";
  const hasMacros = macros.length > 0;
  const placeholder = isNote
    ? hasMacros
      ? "Write a note. Type @ to mention a teammate, # for a macro."
      : "Write a note. Type @ to mention a teammate."
    : hasMacros
      ? "Write a reply… Type # for a macro."
      : "Write a reply…";
  const toolClass = isNote
    ? "text-amber-300 hover:bg-amber-400/10 hover:text-amber-200"
    : "text-muted-foreground hover:bg-surface-hover hover:text-foreground";

  if (disabled) {
    const reason = disabledReason || "You don't have permission to reply.";
    return (
      <div className="shrink-0 px-4 pb-5 pt-2 sm:px-6">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              tabIndex={0}
              className="mx-auto max-w-[760px] rounded-xl border border-border bg-surface-subtle px-4 py-5 text-sm text-muted-foreground"
            >
              {reason}
            </div>
          </TooltipTrigger>
          <TooltipContent>{reason}</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="shrink-0 px-4 pb-5 pt-2 sm:px-6">
      <div
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
        }}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "relative mx-auto max-w-[760px] rounded-xl border transition-colors",
          isNote
            ? "border-amber-400/35 bg-amber-400/[0.06] focus-within:border-amber-400/60"
            : "border-border bg-surface-card focus-within:border-border-strong",
          dragging && "border-dashed border-border-strong",
        )}
      >
        {/* Reply / note tabs */}
        <div className="flex items-center gap-0.5 px-1.5 pt-1.5" role="tablist" aria-label="Composer mode">
          {MODES.map((mode) => {
            const selected = tab === mode.value;
            const Icon = mode.icon;
            return (
              <button
                key={mode.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setTab(mode.value);
                  setPickDismissed(false);
                  inputRef.current?.focus();
                }}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                  selected
                    ? mode.value === "note"
                      ? "bg-amber-400/15 text-amber-300"
                      : "bg-surface-strong text-foreground"
                    : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                )}
              >
                {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                {mode.label}
              </button>
            );
          })}
          <span className={cn("ml-auto truncate pl-2 pr-2 text-xs", isNote ? "text-amber-300" : "text-muted-foreground")}>
            {context}
          </span>
        </div>

        <Textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => changeDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            // A pasted screenshot attaches; rich-text pastes (which also carry an image) stay plain text.
            if (e.clipboardData?.files?.length && !e.clipboardData.getData("text/plain")) {
              e.preventDefault();
              addFiles(e.clipboardData.files);
            }
          }}
          rows={3}
          readOnly={aiBusy}
          aria-busy={aiBusy || undefined}
          aria-label={isNote ? "Internal note" : recipient ? `Reply to ${recipient}` : "Reply"}
          placeholder={placeholder}
          className={cn(
            "min-h-20 resize-none rounded-none border-0 bg-transparent px-3.5 py-2.5 leading-[1.55] placeholder:text-muted-foreground focus-visible:border-0 focus-visible:ring-0",
            aiBusy && "text-muted-foreground",
          )}
        />

        {ai ? <AiDraftStrip ai={ai} inReply={!isNote} mod={mod} onUndo={undoAi} /> : null}

        {/* Mention / macro autocomplete */}
        {items.length > 0 && picker.kind === "mention" ? (
          <div
            role="listbox"
            aria-label="Mention a teammate"
            className="absolute bottom-full left-3 z-20 mb-1 w-60 overflow-hidden rounded-md border border-border bg-surface-subtle py-1 shadow-lg"
          >
            {items.map((teammate, i) => (
              <button
                key={teammate.id}
                type="button"
                role="option"
                aria-selected={i === highlighted}
                onMouseDown={(e) => e.preventDefault()} // keep textarea focus
                onClick={() => applyMention(teammate)}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-surface-hover",
                  i === highlighted && "bg-surface-active",
                )}
              >
                <Avatar className="h-5 w-5">
                  <AvatarImage src={teammate.avatarUrl || undefined} alt="" />
                  <AvatarFallback className="text-[8px]">{teammate.name?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
                </Avatar>
                <span className="truncate text-xs text-foreground">{teammate.name}</span>
                <AtSign className="ml-auto h-3 w-3 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : null}
        {items.length > 0 && picker.kind === "macro" ? (
          <div
            role="listbox"
            aria-label="Insert a macro"
            className="absolute bottom-full left-3 z-20 mb-1 max-h-72 w-80 overflow-y-auto rounded-md border border-border bg-surface-subtle py-1 shadow-lg"
          >
            {items.map((macro, i) => (
              <button
                key={macro.id}
                ref={i === highlighted ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                type="button"
                role="option"
                aria-selected={i === highlighted}
                onMouseDown={(e) => e.preventDefault()} // keep textarea focus
                onClick={() => void applyMacro(macro)}
                className={cn(
                  "flex w-full flex-col gap-0.5 px-2.5 py-1.5 text-left transition-colors hover:bg-surface-hover",
                  i === highlighted && "bg-surface-active",
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
                  <Zap className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{macro.name}</span>
                  {macro.scope === "personal" ? (
                    <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Only you" />
                  ) : null}
                </span>
                {macro.body ? <span className="truncate pl-[18px] text-xs text-muted-foreground">{macro.body}</span> : null}
                {macro.actions.length > 0 ? (
                  <span className="truncate pl-[18px] text-[11px] text-text-tertiary">
                    {summarizeMacroActions(macro.actions)}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        {/* Attachments */}
        {files.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {files.map((f) => (
              <span
                key={f.key}
                className="inline-flex h-7 max-w-[240px] items-center gap-1.5 rounded-md border border-border bg-surface-subtle pl-2 pr-0.5 text-xs text-foreground"
              >
                {f.attachment ? (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="Uploading" />
                )}
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-muted-foreground">{formatBytes(f.size)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-6 text-muted-foreground"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles((prev) => prev.filter((x) => x.key !== f.key))}
                >
                  <X />
                </Button>
              </span>
            ))}
          </div>
        ) : null}

        {/* Macro actions that run once the message is saved */}
        {pending ? (
          <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
            <span className={cn("inline-flex items-center gap-1 text-xs", isNote ? "text-amber-300" : "text-muted-foreground")}>
              <Zap className="h-3.5 w-3.5" /> On send
            </span>
            {pending.actions.map((action, i) => {
              const label = macroActionLabel(action, teammates);
              return (
                <span
                  key={`${action.action}-${i}`}
                  className="inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-border bg-surface-active pl-2.5 pr-0.5 text-xs text-foreground"
                >
                  <span className="truncate">{label}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="size-5 rounded-full text-muted-foreground"
                    aria-label={`Remove “${label}”`}
                    onClick={() => removePendingAction(i)}
                  >
                    <X />
                  </Button>
                </span>
              );
            })}
          </div>
        ) : null}

        {unfilled.length > 0 ? (
          <p className="px-3.5 pb-2 text-xs text-amber-300">Fill in {unfilled.join(", ")} before sending.</p>
        ) : null}

        {/* Send row */}
        <div className="flex items-center gap-1 px-2 pb-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ATTACHMENT_TYPES.join(",")}
            className="hidden"
            tabIndex={-1}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {onUpload ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={cn("size-7", toolClass)}
              aria-label="Attach images or PDFs"
              title="Attach images or PDFs"
              disabled={files.length >= ATTACHMENT_MAX_COUNT}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip />
            </Button>
          ) : null}
          {hasMacros ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn("h-7 gap-1 px-2 text-xs", toolClass)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => startToken("#")}
            >
              <Zap className="h-3.5 w-3.5" /> Macro
            </Button>
          ) : null}
          {isNote ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn("h-7 gap-1 px-2 text-xs", toolClass)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => startToken("@")}
            >
              <AtSign className="h-3.5 w-3.5" /> Mention
            </Button>
          ) : conversationId ? (
            <ComposerAiMenu
              status={aiStatus}
              loading={aiLoading}
              busy={aiBusy}
              draft={draft}
              className={toolClass}
              onRun={(action) => void runAi(action)}
            />
          ) : null}
          <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
            <KbdGroup>
              <Kbd className="h-[18px] min-w-[18px] border border-border bg-transparent font-mono text-[11px]">{mod}</Kbd>
              <Kbd className="h-[18px] min-w-[18px] border border-border bg-transparent font-mono text-[11px]">↵</Kbd>
            </KbdGroup>
            to send
          </span>
          <Button
            type="button"
            size="sm"
            className="ml-auto font-semibold disabled:bg-surface-strong disabled:text-muted-foreground disabled:opacity-100 sm:ml-1"
            onClick={() => void send()}
            disabled={!canSend}
          >
            {sending || uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SendHorizonal className="h-3.5 w-3.5" />
            )}
            {isNote ? "Add note" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default Composer;
