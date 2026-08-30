"use client";

// The Messenger Install section (messenger-widget spec §12): widget app
// credentials, allowed origins with exact-scheme validation, the embed
// snippet + SDK install command pre-filled with the public id, secret shown
// exactly once, and installation status. Talks to /api/widget-apps/*; the
// signing secret never passes through this UI a second time.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, EyeOff, Globe, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from "@geiger/ui";
import { Field, SectionCard } from "@/components/internal/shared/screen_kit";
import { apiPath, widgetInstallSnippet } from "@/lib/widget/embed";

const snippet = widgetInstallSnippet;

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Couldn't copy to clipboard");
        }
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export function InstallSection({ channel }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [draftOrigins, setDraftOrigins] = useState("");
  const [creating, setCreating] = useState(false);
  // The freshly created/rotated app while its one-time secret is on screen.
  const [revealed, setRevealed] = useState(null);

  useEffect(() => {
    let active = true;
    fetch(apiPath(`/api/widget-apps?channelId=${encodeURIComponent(channel.id)}`))
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((rows) => active && setApps(Array.isArray(rows) ? rows : []))
      .catch(() => active && toast.error("Couldn't load widget apps"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [channel.id]);

  async function createApp() {
    const origins = draftOrigins
      .split(/[\s,]+/)
      .map((o) => o.trim())
      .filter(Boolean);
    if (!origins.length) {
      toast.error("Add at least one origin, e.g. https://acme.com");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(apiPath("/api/widget-apps"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channelId: channel.id, allowedOrigins: origins }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.publicId) {
        toast.error(
          payload?.error === "allowed_origins must be exact scheme://host[:port] values"
            ? "Origins must be exact scheme://host[:port] — no paths or wildcards."
            : "Couldn't create the widget app"
        );
        return;
      }
      setApps((prev) => [payload, ...prev]);
      setRevealed(payload);
      setCreateOpen(false);
      setDraftOrigins("");
      toast.success("Widget app created");
    } finally {
      setCreating(false);
    }
  }

  const revokeApp = useCallback(
    async (app) => {
      const previous = apps;
      setApps((prev) => prev.filter((a) => a.id !== app.id));
      const res = await fetch(apiPath(`/api/widget-apps/${app.id}`), { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        setApps(previous);
        toast.error("Couldn't revoke the widget app");
      } else {
        toast.success("Widget app revoked");
      }
    },
    [apps],
  );

  // Rotation keeps the previous secret verifying for a grace period, so live
  // widgets don't drop mid-session (spec §10.1).
  async function rotateApp(app) {
    try {
      const res = await fetch(apiPath(`/api/widget-apps/${app.id}`), { method: "POST" });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.signingSecret) throw new Error();
      setApps((prev) => prev.map((a) => (a.id === payload.id ? payload : a)));
      setRevealed(payload);
    } catch {
      toast.error("Couldn't rotate the signing secret");
    }
  }

  return (
    <SectionCard
      title="Install"
      description="Embed the Messenger on your site. Origins are matched exactly — no wildcards, no paths."
      action={
        <Button type="button" size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="size-3.5" /> New widget app
        </Button>
      }
    >
      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : apps.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No widget apps yet. Create one to get an install snippet.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {apps.map((app) => (
            <div key={app.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Globe className="pointer-events-none size-4 shrink-0 text-text-secondary" />
                    <code className="rounded bg-surface-card px-1.5 py-0.5 font-mono text-sm">{app.publicId}</code>
                    <span className="text-xs text-text-secondary">…{app.secretLast4}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-text-tertiary">
                    {app.allowedOrigins.join(" · ") || "No origins configured"}
                    {app.hasBooted
                      ? ` · last boot ${new Date(app.lastBootAt).toLocaleString()}`
                      : " · never booted"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void rotateApp(app)}
                  >
                    <RefreshCw className="size-3.5" /> Rotate secret
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-red-400 hover:bg-red-500/10 hover:text-red-400"
                    onClick={() => void revokeApp(app)}
                  >
                    <Trash2 className="size-3.5" /> Revoke
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[auto_auto_1fr]">
                {/* SSR renders the placeholder; on the client the real origin is baked in. */}
                <CopyButton
                  value={snippet(app.publicId)}
                  label="Copy snippet"
                />
                <CopyButton
                  value="npm install github:bhargavjoshi1237/geiger-comms-widget#<sha>"
                  label="Copy SDK install"
                />
                <pre className="overflow-x-auto rounded-lg border border-border bg-surface-card p-3 font-mono text-xs text-text-secondary sm:col-span-3">
                  {snippet(app.publicId)}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New widget app</DialogTitle>
            <DialogDescription>
              Creates a public id and a signing secret for your backend&apos;s JWTs.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Allowed origins" hint="One per line. Exact scheme://host[:port], e.g. https://acme.com">
              <textarea
                value={draftOrigins}
                onChange={(e) => setDraftOrigins(e.target.value)}
                rows={3}
                placeholder={"https://acme.com\nhttps://app.acme.com"}
                className="w-full rounded-md border border-border bg-surface-card px-3 py-2 font-mono text-sm outline-none focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-border"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void createApp()} disabled={creating}>
              Create app
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-time secret reveal */}
      <Dialog open={Boolean(revealed)} onOpenChange={(open) => !open && setRevealed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save your signing secret now</DialogTitle>
            <DialogDescription>
              This is shown once. It signs your backend&apos;s JWTs — store it in your secrets manager, never in code.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Public id">
              <Input readOnly value={revealed?.publicId || ""} />
            </Field>
            <Field label="Signing secret">
              <div className="flex gap-2">
                <Input readOnly value={revealed?.signingSecret || ""} className="font-mono text-xs" />
                <CopyButton value={revealed?.signingSecret || ""} label="Copy" />
              </div>
            </Field>
            <p className="flex items-start gap-1.5 text-xs text-text-secondary">
              <EyeOff className="pointer-events-none mt-0.5 size-3.5 shrink-0" />
              After closing this dialog the secret cannot be retrieved again — only its last four characters remain visible.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setRevealed(null)}>
              I&apos;ve saved it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
