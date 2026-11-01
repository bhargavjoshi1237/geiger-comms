"use client";

// Create + edit dialog for an SLA policy: name, the channels/priorities it applies to, its three targets, business hours and the enabled switch; `readOnly` only shows it.

import { useState } from "react";
import { toast } from "sonner";
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
  Switch,
} from "@geiger/ui";
import { Field } from "@/components/internal/shared/screen_kit";
import { Gated } from "@/components/internal/shared/gated";
import { CHANNEL_OPTIONS, NEEDS_MANAGE_SLA, PRIORITY_OPTIONS } from "./constants";
import { ChipMultiSelect, DurationField } from "./rule_fields";

// Radix Select can't hold an empty value, so "no business hours" travels as a sentinel.
const CALENDAR_TIME = "calendar";

function draftFrom(policy) {
  return {
    name: policy?.name ?? "",
    channels: policy?.scope?.channels ?? [],
    priorities: policy?.scope?.priorities ?? [],
    firstResponseMins: policy ? policy.firstResponseMins : 60,
    nextResponseMins: policy ? policy.nextResponseMins : 240,
    resolutionMins: policy ? policy.resolutionMins : 1440,
    businessHoursId: policy?.businessHoursId ?? null,
    enabled: policy?.enabled ?? true,
  };
}

export function SlaPolicyDialog({ open, policy, businessHours, readOnly = false, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => draftFrom(policy));
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  const editing = Boolean(policy);
  const hours = businessHours ?? [];
  const missingHours =
    draft.businessHoursId && !hours.some((h) => h.id === draft.businessHoursId);

  async function submit() {
    if (readOnly || !draft.name.trim()) return;
    if (!draft.firstResponseMins && !draft.resolutionMins) {
      toast.error("Set a first response or a resolution target.");
      return;
    }
    setBusy(true);
    const ok = await onSave({
      name: draft.name.trim(),
      scope: { channels: draft.channels, priorities: draft.priorities },
      firstResponseMins: draft.firstResponseMins,
      nextResponseMins: draft.nextResponseMins,
      resolutionMins: draft.resolutionMins,
      businessHoursId: draft.businessHoursId,
      enabled: draft.enabled,
    });
    setBusy(false);
    if (ok) onCancel();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{readOnly ? "SLA policy" : editing ? "Edit SLA policy" : "New SLA policy"}</DialogTitle>
          <DialogDescription>
            The clock starts when a conversation arrives, on the first enabled policy that matches it
            (a workflow&apos;s Apply SLA step can switch policies). Reassigning or reopening restarts the
            clock; snoozing pauses it.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Policy name" htmlFor="sla-name">
            <Input
              id="sla-name"
              value={draft.name}
              disabled={readOnly}
              onChange={(e) => set("name")(e.target.value)}
              placeholder="e.g. VIP urgent"
              autoFocus
            />
          </Field>

          <Field label="Channels" hint="Leave empty to cover every channel.">
            <ChipMultiSelect
              options={CHANNEL_OPTIONS}
              value={draft.channels}
              onChange={set("channels")}
              anyLabel="Any channel"
              ariaLabel="Channels this policy applies to"
              disabled={readOnly}
            />
          </Field>

          <Field label="Priorities" hint="Leave empty to cover every priority.">
            <ChipMultiSelect
              options={PRIORITY_OPTIONS}
              value={draft.priorities}
              onChange={set("priorities")}
              anyLabel="Any priority"
              ariaLabel="Priorities this policy applies to"
              disabled={readOnly}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First response" htmlFor="sla-first" hint="Time to the first teammate reply.">
              <DurationField
                id="sla-first"
                value={draft.firstResponseMins}
                onChange={set("firstResponseMins")}
                disabled={readOnly}
              />
            </Field>
            <Field label="Resolution" htmlFor="sla-resolution" hint="Time until the conversation is closed.">
              <DurationField
                id="sla-resolution"
                value={draft.resolutionMins}
                onChange={set("resolutionMins")}
                disabled={readOnly}
              />
            </Field>
          </div>

          <Field
            label="Next response"
            htmlFor="sla-next"
            hint="Saved with the policy; the inbox clock doesn't track it yet."
          >
            <DurationField
              id="sla-next"
              value={draft.nextResponseMins}
              onChange={set("nextResponseMins")}
              disabled={readOnly}
            />
          </Field>

          <Field
            label="Business hours"
            htmlFor="sla-hours"
            hint="With business hours set, only open hours count toward the targets."
          >
            <Select
              value={draft.businessHoursId ?? CALENDAR_TIME}
              onValueChange={(v) => set("businessHoursId")(v === CALENDAR_TIME ? null : v)}
              disabled={readOnly}
            >
              <SelectTrigger id="sla-hours">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CALENDAR_TIME}>24/7 — calendar time</SelectItem>
                {hours.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name || "Untitled hours"} ({h.timezone})
                  </SelectItem>
                ))}
                {missingHours ? (
                  <SelectItem value={draft.businessHoursId}>Unknown hours</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </Field>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-subtle px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Enabled</p>
              <p className="text-xs text-text-secondary">
                Disabled policies are skipped when the clock starts.
              </p>
            </div>
            <Switch
              checked={draft.enabled}
              disabled={readOnly}
              onCheckedChange={set("enabled")}
              aria-label="Policy enabled"
            />
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Gated reason={readOnly ? NEEDS_MANAGE_SLA : null}>
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={readOnly || !draft.name.trim() || busy}
              onClick={() => void submit()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing ? "Save policy" : "Create policy"}
            </Button>
          </Gated>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SlaPolicyDialog;
