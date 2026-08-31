"use client";

// Shared pieces every widget space renders: the icon set, avatars, chips,
// header bars and the async states. Markup and class names come straight from
// the messenger design (`gc-*`, styled by app/widget/widget.css) so a screen
// only ever composes these — it never invents its own layout.
//
// The design canvas draws Lucide outlines at 24x24 with a 2px round stroke;
// the path data is kept exactly so the live widget matches it pixel for pixel.
// Icons are decorative — the control around them carries the label.

/* ----------------------------------------------------------------- icons -- */

function svg(size, strokeWidth, rest) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: false,
    ...rest,
  };
}

export function MessageCircle({ size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" />
    </svg>
  );
}

// The brand mark: a chat bubble whose three message lines are the three leaning
// strokes of the Geiger logo (public/logo1.svg), kept at the logo's own
// 38-degree lean. Reads as "chat" at launcher size and as "Geiger" up close.
// The loader draws the identical glyph on the host page — keep them in step.
export function BrandBubble({ size = 24, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" />
      <path d="M6.9 14.7 11.2 9.3" strokeWidth={1.6} />
      <path d="M10.5 14.7 14.8 9.3" strokeWidth={1.6} />
      <path d="M14.1 14.7 18.4 9.3" strokeWidth={1.6} />
    </svg>
  );
}

export function Sparkles({ size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
      <path d="M20 2v4" />
      <path d="M22 4h-4" />
      <circle cx="4" cy="20" r="2" />
    </svg>
  );
}

export function X({ size = 15, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function ChevronRight({ size = 15, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function ChevronLeft({ size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function Search({ size = 14, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="m21 21-4.34-4.34" />
      <circle cx="11" cy="11" r="8" />
    </svg>
  );
}

export function Mail({ size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
      <rect x="2" y="4" width="20" height="16" rx="2" />
    </svg>
  );
}

export function BookHeart({ size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M12 5v16" />
      <path d="M20.001 19A2 2 0 0 0 22 17V5a2 2 0 0 0-1.999-2L16 3.002A5 5 0 0 0 12 5a5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 1.999 2H8a5 5 0 0 1 4 2 5 5 0 0 1 4-2z" />
    </svg>
  );
}

export function User({ size = 12, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  );
}

export function FileText({ size = 11, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

export function ThumbsUp({ size = 12, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
      <path d="M7 10v12" />
    </svg>
  );
}

export function Paperclip({ size = 15, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551" />
    </svg>
  );
}

export function ImageIcon({ size = 15, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

export function ArrowUp({ size = 14, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </svg>
  );
}

export function CheckCheck({ size = 12, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M18 6 7 17l-5-5" />
      <path d="m22 10-7.5 7.5L13 16" />
    </svg>
  );
}

export function Plus({ size = 13, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

export function Clock({ size = 14, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export function CircleCheck({ size = 9, strokeWidth = 3, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M21.801 10A10 10 0 1 1 17 3.335" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
}

export function ArrowUpRight({ size = 14, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </svg>
  );
}

export function Star({ size = 18, strokeWidth = 1.8, filled = false, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)} fill={filled ? "currentColor" : "none"}>
      <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
    </svg>
  );
}

/* ---------------------------------------------------------------- avatar -- */

export function initialsOf(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function Avatar({ name = "", size = "md", online = false, showStatus = false }) {
  const cls = size === "md" ? "gc-avatar" : `gc-avatar gc-avatar--${size}`;
  const dot = <div className={cls}>{initialsOf(name)}</div>;
  if (!showStatus || !online) return dot;
  return (
    <div className="gc-avatar-wrap">
      {dot}
      <span className="gc-online-dot" />
      <span className="gc-sr">{name} is online</span>
    </div>
  );
}

export function AvatarStack({ people = [] }) {
  return (
    <div className="gc-avatar-stack">
      {people.slice(0, 3).map((p, i) => (
        <div key={p.id || p.name || i} className="gc-avatar">
          {initialsOf(p.name)}
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- chips -- */

export function AiBadge() {
  return (
    <span className="gc-badge-ai" title="Answered by AI">
      AI
    </span>
  );
}

export function Cap({ children }) {
  return <span className="gc-cap">{children}</span>;
}

// Conversation status. `closed` earns a tick; `open` a green dot.
export function StatusPill({ status }) {
  if (status === "open") {
    return (
      <span className="gc-pill gc-pill--open">
        <span className="gc-pill__dot" />
        Open
      </span>
    );
  }
  return (
    <span className="gc-pill">
      {status === "closed" ? <CircleCheck /> : null}
      {status === "closed" ? "Closed" : "Waiting on you"}
    </span>
  );
}

export function UnreadCount({ count }) {
  return (
    <span className="gc-count">
      {count}
      <span className="gc-sr"> unread messages</span>
    </span>
  );
}

/* --------------------------------------------------------------- headers -- */

// The back / title / action bar every sub-screen shares.
export function HeaderBar({ onBack, onClose, children, action }) {
  return (
    <header className="gc-header gc-header--bar">
      {onBack ? (
        <button type="button" className="gc-iconbtn gc-iconbtn--sm" onClick={onBack} aria-label="Back">
          <ChevronLeft />
        </button>
      ) : null}
      {children}
      {action}
      {onClose ? (
        <button
          type="button"
          className="gc-iconbtn gc-iconbtn--sm"
          onClick={onClose}
          aria-label="Close messenger"
        >
          <X />
        </button>
      ) : null}
    </header>
  );
}

/* ----------------------------------------------------------------- states -- */

export function Spinner({ className = "" }) {
  return <span className={`gc-spinner ${className}`.trim()} role="status" aria-label="Loading" />;
}

export function LoadingState({ label = "Loading…" }) {
  return (
    <div className="gc-state">
      <Spinner />
      <p className="gc-state__hint">{label}</p>
    </div>
  );
}

export function EmptyState({ title, hint }) {
  return (
    <div className="gc-state">
      <p className="gc-state__title">{title}</p>
      {hint ? <p className="gc-state__hint">{hint}</p> : null}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", hint, onRetry }) {
  return (
    <div className="gc-state gc-state--error">
      <p className="gc-state__title">{title}</p>
      {hint ? <p className="gc-state__hint">{hint}</p> : null}
      {onRetry ? (
        <button type="button" className="gc-outlinebtn" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

// First-class offline surface — consumer connections are flaky (spec §9).
export function ReconnectingBanner({ visible }) {
  if (!visible) return null;
  return (
    <div className="gc-banner gc-banner--warn">
      <Spinner className="gc-spinner--sm" />
      Reconnecting…
    </div>
  );
}

export function Banner({ tone = "muted", children }) {
  return <div className={tone === "muted" ? "gc-banner" : `gc-banner gc-banner--${tone}`}>{children}</div>;
}
