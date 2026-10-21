"use client";

// Create + edit dialog for one business-hours schedule: name, who it applies to, timezone, the weekly hours, holidays and the enabled switch.

import { useMemo, useState } from "react";
import { CalendarPlus, Loader2, Trash2 } from "lucide-react";
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@geiger/ui";
import { Field } from "@/components/internal/shared/screen_kit";
import { WEEKDAYS, defaultSchedule } from "@/lib/supabase/business_hours";
import {
  WEEKDAY_LABELS,
  browserTimeZone,
  dayError,
  formatDateKey,
  timeZoneOptions,
  toDateKey,
} from "./business_hours_constants";

// Radix Select can't hold an empty value, so "the whole workspace" travels as a sentinel.
const WORKSPACE = "__workspace";

function draftFrom(hours) {
  return {
    name: hours?.name ?? "",
    timezone: hours?.timezone ?? browserTimeZone(),
    teamId: hours?.teamId ?? null,
    schedule: hours?.schedule ?? defaultSchedule(),
    holidays: hours?.holidays ?? [],
    enabled: hours?.enabled ?? true,
  };
}

function HolidayAdder({ existing, onAdd }) {
  const [date, setDate] = useState(null);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const key = date ? toDateKey(date) : null;
  const duplicate = key && existing.some((h) => h.date === key);

  const add = () => {
    if (!key || duplicate) return;
    onAdd({ date: key, name: name.trim() });
    setDate(null);
    setName("");
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="justify-start border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground sm:w-48"
          >
            <CalendarPlus className="h-4 w-4" />
            {key ? formatDateKey(key) : "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto border-border bg-surface-subtle p-0">
          <DatePicker
            mode="single"
            selected={date ?? undefined}
            onSelect={(next) => {
              setDate(next ?? null);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name, e.g. Thanksgiving"
        className="min-w-0 flex-1"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
        disabled={!key || duplicate}
        onClick={add}
      >
        {duplicate ? "Already added" : "Add holiday"}
      </Button>
    </div>
  );
}

// `hours` null → create. `onSave(draft)` resolves truthy when the dialog may close.
export function BusinessHoursDialog({ open, hours, teams, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => draftFrom(hours));
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const setDay = (day, patch) =>
    setDraft((d) => ({ ...d, schedule: { ...d.schedule, [day]: { ...d.schedule[day], ...patch } } }));

  const zones = useMemo(() => {
    const list = timeZoneOptions();
    return list.includes(draft.timezone) ? list : [draft.timezone, ...list];
  }, [draft.timezone]);

  const dayErrors = Object.fromEntries(WEEKDAYS.map((day) => [day, dayError(draft.schedule[day])]));
  const invalid = Object.values(dayErrors).some(Boolean);
  const canSave = draft.name.trim() && !invalid && !busy;
  const missingTeam = draft.teamId && !(teams || []).some((t) => t.id === draft.teamId);

  async function submit() {
    if (!canSave) return;
    setBusy(true);
    const ok = await onSave({ ...draft, name: draft.name.trim() });
    setBusy(false);
    if (ok) onCancel();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{hours ? "Edit business hours" : "New business hours"}</DialogTitle>
          <DialogDescription>
            Opening times are read in the schedule&apos;s timezone; holidays close the whole day.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Name" htmlFor="bh-name">
            <Input
              id="bh-name"
              value={draft.name}
              onChange={(e) => set("name")(e.target.value)}
              placeholder="e.g. US support hours"
              autoFocus
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Applies to"
              htmlFor="bh-team"
              hint="A team without its own hours follows the workspace's."
            >
              <Select
                value={draft.teamId ?? WORKSPACE}
                onValueChange={(v) => set("teamId")(v === WORKSPACE ? null : v)}
              >
                <SelectTrigger id="bh-team">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WORKSPACE}>Whole workspace</SelectItem>
                  {(teams || []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name || "Untitled team"}
                    </SelectItem>
                  ))}
                  {missingTeam ? <SelectItem value={draft.teamId}>Removed team</SelectItem> : null}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Timezone" htmlFor="bh-timezone">
              <Select value={draft.timezone} onValueChange={set("timezone")}>
                <SelectTrigger id="bh-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {zones.map((z) => (
                    <SelectItem key={z} value={z}>
                      {z.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Weekly hours">
            <div className="divide-y divide-border rounded-lg border border-border bg-surface-card">
              {WEEKDAYS.map((day) => {
                const d = draft.schedule[day];
                return (
                  <div key={day} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-3">
                      <Switch
                        checked={!d.closed}
                        onCheckedChange={(on) => setDay(day, { closed: !on })}
                        aria-label={`Open on ${WEEKDAY_LABELS[day]}`}
                      />
                      <span className="w-24 text-sm font-medium text-foreground">{WEEKDAY_LABELS[day]}</span>
                      {d.closed ? (
                        <span className="text-sm text-text-tertiary">Closed</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={d.open}
                            onChange={(e) => setDay(day, { open: e.target.value })}
                            aria-label={`${WEEKDAY_LABELS[day]} opening time`}
                            className="w-28"
                          />
                          <span className="text-sm text-text-tertiary">to</span>
                          <Input
                            type="time"
                            value={d.close}
                            onChange={(e) => setDay(day, { close: e.target.value })}
                            aria-label={`${WEEKDAY_LABELS[day]} closing time`}
                            className="w-28"
                          />
                        </div>
                      )}
                    </div>
                    {dayErrors[day] ? (
                      <p className="mt-1 pl-[3.25rem] text-xs text-red-400">{dayErrors[day]}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Field>

          <Field label="Holidays" hint="Closed all day, in this schedule's timezone.">
            <div className="grid gap-2">
              {draft.holidays.length ? (
                <div className="divide-y divide-border rounded-lg border border-border bg-surface-card">
                  {draft.holidays.map((h) => (
                    <div key={h.date} className="flex items-center gap-3 px-3 py-2">
                      <span className="w-36 shrink-0 text-sm tabular-nums text-foreground">
                        {formatDateKey(h.date)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
                        {h.name || "Holiday"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-text-tertiary hover:bg-red-500/10 hover:text-red-400"
                        aria-label={`Remove ${h.name || formatDateKey(h.date)}`}
                        onClick={() => set("holidays")(draft.holidays.filter((x) => x.date !== h.date))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
              <HolidayAdder
                existing={draft.holidays}
                onAdd={(h) =>
                  set("holidays")([...draft.holidays, h].sort((a, b) => a.date.localeCompare(b.date)))
                }
              />
            </div>
          </Field>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-card px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Enabled</p>
              <p className="text-xs text-text-secondary">
                Disabled hours stop counting as office hours for routing and workflows. SLA policies
                linked to them still use them.
              </p>
            </div>
            <Switch checked={draft.enabled} onCheckedChange={set("enabled")} aria-label="Enabled" />
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!canSave}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {hours ? "Save hours" : "Create hours"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BusinessHoursDialog;
