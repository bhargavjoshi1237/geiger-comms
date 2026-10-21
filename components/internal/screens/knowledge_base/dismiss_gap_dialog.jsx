"use client";

// Dismiss a knowledge gap (KB spec §11.6). "Other" needs a reason in words. A dismissed gap comes back on its own
// if its question volume doubles.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
} from "@geiger/ui";
import { DISMISS_REASONS } from "./constants";

export function DismissGapDialog({ gap, onClose, onDismiss }) {
  const [reason, setReason] = useState("not_relevant");
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const invalid = reason === "other" && !other.trim();

  async function submit() {
    setBusy(true);
    const ok = await onDismiss(gap, reason === "other" ? `other: ${other.trim()}` : reason);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dismiss gap</DialogTitle>
          <DialogDescription>
            {gap.label}. It comes back on its own if customers ask about it twice as often.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={reason} onValueChange={setReason}>
          {DISMISS_REASONS.map((r) => (
            <div key={r.value} className="flex items-center gap-2.5">
              <RadioGroupItem value={r.value} id={`dismiss-${r.value}`} />
              <Label htmlFor={`dismiss-${r.value}`} className="text-sm font-normal text-foreground">
                {r.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
        {reason === "other" ? (
          <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Why it isn't a gap" autoFocus />
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy || invalid} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Dismiss
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DismissGapDialog;
