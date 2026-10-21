"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui";

// The one explicit consent step before any content reaches the workspace's AI vendor (spec §6.2). The server stamps
// who confirmed and when; until then every AI feature reports consent_required.
export function DataSharingDialog({ open, providerName, onOpenChange, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const vendor = providerName || "your AI provider";

  const handleOpenChange = (next) => {
    if (!busy) onOpenChange(next);
  };

  const confirm = async () => {
    setBusy(true);
    const ok = await onConfirm();
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm data sharing</DialogTitle>
          <DialogDescription>
            Article text, customer questions and the inbox conversations teammates use AI on (summaries include internal
            notes) will be sent to <span className="font-medium text-foreground">{vendor}</span> to generate results. Your
            provider&apos;s terms and data retention apply.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={confirm} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DataSharingDialog;
