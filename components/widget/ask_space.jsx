"use client";

// Ask — the AI thread. The API answers with a card
// ({ summary, steps, sources, followUps, topArticles }); the screen renders it
// as one assistant bubble in the drawn thread, with the numbered steps and the
// cited sources inside it, follow-ups as quick replies underneath, and the
// standard composer with the AI disclosure note below the box.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AiBadge,
  Cap,
  ErrorState,
  FileText,
  HeaderBar,
  LoadingState,
  Sparkles,
  ThumbsUp,
  User,
} from "./widget_primitives";
import { Composer } from "./composer";

export function AskSpace({ getApi, config, route, navigate }) {
  // A query carried in on the route (from Home or Help) opens the thread with
  // the question already on screen; the effect below only runs the request.
  const [opening] = useState(() => (route.query ? { id: "t-0", question: route.query } : null));
  const [turns, setTurns] = useState(() =>
    opening ? [{ ...opening, answer: null, failed: false }] : [],
  );
  const [pending, setPending] = useState(Boolean(opening));
  const [feedback, setFeedback] = useState({});
  const threadRef = useRef(null);
  const started = useRef(false);

  const assistant = config?.assistantName || "Aria";

  const run = useCallback(
    (id, query) => {
      getApi()
        ?.ask(query)
        .then((card) => {
          setTurns((prev) =>
            prev.map((t) => (t.id === id ? { ...t, answer: card ?? null, failed: !card } : t)),
          );
        })
        .catch(() => {
          setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, failed: true } : t)));
        })
        .finally(() => setPending(false));
    },
    [getApi],
  );

  const ask = useCallback(
    (text) => {
      const query = String(text || "").trim();
      if (!query) return;
      const id = `t-${Date.now()}`;
      setTurns((prev) => [...prev, { id, question: query, answer: null, failed: false }]);
      setPending(true);
      run(id, query);
    },
    [run],
  );

  useEffect(() => {
    if (started.current || !opening) return;
    started.current = true;
    run(opening.id, opening.question);
  }, [run, opening]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, pending]);

  const lastAnswer = [...turns].reverse().find((t) => t.answer)?.answer;
  const followUps = lastAnswer?.followUps || [];

  return (
    <>
      <HeaderBar onBack={() => navigate({ space: "home" })}>
        <div className="gc-avatar" aria-hidden="true">
          <Sparkles size={14} />
        </div>
        <div className="gc-header__ident">
          <div className="gc-header__identtop">
            <span className="gc-header__name">{assistant}</span>
            <AiBadge />
          </div>
          <span className="gc-header__sub">{pending ? "Thinking…" : "Answers in seconds"}</span>
        </div>
        <button
          type="button"
          className="gc-ghostbtn"
          onClick={() =>
            navigate({
              space: "messages",
              newAbout: "other",
              newLabel: "Something else",
              draft: turns[turns.length - 1]?.question || "",
            })
          }
        >
          <User />
          Get a human
        </button>
      </HeaderBar>

      <div ref={threadRef} className="gc-thread" role="log" aria-label={`Conversation with ${assistant}`}>
        {turns.length === 0 && !pending ? (
          <div className="gc-bubble gc-bubble--sys">
            Ask me anything about your order, a return or your account.
          </div>
        ) : null}

        {turns.map((turn) => (
          <div key={turn.id} style={{ display: "contents" }}>
            <div className="gc-bubble gc-bubble--user">{turn.question}</div>
            {turn.failed ? (
              <ErrorState
                title={`${assistant} is offline`}
                hint="A teammate can pick this up right now."
                onRetry={() =>
                  navigate({ space: "messages", newAbout: "other", draft: turn.question })
                }
              />
            ) : turn.answer ? (
              <>
                <div className="gc-bubble">
                  <AnswerBody
                    answer={turn.answer}
                    onOpenArticle={(id) => navigate({ space: "help", articleId: id })}
                  />
                </div>
                <div className="gc-feedback">
                  <span className="gc-feedback__label">Was this helpful?</span>
                  <button
                    type="button"
                    className="gc-thumb gc-thumb--up"
                    aria-pressed={feedback[turn.id] === true}
                    onClick={() => setFeedback((f) => ({ ...f, [turn.id]: true }))}
                    aria-label="Helpful"
                  >
                    <ThumbsUp />
                  </button>
                  <button
                    type="button"
                    className="gc-thumb gc-thumb--down"
                    aria-pressed={feedback[turn.id] === false}
                    onClick={() => setFeedback((f) => ({ ...f, [turn.id]: false }))}
                    aria-label="Not helpful"
                  >
                    <ThumbsUp />
                  </button>
                </div>
              </>
            ) : (
              <LoadingState label={`${assistant} is reading your question…`} />
            )}
          </div>
        ))}

        {followUps.length && !pending ? (
          <div className="gc-replies">
            {followUps.map((f, i) => (
              <button key={i} type="button" className="gc-reply" onClick={() => ask(f.label)}>
                {f.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <Composer
        placeholder="Message…"
        note={`${assistant} is an AI assistant. Ask for a person any time.`}
        allowImages={false}
        sending={pending}
        onSend={ask}
      />
    </>
  );
}

function AnswerBody({ answer, onOpenArticle }) {
  const summary = answer.summary || "";
  const steps = answer.steps || [];
  const sources = answer.sources || [];

  return (
    <>
      {summary}
      {steps.length ? (
        <ol className="gc-steps">
          {steps.map((step, i) => (
            <li key={i} className="gc-step" style={{ listStyle: "none" }}>
              <span className="gc-step__n">{i + 1}</span>
              {step.text}
            </li>
          ))}
        </ol>
      ) : null}
      {sources.length ? (
        <div className="gc-sources">
          <Cap>Sources</Cap>
          {sources.map((source, i) => (
            <button
              key={source.articleId || i}
              type="button"
              className="gc-source"
              onClick={() => source.articleId && onOpenArticle(source.articleId)}
            >
              <FileText />
              {source.title}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
