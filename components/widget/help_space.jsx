"use client";

// Help (spec §9) — search, collections and a reader over published articles; bodies render through MarkdownView, never raw HTML.
// Filters run locally over the fetched set; the "ask <assistant>" nudge appears only when the server configures an assistant.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AiBadge,
  Avatar,
  BookOpen,
  Cap,
  Check,
  ChevronRight,
  CloseButton,
  CreditCard,
  ErrorState,
  ExternalLink,
  HeaderBar,
  Info,
  LoadingState,
  Plug,
  Rocket,
  Search,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  User,
} from "./widget_primitives";
import { MarkdownView } from "./markdown_view";

const POPULAR_COUNT = 5;

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

// A collection's tile icon, guessed from its name; anything unrecognised gets the book.
function CollectionIcon({ name }) {
  const n = String(name || "").toLowerCase();
  if (/bill|pay|invoice|refund|plan|price/.test(n)) return <CreditCard />;
  if (/account|profile|login|sign|security|password/.test(n)) return <User size={16} />;
  if (/integrat|api|connect|webhook|app/.test(n)) return <Plug />;
  if (/start|onboard|setup|set up|basics|welcome/.test(n)) return <Rocket />;
  return <BookOpen />;
}

export function HelpSpace({ getApi, config, route, navigate, postToHost, sessionKey }) {
  const assistant = config?.assistantName || "";
  const close = () => postToHost?.("close");
  if (route.articleId) {
    return (
      <ArticleReader
        articleId={route.articleId}
        getApi={getApi}
        sessionKey={sessionKey}
        assistant={assistant}
        onBack={() => navigate({ space: "help" })}
        onClose={close}
        onAskInstead={() => navigate({ space: "ask" })}
        onMessageTeam={() => navigate({ space: "messages", compose: true })}
      />
    );
  }

  return (
    <HelpCentre
      getApi={getApi}
      sessionKey={sessionKey}
      assistant={assistant}
      route={route}
      navigate={navigate}
      onClose={close}
    />
  );
}

