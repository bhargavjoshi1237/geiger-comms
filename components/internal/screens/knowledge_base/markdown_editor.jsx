"use client";

// Article writing surface (KB spec §9.3): a markdown Textarea with a formatting toolbar and a live preview rendered
// by the Messenger's own MarkdownView, so authors see what customers see.

import { useLayoutEffect, useRef, useState } from "react";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  SquareCode,
} from "lucide-react";
import {
  Button,
  Input,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Switch,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@geiger/ui";
import { Field, SegmentedTabs } from "@/components/internal/shared/screen_kit";
import { Notice } from "@/components/internal/shared/notice";
import { MarkdownView } from "@/components/widget/markdown_view";
import { IMAGE_SCHEMES, LINK_SCHEMES, safeUrl } from "@/lib/markdown/parse";
import { cn } from "@/lib/utils";
import { ARTICLE_PROSE_CLASS, MESSENGER_RICH_ARTICLES } from "./constants";
import { insertBlock, prefixLines, wrapSelection } from "./markdown_toolbar";

const MODES = [
  { label: "Write", value: "write" },
  { label: "Preview", value: "preview" },
  { label: "Split", value: "split" },
];

const TOOLS = [
  { key: "bold", label: "Bold", icon: Bold, shortcut: "⌘B", run: (ref) => wrapSelection(ref, "**", "**", "bold text") },
  { key: "italic", label: "Italic", icon: Italic, shortcut: "⌘I", run: (ref) => wrapSelection(ref, "*", "*", "italic text") },
  { key: "code", label: "Inline code", icon: Code, run: (ref) => wrapSelection(ref, "`", "`", "code") },
  { key: "h2", label: "Heading 2", icon: Heading2, run: (ref) => prefixLines(ref, "## ") },
  { key: "h3", label: "Heading 3", icon: Heading3, run: (ref) => prefixLines(ref, "### ") },
  { key: "ul", label: "Bulleted list", icon: List, shortcut: "⌘⇧8", run: (ref) => prefixLines(ref, "- ") },
  { key: "ol", label: "Numbered list", icon: ListOrdered, shortcut: "⌘⇧7", run: (ref) => prefixLines(ref, "1. ") },
  { key: "link", label: "Link", icon: Link2, shortcut: "⌘K", popover: "link" },
  { key: "callout", label: "Callout", icon: Quote, run: (ref) => prefixLines(ref, "> ") },
  { key: "codeblock", label: "Code block", icon: SquareCode, run: (ref) => insertBlock(ref, "```\ncode\n```", "code") },
  { key: "hr", label: "Divider", icon: Minus, run: (ref) => insertBlock(ref, "---") },
  { key: "image", label: "Image", icon: ImageIcon, popover: "image" },
];

const RICH_NOTICE =
  "The Messenger currently shows headings, numbered lists, link text, callouts, code blocks and images as plain text. This lifts with the Messenger update.";

function initialMode() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches ? "split" : "write";
}

