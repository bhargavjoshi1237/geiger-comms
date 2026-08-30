"use client";

// Help space (§9): search → article reader. Two entry points:
//   • search-as-you-type surfaces "Ask Aria instead" when the typing is
//     conversational enough to benefit from the AI path
//   • the article reader exposes author + last updated + FAQ callouts and
//     offers a contextual "Ask about my order instead" deep link
//
// Search results carry the query they belong to, so a new query renders as
// loading without synchronous effect resets.

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  SparklesIcon,
  SearchIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  LoadingState,
  EmptyState,
  ErrorState,
} from "./widget_primitives";
import { MarkdownView } from "./markdown_view";

export function HelpSpace({ getApi, route, navigate }) {
  const [tab, setTab] = useState(route.articleId ? "article" : "list");
  const [query, setQuery] = useState(route.query || "");

  // Whenever the route changes, snap tabs back into alignment.
  useEffect(() => {
    setTab(route.articleId ? "article" : "list");
    setQuery(route.query || "");
  }, [route.articleId, route.query]);

  if (route.articleId) {
    return (
      <ArticleReader
        articleId={route.articleId}
        getApi={getApi}
        onBack={() => navigate({ space: "help" })}
        onAskAria={(q) => navigate({ space: "ask", query: q })}
        onAskOrder={() => navigate({ space: "messages", newAbout: "order", newLabel: "An order" })}
      />
    );
  }

  return (
    <HelpCentre
      query={query}
      setQuery={setQuery}
      navigate={navigate}
      getApi={getApi}
      route={route}
    />
  );
}

