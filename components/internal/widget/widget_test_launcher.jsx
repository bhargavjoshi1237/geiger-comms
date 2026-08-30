"use client";

// Boots the real GeigerComms widget (loader script -> launcher bubble ->
// iframe -> postMessage) inside the workspace itself, scoped to the active
// project's widget app, so the team can click the bubble and test Messenger
// without leaving the admin. Falls back to a CTA into the Messenger install
// flow when the project has no widget app yet. The widget app's allowed
// origins must include this app's own origin (see Messenger > Install) or
// the bubble opens but boot fails with a "couldn't reach chat" message.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@geiger/ui";
import { apiPath, widgetLoaderUrl } from "@/lib/widget/embed";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";

const LOADER_SCRIPT_ID = "geiger-comms-widget-loader";

function ensureLoaderScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(LOADER_SCRIPT_ID);
    if (existing) {
      if (window.GeigerComms) resolve();
      else existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = LOADER_SCRIPT_ID;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("widget_loader_failed"));
    document.head.appendChild(script);
  });
}

export function WidgetTestLauncher({ projectId }) {
  const { setTab } = useWorkspaceUrl();
  const [status, setStatus] = useState("loading"); // loading | ready | missing
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!projectId) return undefined;
    let active = true;

    fetch(apiPath("/api/widget-apps"))
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        if (!active) return;
        const app = (Array.isArray(rows) ? rows : []).find((a) => a.projectId === projectId);
        if (!app) {
          setStatus("missing");
          return;
        }
        ensureLoaderScript(widgetLoaderUrl())
          .then(() => {
            if (!active || !window.GeigerComms) return;
            window.GeigerComms("boot", { appId: app.publicId });
            setStatus("ready");
          })
          .catch(() => active && setStatus("missing"));
      })
      .catch(() => active && setStatus("missing"));

    return () => {
      active = false;
      window.GeigerComms?.("shutdown");
    };
  }, [projectId]);

  if (status !== "missing" || dismissed) return null;

  return (
    <div className="fixed bottom-5 right-5 z-40 flex max-w-xs items-start gap-2 rounded-lg border border-border bg-surface-subtle p-3 shadow-lg">
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">No test widget yet</p>
        <p className="mt-0.5 text-xs text-text-secondary">
          Install a Messenger widget for this project to preview it here.
        </p>
        <Button size="sm" className="mt-2" onClick={() => setTab("Messenger")}>
          Set up Messenger
        </Button>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        className="text-text-tertiary hover:text-foreground"
        onClick={() => setDismissed(true)}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
