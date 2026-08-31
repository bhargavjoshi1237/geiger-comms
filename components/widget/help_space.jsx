"use client";

// Help — the help-centre search and the article reader.
//
// Search is live-filtered against whatever the API returned for the current
// query, with the matched term marked in the title; an "ask <assistant>
// instead" nudge sits above the results and a "can't find it?" footer offers
// the team. The reader adds the category eyebrow, byline and a
// "did this answer your question?" footer.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Cap,
  ChevronRight,
  Clock,
  ErrorState,
  FileText,
  HeaderBar,
  LoadingState,
  Search,
  Sparkles,
  ThumbsUp,
  X,
} from "./widget_primitives";
import { MarkdownView } from "./markdown_view";

// Wraps every case-insensitive hit of `term` in a <mark>.
function highlight(text, term) {
  const q = String(term || "").trim();
  const source = String(text || "");
  if (!q) return source;
  const parts = [];
  const lower = source.toLowerCase();
  const needle = q.toLowerCase();
  let from = 0;
  for (;;) {
    const at = lower.indexOf(needle, from);
    if (at === -1) break;
    if (at > from) parts.push(source.slice(from, at));
    parts.push({ hit: source.slice(at, at + needle.length) });
    from = at + needle.length;
  }
  if (from < source.length) parts.push(source.slice(from));
  return parts.map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <mark key={i}>{p.hit}</mark>));
}

export function HelpSpace({ getApi, config, route, navigate, postToHost }) {
  if (route.articleId) {
    return (
      <ArticleReader
        articleId={route.articleId}
        getApi={getApi}
        assistant={config?.assistantName || "Aria"}
        onBack={() => navigate({ space: "help" })}
        onAskInstead={() => navigate({ space: "ask" })}
      />
    );
  }

  return (
    <HelpCentre
      getApi={getApi}
      assistant={config?.assistantName || "Aria"}
      route={route}
      navigate={navigate}
      postToHost={postToHost}
    />
  );
}

