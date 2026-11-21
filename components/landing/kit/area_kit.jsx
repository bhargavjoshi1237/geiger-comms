import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Footer } from "@geiger/ui";
import { cn } from "@/lib/utils";
import { Header } from "@/components/header";
import { AREAS } from "@/components/landing/kit/areas";
import styles from "@/components/landing/kit/product_pages.module.css";

// Linear-style product page kit, ported from geiger-dash components/product-pages so Comms reads like the suite's area pages.

export const CONTAINER = "mx-auto w-full max-w-6xl px-4 sm:px-6";
export const HAIRLINE = "border-foreground/[0.08] dark:border-foreground/[0.09]";

export const PRIMARY_CTA =
  "inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
export const SECONDARY_CTA =
  "inline-flex h-11 items-center rounded-full border border-border-strong px-6 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// In-app links go through next/link so the /comms base path applies; suite pages on the same origin are plain anchors.
function SectionLink({ link, className, children }) {
  if (link.internal) {
    return (
      <Link href={link.href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={link.href} className={className}>
      {children}
    </a>
  );
}

export function AreaPage({ dashboardHref, closing, children }) {
  return (
    <div className={cn(styles.page, "flex min-h-screen w-full flex-col overflow-x-clip bg-background font-sans text-foreground antialiased")}>
      <Header dashboardHref={dashboardHref} />
      <main className="flex flex-1 flex-col">{children}</main>
      <AreaLinks />
      {closing}
      <Footer />
    </div>
  );
}

// The opening shot: a tilted, half-focused render of the product behind a large headline.
export function AreaHero({ eyebrow, title, art, children }) {
  return (
    <section className={cn("relative isolate h-[36rem] overflow-hidden border-b sm:h-[42rem] lg:h-[48rem]", HAIRLINE)}>
      <div className={cn("absolute inset-0 -z-10", styles.heroEnter)}>{art}</div>
      <div className={cn(CONTAINER, "flex h-full flex-col justify-end pb-14 sm:pb-20 lg:pb-[7.5rem]")}>
        <div className="sm:px-8">
          <p className={cn("text-[15px] text-foreground/60 sm:text-base", styles.blurIn)} style={{ "--delay": "0.2s" }}>
            {eyebrow}
          </p>
          <h1
            className={cn("mt-3 max-w-[17ch] text-[2.75rem] leading-none font-medium tracking-[-0.032em] text-balance sm:mt-4 sm:text-6xl lg:text-[4.5rem]", styles.blurIn)}
            style={{ "--delay": "0.3s" }}
          >
            {title}
          </h1>
          {children ? (
            <div className={styles.blurIn} style={{ "--delay": "0.5s" }}>
              {children}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// A focus-pulled render of `children` on a tilted plane; `focus` is the sharp spot as [x, y] percentages of the hero.
export function HeroArt({ children, focus = ["60%", "34%"], plane }) {
  const vars = { "--focus-x": focus[0], "--focus-y": focus[1], ...plane };
  return (
    <div aria-hidden="true" className={styles.heroArt} style={vars}>
      <div className={cn(styles.heroLayer, styles.heroBlur)}>
        <div className={styles.heroPlane}>{children}</div>
      </div>
      <div className={cn(styles.heroLayer, styles.heroSharp)}>
        <div className={styles.heroPlane}>{children}</div>
      </div>
      <div className={styles.heroShade} />
    </div>
  );
}

// A chapter of the page: headline left, a lead and a link right, then its stages and grids.
export function AreaSection({ id, title, lead, link, children }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={cn(CONTAINER, "scroll-mt-16 py-24 sm:py-32")}>
      <header className="grid gap-6 pb-14 sm:pb-20 lg:grid-cols-2 lg:gap-0 lg:pb-24">
        <h2 id={id ? `${id}-title` : undefined} className="max-w-[17ch] text-[2.5rem] leading-[1.02] font-medium tracking-[-0.03em] text-balance sm:px-8 sm:text-5xl">
          {title}
        </h2>
        <div className="sm:px-8">
          <p className="max-w-[35rem] text-xl leading-[1.35] tracking-[-0.012em] text-pretty text-foreground/80 sm:text-2xl">{lead}</p>
          {link ? (
            <SectionLink
              link={link}
              className="group mt-6 inline-flex items-center gap-1.5 text-[15px] text-muted-foreground transition-colors hover:text-foreground sm:mt-8"
            >
              {link.label}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </SectionLink>
          ) : null}
        </div>
      </header>
      <div className="flex flex-col gap-12">{children}</div>
    </section>
  );
}

function Caption({ title, body }) {
  return (
    <figcaption className="relative z-[2] bg-background px-4 py-8 sm:p-8">
      <h3 className="text-[15px] leading-6 font-medium text-foreground">{title}</h3>
      <p className="max-w-[38rem] text-[15px] leading-6 text-pretty text-muted-foreground">{body}</p>
    </figcaption>
  );
}

// The big spotlit panel: a composed render that runs off its bottom edge into a caption strip.
export function Stage({ title, body, plain = false, className, children }) {
  return (
    <figure className={cn("-mx-4 overflow-hidden border-y sm:mx-0 sm:rounded-xl sm:border-0", HAIRLINE, styles.edge)}>
      <div aria-hidden="true" className={cn("relative overflow-hidden px-4 pt-12 select-none sm:px-8 sm:pt-20 lg:pt-24", plain ? "bg-surface-subtle/40" : styles.spotlight, className)}>
        <div className={cn(styles.fadeBottom, styles.reveal)}>{children}</div>
      </div>
      <Caption title={title} body={body} />
    </figure>
  );
}

// Two-up hairline grid of smaller renders, each with its own caption.
export function FeatureGrid({ children }) {
  return <div className={cn("-mx-4 grid overflow-hidden border-y sm:mx-0 sm:rounded-xl sm:border lg:grid-cols-2", HAIRLINE)}>{children}</div>;
}

export function FeatureCell({ title, body, className, children }) {
  return (
    <figure className={cn("flex flex-col border-b last:border-b-0 lg:odd:border-r lg:[&:nth-last-child(-n+2)]:border-b-0", HAIRLINE)}>
      <div aria-hidden="true" className={cn("relative flex flex-1 items-center overflow-hidden px-4 pt-10 pb-2 select-none sm:px-8 sm:pt-14", className)}>
        <div className={cn("w-full", styles.reveal)}>{children}</div>
      </div>
      <Caption title={title} body={body} />
    </figure>
  );
}

// Linear's tabbed panel, held still: a list of capabilities with one in focus, and the render for it alongside.
export function SplitShowcase({ items, active = 0, title, body, children }) {
  return (
    <figure className={cn("-mx-4 overflow-hidden border-y sm:mx-0 sm:rounded-xl sm:border-0", HAIRLINE, styles.edge)}>
      <div aria-hidden="true" className="grid gap-8 bg-surface-subtle/40 px-4 py-10 select-none sm:px-8 sm:py-14 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-12 lg:py-16 dark:bg-foreground/[0.015]">
        <ul className="flex flex-col gap-1">
          {items.map((item, index) => (
            <li key={item.title} className={cn("rounded-lg px-5 py-4", index === active ? "bg-foreground/[0.05]" : "opacity-70")}>
              <span className="block font-mono text-[12px] tracking-[0.06em] text-foreground uppercase">{item.title}</span>
              <span className="mt-1.5 block font-mono text-[12px] leading-5 tracking-[0.04em] text-muted-foreground uppercase">{item.body}</span>
            </li>
          ))}
        </ul>
        <div className={cn("min-w-0", styles.reveal)}>{children}</div>
      </div>
      {title ? <Caption title={title} body={body} /> : null}
    </figure>
  );
}

// A centred diagram with mono callouts either side, like Linear's GitHub integration panel.
export function CalloutStage({ left = [], right = [], title, body, children }) {
  const callout = (item, align) => (
    <div key={item.title} className={cn("max-w-[16rem]", align === "right" ? "lg:ml-auto lg:text-right" : "")}>
      <span className="block font-mono text-[12px] tracking-[0.06em] text-foreground uppercase">{item.title}</span>
      <span className="mt-2 block font-mono text-[12px] leading-5 tracking-[0.04em] text-muted-foreground uppercase">{item.body}</span>
    </div>
  );
  return (
    <figure className={cn("-mx-4 overflow-hidden border-y sm:mx-0 sm:rounded-xl sm:border-0", HAIRLINE, styles.edge)}>
      <div className="grid items-center gap-10 bg-surface-subtle/40 px-4 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1fr_auto_1fr] lg:gap-12 lg:py-28 dark:bg-foreground/[0.015]">
        <div className="order-2 flex flex-col gap-10 lg:order-1">{left.map((item) => callout(item, "right"))}</div>
        <div aria-hidden="true" className={cn("order-1 select-none lg:order-2", styles.reveal)}>
          {children}
        </div>
        <div className="order-3 flex flex-col gap-10">{right.map((item) => callout(item, "left"))}</div>
      </div>
      {title ? <Caption title={title} body={body} /> : null}
    </figure>
  );
}

// Scales a fixed-size composition down to the width it gets, without JavaScript; `max` caps upscaling.
export function Fit({ width, height, max = 1, className, children }) {
  return (
    <div className={styles.fit}>
      <div className={styles.fitSizer} style={{ "--w": `${width}px`, "--h": `${height}px`, "--max": max }}>
        <div className={cn(styles.fitInner, className)}>{children}</div>
      </div>
    </div>
  );
}

// Linear's closing nav: the suite's four product areas, which live on the main site outside the /comms base path.
export function AreaLinks() {
  return (
    <nav aria-label="Product areas" className={cn("border-t", HAIRLINE)}>
      <ul className={cn(CONTAINER, "grid gap-y-12 py-24 sm:grid-cols-2 sm:py-32 lg:grid-cols-4")}>
        {AREAS.map((area, index) => (
          <li key={area.id} className={cn("border-l-0 sm:border-l", HAIRLINE, index % 2 === 0 && "sm:border-l-0 lg:border-l", index === 0 && "lg:border-l-0")}>
            <a href={area.href} className="group flex h-full flex-col justify-between gap-10 sm:gap-16 sm:px-8">
              <span className="max-w-[14ch] text-2xl leading-[1.25] font-medium tracking-[-0.015em] text-balance text-foreground">{area.headline}</span>
              <span className="inline-flex items-center gap-1.5 text-[15px] text-muted-foreground transition-colors group-hover:text-foreground">
                {area.label}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