function HelpCentre({ query, setQuery, navigate, getApi, route }) {
  const [result, setResult] = useState(null); // { query, rows }
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const q = route.query || "";
    let active = true;
    setFailed(false);
    getApi()
      ?.articles?.(q)
      .then((rows) => {
        if (active) setResult({ query: q, rows: rows ?? [] });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [route.query]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentQuery = route.query || "";
  const loading = !failed && (!result || result.query !== currentQuery);
  const showAriaPrompt = currentQuery && currentQuery.split(/\s+/).length >= 2;

  function search(q) {
    if (q === currentQuery) return;
    navigate({ space: "help", query: q });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Back"
            onClick={() => navigate({ space: "home" })}
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-surface-hover"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h1 className="text-sm font-semibold">Help centre</h1>
        </span>
        <button
          type="button"
          aria-label="Close"
          onClick={() => navigate({ space: "home" })}
          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-surface-hover"
        >
          <ChevronUp className="h-4 w-4 rotate-45" />
        </button>
      </header>

      <div className="px-4 pb-4 pt-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            search(query);
          }}
          className="relative"
        >
          <SearchIcon className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles…"
            className="w-full rounded-full border border-border bg-surface-card py-2 pr-3 pl-9 text-sm outline-none focus:border-border-strong"
          />
        </form>

        {showAriaPrompt ? (
          <button
            type="button"
            onClick={() => navigate({ space: "ask", query: currentQuery })}
            className="mt-3 flex w-full items-center gap-3 rounded-lg border border-border bg-surface-card p-3 text-left hover:bg-surface-hover"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
              <SparklesIcon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Ask Aria instead</span>
              <span className="text-[12px] text-muted-foreground">
                Aria will check the actual order rather than the general article.
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ) : null}
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <LoadingState label="Loading articles…" />
        ) : failed ? (
          <ErrorState title="Couldn't load articles" onRetry={() => search(currentQuery)} />
        ) : result.rows.length === 0 ? (
          <EmptyState
            title={currentQuery ? "No matches" : "No articles yet"}
            hint={currentQuery ? "Try a different search — or ask Aria instead." : undefined}
          />
        ) : (
          <>
            <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {result.rows.length} {result.rows.length === 1 ? "article" : "articles"}
            </h2>
            <ul className="flex flex-col">
              {result.rows.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => navigate({ space: "help", articleId: a.id })}
                    className="flex w-full items-start gap-3 border-b border-border px-1 py-3 text-left hover:bg-surface-hover"
                  >
                    <span className="mt-0.5 grid h-7 w-7 place-items-center rounded bg-surface-card text-[10px] font-semibold uppercase text-muted-foreground">
                      📄
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.title}</span>
                      <span className="line-clamp-2 text-[12px] text-muted-foreground">
                        {highlight(a.summary || a.body, currentQuery)}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        {a.collectionTitle ? <span>{a.collectionTitle}</span> : null}
                        {a.readMinutes ? <span>· {a.readMinutes} min read</span> : null}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

function highlight(text, q) {
  if (!q) return text;
  const re = new RegExp(`(${q.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")})`, "ig");
  const parts = text.split(re);
  return parts.map((p, i) =>
    re.test(p) ? <mark key={i} className="rounded bg-primary/15 px-0.5 text-foreground">{p}</mark> : p,
  );
}

function ArticleReader({ articleId, getApi, onBack, onAskAria, onAskOrder }) {
  const [state, setState] = useState({ status: "loading", article: null });
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    let active = true;
    getApi()
      .article(articleId)
      .then((row) => {
        if (!active) return;
        setState(row ? { status: "done", article: row } : { status: "failed", article: null });
      })
      .catch(() => active && setState({ status: "failed", article: null }));
    return () => {
      active = false;
    };
  }, [articleId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Back"
            onClick={onBack}
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-surface-hover"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {state.article?.collectionTitle || "Article"}
          </span>
        </span>
        <button
          type="button"
          onClick={onAskAria}
          className="flex items-center gap-1 rounded-full border border-border bg-surface-card px-2.5 py-1 text-[11px] font-medium hover:bg-surface-hover"
        >
          <SparklesIcon className="h-3.5 w-3.5 text-primary" />
          Ask Aria
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {state.status === "loading" ? (
          <LoadingState label="Loading article…" />
        ) : state.status === "failed" ? (
          <ErrorState title="Article not found" onRetry={onBack} />
        ) : (
          <article>
            <h1 className="text-lg font-semibold leading-tight">{state.article.title}</h1>
            <div className="mt-2 flex items-center gap-2 border-b border-border pb-3 text-[11px] text-muted-foreground">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-surface-card text-[10px] font-bold uppercase">
                {initials(state.article.authorName || "Author")}
              </span>
              <span className="font-semibold text-foreground">{state.article.authorName || "Author"}</span>
              <span>·</span>
              <span>Updated {relativeDay(state.article.updatedAt)}</span>
            </div>

            <div className="mt-3">
              <MarkdownView text={state.article.body} />
            </div>

            {state.article.callout ? (
              <aside className="mt-5 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[12px] text-amber-200">
                <span className="mt-0.5 text-lg">ⓘ</span>
                <span>{state.article.callout}</span>
              </aside>
            ) : null}

            <section className="mt-8">
              <p className="mb-2 text-[13px] font-medium">Did this answer your question?</p>
              <div className="flex items-center gap-2">
                <FeedbackButton
                  icon={<ThumbsUpIcon className="h-4 w-4" />}
                  active={feedback === "up"}
                  onClick={() => setFeedback("up")}
                  aria-label="Helpful"
                />
                <FeedbackButton
                  icon={<ThumbsDownIcon className="h-4 w-4" />}
                  active={feedback === "down"}
                  onClick={() => setFeedback("down")}
                  aria-label="Not helpful"
                />
              </div>
            </section>

            <button
              type="button"
              onClick={onAskOrder}
              className="mt-6 w-full rounded-full border border-border bg-surface-card py-2.5 text-sm font-medium hover:bg-surface-hover"
            >
              Ask about my order instead
            </button>
          </article>
        )}
      </main>
    </div>
  );
}

function FeedbackButton({ icon, onClick, active, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded-full border ${
        active ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface-card text-muted-foreground hover:bg-surface-hover"
      }`}
      {...rest}
    >
      {icon}
    </button>
  );
}

function initials(name) {
  return (name?.match(/\S/g) || ["?"]).slice(0, 2).join("").toUpperCase();
}

function relativeDay(iso) {
  if (!iso) return "recently";
  try {
    const d = new Date(iso);
    const days = Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (days < 1) return "today";
    if (days < 2) return "yesterday";
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "recently";
  }
}
