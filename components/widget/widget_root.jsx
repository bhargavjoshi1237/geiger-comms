"use client";

// Route entry for /widget (the iframe app). useSearchParams needs a Suspense
// boundary because the page is statically prerendered.

import { Suspense } from "react";
import { WidgetApp } from "./widget_app";

export default function WidgetRoot() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-background text-foreground">
          <p className="text-xs text-muted-foreground">Starting chat…</p>
        </div>
      }
    >
      <WidgetApp />
    </Suspense>
  );
}
