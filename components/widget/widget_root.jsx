"use client";

// Route entry for /widget (the iframe app). useSearchParams needs a Suspense
// boundary because the page is statically prerendered.

import { Suspense } from "react";
import { WidgetApp } from "./widget_app";

export default function WidgetRoot() {
  return (
    <Suspense
      fallback={
        <div className="gc-widget gc-widget--framed">
          <div className="gc-boot">
            <p>Starting chat…</p>
          </div>
        </div>
      }
    >
      <WidgetApp />
    </Suspense>
  );
}
