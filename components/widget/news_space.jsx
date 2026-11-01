"use client";

// News (spec §9) — published posts with a simple reader, in the help centre's row idiom. Bodies render through MarkdownView.

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, ErrorState, HeaderBar, LoadingState, PageHead } from "./widget_primitives";
import { MarkdownView } from "./markdown_view";

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function NewsSpace({ getApi, route, navigate, postToHost, sessionKey }) {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    getApi()
      ?.news()
      .then((result) => {
        setRows(Array.isArray(result) ? result : []);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [getApi]);

  useEffect(() => {
    load();
  }, [load, sessionKey]);

  const retry = () => {
    setFailed(false);
    setRows(null);
    load();
  };

  const post = route.postId ? rows?.find((p) => p.id === route.postId) : null;
  const close = () => postToHost?.("close");

  if (route.postId) {
    return (
      <>
        <HeaderBar onBack={() => navigate({ space: "news" })} backLabel="Back to news" onClose={close}>
          <span className="gc-bar__crumb">News</span>
        </HeaderBar>
        {rows === null && !failed ? (
          <div className="gc-panel__body">
            <LoadingState label="Loading update" />
          </div>
        ) : failed ? (
          <div className="gc-panel__body">
            <ErrorState title="Couldn't load this update" onRetry={retry} />
          </div>
        ) : !post ? (
          <div className="gc-panel__body">
            <ErrorState
              title="Update not found"
              onRetry={() => navigate({ space: "news" })}
              retryLabel="Back to news"
            />
          </div>
        ) : (
          <article className="gc-article">
            <h1 className="gc-article__title">{post.title}</h1>
            <div className="gc-byline">
              <span className="gc-byline__date">{formatDate(post.publishedAt)}</span>
            </div>
            <hr className="gc-article__rule" />
            <MarkdownView text={post.body} variant="article" className="gc-prose" />
          </article>
        )}
      </>
    );
  }

  return (
    <>
      <PageHead title="What’s new" onClose={close} />

      <div className="gc-panel__body gc-help">
        {rows === null && !failed ? (
          <LoadingState label="Loading news…" />
        ) : failed ? (
          <ErrorState title="Couldn't load news" onRetry={retry} />
        ) : rows.length === 0 ? (
          <div className="gc-state">
            <p className="gc-state__title">No updates yet</p>
          </div>
        ) : (
          <div className="gc-articles">
            {rows.map((p) => (
              <button
                key={p.id}
                type="button"
                className="gc-article-row"
                onClick={() => navigate({ space: "news", postId: p.id })}
              >
                <span className="gc-article-row__body">
                  <span className="gc-article-row__meta">{formatDate(p.publishedAt)}</span>
                  <span className="gc-article-row__title">{p.title}</span>
                  {p.summary ? <span className="gc-article-row__desc">{p.summary}</span> : null}
                </span>
                <ChevronRight className="gc-article-row__chev" />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
