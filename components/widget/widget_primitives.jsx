"use client";

// Shared pieces every widget space composes (icons, avatars, tags, header bars, file cards, async states); `gc-*` classes live in app/widget/widget.css.
// Icons are decorative Lucide outlines (24x24, 2px round stroke, paths kept exactly); the control around them carries the label.

import { LogoLoading } from "@geiger/ui/logo-loading";

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
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
}

export function House({ size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

// The Geiger logo (public/logo1.svg's three strokes), filled; `size` is its width. The loader's SVG_MARK draws the same path.
export function BrandMark({ size = 24, ...rest }) {
  return (
    <svg
      width={size}
      height={Math.round((size * 285) / 467)}
      viewBox="0 0 467 285"
      fill="currentColor"
      aria-hidden
      focusable={false}
      {...rest}
    >
      <path d="M409 1h57L304 284h-60zM285 1h60L181 284h-58zM161 1h63L57 284H0z" />
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

export function X({ size = 18, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function ChevronRight({ size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function ChevronLeft({ size = 20, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ArrowRight({ size = 17, strokeWidth = 2.2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function Search({ size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function Mail({ size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

export function BookOpen({ size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

export function Newspaper({ size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8" />
      <path d="M15 18h-5" />
      <path d="M10 6h8v4h-8V6Z" />
    </svg>
  );
}

export function Ticket({ size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" />
      <path d="M13 17v2" />
      <path d="M13 11v2" />
    </svg>
  );
}

export function User({ size = 14, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  );
}

export function CreditCard({ size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

export function Plug({ size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </svg>
  );
}

export function Rocket({ size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

export function FileText({ size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

export function ThumbsUp({ size = 17, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

export function ThumbsDown({ size = 17, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}

export function Paperclip({ size = 18, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

export function ImageIcon({ size = 18, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

export function Download({ size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

export function ArrowUp({ size = 17, strokeWidth = 2.4, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </svg>
  );
}

export function Check({ size = 16, strokeWidth = 2.4, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function CheckCheck({ size = 14, strokeWidth = 2.2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M18 6 7 17l-5-5" />
      <path d="m22 10-7.5 7.5L13 16" />
    </svg>
  );
}

export function Plus({ size = 15, strokeWidth = 2.2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

export function Moon({ size = 15, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

export function Info({ size = 16, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function CircleCheck({ size = 12, strokeWidth = 2.2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M21.801 10A10 10 0 1 1 17 3.335" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
}

export function ExternalLink({ size = 17, strokeWidth = 2, ...rest }) {
  return (
    <svg {...svg(size, strokeWidth, rest)}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

export function Star({ size = 24, strokeWidth = 1.8, filled = false, ...rest }) {
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

export function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

// One of five tints, stable per name, so a teammate keeps their colour on every screen.
export function toneOf(name) {
  const s = String(name || "");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 5;
}

// size: xs 22 · sm 24 · md 34 · lg 36. `muted` greys out a closed conversation; `ai` swaps initials for sparkles.
export function Avatar({ name = "", size = "md", online = false, showStatus = false, muted = false, ai = false }) {
  const cls = size === "md" ? "gc-avatar" : `gc-avatar gc-avatar--${size}`;
  const face = (
    <span className={cls} data-tone={ai || muted ? "muted" : toneOf(name)} aria-hidden="true">
      {ai ? <Sparkles size={size === "sm" || size === "xs" ? 12 : 15} /> : initialsOf(name)}
    </span>
  );
  if (!showStatus || !online) return face;
  return (
    <span className="gc-avatar-wrap">
      {face}
      <span className="gc-online-dot" aria-hidden="true" />
      <span className="gc-sr">{name} is online</span>
    </span>
  );
}

export function AvatarStack({ people = [] }) {
  return (
    <span className="gc-avatar-stack" aria-hidden="true">
      {people.slice(0, 3).map((p, i) => (
        <span key={p.id || p.name || i} className="gc-avatar" data-tone={toneOf(p.name)}>
          {initialsOf(p.name)}
        </span>
      ))}
    </span>
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

export function Tag({ tone, children }) {
  return <span className={tone ? `gc-tag gc-tag--${tone}` : "gc-tag"}>{children}</span>;
}

// Conversation and ticket status: `open` earns a green dot, `closed` a tick, `waiting` an amber dot.
export function StatusPill({ status }) {
  if (status === "closed") {
    return (
      <Tag>
        <CircleCheck />
        Closed
      </Tag>
    );
  }
  return (
    <Tag tone={status === "open" ? "open" : "waiting"}>
      <span className="gc-tag__dot" aria-hidden="true" />
      {status === "open" ? "Open" : "Waiting on you"}
    </Tag>
  );
}

export function UnreadCount({ count }) {
  return (
    <span className="gc-count">
      {count > 99 ? "99+" : count}
      <span className="gc-sr"> unread {count === 1 ? "message" : "messages"}</span>
    </span>
  );
}

function listNames(names) {
  if (names.length < 2) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// "Maya, Arjun and Lena are online" / "Away. Back Mon 09:00" — the presence line on the home card and the list footer.
export function Presence({ team = [], online, backAt = "" }) {
  const names = team.map((p) => firstName(p.name)).filter(Boolean);
  let text;
  if (online) {
    text = names.length ? `${listNames(names)} ${names.length > 1 ? "are" : "is"} online` : "The team is online";
  } else {
    text = backAt ? `Away. Back ${backAt}` : "The team is away";
  }
  return (
    <span className="gc-presence" data-state={online ? "online" : "away"}>
      <span className="gc-presence__dot" aria-hidden="true" />
      {text}
    </span>
  );
}

/* --------------------------------------------------------------- headers -- */

export function CloseButton({ onClose }) {
  if (!onClose) return null;
  return (
    <button type="button" className="gc-iconbtn" onClick={onClose} aria-label="Close messenger">
      <X />
    </button>
  );
}

// The back / title / action bar every sub-screen shares.
export function HeaderBar({ onBack, onClose, backLabel = "Back", children, action }) {
  return (
    <header className={onBack ? "gc-bar" : "gc-bar gc-bar--flush"}>
      {onBack ? (
        <button type="button" className="gc-iconbtn" onClick={onBack} aria-label={backLabel}>
          <ChevronLeft />
        </button>
      ) : null}
      {children}
      {action}
      <CloseButton onClose={onClose} />
    </header>
  );
}

// The title row a top-level space (Messages, Help, News, Tickets) opens with.
export function PageHead({ title, onClose, children }) {
  return (
    <header className="gc-pagehead">
      <h1 className="gc-pagehead__title">{title}</h1>
      {children}
      <CloseButton onClose={onClose} />
    </header>
  );
}

/* ----------------------------------------------------------- attachments -- */

export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

function extOf(name) {
  const s = String(name || "");
  return s.includes(".") ? s.split(".").pop().toLowerCase() : "";
}

function fileKind(contentType, name) {
  const type = String(contentType || "").toLowerCase();
  if (type.startsWith("image/") || IMAGE_EXTS.has(extOf(name))) return "image";
  if (type === "application/pdf" || extOf(name) === "pdf") return "pdf";
  return "file";
}

// An attachment card (tile, name, "PNG · 248 KB", download); uploads are stored as octet-stream, so the tile is an icon, never a thumbnail.
export function FileCard({ file, mine = false }) {
  const href = safeHref(file?.url);
  if (!href) return null;
  const name = (typeof file.name === "string" && file.name) || "Attachment";
  const label = (extOf(name) || String(file.contentType || "").split("/")[1] || "file").slice(0, 5).toUpperCase();
  const meta = [label, formatBytes(file.size)].filter(Boolean).join(" · ");
  const kind = fileKind(file.contentType, name);
  return (
    <a
      className="gc-file"
      data-kind={kind}
      data-mine={mine ? "true" : undefined}
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label={`Download ${name}`}
    >
      <span className="gc-file__tile" aria-hidden="true">
        {kind === "image" ? <ImageIcon /> : <FileText size={18} />}
      </span>
      <span className="gc-file__text">
        <span className="gc-file__name">{name}</span>
        <span className="gc-file__meta">{meta}</span>
      </span>
      <span className="gc-file__dl" aria-hidden="true">
        <Download />
      </span>
    </a>
  );
}

/* ----------------------------------------------------------------- states -- */

export function Spinner({ className = "" }) {
  return <span className={`gc-spinner ${className}`.trim()} role="status" aria-label="Loading" />;
}

// Section-level loader: the shared Geiger mark, sized for a panel body.
export function LoadingState({ label = "Loading" }) {
  return (
    <div className="gc-state">
      <LogoLoading size={36} aria-label={label} />
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

export function ErrorState({ title = "Something went wrong", hint, onRetry, retryLabel = "Try again" }) {
  return (
    <div className="gc-state gc-state--error" role="alert">
      <p className="gc-state__title">{title}</p>
      {hint ? <p className="gc-state__hint">{hint}</p> : null}
      {onRetry ? (
        <button type="button" className="gc-btn gc-btn--outline gc-btn--sm" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

// First-class offline surface — consumer connections are flaky (spec §9).
export function ReconnectingBanner({ visible, label = "Reconnecting…" }) {
  if (!visible) return null;
  return (
    <div className="gc-banner gc-banner--warn" role="status">
      <Spinner className="gc-spinner--sm" />
      {label}
    </div>
  );
}

// Workspace logo when the config carries an https URL, else the brand's initials on the brand tile.
export function BrandLogo({ name, logoUrl }) {
  return (
    <span className="gc-brandtile" aria-hidden="true">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote, workspace-configured logo
        <img src={logoUrl} alt="" />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

// Only http(s) links are ever rendered from message/attachment data.
export function safeHref(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
}

export function Banner({ tone = "muted", children }) {
  return <div className={tone === "muted" ? "gc-banner" : `gc-banner gc-banner--${tone}`}>{children}</div>;
}