function HelpCentre({ getApi, sessionKey, assistant, route, navigate, onClose }) {
  const [query, setQuery] = useState(route.query || "");
  const [collection, setCollection] = useState(null);
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);

  // One fetch of the published set; filtering below is local so a keystroke never becomes a request.
  const load = useCallback(() => {
    getApi()
      ?.articles?.("")
      .then((result) => {
        setRows(Array.isArray(result) ? result : []);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [getApi]);

  useEffect(() => {
    load();
  }, [load, sessionKey]);

  const collections = useMemo(() => {
    const counts = new Map();
    for (const a of rows ?? []) {
      const name = String(a.collectionTitle || "").trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts].map(([name, count]) => ({ name, count }));
  }, [rows]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!rows) return [];
    return rows.filter((a) => {
      if (collection && String(a.collectionTitle || "").trim() !== collection) return false;
      if (!q) return true;
      return (
        String(a.title || "").toLowerCase().includes(q) ||
        String(a.summary || a.body || "").toLowerCase().includes(q) ||
        String(a.collectionTitle || "").toLowerCase().includes(q)
      );
    });
  }, [rows, q, collection]);

  const browsing = !q && !collection;
  const shown = browsing ? results.slice(0, POPULAR_COUNT) : results;

  return (
    <>
      <header className="gc-helphead">
        <div className="gc-helphead__row">
          <h1 className="gc-pagehead__title">Help centre</h1>
          <CloseButton onClose={onClose} />
        </div>
        <label className="gc-search">
          <Search />
          <span className="gc-sr">Search articles</span>
          <input
            type="search"
            className="gc-search__input"
            value={query}
            placeholder="Search articles"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </header>

      <div className="gc-panel__body gc-help">
        {rows === null && !failed ? (
          <LoadingState label="Loading articles…" />
        ) : failed ? (
          <ErrorState
            title="Couldn't load articles"
            onRetry={() => {
              setFailed(false);
              setRows(null);
              load();
            }}
          />
        ) : (
          <>
            {browsing && collections.length ? (
              <section className="gc-section">
                <div className="gc-section__head">
                  <Cap>Collections</Cap>
                </div>
                <div className="gc-collections">
                  {collections.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      className="gc-collection"
                      onClick={() => setCollection(c.name)}
                    >
                      <span className="gc-collection__tile" aria-hidden="true">
                        <CollectionIcon name={c.name} />
                      </span>
                      <span className="gc-collection__text">
                        <span className="gc-collection__name">{c.name}</span>
                        <span className="gc-collection__count">
                          {c.count} {c.count === 1 ? "article" : "articles"}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {assistant && q ? (
              <button type="button" className="gc-linkcard" onClick={() => navigate({ space: "ask", query })}>
                <span className="gc-linkcard__tile" aria-hidden="true">
                  <Sparkles size={16} />
                </span>
                <span className="gc-linkcard__text">
                  <span className="gc-linkcard__title">
                    Ask {assistant} instead
                    <AiBadge />
                  </span>
                  <span className="gc-linkcard__sub">{assistant} is our AI assistant and answers in seconds.</span>
                </span>
                <ChevronRight className="gc-linkcard__chev" />
              </button>
            ) : null}

            <section className="gc-section">
              <div className="gc-section__head">
                <Cap>
                  {browsing
                    ? "Popular"
                    : collection && !q
                      ? collection
                      : `${results.length} ${results.length === 1 ? "result" : "results"}`}
                </Cap>
                {collection ? (
                  <button type="button" className="gc-link" onClick={() => setCollection(null)}>
                    All articles
                  </button>
                ) : null}
              </div>

              {shown.length === 0 ? (
                <div className="gc-state gc-state--inline">
                  <p className="gc-state__title">{q ? "No matches" : "No articles yet"}</p>
                  {q ? (
                    <p className="gc-state__hint">
                      Try a different search{assistant ? `, or ask ${assistant} instead` : ", or message the team"}.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="gc-articles">
                  {shown.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="gc-article-row"
                      onClick={() => navigate({ space: "help", articleId: a.id })}
                    >
                      <span className="gc-article-row__body">
                        <span className="gc-article-row__title">{highlight(a.title, query)}</span>
                        {q && (a.summary || a.body) ? (
                          <span className="gc-article-row__desc">{a.summary || a.body}</span>
                        ) : null}
                        <span className="gc-article-row__meta">
                          {a.collectionTitle || "Help"}
                          {a.readMinutes ? ` · ${a.readMinutes} min read` : ""}
                        </span>
                      </span>
                      <ChevronRight className="gc-article-row__chev" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <div className="gc-helpcta">
          <span className="gc-helpcta__text">Can&rsquo;t find what you need?</span>
          <button
            type="button"
            className="gc-btn gc-btn--outline gc-btn--sm"
            onClick={() => navigate({ space: "messages", compose: true })}
          >
            Message the team
          </button>
        </div>
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
    return d.toLocaleDateString([], { day: "numeric", month: "short" });
  } catch {
    return "recently";
  }
}

function ArticleReader({ articleId, getApi, sessionKey, assistant, onBack, onClose, onAskInstead, onMessageTeam }) {
  const [state, setState] = useState({ status: "loading", article: null });
  const [vote, setVote] = useState(null);

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
  }, [articleId, getApi, sessionKey]);

  const article = state.article;
  const href = typeof article?.url === "string" && /^https?:\/\//i.test(article.url) ? article.url : null;

  return (
    <>
      <HeaderBar
        onBack={onBack}
        backLabel="Back to help centre"
        onClose={onClose}
        action={
          href ? (
            <a
              className="gc-iconbtn"
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              aria-label="Open article in a new tab"
            >
              <ExternalLink />
            </a>
          ) : null
        }
      >
        <span className="gc-bar__crumb">
          Help centre{article?.collectionTitle ? ` / ${article.collectionTitle}` : ""}
        </span>
      </HeaderBar>

      {state.status === "loading" ? (
        <div className="gc-panel__body gc-panel__body--stack">
          <LoadingState label="Loading article…" />
        </div>
      ) : state.status === "failed" ? (
        <div className="gc-panel__body gc-panel__body--stack">
          <ErrorState
            title="Article not found"
            hint="It may have been moved or unpublished."
            onRetry={onBack}
            retryLabel="Back to help"
          />
        </div>
      ) : (
        <>
          <article className="gc-article">
            <h1 className="gc-article__title">{article.title}</h1>
            <div className="gc-byline">
              {article.authorName ? (
                <>
                  <Avatar name={article.authorName} size="xs" />
                  <span className="gc-byline__name">{article.authorName}</span>
                  <span className="gc-byline__dot" aria-hidden="true" />
                </>
              ) : null}
              <span className="gc-byline__date">Updated {relativeDay(article.updatedAt)}</span>
            </div>
            <hr className="gc-article__rule" />

            <MarkdownView text={article.body} variant="article" className="gc-prose" />

            {article.callout ? (
              <aside className="gc-callout">
                <Info />
                <p>{article.callout}</p>
              </aside>
            ) : null}
          </article>

          <footer className="gc-articlefoot">
            {vote === null ? (
              <>
                <span className="gc-articlefoot__q">Did this answer your question?</span>
                <button type="button" className="gc-vote" onClick={() => setVote("up")} aria-label="Yes, it helped">
                  <ThumbsUp />
                </button>
                <button
                  type="button"
                  className="gc-vote"
                  onClick={() => setVote("down")}
                  aria-label="No, it didn't help"
                >
                  <ThumbsDown />
                </button>
              </>
            ) : vote === "up" ? (
              <span className="gc-articlefoot__q gc-articlefoot__thanks" role="status">
                <Check />
                Thanks for letting us know.
              </span>
            ) : (
              <>
                <span className="gc-articlefoot__sorry">Sorry about that.</span>
                <button
                  type="button"
                  className="gc-btn gc-btn--accent gc-btn--md"
                  onClick={assistant ? onAskInstead : onMessageTeam}
                >
                  {assistant ? `Ask ${assistant}` : "Message the team"}
                </button>
              </>
            )}
          </footer>
        </>
      )}
    </>
  );
}
