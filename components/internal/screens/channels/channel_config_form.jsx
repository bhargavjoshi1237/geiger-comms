"use client";

// The config form renders straight from CHANNEL_KIND_META[kind].fields
// (channels spec §3), so adding a field is a one-line change in constants.js.
// Value fields sit in a Field grid; switches drop to a SettingsList underneath.
// Saves through updateChannel; the editor owns optimistic state + toasts.

import { Plus, Trash2 } from "lucide-react";
import { Button, Input } from "@geiger/ui";
import { Field, SettingRow, SettingsList } from "@/components/internal/shared/screen_kit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui";

// One row per linked social account; networks come from the field's options.
function AccountsEditor({ field, value, onChange }) {
  const accounts = Array.isArray(value) ? value : [];
  const networks = field.options || [];

  const patch = (index, partial) =>
    onChange(accounts.map((a, i) => (i === index ? { ...a, ...partial } : a)));

  return (
    <div className="space-y-2">
      {accounts.map((account, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select
            value={account.network || networks[0]?.value || ""}
            onValueChange={(network) => patch(i, { network })}
          >
            <SelectTrigger size="sm" className="w-[140px]" aria-label="Network">
              <SelectValue placeholder="Network" />
            </SelectTrigger>
            <SelectContent>
              {networks.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={account.handle || ""}
            onChange={(e) => patch(i, { handle: e.target.value })}
            placeholder="@acme"
            aria-label="Handle"
            className="h-9 flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove account"
            className="text-red-400 hover:bg-red-500/10 hover:text-red-400"
            onClick={() => onChange(accounts.filter((_, index) => index !== i))}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
        onClick={() =>
          onChange([...accounts, { network: networks[0]?.value || "", handle: "" }])
        }
      >
        <Plus className="size-3.5" /> Add account
      </Button>
    </div>
  );
}

export function ChannelConfigForm({ meta, config = {}, onChange }) {
  const set = (key) => (value) => onChange({ ...config, [key]: value });

  const switches = meta.fields.filter((f) => f.type === "switch");
  const values = meta.fields.filter((f) => f.type !== "switch");
  // Anything wider than a single input gets its own full-width row.
  const isWide = (field) => ["textarea", "accounts"].includes(field.type);

  const control = (field) => {
    const shared = { placeholder: field.placeholder, "aria-label": field.label };

    if (field.type === "textarea") {
      return (
        <textarea
          {...shared}
          rows={3}
          value={config[field.key] ?? ""}
          onChange={(e) => set(field.key)(e.target.value)}
          className="w-full rounded-md border border-border bg-surface-card px-3 py-2 text-sm outline-none focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-border"
        />
      );
    }
    if (field.type === "select") {
      return (
        <Select value={config[field.key] || ""} onValueChange={set(field.key)}>
          <SelectTrigger size="sm" className="w-full" aria-label={field.label}>
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
    }
    if (field.type === "color") {
      return (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={field.label}
            value={config[field.key] || "#ffffff"}
            onChange={(e) => set(field.key)(e.target.value)}
            className="size-9 cursor-pointer rounded-md border border-border bg-surface-card p-0.5"
          />
          <Input
            {...shared}
            value={config[field.key] || ""}
            onChange={(e) => set(field.key)(e.target.value)}
            className="h-9 flex-1 font-mono text-xs"
          />
        </div>
      );
    }
    if (field.type === "accounts") {
      return (
        <AccountsEditor
          field={field}
          value={config[field.key]}
          onChange={set(field.key)}
        />
      );
    }
    return (
      <Input
        {...shared}
        value={config[field.key] ?? ""}
        onChange={(e) => set(field.key)(e.target.value)}
        className="h-9"
      />
    );
  };

  return (
    <div className="space-y-5">
      {values.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {values.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              hint={field.hint}
              className={isWide(field) ? "sm:col-span-2" : undefined}
            >
              {control(field)}
            </Field>
          ))}
        </div>
      ) : null}

      {switches.length ? (
        <SettingsList className="border-t border-border pt-2">
          {switches.map((field) => (
            <SettingRow
              key={field.key}
              title={field.label}
              description={field.hint}
              checked={config[field.key] === true}
              onCheckedChange={set(field.key)}
            />
          ))}
        </SettingsList>
      ) : null}
    </div>
  );
}
