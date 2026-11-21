"use client";

import dynamic from "next/dynamic";
import { LogoLoading } from "@geiger/ui";
import { cn } from "@/lib/utils";
import styles from "@/components/landing/kit/product_pages.module.css";

const CommsPlayground = dynamic(() => import("@/components/CommsPlayground").then((mod) => mod.CommsPlayground), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <LogoLoading size={56} />
    </div>
  ),
});

// The live Comms workspace on the landing page, framed like the page's other stages: every screen runs in place, nothing is saved.
export default function CommsPlaygroundShowcase({ className }) {
  return (
    <div className={cn("-mx-4 overflow-hidden border-y border-foreground/[0.08] sm:mx-0 sm:rounded-xl sm:border-0 dark:border-foreground/[0.09]", styles.edge, styles.spotlight, className)}>
      <div className="px-2 pt-10 pb-2 sm:px-6 sm:pt-16 sm:pb-6">
        <div className="h-[640px] overflow-hidden rounded-lg border border-foreground/[0.1] bg-background shadow-2xl shadow-black/20 sm:h-[720px] lg:h-[820px]">
          <CommsPlayground />
        </div>
      </div>
    </div>
  );
}
