"use client";

// The config form renders straight from CHANNEL_KIND_META[kind].fields
// (channels spec §3), so adding a field is a one-line change in constants.js.
// Saves through updateChannel; the screen owns optimistic state + toasts.

import { Input } from "@geiger/ui";
import { Field, SettingRow, SettingsList } from "@/components/internal/shared/screen_kit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui";
import { Switch } from "@geiger/ui";

export function ChannelConfigForm({ meta, config = {}, onChange }) {
  const set = (key) => (value) => onChange({ ...config, [key]: value });

  return (
    <SettingsList>
      {meta.fields.map((field) => {
        const controlProps = {
          placeholder: field.placeholder,
          "aria-label": field.label,
        };
        let control;
        if (field.type === "switch") {
          return (
            <SettingRow
              key={field.key}
              title={field.label}
              description={field.hint}
              checked={config[field.key] === true}
              onCheckedChange={set(field.key)}
            />
          );
        }
        if (field.type === "textarea") {
          control = (
            <textarea
              {...controlProps}
              rows={2}
              className="w-full rounded-md border border-border bg-surface-card px-3 py-2 text-sm outline-none focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-border"
            />
          );
        } else if (field.type === "select") {
          control = (
            <Select value={config[field.key] || ""} onValueChange={set(field.key)}>
              <SelectTrigger size="sm" className="w-[160px]" aria-label={field.label}>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {(field.options || []).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        } else if (field.type === "color") {
          control = (
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={field.label}
                value={config[field.key] || "#6366f1"}
                onChange={(e) => set(field.key)(e.target.value)}
                className="size-8 cursor-pointer rounded-md border border-border bg-surface-card p-0.5"
              />
              <Input
                {...controlProps}
                value={config[field.key] || ""}
                onChange={(e) => set(field.key)(e.target.value)}
                className="h-9 w-32 font-mono text-xs"
              />
            </div>
          );
        } else if (field.type === "accounts") {
          // Social accounts are edited as one line per account.
          control = null;
        } else {
          control = (
            <Input
              {...controlProps}
              value={config[field.key] ?? ""}
              onChange={(e) => set(field.key)(e.target.value)}
              className="h-9"
            />
          );
        }

        if (!control && field.type !== "accounts") return null;

        return (
          <div key={field.key} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
            <Field label={field.label} hint={field.hint}>
              {control}
            </Field>
          </div>
        );
      })}
    </SettingsList>
  );
}
