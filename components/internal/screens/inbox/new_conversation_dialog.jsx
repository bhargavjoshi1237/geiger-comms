"use client";

// Create a conversation from scratch (spec §4.2): a subject, a contact, a
// channel and an optional first message. InboxShell owns the create.

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
  Textarea,
} from "@geiger/ui";
import { Field } from "@/components/internal/shared/screen_kit";
import { CHANNEL_FILTER_OPTIONS } from "./constants";

const EMPTY_DRAFT = {
  subject: "",
  contactName: "",
  contactEmail: "",
  channel: "Email",
  body: "",
};

export function NewConversationDialog({ open, onOpenChange, onCreate }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  function reset() {
    setDraft(EMPTY_DRAFT);
    setBusy(false);
  }

  async function create() {
    if (!draft.subject.trim() || !draft.contactName.trim()) return;
    setBusy(true);
    const created = await onCreate?.(draft);
    if (created) {
      reset();
      onOpenChange(false);
    } else {
      setBusy(false);
    }
  }

  const valid = draft.subject.trim() && draft.contactName.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
          <DialogDescription>
            Opens a thread on behalf of a contact. It appears in every inbox immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Subject" htmlFor="nc-subject">
            <Input
              id="nc-subject"
              value={draft.subject}
              onChange={(e) => set("subject")(e.target.value)}
              placeholder="Refund for duplicate charge"
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Contact name" htmlFor="nc-contact">
              <Input
                id="nc-contact"
                value={draft.contactName}
                onChange={(e) => set("contactName")(e.target.value)}
                placeholder="Maya Chen"
              />
            </Field>
            <Field label="Contact email" htmlFor="nc-email" hint="Optional">
              <Input
                id="nc-email"
                type="email"
                value={draft.contactEmail}
                onChange={(e) => set("contactEmail")(e.target.value)}
                placeholder="maya@northwind.io"
              />
            </Field>
          </div>
          <Field label="Channel" htmlFor="nc-channel">
            <select
              id="nc-channel"
              value={draft.channel}
              onChange={(e) => set("channel")(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-surface-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-border"
            >
              {CHANNEL_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="First message" htmlFor="nc-body" hint="Optional — sent as the customer.">
            <Textarea
              id="nc-body"
              rows={3}
              value={draft.body}
              onChange={(e) => set("body")(e.target.value)}
              placeholder="Hi — I noticed two identical charges…"
              className="resize-none"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void create()} disabled={!valid || busy}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NewConversationDialog;