function ToolButton({ tool, onClick }) {
  const Icon = tool.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={tool.label}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          className="text-text-secondary hover:bg-surface-active hover:text-foreground"
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {tool.label}
        {tool.shortcut ? <span className="ml-1.5 text-text-tertiary">{tool.shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

// The URL popover behind Link and Image; nothing is inserted until the URL passes the renderer's allowlist.
function UrlForm({ kind, onInsert, onCancel }) {
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState("");
  const image = kind === "image";

  function submit(e) {
    e.preventDefault();
    const safe = safeUrl(url, image ? IMAGE_SCHEMES : LINK_SCHEMES);
    if (!safe) {
      setError(image ? "Use an https:// image address." : "Use an https, http or mailto link.");
      return;
    }
    onInsert({ url: safe, alt: alt.trim() });
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Field label={image ? "Image URL" : "Link URL"}>
        <Input
          autoFocus
          value={url}
          placeholder={image ? "https://…/image.png" : "https://…"}
          onChange={(e) => {
            setUrl(e.target.value);
            setError("");
          }}
        />
      </Field>
      {image ? (
        <Field label="Alt text" hint="Describes the image for screen readers.">
          <Input value={alt} onChange={(e) => setAlt(e.target.value)} />
        </Field>
      ) : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
          Insert
        </Button>
      </div>
    </form>
  );
}

function Preview({ body, asMessenger }) {
  if (!body.trim()) {
    return <p className="text-sm text-text-tertiary">Nothing to preview yet.</p>;
  }
  return (
    <MarkdownView
      text={body}
      variant={asMessenger ? "message" : "article"}
      className={ARTICLE_PROSE_CLASS}
    />
  );
}

// selectionRef, when given, tracks the body selection so AI assist can act on it.
export function MarkdownEditor({ summary, body, onSummaryChange, onBodyChange, selectionRef }) {
  const bodyRef = useRef(null);
  const pendingSelection = useRef(null);
  const [mode, setMode] = useState(initialMode);
  const [asMessenger, setAsMessenger] = useState(false);
  const [popover, setPopover] = useState(null);

  // Restore the selection a toolbar edit asked for, once the controlled value has rendered.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    const sel = pendingSelection.current;
    if (!el || !sel) return;
    pendingSelection.current = null;
    el.focus();
    el.setSelectionRange(sel.start, sel.end);
  }, [body]);

  // Grow with the content so the page, not the textarea, scrolls.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [body, mode]);

  function apply(edit) {
    if (!edit) return;
    pendingSelection.current = { start: edit.start, end: edit.end };
    onBodyChange(edit.value);
  }

  function runTool(tool) {
    if (tool.popover) setPopover(tool.popover);
    else apply(tool.run(bodyRef));
  }

  function insertUrl({ url, alt }) {
    const kind = popover;
    setPopover(null);
    if (kind === "image") apply(insertBlock(bodyRef, `![${alt}](${url})`));
    else apply(wrapSelection(bodyRef, "[", `](${url})`, "link text"));
  }

  function onKeyDown(e) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    const byKey = (k) => TOOLS.find((t) => t.key === k);
    let tool = null;
    if (!e.shiftKey && key === "b") tool = byKey("bold");
    else if (!e.shiftKey && key === "i") tool = byKey("italic");
    else if (!e.shiftKey && key === "k") tool = byKey("link");
    else if (e.shiftKey && e.code === "Digit8") tool = byKey("ul");
    else if (e.shiftKey && e.code === "Digit7") tool = byKey("ol");
    if (!tool) return;
    e.preventDefault();
    // Keeps ⌘K on the link popover instead of also toggling the topbar's command palette.
    e.stopPropagation();
    runTool(tool);
  }

  const writer = (
    <div className="space-y-3">
      <Popover open={!!popover} onOpenChange={(open) => !open && setPopover(null)}>
        <PopoverAnchor asChild>
          <div
            role="toolbar"
            aria-label="Formatting"
            className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-surface-subtle p-1"
          >
            {TOOLS.map((tool) => (
              <ToolButton key={tool.key} tool={tool} onClick={() => runTool(tool)} />
            ))}
          </div>
        </PopoverAnchor>
        <PopoverContent align="start" className="w-80 border-border bg-surface-subtle">
          {popover ? (
            <UrlForm key={popover} kind={popover} onInsert={insertUrl} onCancel={() => setPopover(null)} />
          ) : null}
        </PopoverContent>
      </Popover>
      <Textarea
        ref={bodyRef}
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        onKeyDown={onKeyDown}
        onSelect={(e) => {
          if (selectionRef) selectionRef.current = { start: e.target.selectionStart, end: e.target.selectionEnd };
        }}
        placeholder="Write the article in markdown…"
        aria-label="Article body"
        spellCheck
        className="min-h-[480px] resize-none overflow-hidden font-mono text-[13px] leading-6"
      />
    </div>
  );

  const preview = (
    <div className="rounded-xl border border-border bg-surface-subtle p-5">
      {!MESSENGER_RICH_ARTICLES ? (
        <label className="mb-4 flex items-center gap-2 text-xs text-text-secondary">
          <Switch checked={asMessenger} onCheckedChange={setAsMessenger} />
          As the Messenger shows it today
        </label>
      ) : null}
      <Preview body={body} asMessenger={asMessenger} />
    </div>
  );

  return (
    <div className="space-y-5">
      <Field label="Description — shown under the title in the Messenger">
        <Textarea
          value={summary}
          rows={2}
          onChange={(e) => onSummaryChange(e.target.value)}
          placeholder="A one-line summary of what this article answers"
          className="min-h-0 resize-none"
        />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs tabs={MODES} value={mode} onChange={setMode} />
      </div>

      {mode !== "preview" && !MESSENGER_RICH_ARTICLES ? <Notice>{RICH_NOTICE}</Notice> : null}

      <div className={cn(mode === "split" && "grid gap-5 xl:grid-cols-2")}>
        {mode !== "preview" ? writer : null}
        {mode !== "write" ? preview : null}
      </div>
    </div>
  );
}

export default MarkdownEditor;
