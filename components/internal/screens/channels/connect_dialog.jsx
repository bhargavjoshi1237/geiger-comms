"use client";

// Connect dialog (channels spec §1.1/§5): create a channel of this kind. The
// disclosure that nothing connects to a real provider is the body's first
// sentence — non-negotiable.

import { useState } from "react";
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
import { CONNECT_DISCLOSURE } from "./constants";

export function ConnectDialog({ open, onOpenChange, meta, requiredField, onConnect }) {
  const [name, setName] = useState("");
  const [requiredValue, setRequiredValue] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setName("");
    setRequiredValue("");
    setBusy(false);
  }

  async function connect() {
    if (!name.trim() || (requiredField && !requiredValue.trim())) return;
    setBusy(true);
    try {
      await onConnect({
        name: name.trim(),
        config: requiredField ? { [requiredField.key]: requiredValue.trim() } : {},
      });
      reset();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect {meta.label}</DialogTitle>
          <DialogDescription>{CONNECT_DISCLOSURE}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name" htmlFor="channel-name">
            <Input
              id="channel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={meta.label === "Email" ? "Support inbox" : meta.label}
            />
          </Field>
          {requiredField ? (
            <Field label={requiredField.label} htmlFor="channel-required">
              <Input
                id="channel-required"
                value={requiredValue}
                onChange={(e) => setRequiredValue(e.target.value)}
                placeholder={requiredField.placeholder}
              />
            </Field>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void connect()}
            disabled={busy || !name.trim() || (Boolean(requiredField) && !requiredValue.trim())}
          >
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
