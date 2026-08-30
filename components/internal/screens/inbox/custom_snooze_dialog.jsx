"use client";

import { useState } from "react";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input } from "@geiger/ui";
import { Field } from "@/components/internal/shared/screen_kit";

export function CustomSnoozeDialog({ conversation, onConfirm, onCancel }) {
  const [value, setValue] = useState("");
  return (
    <Dialog open={Boolean(conversation)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Snooze until…</DialogTitle>
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
            onClick={() => value && onConfirm(new Date(value).toISOString())}
          >
            Snooze
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
