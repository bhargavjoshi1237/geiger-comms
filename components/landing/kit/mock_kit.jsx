import { cn } from "@/lib/utils";
import styles from "@/components/landing/kit/product_pages.module.css";

// Non-interactive renders of product UI for the landing page (ported from geiger-dash components/product-pages): drawn in the palette's greys, with emerald, amber
// and red kept for the states they mean (done, in progress, urgent).

export const WINDOW =
  "rounded-xl border border-foreground/[0.09] bg-surface-card shadow-[0_1px_0_0_rgb(255_255_255/0.03)_inset,0_4px_12px_rgb(0_0_0/0.08),0_30px_60px_-20px_rgb(0_0_0/0.25)] dark:border-foreground/[0.07] dark:bg-surface-subtle dark:shadow-[0_1px_0_0_rgb(255_255_255/0.04)_inset,0_4px_12px_rgb(0_0_0/0.15),0_40px_80px_-24px_rgb(0_0_0/0.6)]";

export const LINE = "border-foreground/[0.07]";

export function Window({ title, icon: Icon, meta, actions, className, barClassName, children }) {
  return (
    <div className={cn(WINDOW, "flex flex-col overflow-hidden text-[13px] text-foreground", className)}>
      {title ? (
        <div className={cn("flex h-12 shrink-0 items-center gap-2 border-b px-5", LINE, barClassName)}>
          {Icon ? <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} /> : null}
          <span className="truncate font-medium">{title}</span>
          {meta ? <span className="truncate text-muted-foreground">{meta}</span> : null}
          {actions ? <div className="ml-auto flex items-center gap-3 text-muted-foreground">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

const AVATAR_TONES = [
  "from-foreground/45 to-foreground/15",
  "from-foreground/30 to-foreground/10",
  "from-foreground/55 to-foreground/25",
  "from-foreground/25 to-foreground/5",
  "from-foreground/40 to-foreground/20",
];

function toneFor(name) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function Avatar({ name, size = 20, className }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-linear-to-br font-semibold text-background ring-1 ring-background", toneFor(name), className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function AvatarStack({ names, size = 20 }) {
  return (
    <span className="flex -space-x-1.5">
      {names.map((name) => (
        <Avatar key={name} name={name} size={size} />
      ))}
    </span>
  );
}

// Linear-style status glyphs, 14px.
export function StatusIcon({ status = "todo", className }) {
  const common = cn("size-3.5 shrink-0", className);
  if (status === "backlog") {
    return (
      <svg viewBox="0 0 14 14" className={cn(common, "text-muted-foreground")} fill="none">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1.6 1.9" />
      </svg>
    );
  }
  if (status === "progress" || status === "review") {
    const sweep = status === "review" ? "M7 3.5A3.5 3.5 0 1 1 3.5 7H7Z" : "M7 3.5A3.5 3.5 0 0 1 7 10.5Z";
    return (
      <svg viewBox="0 0 14 14" className={cn(common, status === "review" ? "text-emerald-500" : "text-amber-500")} fill="none">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d={sweep} fill="currentColor" />
      </svg>
    );
  }
  if (status === "done") {
    return (
      <svg viewBox="0 0 14 14" className={cn(common, "text-emerald-500")}>
        <circle cx="7" cy="7" r="7" fill="currentColor" />
        <path d="M4.2 7.2 6.1 9l3.7-3.9" stroke="var(--background)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "canceled") {
    return (
      <svg viewBox="0 0 14 14" className={cn(common, "text-muted-foreground")}>
        <circle cx="7" cy="7" r="7" fill="currentColor" />
        <path d="m4.8 4.8 4.4 4.4m0-4.4-4.4 4.4" stroke="var(--background)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "triage") {
    return (
      <svg viewBox="0 0 14 14" className={cn(common, "text-amber-500")}>
        <circle cx="7" cy="7" r="7" fill="currentColor" />
        <path d="M4 7h6M8 5l2 2-2 2" stroke="var(--background)" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 14 14" className={cn(common, "text-muted-foreground")} fill="none">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// Signal bars for low/medium/high, a filled badge for urgent.
export function PriorityIcon({ level = "medium", className }) {
  if (level === "urgent") {
    return (
      <svg viewBox="0 0 14 14" className={cn("size-3.5 shrink-0 text-red-500", className)}>
        <rect width="14" height="14" rx="3" fill="currentColor" />
        <path d="M7 3.6v4.3" stroke="var(--background)" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="7" cy="10.4" r="0.95" fill="var(--background)" />
      </svg>
    );
  }
  const filled = { none: 0, low: 1, medium: 2, high: 3 }[level] ?? 2;
  return (
    <svg viewBox="0 0 14 14" className={cn("size-3.5 shrink-0 text-muted-foreground", className)}>
      {[0, 1, 2].map((bar) => (
        <rect key={bar} x={1.5 + bar * 4.2} y={8 - bar * 3} width="2.6" height={4.5 + bar * 3} rx="0.8" fill="currentColor" opacity={bar < filled ? 1 : 0.3} />
      ))}
    </svg>
  );
}

const DOT_TONES = {
  neutral: "bg-foreground/40",
  strong: "bg-foreground/75",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

export function Dot({ tone = "neutral", className }) {
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", DOT_TONES[tone], className)} />;
}

export function Chip({ children, icon: Icon, dot, dashed = false, className }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] whitespace-nowrap text-foreground/85",
        dashed ? "border-dashed border-foreground/20" : "border-foreground/[0.1] bg-foreground/[0.03]",
        className,
      )}
    >
      {dot ? <Dot tone={dot} /> : null}
      {Icon ? <Icon className="size-3 text-muted-foreground" strokeWidth={2} /> : null}
      {children}
    </span>
  );
}

// Placeholder text bars for the parts of a render that are only there for rhythm.
export function Bar({ className }) {
  return <span className={cn("block h-2 rounded-full bg-foreground/[0.07]", className)} />;
}

export function Kbd({ children }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-foreground/[0.12] bg-foreground/[0.04] px-1 font-sans text-[11px] text-muted-foreground">
      {children}
    </kbd>
  );
}

export function MonoLabel({ children, className }) {
  return <span className={cn("font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase", className)}>{children}</span>;
}

// Text that types itself out once, then leaves a blinking caret.
export function Typed({ text, delay = 0.6, duration, className }) {
  return (
    <span className={cn("whitespace-nowrap", className)}>
      <span className={styles.typed} style={{ "--chars": text.length, "--type-delay": `${delay}s`, "--type-duration": `${duration ?? Math.max(1.2, text.length * 0.055)}s` }}>
        {text}
      </span>
      <span className={styles.caret} />
    </span>
  );
}

export function Caret({ className }) {
  return <span className={cn(styles.caret, className)} />;
}

export function TypingDots({ className }) {
  return (
    <span className={cn("inline-flex items-center gap-1", styles.dots, className)}>
      <span className="size-1.5 rounded-full bg-current" />
      <span className="size-1.5 rounded-full bg-current" />
      <span className="size-1.5 rounded-full bg-current" />
    </span>
  );
}

// Lays out absolutely positioned layers inside a composition (`at` = [left, top] in px).
export function Layer({ at = [0, 0], z = 1, className, children }) {
  return (
    <div className={cn("absolute", className)} style={{ left: at[0], top: at[1], zIndex: z }}>
      {children}
    </div>
  );
}
