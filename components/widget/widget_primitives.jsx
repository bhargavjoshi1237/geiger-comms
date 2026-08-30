"use client";

// Small shared primitives used across every widget space (spec §9). Loading,
// empty, error, reconnecting banners, plus the inline icons we render
// everywhere — keeping them here avoids re-defining them per screen.

export function Spinner({ className = "" }) {
  return (
    <span
      className={`inline-block size-4 animate-spin rounded-full border-2 border-border border-t-foreground ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function LoadingState({ label = "Loading…" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
      <Spinner />
      <span className="text-xs">{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", hint, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <p className="text-sm font-medium text-red-400">{title}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
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
    <div className="flex items-center justify-center gap-2 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400">
      <Spinner className="size-3" />
      Reconnecting…
    </div>
  );
}

/* ---------- Inline icon set (single-stroke, currentColor) ---------- */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function ChevronLeft({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function ChevronRight({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function ChevronUp({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

export function ChevronDown({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function SearchIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function SparklesIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
    </svg>
  );
}

export function PackageIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.3 7L12 12l8.7-5M12 22V12" />
    </svg>
  );
}

export function UndoIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M3 7v6h6M3 13a9 9 0 1 0 3-7" />
    </svg>
  );
}

export function ReceiptIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M5 3h14v18l-3-2-3 2-3-2-3 2-2-2z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

export function UserIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function HomeIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}

export function MessageIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z" />
    </svg>
  );
}

export function BookIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M4 4a2 2 0 0 1 2-2h12v18H6a2 2 0 0 0-2 2z" />
      <path d="M4 4v16a2 2 0 0 0 2 2h12" />
    </svg>
  );
}

export function BellIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9z" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function PaperclipIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M21.4 11.6l-9.2 9.2a5 5 0 0 1-7-7l9.2-9.2a3.5 3.5 0 0 1 4.9 4.9l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    </svg>
  );
}

export function ArrowUpIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

export function ArrowUpCircle({ className = "h-10 w-10" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <path d="M12 7v10M7 12l5-5 5 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function XIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M6 6l12 12M6 18L18 6" />
    </svg>
  );
}

export function UserCheckIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0" />
      <path d="M16 11l2 2 4-4" />
    </svg>
  );
}

export function ThumbsUpIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M7 10v11M7 10l5-8a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1 7a2 2 0 0 1-2 1.7H7" />
    </svg>
  );
}

export function ThumbsDownIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M7 14V3M7 14l5 8a2 2 0 0 0 2-2v-4h5a2 2 0 0 0 2-2.3l-1-7A2 2 0 0 0 18 5H7" />
    </svg>
  );
}

export function PhoneIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.7 19.7 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5 13 13 0 0 0 2.8.7A2 2 0 0 1 22 16.9z" />
    </svg>
  );
}

export function StarIcon({ className = "h-5 w-5", filled = false }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill={filled ? "currentColor" : "none"} {...stroke}>
      <path d="M12 3l2.7 5.6 6.3.9-4.5 4.4 1.1 6.3L12 17.7 6.4 20.2l1.1-6.3L3 9.5l6.3-.9z" />
    </svg>
  );
}

export function ImageIcon({ className = "h-12 w-12" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

export function ClockIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function SendIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
    </svg>
  );
}

export function CheckIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M5 12l4 4L19 7" />
    </svg>
  );
}

export function PlusIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function InfoIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

export function AvatarStack({ users = [], size = 18 }) {
  return (
    <span className="flex -space-x-1.5">
      {users.slice(0, 3).map((u, i) => (
        <span
          key={u.id || i}
          className="inline-block rounded-full ring-2 ring-background"
          style={{ width: size, height: size }}
        >
          <span
            className="grid h-full w-full place-items-center rounded-full text-[10px] font-bold text-white"
            style={{ background: `hsl(${(u.name?.charCodeAt(0) || 0) % 360}, 60%, 35%)` }}
            aria-hidden="true"
          >
            {(u.name || "?").match(/\S/g)?.slice(0, 2).join("").toUpperCase() || "?"}
          </span>
        </span>
      ))}
    </span>
  );
}
