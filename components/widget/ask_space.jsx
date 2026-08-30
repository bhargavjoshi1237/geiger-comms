"use client";

// AI "Ask" space — the answer card layout from the spec. Instead of long chat
// bubbles, the AI returns a single AnswerCard payload:
//   { query, summary, steps[], sources[], followUps[], hero, topArticles[] }
// The view reads top-down: greeting + match summary, numbered step list with
// citations, a sources rail, related follow-up chips, and at the bottom a
// sticky AskBar that grows upward while typing and collapses back into a pill.
//
// A failed ask falls back to a "we couldn't reach Aria" card with a Talk to
// person option; the upstream layer is allowed to take over hand-over.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpCircle,
  ChevronLeft,
  ArrowUpIcon,
  SparklesIcon,
  Spinner,
  LoadingState,
  ErrorState,
  SearchIcon,
} from "./widget_primitives";

function initials(name) {
  return (name?.match(/\S/g) || ["A"]).slice(0, 2).join("").toUpperCase();
}

export function AskSpace({ getApi, route, navigate, postToHost }) {
  const query = route.query || "";
  const initialQuery = useMemo(() => query, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [askbarOpen, setAskbarOpen] = useState(false);
  const inputRef = useRef(null);
  const requestedAt = useRef(initialQuery);

  const ask = useCallback(
    (q) => {
      const text = (q ?? "").trim();
      if (!text) return;
      requestedAt.current = text;
      setLoading(true);
      setAnswer(null);
      setFailed(false);
      navigate({ space: "ask", query: text });
      getApi()
        ?.ask(text)
        .then((card) => {
          if (requestedAt.current !== text) return;
          if (!card) {
            setFailed(true);
            setLoading(false);
            return;
          }
          setAnswer(card);
          setLoading(false);
        })
        .catch(() => {
          if (requestedAt.current !== text) return;
          setFailed(true);
          setLoading(false);
        });
    },
    [getApi, navigate],
  );

  useEffect(() => {
    if (!initialQuery) {
      setLoading(false);
      return;
    }
    ask(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function followUp(text) {
    setAskbarOpen(false);
    setDraft("");
    ask(text);
  }

  function submit(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    const text = draft.trim();
    followUp(text);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="Back to Home"
            onClick={() => navigate({ space: "home" })}
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-surface-hover"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
            <SparklesIcon className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-semibold leading-tight">Aria</span>
            <span className="text-[11px] text-muted-foreground">
              {failed
                ? "Couldn't reach Aria"
                : loading
                  ? "Thinking…"
                  : "Northwind · answers in seconds"}
            </span>
          </span>
        </span>
        <button
          type="button"
          onClick={() => navigate({ space: "messages", draft: `I'd like to talk to a person about: ${query}` })}
          className="rounded-full border border-border px-3 py-1.5 text-[11px] font-medium hover:bg-surface-hover"
        >
          Get a human
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-32 pt-3">
        {/* The user's question, rendered as a single bubble for context. */}
        {initialQuery ? (
          <div className="ml-auto mb-4 max-w-[80%] rounded-2xl bg-surface-card px-3 py-2 text-sm">
            {initialQuery}
          </div>
        ) : null}

        {/* The answer card itself */}
        {loading ? (
          <LoadingState label="Aria is reading your question…" />
        ) : failed ? (
          <ErrorState
            title="Aria is offline"
            hint="A teammate can pick this up right now."
            onRetry={() => navigate({ space: "messages", draft: `I'd like help with: ${query}` })}
          />
        ) : answer ? (
          <AnswerCard answer={answer} onFollowUp={followUp} onOpenArticle={(id) => navigate({ space: "help", articleId: id })} />
        ) : (
          <p className="text-sm text-muted-foreground">Type a question to start.</p>
        )}
      </main>

      {/* The sticky AskBar — collapsed pill (left) and typing / expanded state. */}
      <div className="sticky bottom-0 z-10 border-t border-border bg-background/80 px-3 py-3 backdrop-blur">
        {!askbarOpen ? (
          <button
            type="button"
            onClick={() => {
              setAskbarOpen(true);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            className="flex w-full items-center gap-2.5 rounded-full border border-border bg-surface-card py-2.5 pr-3 pl-4 text-left text-sm hover:bg-surface-hover"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-primary">
              <SparklesIcon className="h-3.5 w-3.5" />
            </span>
            <span className="text-muted-foreground">Ask Aria anything…</span>
          </button>
        ) : (
          <form onSubmit={submit} className="flex items-end gap-2">
            <div className="flex min-h-[44px] flex-1 items-end gap-2 rounded-2xl border border-border bg-surface-card px-3 py-2 focus-within:border-border-strong">
              <SearchIcon className="mb-2 h-4 w-4 text-muted-foreground" />
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(e);
                  }
                  if (e.key === "Escape") {
                    setAskbarOpen(false);
                  }
                }}
                placeholder="Ask Aria anything…"
                rows={1}
                className="min-h-[24px] w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <button
              type="submit"
              aria-label="Send"
              disabled={!draft.trim()}
              className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            >
              <ArrowUpIcon className="h-4 w-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function AnswerCard({ answer, onFollowUp, onOpenArticle }) {
  const summary = answer.summary || "";
  const steps = answer.steps || [];
  const sources = answer.sources || [];
  const followUps = answer.followUps || [];
  const articles = answer.topArticles || [];

  return (
    <article className="space-y-4">
      <header>
        <h1 className="text-[15px] font-semibold leading-snug">{summary.split("\n")[0]}</h1>
        {summary.split("\n").slice(1).join("\n").trim() ? (
          <p className="mt-2 text-sm leading-relaxed text-foreground/90">
            {summary.split("\n").slice(1).join("\n").trim()}
          </p>
        ) : null}
      </header>

      {steps.length ? (
        <section>
          <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Try this
          </h2>
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3 rounded-lg bg-surface-card px-3 py-2 text-sm">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{step.text}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {sources.length ? (
        <section>
          <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Sources
          </h2>
          <ul className="flex flex-col gap-1.5">
            {sources.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => s.articleId && onOpenArticle(s.articleId)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-hover"
                >
                  <span className="grid h-5 w-5 place-items-center rounded bg-surface-subtle text-[10px] font-bold uppercase text-muted-foreground">
                    {s.icon || "📄"}
                  </span>
                  <span className="flex-1 truncate font-medium">{s.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {followUps.length ? (
        <section>
          <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Was this helpful?
          </h2>
          <div className="flex flex-wrap gap-2">
            {followUps.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onFollowUp(c.label)}
                className="rounded-full border border-border bg-surface-card px-3 py-1.5 text-[12px] font-medium hover:bg-surface-hover"
              >
                {c.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {articles.length ? (
        <section className="rounded-lg border border-border bg-surface-card p-3">
          <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Related articles
          </h3>
          <ul className="mt-2 flex flex-col">
            {articles.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onOpenArticle(a.id)}
                  className="flex w-full items-center justify-between py-1.5 text-left text-[13px] hover:underline"
                >
                  <span className="truncate font-medium">{a.title}</span>
                  <span className="ml-3 text-[11px] text-muted-foreground">
                    {Math.max(1, Math.round((a.readMinutes || 1)))} min read
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
