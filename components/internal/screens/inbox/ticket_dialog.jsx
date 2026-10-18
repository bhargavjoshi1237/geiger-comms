"use client";

// Create-only ticket dialog: from a thread (pass `conversation`) or standalone from the Tickets queue (pass `open`); editing lives in ticket_detail.jsx.

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@geiger/ui";
import { Field } from "@/components/internal/shared/screen_kit";
import { TICKET_TYPE_OPTIONS } from "./constants";

export function TicketDialog({ conversation, open, onCancel, onCreate }) {
  const [type, setType] = useState("customer");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const isOpen = open ?? Boolean(conversation);

  function reset() {
    setType("customer");
    setTitle("");
    setDescription("");
  }

  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    const created = await onCreate({ conversation, type, title, description });
    setBusy(false);
    if (created) {
      reset();
      onCancel();
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (next) return;
        reset();
        onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {conversation ? "Create ticket from thread" : "Create ticket"}
          </DialogTitle>
          <DialogDescription>
            Tickets share one queue — the type decides which view it shows up in.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Type" htmlFor="ticket-dialog-type">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="ticket-dialog-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Title" htmlFor="ticket-dialog-title">
            <Input
              id="ticket-dialog-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Refund double charge"
            />
          </Field>
          <Field
            label="Description"
            htmlFor="ticket-dialog-description"
            hint="Optional — you can fill this in later in the editor."
          >
            <Textarea
              id="ticket-dialog-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What needs doing?"
              rows={3}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              reset();
              onCancel();
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!title.trim() || busy}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TicketDialog;
