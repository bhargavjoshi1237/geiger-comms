"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const CommsPlayground = dynamic(
  () =>
    import("@/components/CommsPlayground").then((mod) => mod.CommsPlayground),
  { ssr: false },
);

// Framed, interactive product preview for the landing page: intro copy + CTA
// over a background image, with the live Comms workspace running below in its
// own bordered, fixed-height card.
export default function CommsPlaygroundShowcase({
  ctaHref = "/project",
  ctaLabel = "Open the workspace",
}) {
  return (
    <section className="rounded-2xl border mx-auto w-[80%] border-border bg-[url('https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-00a586c62c8782e65c0a.jpg')] bg-cover bg-center p-3 sm:rounded-3xl sm:p-6 md:p-8 xl:p-10">
      <div className="flex flex-col gap-6 sm:gap-10">
        <div className="space-y-5">
          <div className="mx-auto mb-4 mt-4 flex w-[92%] flex-col items-start gap-4 sm:mb-6 sm:mt-6 sm:w-[90%]">
            <h3 className="text-3xl font-semibold leading-tight text-white">
              Try the full support inbox in real time.
            </h3>

            <p className="max-w-lg text-muted-foreground">
              This playground runs live on the page with the complete workspace —
              sidebar navigation, the shared inbox, and every screen. No save and
              no load, just pure exploration.
            </p>

            <Link
              href={ctaHref}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-zinc-100 px-5 font-medium text-zinc-950 transition-colors hover:bg-white"
            >
              {ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div>
          <div className="h-[720px] overflow-hidden rounded-lg border border-border bg-background sm:h-[700px] lg:h-[900px]">
            <CommsPlayground />
          </div>
        </div>
      </div>
    </section>
  );
}
