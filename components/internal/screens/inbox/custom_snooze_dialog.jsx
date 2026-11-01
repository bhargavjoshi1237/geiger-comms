"use client";

import { useState } from "react";
import { toast } from "sonner";
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

export function CustomSnoozeDialog({ open, onConfirm, onCancel }) {
  const [value, setValue] = useState("");

  // A past time would reopen the conversation straight away, so only a future one is accepted.
  function submit() {
    const at = new Date(value);
    if (!value || !(at.getTime() > Date.now())) {
      toast.error("Pick a time in the future.");
      return;
    }
    onConfirm(at.toISOString());
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Snooze until…</DialogTitle>
          <DialogDescription>Snoozed conversations come back to the inbox at this time.</DialogDescription>
        </DialogHeader>
        <Field label="Pick a date and time" htmlFor="snooze-at">
          <Input
            id="snooze-at"
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!value}
            onClick={submit}
          >
            Snooze
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