function HelpCentre({ getApi, assistant, route, navigate, postToHost }) {
  const [query, setQuery] = useState(route.query || "");
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);

  // One fetch of the published set; filtering below is local so typing is
  // instant and every keystroke does not become a request.
  const load = useCallback(() => {
    getApi()
      ?.articles?.("")
      .then((result) => {
        setRows(result ?? []);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [getApi]);

  useEffect(() => {
    load();
  }, [load]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!rows) return [];
    if (!q) return rows;
    return rows.filter(
      (a) =>
        String(a.title || "").toLowerCase().includes(q) ||
        String(a.summary || a.body || "").toLowerCase().includes(q) ||
        String(a.collectionTitle || "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <>
      <header className="gc-helphead">
        <div className="gc-helphead__row">
          <span className="gc-listhead__title">Help centre</span>
          <button
            type="button"
            className="gc-iconbtn gc-iconbtn--sm"
            onClick={() => postToHost?.("close")}
            aria-label="Close messenger"
          >
            <X />
          </button>
        </div>
        <div className="gc-search" style={{ marginTop: 0 }}>
          <Search className="gc-search__icon" />
          <input
            type="search"
            className="gc-search__input"
            value={query}
            placeholder="Search for help"
            aria-label="Search the help centre"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </header>

      <div className="gc-panel__body" style={{ padding: "12px 0" }}>
        <button type="button" className="gc-suggest" onClick={() => navigate({ space: "ask", query })}>
          <Sparkles size={15} className="gc-suggest__icon" />
          <div className="gc-suggest__body">
            <p className="gc-suggest__title">Ask {assistant} instead</p>
            <p className="gc-suggest__desc">
              {assistant} checks your actual order rather than the general article.
            </p>
          </div>
          <ChevronRight
            size={14}
            style={{ color: "var(--gc-text-tertiary)", flex: "none", marginTop: 3 }}
          />
        </button>

        {rows === null && !failed ? (
          <LoadingState label="Loading articles…" />
        ) : failed ? (
          <ErrorState title="Couldn't load articles" onRetry={load} />
        ) : results.length === 0 ? (
          <div className="gc-state">
            <p className="gc-state__title">{query ? "No matches" : "No articles yet"}</p>
            {query ? (
              <p className="gc-state__hint">Try a different search — or ask {assistant} instead.</p>
            ) : null}
          </div>
        ) : (
          <>
            <div style={{ padding: "0 14px 6px" }}>
              <Cap>
                {results.length} {results.length === 1 ? "article" : "articles"}
              </Cap>
            </div>

            {results.map((a) => (
              <button
                key={a.id}
                type="button"
                className="gc-article-row"
                onClick={() => navigate({ space: "help", articleId: a.id })}
              >
                <FileText size={14} className="gc-article-row__icon" />
                <span style={{ minWidth: 0 }}>
                  <span className="gc-article-row__title">{highlight(a.title, query)}</span>
                  <span className="gc-article-row__desc">{a.summary || a.body}</span>
                  <span className="gc-article-row__meta">
                    {(a.collectionTitle || "Help").toUpperCase()}
                    {a.readMinutes ? ` · ${a.readMinutes} MIN READ` : ""}
                  </span>
                </span>
              </button>
            ))}
          </>
        )}
      </div>

      <div className="gc-panel__footer gc-helpfoot">
        <span className="gc-helpfoot__text">Can&rsquo;t find it?</span>
        <button
          type="button"
          className="gc-primarybtn"
          onClick={() => navigate({ space: "messages", newAbout: "other", newLabel: "Something else" })}
        >
          Message the team
        </button>
      </div>
    </>
  );
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

function ArticleReader({ articleId, getApi, assistant, onBack, onAskInstead }) {
  const [state, setState] = useState({ status: "loading", article: null });
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    let active = true;
    getApi()
      ?.article(articleId)
      .then((row) => {
        if (!active) return;
        setState(row ? { status: "done", article: row } : { status: "failed", article: null });
      })
      .catch(() => active && setState({ status: "failed", article: null }));
    return () => {
      active = false;
    };
  }, [articleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const article = state.article;

  return (
    <>
      <HeaderBar
        onBack={onBack}
        action={
          article?.url ? (
            <a
              className="gc-iconbtn gc-iconbtn--sm"
              href={article.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              aria-label="Open in help centre"
            >
              <ArrowUpRight />
            </a>
          ) : null
        }
      >
        <span className="gc-header__eyebrow">{(article?.collectionTitle || "Article").toUpperCase()}</span>
      </HeaderBar>

      {state.status === "loading" ? (
        <div className="gc-panel__body">
          <LoadingState label="Loading article…" />
        </div>
      ) : state.status === "failed" ? (
        <div className="gc-panel__body">
          <ErrorState title="Article not found" onRetry={onBack} />
        </div>
      ) : (
        <>
          <article className="gc-article">
            <h2>{article.title}</h2>
            <div className="gc-article__byline">
              <div className="gc-avatar gc-avatar--xs" aria-hidden="true">
                {(article.authorName || "Author").slice(0, 2).toUpperCase()}
              </div>
              <span>
                {(article.authorName || "Author").toUpperCase()} · UPDATED{" "}
                {relativeDay(article.updatedAt).toUpperCase()}
              </span>
            </div>
            <div className="gc-article__divider" />

            <div className="gc-article__p">
              <MarkdownView text={article.body} />
            </div>

            {article.callout ? (
              <aside className="gc-callout">
                <Clock />
                <p>{article.callout}</p>
              </aside>
            ) : null}
          </article>

          <footer className="gc-panel__footer gc-articlefoot">
            <div className="gc-articlefoot__row">
              <span className="gc-articlefoot__label">Did this answer your question?</span>
              <div className="gc-articlefoot__thumbs">
                <button
                  type="button"
                  className="gc-thumb gc-thumb--up"
                  aria-pressed={feedback === "up"}
                  onClick={() => setFeedback("up")}
                  aria-label="Yes"
                >
                  <ThumbsUp size={13} />
                </button>
                <button
                  type="button"
                  className="gc-thumb gc-thumb--down"
                  aria-pressed={feedback === "down"}
                  onClick={() => setFeedback("down")}
                  aria-label="No"
                >
                  <ThumbsUp size={13} />
                </button>
              </div>
            </div>
            <button type="button" className="gc-outlinebtn" onClick={onAskInstead}>
              Ask {assistant} about my order instead
            </button>
          </footer>
        </>
      )}
    </>
  );
}
