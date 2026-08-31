"use client";

// Post-chat CSAT card, shown inside a closed thread. Five stars, an optional
// comment, then send or skip — the design's 2h state.

import { useState } from "react";
import { Star } from "./widget_primitives";

export function RatingCard({ agentName = "the team", onSubmit, onSkip }) {
  const [value, setValue] = useState(0);
  const [comment, setComment] = useState("");

  return (
    <section className="gc-rating" aria-label="Rate this conversation">
      <p className="gc-rating__title">How did we do?</p>
      <p className="gc-rating__sub">Rating helps {agentName} and the team.</p>
      <div className="gc-stars" role="radiogroup" aria-label="Rating out of 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className="gc-star"
            data-filled={n <= value}
            role="radio"
            aria-checked={n === value}
            aria-label={`${n} out of 5`}
            onClick={() => setValue(n)}
          >
            <Star filled={n <= value} />
          </button>
        ))}
      </div>
      <textarea
        className="gc-rating__comment"
        value={comment}
        placeholder="Add a comment (optional)"
        aria-label="Comment"
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="gc-rating__actions">
        <button
          type="button"
          className="gc-primarybtn"
          disabled={!value}
          onClick={() => onSubmit?.({ score: value, comment })}
        >
          Send rating
        </button>
        <button type="button" className="gc-textbtn" onClick={() => onSkip?.()}>
          Skip
        </button>
      </div>
    </section>
  );
}
