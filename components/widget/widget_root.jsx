"use client";

// Route entry for /widget (the iframe app). useSearchParams needs a Suspense boundary because the page is statically prerendered.

import { Suspense } from "react";
import { LogoLoading } from "@geiger/ui/logo-loading";
import { WidgetApp } from "./widget_app";

export default function WidgetRoot() {
  return (
    <Suspense
      fallback={
        <div className="gc-widget gc-widget--framed">
          <div className="gc-boot">
            <LogoLoading size={64} aria-label="Starting chat" />
            <p>Starting chat…</p>
          </div>
        </div>
      }
    >
      <WidgetApp />
    </Suspense>
  );
}
