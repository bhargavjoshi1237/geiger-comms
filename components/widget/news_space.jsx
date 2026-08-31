"use client";

// News — published posts with a simple reader. The canvas never drew this
// space, so it borrows the help centre's row idiom rather than inventing a
// third list style.

import { useCallback, useEffect, useState } from "react";
import { ErrorState, FileText, HeaderBar, LoadingState } from "./widget_primitives";
import { MarkdownView } from "./markdown_view";

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function NewsSpace({ getApi, route, navigate }) {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    getApi()
      ?.news()
      .then((result) => {
        setRows(result ?? []);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [getApi]);

  useEffect(() => {
    load();
  }, [load]);

  const post = route.postId ? rows?.find((p) => p.id === route.postId) : null;

  if (route.postId) {
    return (
      <>
        <HeaderBar onBack={() => navigate({ space: "news" })}>
          <span className="gc-header__eyebrow">UPDATE</span>
        </HeaderBar>
        {rows === null ? (
          <div className="gc-panel__body">
            <LoadingState label="Loading…" />
          </div>
        ) : !post ? (
          <div className="gc-panel__body">
            <ErrorState title="Post not found" onRetry={() => navigate({ space: "news" })} />
          </div>
        ) : (
          <article className="gc-article">
            <h2>{post.title}</h2>
            <div className="gc-article__byline">
              <span>{formatDate(post.publishedAt).toUpperCase()}</span>
            </div>
            <div className="gc-article__divider" />
            <div className="gc-article__p">
              <MarkdownView text={post.body} />
            </div>
          </article>
        )}
      </>
    );
  }

  return (
    <>
      <header className="gc-listhead">
        <span className="gc-listhead__title">What&rsquo;s new</span>
      </header>

      <div className="gc-panel__body" style={{ padding: "12px 0" }}>
        {rows === null && !failed ? (
          <LoadingState label="Loading news…" />
        ) : failed ? (
          <ErrorState title="Couldn't load news" onRetry={load} />
        ) : rows.length === 0 ? (
          <div className="gc-state">
            <p className="gc-state__title">No updates yet</p>
          </div>
        ) : (
          rows.map((p) => (
            <button
              key={p.id}
              type="button"
              className="gc-article-row"
              onClick={() => navigate({ space: "news", postId: p.id })}
            >
              <FileText size={14} className="gc-article-row__icon" />
              <span style={{ minWidth: 0 }}>
                <span className="gc-article-row__title">{p.title}</span>
                {p.summary ? <span className="gc-article-row__desc">{p.summary}</span> : null}
                <span className="gc-article-row__meta">{formatDate(p.publishedAt).toUpperCase()}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </>
  );
}
