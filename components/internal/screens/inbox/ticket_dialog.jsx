"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui";
import { Field } from "@/components/internal/shared/screen_kit";
import { TICKET_TYPE_LABELS } from "./use_inbox_shell";

export function TicketDialog({ conversation, onCancel, onCreate }) {
  const [type, setType] = useState("customer");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    const created = await onCreate({ conversation, type, title, description: "" });
    setBusy(false);
    if (created) {
      setTitle("");
      onCancel();
    }
  }

  return (
    <Dialog open={Boolean(conversation)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create ticket from thread</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Type" htmlFor="ticket-type">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="ticket-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TICKET_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Title" htmlFor="ticket-title">
            <Input
              id="ticket-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Refund double charge"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={!title.trim() || busy} onClick={() => void submit()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
