"use client";

// Connect dialog (spec §1.1/§5): creates a channel of this kind; for simulated kinds the body opens with the settings-only disclosure.

import { useState } from "react";
import { FlaskConical, Loader2, MessageCircle } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@geiger/ui";
import { Field } from "@/components/internal/shared/screen_kit";
import { CONNECT_DISCLOSURE, LIVE_NOTE } from "./constants";

export function ConnectDialog({
  open,
  onOpenChange,
  meta,
  simulated = true,
  requiredFields = [],
  onConnect,
}) {
  const [name, setName] = useState("");
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);

  const missing =
    !name.trim() || requiredFields.some((f) => !String(values[f.key] ?? "").trim());

  function reset() {
    setName("");
    setValues({});
    setBusy(false);
  }

  function handleOpenChange(next) {
    if (busy) return; // keep the dialog up until the write settles
    if (!next) reset();
    onOpenChange(next);
  }

  async function connect() {
    if (missing || busy) return;
    setBusy(true);
    const config = Object.fromEntries(
      requiredFields.map((f) => [f.key, String(values[f.key] ?? "").trim()]),
    );
    const ok = await onConnect({ name: name.trim(), config });
    setBusy(false);
    // Stay open on failure so the typed values aren't lost; the screen has already toasted.
    if (ok) {
      reset();
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect {meta.label}</DialogTitle>
          <DialogDescription>
            {simulated
              ? `Save the settings for a ${meta.label.toLowerCase()} channel.`
              : `Create a ${meta.label} channel, then install it on your site.`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void connect();
          }}
        >
          {simulated ? (
            <div
              role="note"
              className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-400"
            >
              <FlaskConical className="pointer-events-none mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                <span className="font-semibold">Simulated connection.</span> {CONNECT_DISCLOSURE}
              </p>
            </div>
          ) : (
            <div
              role="note"
              className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-card px-3 py-2.5 text-sm text-text-secondary"
            >
              <MessageCircle className="pointer-events-none mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>{LIVE_NOTE} Generate an install snippet from the channel&apos;s Install section.</p>
            </div>
          )}
          <Field label="Name" htmlFor="connect-channel-name">
            <Input
              id="connect-channel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={meta.label === "Email" ? "Support inbox" : meta.label}
              disabled={busy}
            />
          </Field>
          {requiredFields.map((field) => (
            <Field key={field.key} label={field.label} htmlFor={`connect-${field.key}`}>
              <Input
                id={`connect-${field.key}`}
                value={values[field.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                disabled={busy}
              />
            </Field>
          ))}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={busy || missing}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "Connecting…" : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
