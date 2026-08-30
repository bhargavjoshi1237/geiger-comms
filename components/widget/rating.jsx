"use client";

// Post-chat CSAT prompt. Five stars, an optional comment, then either an
// inline thank-you or a "send anyway" loop. Used on the closed thread.

import { useState } from "react";
import { StarIcon, CheckIcon } from "./widget_primitives";

export function RatingPrompt({ onRated }) {
  const [hover, setHover] = useState(0);
  const [value, setValue] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);

  function rate(score) {
    setValue(score);
  }

  function submit() {
    if (!value) return;
    onRated({ score: value, comment });
    setDone(true);
  }

  return (
    <div className="border-t border-border bg-background px-3 py-4">
      {done ? (
        <p className="flex items-center gap-2 text-sm">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
            <CheckIcon className="h-3.5 w-3.5" />
          </span>
          Thanks for the rating — it helps Maya and the team.
        </p>
      ) : (
        <div>
          <p className="mb-1 text-center text-sm font-semibold">How did we do?</p>
          <p className="mb-3 text-center text-[11px] text-muted-foreground">
            Rating helps Maya and the team.
          </p>
          <div className="mb-3 flex items-center justify-center gap-1.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(0)}
                onClick={() => rate(i)}
                aria-label={`${i} star${i === 1 ? "" : "s"}`}
                className={`transition ${(hover || value) >= i ? "text-foreground" : "text-muted-foreground"}`}
              >
                <StarIcon filled={(hover || value) >= i} className="h-7 w-7" />
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment (optional)"
            rows={2}
            className="mb-2 w-full resize-none rounded-lg border border-border bg-surface-card px-3 py-2 text-sm outline-none focus:border-border-strong"
          />
          <div className="flex items-center justify-end gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => onRated({})}
              className="rounded-full px-3 py-1.5 text-muted-foreground hover:bg-surface-hover"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!value}
              className="rounded-full bg-primary px-4 py-1.5 font-semibold text-primary-foreground disabled:opacity-40"
            >
              Send rating
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
