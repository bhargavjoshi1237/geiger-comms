"use client";

// AI suggestion (KB spec §9.6): runs one assist request and shows the result for review. Nothing applies until the
// author picks an apply action; links and images the model added are already removed and listed here.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, RotateCw, ShieldAlert } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  LogoLoading,
  RadioGroup,
  RadioGroupItem,
} from "@geiger/ui";
import { Notice } from "@/components/internal/shared/notice";
import { MarkdownView } from "@/components/widget/markdown_view";
import { assist } from "@/lib/supabase/ai";
import { ARTICLE_PROSE_CLASS } from "./constants";
import { DiffView } from "./history_section";

export const ASSIST_LABELS = {
  draft: "Draft article",
  improve: "Improve writing",
  shorten: "Shorten",
  expand: "Expand",
  fix: "Fix spelling & grammar",
  tone: "Change tone",
  description: "Write description",
  titles: "Suggest titles",
  translate: "Translate with AI",
  suggest_edit: "Suggest edit",
};

const PRIMARY = "bg-primary text-primary-foreground hover:bg-primary/90";
const OUTLINE = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

const ERROR_COPY = {
  input_too_long: "That's too much text for one request — select a shorter passage.",
};

function copyText(output, result, choice) {
  if (output === "article") return [result.title, result.summary, result.body].filter(Boolean).join("\n\n");
  if (output === "summary") return result.summary;
  if (output === "titles") return choice || result.titles.join("\n");
  return result.text;
}

function ResultView({ output, result, choice, onChoice, compareTo }) {
  if (compareTo !== undefined) return <DiffView before={compareTo} after={result.text} />;
  if (output === "titles") {
    return (
      <RadioGroup value={choice ?? ""} onValueChange={onChoice}>
        {result.titles.map((title, i) => (
          <div key={title} className="flex items-center gap-2.5">
            <RadioGroupItem value={title} id={`title-${i}`} />
            <Label htmlFor={`title-${i}`} className="text-sm font-normal text-foreground">
              {title}
            </Label>
          </div>
        ))}
      </RadioGroup>
    );
  }
  if (output === "summary") return <p className="text-sm text-foreground">{result.summary}</p>;
  if (output === "article") {
    return (
      <div className="space-y-3">
        {result.title ? <h3 className="text-lg font-semibold text-foreground">{result.title}</h3> : null}
        {result.summary ? <p className="text-sm text-text-secondary">{result.summary}</p> : null}
        <MarkdownView text={result.body} variant="article" className={ARTICLE_PROSE_CLASS} />
      </div>
    );
  }
  return <MarkdownView text={result.text} variant="article" className={ARTICLE_PROSE_CLASS} />;
}

// Starts the model call from the click that asked for it, so a remounting dialog never sends it twice.
export function startAssist(request) {
  return { ...request, promise: assist(request.body) };
}

// request comes from startAssist (createLabel: a gap's new-article draft; compareTo: diff a suggested edit); onApply(mode, result, { provider, model }) -> boolean
export function AiSuggestionDialog({ request, onClose, onApply }) {
  const [pending, setPending] = useState(() => request.promise);
  const [response, setResponse] = useState(null);
  const [choice, setChoice] = useState(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let alive = true;
    pending.then((res) => alive && setResponse(res));
    return () => {
      alive = false;
    };
  }, [pending]);

  const loading = !response;
  const failed = response && !response.ok;
  const done = response?.ok ? response : null;

  function retry() {
    setResponse(null);
    setPending(assist(request.body));
  }

  async function apply(mode) {
    setApplying(true);
    const ok = await onApply(mode, mode === "title" ? { title: choice } : done.result, {
      provider: done.provider,
      model: done.model,
    });
    setApplying(false);
    if (ok) onClose();
  }

  function copy() {
    navigator.clipboard?.writeText(copyText(done.output, done.result, choice)).then(
      () => toast.success("Copied"),
      () => toast.error("Couldn't copy the text."),
    );
  }

  let actions = null;
  if (done) {
    const { action } = request;
    if (action === "draft" && request.createLabel) {
      actions = (
        <Button className={PRIMARY} disabled={applying} onClick={() => apply("create")}>
          {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {request.createLabel}
        </Button>
      );
    } else if (action === "suggest_edit") {
      actions = (
        <Button className={PRIMARY} disabled={applying} onClick={() => apply("accept_edit")}>
          {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Accept as draft
        </Button>
      );
    } else if (action === "draft") {
      actions = (
        <Button className={PRIMARY} disabled={applying || !request.bodyEmpty} onClick={() => apply("draft")}>
          Use this draft
        </Button>
      );
    } else if (action === "translate") {
      actions = (
        <Button className={PRIMARY} disabled={applying} onClick={() => apply("translation")}>
          {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Create {request.targetLabel} draft
        </Button>
      );
    } else if (action === "description") {
      actions = (
        <Button className={PRIMARY} disabled={applying} onClick={() => apply("description")}>
          Use as description
        </Button>
      );
    } else if (action === "titles") {
      actions = (
        <Button className={PRIMARY} disabled={applying || !choice} onClick={() => apply("title")}>
          Use title
        </Button>
      );
    } else {
      actions = (
        <>
          <Button variant="outline" className={OUTLINE} disabled={applying} onClick={() => apply("insert")}>
            Insert below
          </Button>
          <Button className={PRIMARY} disabled={applying} onClick={() => apply("replace")}>
            {request.hasSelection ? "Replace selection" : "Replace body"}
          </Button>
        </>
      );
    }
  }

  const removed = done?.removedLinks ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && !applying && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ASSIST_LABELS[request.action]}</DialogTitle>
          <DialogDescription>
            {done
              ? `Generated by ${done.provider} · ${done.model}. Review before publishing.`
              : "Your AI provider is writing a suggestion. Nothing changes until you apply it."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LogoLoading size={40} aria-label="Generating a suggestion" />
          </div>
        ) : failed ? (
          <Notice
            icon={ShieldAlert}
            action={
              <Button variant="outline" size="sm" className={OUTLINE} onClick={retry}>
                <RotateCw className="h-3.5 w-3.5" /> Retry
              </Button>
            }
          >
            {ERROR_COPY[response.code] ?? response.message}
          </Notice>
        ) : (
          <div className="space-y-4">
            {removed.length ? (
              <Notice icon={ShieldAlert}>
                Removed {removed.length} {removed.length === 1 ? "link" : "links"} the model added:{" "}
                <span className="font-mono">{removed.map((r) => r.url).join(", ")}</span>
              </Notice>
            ) : null}
            <div className="rounded-xl border border-border bg-surface-subtle p-5">
              <ResultView
                output={done.output}
                result={done.result}
                choice={choice}
                onChoice={setChoice}
                compareTo={request.compareTo}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" disabled={applying} onClick={onClose}>
            Discard
          </Button>
          {done ? (
            <Button variant="outline" className={OUTLINE} onClick={copy}>
              <Copy className="h-4 w-4" /> Copy
            </Button>
          ) : null}
          {actions}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AiSuggestionDialog;
