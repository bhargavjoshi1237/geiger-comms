"use client";

// Create a conversation from scratch (spec §4.2): subject, contact (linked to comms.contacts), channel and an optional first message.
// Picking a connected channel sets channel_id plus the matching display kind (Channels spec §2.1). InboxShell owns the create.

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
import { Loader2 } from "lucide-react";
import { Field } from "@/components/internal/shared/screen_kit";
import { CHANNEL_FILTER_OPTIONS, displayChannelFor } from "./constants";

const EMPTY_DRAFT = {
  subject: "",
  contactName: "",
  contactEmail: "",
  channelChoice: "", // "ch:<channelId>" | "kind:<display text>"; "" = default
  body: "",
};

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-border bg-surface-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-border";

export function NewConversationDialog({ open, onOpenChange, onCreate, channels = [] }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  // Default to the first connected channel, else the plain Email kind.
  const connected = channels.filter((c) => c.status === "connected");
  const defaultChoice = connected[0] ? `ch:${connected[0].id}` : channels[0] ? `ch:${channels[0].id}` : "kind:Email";
  const choice = draft.channelChoice || defaultChoice;

  function resolveChannel() {
    if (choice.startsWith("ch:")) {
      const row = channels.find((c) => c.id === choice.slice(3));
      if (row) return { channelId: row.id, channel: displayChannelFor(row) };
    }
    return { channelId: null, channel: choice.startsWith("kind:") ? choice.slice(5) : "Email" };
  }

  function close() {
    setDraft(EMPTY_DRAFT);
    setBusy(false);
    onOpenChange(false);
  }

  async function create() {
    if (!draft.subject.trim() || !draft.contactName.trim()) return;
    setBusy(true);
    const created = await onCreate?.({ ...draft, ...resolveChannel() });
    if (created) close();
    else setBusy(false);
  }

  const valid = Boolean(draft.subject.trim() && draft.contactName.trim());

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
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
            <Field label="Contact email" htmlFor="nc-email" hint="Optional — reuses an existing contact with this email.">
              <Input
                id="nc-email"
                type="email"
                value={draft.contactEmail}
                onChange={(e) => set("contactEmail")(e.target.value)}
                placeholder="maya@northwind.io"
              />
            </Field>
          </div>
          <Field
            label="Channel"
            htmlFor="nc-channel"
            hint={channels.length === 0 ? "No connected channels yet — pick a channel type." : undefined}
          >
            <select
              id="nc-channel"
              value={choice}
              onChange={(e) => set("channelChoice")(e.target.value)}
              className={SELECT_CLASS}
            >
              {channels.length > 0 ? (
                <optgroup label="Connected channels">
                  {channels.map((c) => (
                    <option key={c.id} value={`ch:${c.id}`}>
                      {(c.name || displayChannelFor(c)) + ` · ${displayChannelFor(c)}`}
                      {c.status !== "connected" ? " (not connected)" : ""}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <optgroup label={channels.length > 0 ? "Without a connected channel" : "Channel type"}>
                {CHANNEL_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={`kind:${option.value}`}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
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
          <Button type="button" variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="button" className="bg-primary" onClick={() => void create()} disabled={!valid || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NewConversationDialog;
