"use client";

// Post-chat CSAT in a closed thread: five stars with a word for the score and an optional comment; sending shows a thank-you, skipping hides it.

import { useState } from "react";
import { Check, Star } from "./widget_primitives";

const WORDS = ["Poor", "Fair", "Okay", "Good", "Great"];

export function RatingCard({ agentName = "", result = null, onSubmit, onSkip }) {
  const [value, setValue] = useState(0);
  const [comment, setComment] = useState("");

  if (result?.skipped) return null;

  if (result?.score) {
    return (
      <section className="gc-thanks" role="status">
        <span className="gc-okmark" aria-hidden="true">
          <Check />
        </span>
        <span className="gc-thanks__text">
          <span className="gc-thanks__title">Thanks for the rating</span>
          <span className="gc-thanks__sub">You gave this conversation {result.score} out of 5.</span>
        </span>
      </section>
    );
  }

  return (
    <section className="gc-rating" aria-label="Rate this conversation">
      <div className="gc-rating__head">
        <h2 className="gc-rating__title">{agentName ? `How did ${agentName} do?` : "How did we do?"}</h2>
        <p className="gc-rating__sub">Rate this conversation.</p>
      </div>
      <div className="gc-stars" role="radiogroup" aria-label="Rating out of 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className="gc-star"
            data-filled={n <= value}
            role="radio"
            aria-checked={n === value}
            aria-label={`${n} out of 5, ${WORDS[n - 1]}`}
            onClick={() => setValue(n)}
          >
            <Star filled={n <= value} />
          </button>
        ))}
        {value ? (
          <span className="gc-stars__word" aria-hidden="true">
            {WORDS[value - 1]}
          </span>
        ) : null}
      </div>
      <textarea
        className="gc-rating__comment"
        value={comment}
        maxLength={1000}
        placeholder="Anything we could do better? (optional)"
        aria-label="Comment, optional"
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="gc-rating__actions">
        <button
          type="button"
          className="gc-btn gc-btn--accent gc-btn--md"
          disabled={!value}
          onClick={() => onSubmit?.({ score: value, comment })}
        >
          Send rating
        </button>
        <button type="button" className="gc-btn gc-btn--ghost gc-btn--md" onClick={() => onSkip?.()}>
          Skip
        </button>
      </div>
    </section>
  );
}
